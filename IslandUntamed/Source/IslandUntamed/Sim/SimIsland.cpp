#include "SimIsland.h"

namespace IUSim
{
	const char* BiomeToString(EBiome B)
	{
		switch (B)
		{
		case EBiome::Ocean: return "Ocean";
		case EBiome::Reef: return "Reef";
		case EBiome::Beach: return "Beach";
		case EBiome::Jungle: return "Jungle";
		case EBiome::Forest: return "Forest";
		case EBiome::Plains: return "Plains";
		case EBiome::Swamp: return "Swamp";
		case EBiome::Mountain: return "Mountain";
		case EBiome::Volcanic: return "Volcanic";
		case EBiome::Cliff: return "Cliff";
		case EBiome::River: return "River";
		case EBiome::Lake: return "Lake";
		}
		return "Ocean";
	}

	const char* BiomeDisplayName(EBiome B)
	{
		switch (B)
		{
		case EBiome::Ocean: return "Oceano";
		case EBiome::Reef: return "Arrecife";
		case EBiome::Beach: return "Playa";
		case EBiome::Jungle: return "Selva";
		case EBiome::Forest: return "Bosque";
		case EBiome::Plains: return "Llanura";
		case EBiome::Swamp: return "Pantano";
		case EBiome::Mountain: return "Montana";
		case EBiome::Volcanic: return "Zona volcanica";
		case EBiome::Cliff: return "Acantilado";
		case EBiome::River: return "Rio";
		case EBiome::Lake: return "Lago";
		}
		return "";
	}

	EBiome BiomeFromString(const std::string& S)
	{
		for (int I = 0; I <= static_cast<int>(EBiome::Lake); ++I)
		{
			const EBiome B = static_cast<EBiome>(I);
			if (S == BiomeToString(B)) { return B; }
		}
		return EBiome::Ocean;
	}

	const char* POITypeToString(EPOIType T)
	{
		switch (T)
		{
		case EPOIType::CrashSite: return "crash";
		case EPOIType::PlaneTail: return "plane_tail";
		case EPOIType::Village: return "village";
		case EPOIType::Ruins: return "ruins";
		case EPOIType::Cave: return "cave";
		case EPOIType::Waterfall: return "waterfall";
		case EPOIType::Facility: return "facility";
		case EPOIType::Camp: return "camp";
		case EPOIType::Lighthouse: return "lighthouse";
		case EPOIType::Secret: return "secret";
		case EPOIType::Lake: return "lake";
		case EPOIType::Volcano: return "volcano";
		}
		return "camp";
	}

	namespace IslandDetail
	{
		// Region centers in normalized [-1,1] island space. +X east, +Y north.
		const Vec2 kMountainUV(-0.20f, 0.28f);
		const Vec2 kVolcanoUV(0.40f, 0.33f);
		const Vec2 kSwampUV(-0.40f, -0.33f);
		const Vec2 kPlainsUV(0.33f, -0.24f);

		inline float Dist(const Vec2& A, const Vec2& B) { return (A - B).Length(); }

		// Water-kind grid values.
		constexpr uint8_t WaterNone = 0;
		constexpr uint8_t WaterRiver = 1;
		constexpr uint8_t WaterLake = 2;

	}

	// ------------------------------------------------------------------------------------------------
	// Generation
	// ------------------------------------------------------------------------------------------------

	void IslandModel::Generate(const IslandParams& InParams, const ResourceDatabase* InResources)
	{
		Params = InParams;
		Resources = InResources;
		Noise = Noise2D(Params.Seed);
		DetailNoise = Noise2D(HashU32(Params.Seed ^ 0xA5A5A5A5U));
		MoistureNoise = Noise2D(HashU32(Params.Seed ^ 0x5EED1234U));
		CellSize = Params.Size / static_cast<float>(Params.GridResolution);
		const float H = HalfSize();
		VolcanoCenter = IslandDetail::kVolcanoUV * H;
		SwampCenter = IslandDetail::kSwampUV * H;
		MountainCenter = IslandDetail::kMountainUV * H;
		PlainsCenter = IslandDetail::kPlainsUV * H;
		POIs.clear();
		Rivers.clear();
		Lakes.clear();

		AuxGrids& Aux = WaterGrids;
		const size_t N = static_cast<size_t>(Params.GridResolution + 1) * static_cast<size_t>(Params.GridResolution + 1);
		Aux.Res = Params.GridResolution + 1;
		Aux.WaterLevel.assign(N, -1000.0f);
		Aux.WaterKind.assign(N, IslandDetail::WaterNone);
		Aux.RiverDist.assign(N, 1.0e6f);

		BuildHeightGrid();
		PlaceLakes();
		TraceRivers();
		PlacePOIs();
	}

	Vec2 IslandModel::WarpUV(const Vec2& UV) const
	{
		// Distorts region masks so biomes get organic, non-circular borders.
		return Vec2(UV.X + MoistureNoise.Fbm(UV.X * 3.0f + 7.0f, UV.Y * 3.0f, 3) * 0.11f,
			UV.Y + MoistureNoise.Fbm(UV.X * 3.0f, UV.Y * 3.0f - 5.0f, 3) * 0.11f);
	}

	float IslandModel::GridHeightRaw(float X, float Y) const
	{
		using namespace IslandDetail;
		const float H = HalfSize();
		const Vec2 UV(X / H, Y / H);
		const float U = UV.X;
		const float V = UV.Y;

		// Coastline with domain warping, slightly elongated north-south.
		const float R = std::sqrt((U * 0.92f) * (U * 0.92f) + (V * 1.04f) * (V * 1.04f));
		const float CoastWarp = Noise.Warped(U * 1.4f, V * 1.4f, 5, 1.1f);
		const float CoastDetail = Noise.Fbm(U * 7.0f + 11.0f, V * 7.0f - 3.0f, 3);
		// Large bays and peninsulas from low-frequency angular noise.
		const float BayNoise = Noise.Fbm(std::cos(std::atan2(V, U)) * 1.3f + 40.0f, std::sin(std::atan2(V, U)) * 1.3f + 40.0f, 3);
		const float RR = R + CoastWarp * 0.26f + CoastDetail * 0.035f + BayNoise * 0.18f;

		// North coast: high cliffs (sharp falloff + plateau).
		const float Angle = std::atan2(V, U);
		const float Northness = Clamp01(std::cos(Angle - kPi * 0.5f));
		const float CliffSector = SmoothStep(0.55f, 0.85f, Northness);
		const float Edge0 = Lerpf(0.62f, 0.80f, CliffSector);
		const float Edge1 = Lerpf(0.95f, 0.855f, CliffSector);
		const float Land = 1.0f - SmoothStep(Edge0, Edge1, RR);

		const float Hills = Noise.Fbm(U * 3.2f, V * 3.2f, 5) * 0.5f + 0.5f;
		float Height = Land * (5.0f + Hills * 65.0f);
		Height += Land * CliffSector * 32.0f * SmoothStep(0.25f, 0.7f, Land);

		// Central/north-west mountain range.
		const Vec2 WUV = WarpUV(UV);
		const float DM = Dist(WUV, kMountainUV) / 0.52f;
		const float MountainMask = 1.0f - SmoothStep(0.15f, 1.0f, DM);
		const float Ridge = Noise.Ridged(U * 2.6f + 3.0f, V * 2.6f - 1.0f, 5);
		Height += Land * MountainMask * Ridge * Params.MaxHeight * 0.78f;

		// Volcano with crater.
		const float DV = Dist(UV, kVolcanoUV);
		if (DV < 0.27f)
		{
			const float T = 1.0f - DV / 0.27f;
			float Cone = Params.MaxHeight * 0.92f * std::pow(T, 1.7f);
			Cone += Noise.Ridged(U * 9.0f, V * 9.0f, 3) * 18.0f * T;
			if (DV < 0.035f) { Cone -= (1.0f - DV / 0.035f) * 60.0f; }
			Height = std::max(Height, Cone * Land + Height * (1.0f - T));
		}

		// South-west swamp: flat, soggy, with pools at sea level.
		const float DS = Dist(WUV, kSwampUV) / 0.25f;
		const float SwampMask = (1.0f - SmoothStep(0.45f, 1.0f, DS)) * Land;
		Height = Lerpf(Height, 1.1f + Noise.Fbm(U * 16.0f, V * 16.0f, 3) * 1.9f, SwampMask);

		// South-east plains: gentle rolling grassland.
		const float DP = Dist(WUV, kPlainsUV) / 0.30f;
		const float PlainsMask = (1.0f - SmoothStep(0.35f, 1.0f, DP)) * Land;
		Height = Lerpf(Height, 7.0f + Hills * 16.0f, PlainsMask * 0.8f);

		// Sea floor.
		Height -= (1.0f - Land) * 58.0f;
		return Height;
	}

	float& IslandModel::GridAt(int32_t GX, int32_t GY)
	{
		const int32_t Res = Params.GridResolution + 1;
		GX = GX < 0 ? 0 : (GX >= Res ? Res - 1 : GX);
		GY = GY < 0 ? 0 : (GY >= Res ? Res - 1 : GY);
		return Grid[static_cast<size_t>(GY) * static_cast<size_t>(Res) + static_cast<size_t>(GX)];
	}

	float IslandModel::GridValue(int32_t GX, int32_t GY) const
	{
		const int32_t Res = Params.GridResolution + 1;
		GX = GX < 0 ? 0 : (GX >= Res ? Res - 1 : GX);
		GY = GY < 0 ? 0 : (GY >= Res ? Res - 1 : GY);
		return Grid[static_cast<size_t>(GY) * static_cast<size_t>(Res) + static_cast<size_t>(GX)];
	}

	void IslandModel::BuildHeightGrid()
	{
		const int32_t Res = Params.GridResolution + 1;
		Grid.assign(static_cast<size_t>(Res) * static_cast<size_t>(Res), 0.0f);
		const float H = HalfSize();
		for (int32_t GY = 0; GY < Res; ++GY)
		{
			for (int32_t GX = 0; GX < Res; ++GX)
			{
				const float X = -H + static_cast<float>(GX) * CellSize;
				const float Y = -H + static_cast<float>(GY) * CellSize;
				GridAt(GX, GY) = GridHeightRaw(X, Y);
			}
		}
	}

	float IslandModel::SampleGrid(float X, float Y) const
	{
		const float H = HalfSize();
		const float FX = (X + H) / CellSize;
		const float FY = (Y + H) / CellSize;
		const int32_t GX = static_cast<int32_t>(std::floor(FX));
		const int32_t GY = static_cast<int32_t>(std::floor(FY));
		const float TX = FX - static_cast<float>(GX);
		const float TY = FY - static_cast<float>(GY);
		const float A = Lerpf(GridValue(GX, GY), GridValue(GX + 1, GY), TX);
		const float B = Lerpf(GridValue(GX, GY + 1), GridValue(GX + 1, GY + 1), TX);
		return Lerpf(A, B, TY);
	}

	void IslandModel::PlaceLakes()
	{
		AuxGrids& Aux = WaterGrids;
		struct LakeRequest { Vec2 UV; float Radius; float MinH; float MaxH; };
		const LakeRequest Requests[] = {
			{ Vec2(-0.05f, 0.08f), 95.0f, 25.0f, 140.0f },  // highland lake
			{ Vec2(0.18f, -0.42f), 70.0f, 5.0f, 40.0f },    // lowland lagoon
			{ Vec2(-0.30f, 0.12f), 60.0f, 15.0f, 120.0f },  // jungle lake
		};
		const char* Names[] = { "Lago Espejo", "Laguna Verde", "Lago de las Garzas" };
		int Index = 0;
		for (const LakeRequest& Req : Requests)
		{
			Vec3 Spot;
			if (!FindSpot(Req.UV, 600.0f, EBiome::Ocean, true, Req.MinH, Req.MaxH, 0.0f, 12.0f, Spot)) { ++Index; continue; }
			LakeBody Lake;
			Lake.Center = Spot.XY();
			Lake.Radius = Req.Radius;
			Lake.WaterLevel = Spot.Z;
			const float Depth = 7.0f;
			const int32_t Reach = static_cast<int32_t>((Lake.Radius + 40.0f) / CellSize) + 1;
			const float H = HalfSize();
			const int32_t CX = static_cast<int32_t>((Lake.Center.X + H) / CellSize);
			const int32_t CY = static_cast<int32_t>((Lake.Center.Y + H) / CellSize);
			for (int32_t GY = CY - Reach; GY <= CY + Reach; ++GY)
			{
				for (int32_t GX = CX - Reach; GX <= CX + Reach; ++GX)
				{
					if (GX < 0 || GY < 0 || GX >= Aux.Res || GY >= Aux.Res) { continue; }
					const Vec2 P(-H + static_cast<float>(GX) * CellSize, -H + static_cast<float>(GY) * CellSize);
					const float D = (P - Lake.Center).Length();
					float& Cell = GridAt(GX, GY);
					const size_t Idx = static_cast<size_t>(GY) * static_cast<size_t>(Aux.Res) + static_cast<size_t>(GX);
					if (D < Lake.Radius)
					{
						const float T = D / Lake.Radius;
						Cell = std::min(Cell, Lake.WaterLevel - Depth * (1.0f - T * T) - 0.6f);
						Aux.WaterLevel[Idx] = Lake.WaterLevel;
						Aux.WaterKind[Idx] = IslandDetail::WaterLake;
					}
					else if (D < Lake.Radius + 40.0f)
					{
						// Raise a rim so the water body is always contained.
						const float T = SmoothStep(Lake.Radius, Lake.Radius + 40.0f, D);
						Cell = std::max(Cell, Lerpf(Lake.WaterLevel + 0.8f, Cell, T));
					}
				}
			}
			Lakes.push_back(Lake);
			AddPOI("lake_" + std::to_string(Index), Names[Index], EPOIType::Lake, Vec3(Lake.Center.X, Lake.Center.Y, Lake.WaterLevel), Lake.Radius + 30.0f, "Agua dulce y peces de lago.");
			++Index;
		}
	}

	void IslandModel::TraceRivers()
	{
		AuxGrids& Aux = WaterGrids;
		const int32_t Res = Params.GridResolution + 1;
		const float H = HalfSize();

		// 1) Pick springs: high cells in the mountain range, well separated.
		struct Candidate { int32_t GX; int32_t GY; uint32_t Order; };
		std::vector<Candidate> Candidates;
		for (int32_t GY = 2; GY < Res - 2; GY += 3)
		{
			for (int32_t GX = 2; GX < Res - 2; GX += 3)
			{
				const float Hgt = GridValue(GX, GY);
				if (Hgt < Params.MaxHeight * 0.35f || Hgt > Params.MaxHeight * 0.75f) { continue; }
				const Vec2 P(-H + static_cast<float>(GX) * CellSize, -H + static_cast<float>(GY) * CellSize);
				if ((P - VolcanoCenter).Length() < H * 0.33f) { continue; } // no rivers on the volcano
				Candidates.push_back(Candidate{ GX, GY, Hash2D(GX, GY, Params.Seed ^ 0x77U) });
			}
		}
		std::sort(Candidates.begin(), Candidates.end(), [](const Candidate& A, const Candidate& B) { return A.Order < B.Order; });

		std::vector<Vec2> Springs;
		for (const Candidate& C : Candidates)
		{
			const Vec2 P(-H + static_cast<float>(C.GX) * CellSize, -H + static_cast<float>(C.GY) * CellSize);
			bool bFar = true;
			for (const Vec2& S : Springs) { if ((S - P).Length() < 650.0f) { bFar = false; break; } }
			if (bFar) { Springs.push_back(P); }
			if (Springs.size() >= 4) { break; }
		}

		std::vector<uint8_t> Visited(static_cast<size_t>(Res) * static_cast<size_t>(Res), 0);
		const char* FallNames[] = { "Cascada del Trueno", "Cascada Velo de Novia", "Salto del Jaguar", "Cascada Escondida", "Salto de las Nieblas" };
		int32_t FallCount = 0;

		for (size_t RiverIndex = 0; RiverIndex < Springs.size(); ++RiverIndex)
		{
			const Vec2 Spring = Springs[RiverIndex];
			int32_t GX = static_cast<int32_t>((Spring.X + H) / CellSize);
			int32_t GY = static_cast<int32_t>((Spring.Y + H) / CellSize);
			std::vector<Vec2> Path;
			std::vector<float> Terrain;
			bool bMerged = false;
			for (int Step = 0; Step < 4000; ++Step)
			{
				const size_t Idx = static_cast<size_t>(GY) * static_cast<size_t>(Res) + static_cast<size_t>(GX);
				if (Visited[Idx] == 2) { bMerged = true; } // joined an earlier river
				Visited[Idx] = 1;
				const Vec2 P(-H + static_cast<float>(GX) * CellSize, -H + static_cast<float>(GY) * CellSize);
				Path.push_back(P);
				Terrain.push_back(GridValue(GX, GY));
				if (GridValue(GX, GY) < -0.5f || bMerged) { break; }

				// Steepest descent with a little deterministic meander.
				int32_t BestX = GX;
				int32_t BestY = GY;
				float BestScore = 1.0e9f;
				for (int32_t DY = -1; DY <= 1; ++DY)
				{
					for (int32_t DX = -1; DX <= 1; ++DX)
					{
						if (DX == 0 && DY == 0) { continue; }
						const int32_t NX = GX + DX;
						const int32_t NY = GY + DY;
						if (NX < 1 || NY < 1 || NX >= Res - 1 || NY >= Res - 1) { continue; }
						const size_t NIdx = static_cast<size_t>(NY) * static_cast<size_t>(Res) + static_cast<size_t>(NX);
						if (Visited[NIdx] == 1) { continue; }
						const float Diag = (DX != 0 && DY != 0) ? 1.4142f : 1.0f;
						const float Meander = static_cast<float>(Hash2D(NX, NY, Params.Seed + static_cast<uint32_t>(RiverIndex)) & 1023U) / 1023.0f * 0.25f;
						// Bias toward the coast (outward) so flat land and pits never trap the river.
						const Vec2 NP(-H + static_cast<float>(NX) * CellSize, -H + static_cast<float>(NY) * CellSize);
						const Vec2 CP(-H + static_cast<float>(GX) * CellSize, -H + static_cast<float>(GY) * CellSize);
						const float Outward = -(NP.Length() - CP.Length()) / CellSize * 0.6f;
						const float Score = (GridValue(NX, NY) - GridValue(GX, GY)) / Diag + Meander + Outward;
						if (Score < BestScore) { BestScore = Score; BestX = NX; BestY = NY; }
					}
				}
				if (BestX == GX && BestY == GY) { break; }
				GX = BestX;
				GY = BestY;
			}
			if (Path.size() < 20) { continue; }

			// 2) Monotonic bed and carving.
			RiverPath River;
			const float Depth = 2.4f;
			float Bed = Terrain[0] - Depth;
			const size_t Count = Path.size();
			for (size_t I = 0; I < Count; ++I)
			{
				Bed = std::min(Bed, Terrain[I] - Depth);
				const float T = static_cast<float>(I) / static_cast<float>(Count);
				const float Width = 5.0f + 17.0f * T;
				const float Level = std::max(Bed + Depth * 0.75f, 0.05f);
				River.Points.push_back(Vec3(Path[I].X, Path[I].Y, Level));
				River.Widths.push_back(Width);

				const float Half = Width * 0.5f;
				const int32_t Reach = static_cast<int32_t>((Half + 60.0f) / CellSize) + 1;
				const int32_t CX = static_cast<int32_t>((Path[I].X + H) / CellSize);
				const int32_t CY = static_cast<int32_t>((Path[I].Y + H) / CellSize);
				for (int32_t NY = CY - Reach; NY <= CY + Reach; ++NY)
				{
					for (int32_t NX = CX - Reach; NX <= CX + Reach; ++NX)
					{
						if (NX < 0 || NY < 0 || NX >= Res || NY >= Res) { continue; }
						const Vec2 P(-H + static_cast<float>(NX) * CellSize, -H + static_cast<float>(NY) * CellSize);
						const float D = (P - Path[I]).Length();
						const size_t Idx = static_cast<size_t>(NY) * static_cast<size_t>(Res) + static_cast<size_t>(NX);
						Aux.RiverDist[Idx] = std::min(Aux.RiverDist[Idx], D);
						Visited[Idx] = 2;
						float& Cell = GridAt(NX, NY);
						if (D < Half + CellSize)
						{
							const float Prof = Clamp01(D / (Half + CellSize));
							Cell = std::min(Cell, Bed + Prof * Prof * Depth);
							if (D < Half + CellSize * 0.5f && Aux.WaterKind[Idx] != IslandDetail::WaterLake)
							{
								Aux.WaterLevel[Idx] = std::max(Aux.WaterLevel[Idx], Level);
								Aux.WaterKind[Idx] = IslandDetail::WaterRiver;
							}
						}
						else if (D < Half + 16.0f)
						{
							const float BankT = SmoothStep(Half + CellSize, Half + 16.0f, D);
							Cell = std::min(Cell, Lerpf(Bed + Depth + 0.6f, Cell, BankT));
						}
					}
				}
			}

			// 3) Waterfalls: big drops of the original terrain over a short distance.
			for (size_t I = 3; I + 3 < Count && FallCount < 5; ++I)
			{
				const float Drop = Terrain[I - 3] - Terrain[I + 3];
				if (Drop > 14.0f && Terrain[I] > 6.0f)
				{
					const Vec3 Pos(Path[I].X, Path[I].Y, River.Points[I].Z);
					if (DistanceToNearestPOI(Pos.X, Pos.Y) > 250.0f)
					{
						AddPOI("waterfall_" + std::to_string(FallCount), FallNames[FallCount], EPOIType::Waterfall, Pos, 60.0f, "El rugido del agua se oye desde lejos.");
						++FallCount;
						I += 20;
					}
				}
			}
			Rivers.push_back(River);
		}
	}

	bool IslandModel::FindSpot(const Vec2& PreferredUV, float SearchRadiusM, EBiome WantBiome, bool bAnyLand, float MinHeight, float MaxHeight, float MinSlope, float MaxSlope, Vec3& Out) const
	{
		const float H = HalfSize();
		const Vec2 Center = PreferredUV * H;
		const float Step = CellSize * 2.0f;
		const int32_t Rings = static_cast<int32_t>(SearchRadiusM / Step);
		for (int32_t Ring = 0; Ring <= Rings; ++Ring)
		{
			// Walk the square ring deterministically.
			for (int32_t I = -Ring; I <= Ring; ++I)
			{
				for (int32_t J = -Ring; J <= Ring; ++J)
				{
					if (std::abs(I) != Ring && std::abs(J) != Ring) { continue; }
					const float X = Center.X + static_cast<float>(I) * Step;
					const float Y = Center.Y + static_cast<float>(J) * Step;
					if (std::fabs(X) > H - 50.0f || std::fabs(Y) > H - 50.0f) { continue; }
					const float Hgt = SampleGrid(X, Y);
					if (Hgt < MinHeight || Hgt > MaxHeight) { continue; }
					const float Slope = GetSlopeDeg(X, Y);
					if (Slope < MinSlope || Slope > MaxSlope) { continue; }
					const EBiome B = GetBiome(X, Y);
					if (B == EBiome::River || B == EBiome::Lake || B == EBiome::Ocean || B == EBiome::Reef) { continue; }
					if (!bAnyLand && B != WantBiome) { continue; }
					if (DistanceToNearestPOI(X, Y) < 180.0f) { continue; }
					Out = Vec3(X, Y, Hgt);
					return true;
				}
			}
		}
		return false;
	}

	void IslandModel::AddPOI(const std::string& Id, const std::string& Name, EPOIType Type, const Vec3& Pos, float Radius, const std::string& Desc, bool bHidden, const std::string& Tribe)
	{
		PointOfInterest P;
		P.Id = Id;
		P.Name = Name;
		P.Type = Type;
		P.Position = Pos;
		P.Radius = Radius;
		P.Description = Desc;
		P.bHiddenOnMap = bHidden;
		P.TribeId = Tribe;
		POIs.push_back(P);
	}

	float IslandModel::DistanceToNearestPOI(float X, float Y) const
	{
		float Best = 1.0e9f;
		for (const PointOfInterest& P : POIs)
		{
			if (P.Type == EPOIType::Lake) { continue; }
			Best = std::min(Best, (P.Position.XY() - Vec2(X, Y)).Length());
		}
		return Best;
	}

	void IslandModel::PlacePOIs()
	{
		struct Request
		{
			const char* Id; const char* Name; EPOIType Type; Vec2 UV; EBiome Biome; bool bAny;
			float MinH; float MaxH; float MinSlope; float MaxSlope; float Radius; const char* Tribe; bool bHidden; const char* Desc;
		};
		const float MH = Params.MaxHeight;
		const Request Requests[] = {
			{ "crash_site", "Restos del vuelo IU-417", EPOIType::CrashSite, Vec2(0.0f, -0.80f), EBiome::Beach, false, 0.4f, 3.0f, 0.0f, 10.0f, 70.0f, "", false, "El fuselaje humea sobre la arena." },
			{ "plane_tail", "Cola del avion", EPOIType::PlaneTail, Vec2(0.06f, -0.48f), EBiome::Jungle, true, 6.0f, 60.0f, 0.0f, 18.0f, 50.0f, "", false, "La cola se partio y cayo en la selva. La caja negra deberia estar aqui." },
			{ "village_kairu", "Aldea Kairu", EPOIType::Village, Vec2(0.80f, -0.10f), EBiome::Beach, false, 0.6f, 6.0f, 0.0f, 9.0f, 120.0f, "kairu", false, "Palafitos y redes de pesca junto al mar." },
			{ "village_vesh", "Aldea Vesh'ka", EPOIType::Village, Vec2(-0.46f, 0.0f), EBiome::Jungle, true, 8.0f, 90.0f, 0.0f, 10.0f, 120.0f, "veshka", false, "Totems de hueso y empalizadas en la selva profunda." },
			{ "village_ash", "Bastion Ceniza", EPOIType::Village, Vec2(0.20f, 0.50f), EBiome::Forest, true, 30.0f, MH * 0.5f, 0.0f, 12.0f, 120.0f, "ashborn", false, "Muros de piedra negra a la sombra del volcan." },
			{ "ruins_sun", "Templo del Sol", EPOIType::Ruins, Vec2(-0.16f, -0.26f), EBiome::Jungle, true, 8.0f, 120.0f, 0.0f, 16.0f, 70.0f, "", false, "Escalinatas cubiertas de raices." },
			{ "ruins_observatory", "Observatorio de Piedra", EPOIType::Ruins, Vec2(-0.24f, 0.40f), EBiome::Mountain, true, MH * 0.3f, MH, 0.0f, 22.0f, 60.0f, "", false, "Un circulo de monolitos alineados con las estrellas." },
			{ "ruins_sunken", "Puerta Hundida", EPOIType::Ruins, Vec2(-0.40f, -0.33f), EBiome::Swamp, true, -0.5f, 8.0f, 0.0f, 20.0f, 60.0f, "", false, "Un arco de piedra medio sumergido en el pantano." },
			{ "cave_echo", "Cueva del Eco", EPOIType::Cave, Vec2(-0.08f, 0.20f), EBiome::Mountain, true, 25.0f, MH, 18.0f, 60.0f, 40.0f, "", false, "Una grieta oscura en la ladera." },
			{ "cave_crystal", "Gruta de Cristal", EPOIType::Cave, Vec2(-0.32f, 0.44f), EBiome::Mountain, true, 40.0f, MH, 15.0f, 60.0f, 40.0f, "", false, "Destellos azules en la oscuridad." },
			{ "cave_cliff", "Cueva del Acantilado", EPOIType::Cave, Vec2(0.0f, 0.80f), EBiome::Cliff, true, 8.0f, MH, 20.0f, 70.0f, 40.0f, "", false, "Una boca de roca sobre el mar." },
			{ "cave_lava", "Tunel de Lava", EPOIType::Cave, Vec2(0.46f, 0.20f), EBiome::Volcanic, true, 20.0f, MH, 8.0f, 60.0f, 40.0f, "", false, "Aire caliente sale de la roca." },
			{ "facility", "Estacion Meridian", EPOIType::Facility, Vec2(-0.04f, 0.56f), EBiome::Mountain, true, 60.0f, MH, 0.0f, 14.0f, 90.0f, "", false, "Hormigon y antenas oxidadas. Alguien estuvo aqui antes." },
			{ "camp_old", "Campamento abandonado", EPOIType::Camp, Vec2(0.16f, -0.20f), EBiome::Forest, true, 5.0f, 120.0f, 0.0f, 15.0f, 45.0f, "", false, "Tiendas rasgadas y una hoguera fria." },
			{ "lighthouse", "Faro en ruinas", EPOIType::Lighthouse, Vec2(-0.38f, 0.70f), EBiome::Cliff, true, 12.0f, MH, 0.0f, 25.0f, 60.0f, "", false, "La linterna lleva decadas apagada." },
			{ "volcano", "Monte Ceniza", EPOIType::Volcano, Vec2(0.40f, 0.33f), EBiome::Volcanic, true, MH * 0.4f, MH * 2.0f, 0.0f, 80.0f, 120.0f, "", false, "El volcano domina el noreste de la isla." },
			{ "secret_caldera", "La Caldera", EPOIType::Secret, Vec2(0.40f, 0.33f), EBiome::Volcanic, true, 0.0f, MH * 2.0f, 0.0f, 90.0f, 45.0f, "", true, "En el corazon del crater, algo brilla." },
			{ "secret_bluegrotto", "Gruta Azul", EPOIType::Secret, Vec2(0.55f, 0.60f), EBiome::Beach, true, 0.3f, 25.0f, 0.0f, 60.0f, 35.0f, "", true, "Una cueva marina que solo se ve desde la orilla." },
		};

		for (const Request& R : Requests)
		{
			Vec3 Spot;
			bool bFound = FindSpot(R.UV, 700.0f, R.Biome, R.bAny, R.MinH, R.MaxH, R.MinSlope, R.MaxSlope, Spot);
			if (!bFound)
			{
				// Relax constraints: any land with a sane slope near the preferred spot.
				bFound = FindSpot(R.UV, 1200.0f, R.Biome, true, 0.3f, Params.MaxHeight * 2.0f, 0.0f, 45.0f, Spot);
			}
			if (!bFound) { continue; }
			AddPOI(R.Id, R.Name, R.Type, Spot, R.Radius, R.Desc, R.bHidden, R.Tribe);
		}

		// The caldera secret sits exactly in the crater, which FindSpot cannot pick (too close to the landmark).
		for (PointOfInterest& P : POIs)
		{
			if (P.Id == "secret_caldera") { P.Position = Vec3(VolcanoCenter.X, VolcanoCenter.Y, SampleGrid(VolcanoCenter.X, VolcanoCenter.Y)); }
		}
		if (!FindPOI("secret_caldera"))
		{
			AddPOI("secret_caldera", "La Caldera", EPOIType::Secret, Vec3(VolcanoCenter.X, VolcanoCenter.Y, SampleGrid(VolcanoCenter.X, VolcanoCenter.Y)), 45.0f, "En el corazon del crater, algo brilla.", true);
		}

		// Flatten village and facility sites so buildings sit on level ground.
		AuxGrids& Aux = WaterGrids;
		const float H = HalfSize();
		for (const PointOfInterest& P : POIs)
		{
			const bool bFlatten = P.Type == EPOIType::Village || P.Type == EPOIType::Facility || P.Type == EPOIType::Camp || P.Type == EPOIType::CrashSite;
			if (!bFlatten) { continue; }
			const float Radius = P.Type == EPOIType::Village ? 70.0f : 40.0f;
			const int32_t Reach = static_cast<int32_t>((Radius + 30.0f) / CellSize) + 1;
			const int32_t CX = static_cast<int32_t>((P.Position.X + H) / CellSize);
			const int32_t CY = static_cast<int32_t>((P.Position.Y + H) / CellSize);
			for (int32_t GY = CY - Reach; GY <= CY + Reach; ++GY)
			{
				for (int32_t GX = CX - Reach; GX <= CX + Reach; ++GX)
				{
					if (GX < 0 || GY < 0 || GX >= Aux.Res || GY >= Aux.Res) { continue; }
					const size_t Idx = static_cast<size_t>(GY) * static_cast<size_t>(Aux.Res) + static_cast<size_t>(GX);
					if (Aux.WaterKind[Idx] != IslandDetail::WaterNone) { continue; }
					const Vec2 C(-H + static_cast<float>(GX) * CellSize, -H + static_cast<float>(GY) * CellSize);
					const float D = (C - P.Position.XY()).Length();
					const float T = SmoothStep(Radius, Radius + 30.0f, D);
					float& Cell = GridAt(GX, GY);
					Cell = Lerpf(std::max(P.Position.Z, 0.6f), Cell, T);
				}
			}
		}
		// Re-read heights after flattening.
		for (PointOfInterest& P : POIs) { P.Position.Z = GetHeight(P.Position.X, P.Position.Y); }

		if (const PointOfInterest* Crash = FindPOI("crash_site"))
		{
			// Wake up a little inland from the wreck, facing it.
			Vec2 Inland = Vec2(-Crash->Position.X, -Crash->Position.Y).Normalized();
			const Vec2 SpawnXY = Crash->Position.XY() + Inland * 14.0f;
			PlayerSpawn = Vec3(SpawnXY.X, SpawnXY.Y, GetHeight(SpawnXY.X, SpawnXY.Y));
		}
		else
		{
			PlayerSpawn = Vec3(0.0f, 0.0f, GetHeight(0.0f, 0.0f));
		}
	}

	// ------------------------------------------------------------------------------------------------
	// Queries
	// ------------------------------------------------------------------------------------------------

	float IslandModel::GetHeight(float X, float Y) const
	{
		const float Base = SampleGrid(X, Y);
		const AuxGrids* Aux = &WaterGrids;
		float DetailMask = Clamp01((Base - 0.5f) / 4.0f);
		if (Aux && Aux->Res > 0)
		{
			const float H = HalfSize();
			const int32_t GX = static_cast<int32_t>(std::lround((X + H) / CellSize));
			const int32_t GY = static_cast<int32_t>(std::lround((Y + H) / CellSize));
			if (GX >= 0 && GY >= 0 && GX < Aux->Res && GY < Aux->Res)
			{
				const size_t Idx = static_cast<size_t>(GY) * static_cast<size_t>(Aux->Res) + static_cast<size_t>(GX);
				if (Aux->WaterKind[Idx] != IslandDetail::WaterNone) { DetailMask = 0.0f; }
				else if (Aux->RiverDist[Idx] < 30.0f) { DetailMask *= Aux->RiverDist[Idx] / 30.0f; }
			}
		}
		if (DetailMask <= 0.0f) { return Base; }
		const float Detail = DetailNoise.Fbm(X / 22.0f, Y / 22.0f, 3) * 0.9f + DetailNoise.Perlin(X / 5.0f, Y / 5.0f) * 0.12f;
		return Base + Detail * DetailMask;
	}

	Vec3 IslandModel::GetNormal(float X, float Y) const
	{
		const float E = 1.0f;
		const float HL = GetHeight(X - E, Y);
		const float HR = GetHeight(X + E, Y);
		const float HD = GetHeight(X, Y - E);
		const float HU = GetHeight(X, Y + E);
		return Vec3(HL - HR, HD - HU, 2.0f * E).Normalized();
	}

	float IslandModel::GetSlopeDeg(float X, float Y) const
	{
		const float E = CellSize;
		const float DX = (SampleGrid(X + E, Y) - SampleGrid(X - E, Y)) / (2.0f * E);
		const float DY = (SampleGrid(X, Y + E) - SampleGrid(X, Y - E)) / (2.0f * E);
		return std::atan(std::sqrt(DX * DX + DY * DY)) * kRadToDeg;
	}

	float IslandModel::GetWaterLevel(float X, float Y) const
	{
		const AuxGrids* Aux = &WaterGrids;
		if (!Aux || Aux->Res == 0) { return 0.0f; }
		const float H = HalfSize();
		const int32_t GX = static_cast<int32_t>(std::lround((X + H) / CellSize));
		const int32_t GY = static_cast<int32_t>(std::lround((Y + H) / CellSize));
		if (GX < 0 || GY < 0 || GX >= Aux->Res || GY >= Aux->Res) { return 0.0f; }
		const size_t Idx = static_cast<size_t>(GY) * static_cast<size_t>(Aux->Res) + static_cast<size_t>(GX);
		return Aux->WaterKind[Idx] != IslandDetail::WaterNone ? std::max(0.0f, Aux->WaterLevel[Idx]) : 0.0f;
	}

	EWaterZone IslandModel::GetWaterZone(float X, float Y) const
	{
		if (GetWaterDepth(X, Y) <= 0.2f) { return EWaterZone::None; }
		switch (GetBiome(X, Y))
		{
		case EBiome::River: return EWaterZone::River;
		case EBiome::Lake: return EWaterZone::Lake;
		case EBiome::Swamp: return EWaterZone::Swamp;
		case EBiome::Reef: return EWaterZone::Reef;
		default: return EWaterZone::Sea;
		}
	}

	float IslandModel::DistanceToRiver(float X, float Y, float* OutWaterLevel, float* OutWidth) const
	{
		float Best = 1.0e9f;
		for (const RiverPath& R : Rivers)
		{
			for (size_t I = 0; I < R.Points.size(); ++I)
			{
				const float D = (R.Points[I].XY() - Vec2(X, Y)).Length();
				if (D < Best)
				{
					Best = D;
					if (OutWaterLevel) { *OutWaterLevel = R.Points[I].Z; }
					if (OutWidth) { *OutWidth = R.Widths[I]; }
				}
			}
		}
		return Best;
	}

	bool IslandModel::IsInsideLake(float X, float Y, const LakeBody** OutLake) const
	{
		for (const LakeBody& L : Lakes)
		{
			if ((L.Center - Vec2(X, Y)).Length() < L.Radius)
			{
				if (OutLake) { *OutLake = &L; }
				return true;
			}
		}
		return false;
	}

	EBiome IslandModel::GetBiome(float X, float Y) const
	{
		using namespace IslandDetail;
		const AuxGrids* Aux = &WaterGrids;
		const float H = HalfSize();
		float RiverDistance = 1.0e6f;
		if (Aux && Aux->Res > 0)
		{
			const int32_t GX = static_cast<int32_t>(std::lround((X + H) / CellSize));
			const int32_t GY = static_cast<int32_t>(std::lround((Y + H) / CellSize));
			if (GX >= 0 && GY >= 0 && GX < Aux->Res && GY < Aux->Res)
			{
				const size_t Idx = static_cast<size_t>(GY) * static_cast<size_t>(Aux->Res) + static_cast<size_t>(GX);
				if (Aux->WaterKind[Idx] == WaterLake) { return EBiome::Lake; }
				if (Aux->WaterKind[Idx] == WaterRiver) { return EBiome::River; }
				RiverDistance = Aux->RiverDist[Idx];
			}
		}
		const float Hgt = SampleGrid(X, Y);
		const Vec2 UV(X / H, Y / H);
		const Vec2 WUV = WarpUV(UV);
		if (Hgt < -0.8f)
		{
			const bool bEastReef = UV.X > 0.35f && UV.Y < 0.2f && Hgt > -9.0f;
			return bEastReef ? EBiome::Reef : EBiome::Ocean;
		}
		if (Dist(WUV, kVolcanoUV) < 0.17f + Noise.Fbm(UV.X * 9.0f, UV.Y * 9.0f, 2) * 0.05f && Hgt > 20.0f) { return EBiome::Volcanic; }
		const float SwampMask = 1.0f - SmoothStep(0.45f, 1.0f, Dist(WUV, kSwampUV) / 0.25f);
		if (SwampMask > 0.45f && Hgt < 6.0f) { return EBiome::Swamp; }
		if (Hgt < 2.8f) { return EBiome::Beach; }
		if (GetSlopeDeg(X, Y) > 38.0f) { return EBiome::Cliff; }
		if (Hgt > Params.MaxHeight * 0.42f) { return EBiome::Mountain; }
		float Moisture = MoistureNoise.Fbm(UV.X * 4.0f, UV.Y * 4.0f, 3) * 0.5f + 0.5f;
		if (RiverDistance < 80.0f) { Moisture += 0.2f * (1.0f - RiverDistance / 80.0f); }
		Moisture -= Hgt * 0.0012f;
		const float PlainsMask = 1.0f - SmoothStep(0.35f, 1.0f, Dist(WUV, kPlainsUV) / 0.30f);
		if (PlainsMask > 0.5f && Moisture < 0.68f) { return EBiome::Plains; }
		return Moisture > 0.5f ? EBiome::Jungle : EBiome::Forest;
	}

	float IslandModel::GetBaseTemperature(float X, float Y) const
	{
		float Base = 26.0f;
		switch (GetBiome(X, Y))
		{
		case EBiome::Beach: Base = 29.0f; break;
		case EBiome::Jungle: Base = 28.0f; break;
		case EBiome::Forest: Base = 25.0f; break;
		case EBiome::Plains: Base = 27.5f; break;
		case EBiome::Swamp: Base = 27.0f; break;
		case EBiome::Mountain: Base = 22.0f; break;
		case EBiome::Volcanic: Base = 34.0f; break;
		case EBiome::Cliff: Base = 23.0f; break;
		case EBiome::River: case EBiome::Lake: Base = 24.0f; break;
		case EBiome::Ocean: case EBiome::Reef: Base = 25.0f; break;
		}
		// Atmospheric lapse rate: -6.5C per 1000 m.
		return Base - std::max(0.0f, GetHeight(X, Y)) * 0.0065f;
	}

	const PointOfInterest* IslandModel::FindPOI(const std::string& Id) const
	{
		for (const PointOfInterest& P : POIs) { if (P.Id == Id) { return &P; } }
		return nullptr;
	}

	const PointOfInterest* IslandModel::FindNearestPOI(float X, float Y, EPOIType Type) const
	{
		const PointOfInterest* Best = nullptr;
		float BestD = 1.0e9f;
		for (const PointOfInterest& P : POIs)
		{
			if (P.Type != Type) { continue; }
			const float D = (P.Position.XY() - Vec2(X, Y)).Length();
			if (D < BestD) { BestD = D; Best = &P; }
		}
		return Best;
	}

	float IslandModel::ExclusionRadiusAt(float X, float Y) const
	{
		// Returns > 0 if (X,Y) lies inside a POI clearing.
		for (const PointOfInterest& P : POIs)
		{
			float Clear = 0.0f;
			switch (P.Type)
			{
			case EPOIType::Village: Clear = 75.0f; break;
			case EPOIType::CrashSite: Clear = 35.0f; break;
			case EPOIType::Facility: Clear = 45.0f; break;
			case EPOIType::Camp: Clear = 15.0f; break;
			case EPOIType::Ruins: Clear = 22.0f; break;
			case EPOIType::Cave: Clear = 10.0f; break;
			default: break;
			}
			if (Clear > 0.0f && (P.Position.XY() - Vec2(X, Y)).Length() < Clear) { return Clear; }
		}
		return 0.0f;
	}

	std::vector<ScatterInstance> IslandModel::ScatterRegion(float MinX, float MinY, float RegionSize) const
	{
		std::vector<ScatterInstance> Out;
		if (!Resources) { return Out; }
		const float Cell = Params.ScatterCell;
		const int32_t X0 = static_cast<int32_t>(std::floor(MinX / Cell));
		const int32_t Y0 = static_cast<int32_t>(std::floor(MinY / Cell));
		const int32_t X1 = static_cast<int32_t>(std::floor((MinX + RegionSize) / Cell));
		const int32_t Y1 = static_cast<int32_t>(std::floor((MinY + RegionSize) / Cell));
		const std::vector<ResourceNodeDef>& Nodes = Resources->All();

		for (int32_t IY = Y0; IY < Y1; ++IY)
		{
			for (int32_t IX = X0; IX < X1; ++IX)
			{
				const uint32_t Hash = Hash2D(IX, IY, Params.Seed ^ 0x5CA77E12U);
				const float Roll = static_cast<float>(Hash & 0xFFFFU) / 65536.0f;
				const float JX = static_cast<float>((Hash >> 16) & 0xFFU) / 255.0f;
				const float JY = static_cast<float>((Hash >> 24) & 0xFFU) / 255.0f;
				const float X = (static_cast<float>(IX) + JX) * Cell;
				const float Y = (static_cast<float>(IY) + JY) * Cell;
				if (std::fabs(X) > HalfSize() || std::fabs(Y) > HalfSize()) { continue; }

				const EBiome Biome = GetBiome(X, Y);
				if (Biome == EBiome::Ocean || Biome == EBiome::Reef || Biome == EBiome::Lake || Biome == EBiome::River) { continue; }
				const float Z = GetHeight(X, Y);
				const bool bWet = GetWaterDepth(X, Y) > 0.15f;
				const char* BiomeName = BiomeToString(Biome);

				float Cumulative = 0.0f;
				for (size_t N = 0; N < Nodes.size(); ++N)
				{
					const auto It = Nodes[N].Density.find(BiomeName);
					if (It == Nodes[N].Density.end()) { continue; }
					Cumulative += It->second;
					if (Roll >= Cumulative) { continue; }

					const ResourceNodeDef& Def = Nodes[N];
					if (bWet && Def.Visual != "reeds") { break; }
					if (Def.bBlocking && ExclusionRadiusAt(X, Y) > 0.0f) { break; }
					ScatterInstance Inst;
					Inst.NodeIndex = static_cast<int32_t>(N);
					Inst.Position = Vec3(X, Y, Z);
					const uint32_t H2 = HashU32(Hash ^ 0x9E3779B9U);
					Inst.Yaw = static_cast<float>(H2 % 360U);
					Inst.Scale = Lerpf(Def.ScaleMin, Def.ScaleMax, static_cast<float>((H2 >> 9) & 1023U) / 1023.0f);
					Inst.StableId = Hash2D(IX, IY, 0xC0FFEEU);
					Out.push_back(Inst);
					break;
				}
			}
		}
		return Out;
	}

	std::vector<uint8_t> IslandModel::BuildMapImage(int32_t Resolution) const
	{
		std::vector<uint8_t> Pixels(static_cast<size_t>(Resolution) * static_cast<size_t>(Resolution) * 4U, 255U);
		const float H = HalfSize();
		for (int32_t PY = 0; PY < Resolution; ++PY)
		{
			for (int32_t PX = 0; PX < Resolution; ++PX)
			{
				const float X = -H + (static_cast<float>(PX) + 0.5f) / static_cast<float>(Resolution) * Params.Size;
				// Image row 0 is north (+Y).
				const float Y = H - (static_cast<float>(PY) + 0.5f) / static_cast<float>(Resolution) * Params.Size;
				const EBiome B = GetBiome(X, Y);
				const float Hgt = SampleGrid(X, Y);
				float R = 0.0f, G = 0.0f, Bl = 0.0f;
				switch (B)
				{
				case EBiome::Ocean: { const float D = Clamp01(-Hgt / 60.0f); R = Lerpf(0.16f, 0.05f, D); G = Lerpf(0.42f, 0.17f, D); Bl = Lerpf(0.55f, 0.33f, D); break; }
				case EBiome::Reef: R = 0.22f; G = 0.62f; Bl = 0.64f; break;
				case EBiome::Beach: R = 0.86f; G = 0.79f; Bl = 0.58f; break;
				case EBiome::Jungle: R = 0.17f; G = 0.38f; Bl = 0.16f; break;
				case EBiome::Forest: R = 0.27f; G = 0.45f; Bl = 0.22f; break;
				case EBiome::Plains: R = 0.55f; G = 0.60f; Bl = 0.30f; break;
				case EBiome::Swamp: R = 0.30f; G = 0.36f; Bl = 0.22f; break;
				case EBiome::Mountain: R = 0.50f; G = 0.47f; Bl = 0.42f; break;
				case EBiome::Volcanic: R = 0.25f; G = 0.20f; Bl = 0.19f; break;
				case EBiome::Cliff: R = 0.44f; G = 0.41f; Bl = 0.37f; break;
				case EBiome::River: case EBiome::Lake: R = 0.20f; G = 0.50f; Bl = 0.66f; break;
				}
				if (Hgt > 0.0f && B != EBiome::River && B != EBiome::Lake)
				{
					// Hill shading from the north-west.
					const float Shade = Clampf(1.0f + (SampleGrid(X - CellSize, Y + CellSize) - Hgt) * -0.03f + Hgt / Params.MaxHeight * 0.25f, 0.6f, 1.35f);
					R *= Shade; G *= Shade; Bl *= Shade;
				}
				const size_t Idx = (static_cast<size_t>(PY) * static_cast<size_t>(Resolution) + static_cast<size_t>(PX)) * 4U;
				Pixels[Idx + 0] = static_cast<uint8_t>(Clamp01(R) * 255.0f);
				Pixels[Idx + 1] = static_cast<uint8_t>(Clamp01(G) * 255.0f);
				Pixels[Idx + 2] = static_cast<uint8_t>(Clamp01(Bl) * 255.0f);
				Pixels[Idx + 3] = 255U;
			}
		}
		return Pixels;
	}
}
