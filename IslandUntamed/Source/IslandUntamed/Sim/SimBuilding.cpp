#include "SimBuilding.h"

namespace IUSim
{
	EBuildCategory BuildCategoryFromString(const std::string& S)
	{
		if (S == "wall") { return EBuildCategory::Wall; }
		if (S == "roof") { return EBuildCategory::Roof; }
		if (S == "door") { return EBuildCategory::Door; }
		if (S == "stairs") { return EBuildCategory::Stairs; }
		if (S == "fence") { return EBuildCategory::Fence; }
		if (S == "station") { return EBuildCategory::Station; }
		if (S == "storage") { return EBuildCategory::Storage; }
		if (S == "defense") { return EBuildCategory::Defense; }
		if (S == "farm") { return EBuildCategory::Farm; }
		if (S == "shelter") { return EBuildCategory::Shelter; }
		if (S == "light") { return EBuildCategory::Light; }
		return EBuildCategory::Foundation;
	}

	const char* BuildCategoryToString(EBuildCategory C)
	{
		switch (C)
		{
		case EBuildCategory::Foundation: return "Suelos";
		case EBuildCategory::Wall: return "Paredes";
		case EBuildCategory::Roof: return "Techos";
		case EBuildCategory::Door: return "Puertas";
		case EBuildCategory::Stairs: return "Escaleras";
		case EBuildCategory::Fence: return "Vallas";
		case EBuildCategory::Station: return "Estaciones";
		case EBuildCategory::Storage: return "Almacenaje";
		case EBuildCategory::Defense: return "Defensa";
		case EBuildCategory::Farm: return "Cultivo";
		case EBuildCategory::Shelter: return "Refugios";
		case EBuildCategory::Light: return "Luz";
		}
		return "";
	}

	const char* PlacementFailToText(EPlacementFail F)
	{
		switch (F)
		{
		case EPlacementFail::None: return "";
		case EPlacementFail::NoGround: return "Necesita apoyarse en el suelo";
		case EPlacementFail::TooSteep: return "Terreno demasiado inclinado";
		case EPlacementFail::Floating: return "La estructura quedaria flotando";
		case EPlacementFail::Overlap: return "Atraviesa otro objeto";
		case EPlacementFail::Water: return "No se puede construir en agua profunda";
		case EPlacementFail::TribeTerritory: return "Territorio de una tribu";
		case EPlacementFail::TooFar: return "Demasiado lejos";
		case EPlacementFail::MissingMaterials: return "Faltan materiales";
		}
		return "";
	}

	namespace BuildingDbDetail
	{
		ESnapMode SnapFromString(const std::string& S)
		{
			if (S == "grid") { return ESnapMode::Grid; }
			if (S == "edge") { return ESnapMode::WallEdge; }
			if (S == "top") { return ESnapMode::OnTop; }
			return ESnapMode::Free;
		}

		Vec3 ReadVec3(const JsonValue* A, const Vec3& Default)
		{
			if (!A || !A->IsArray() || A->Items().size() < 3) { return Default; }
			return Vec3(A->Items()[0].AsFloat(), A->Items()[1].AsFloat(), A->Items()[2].AsFloat());
		}
	}

	bool BuildingDatabase::LoadFromJson(const JsonValue& Root, const ItemDatabase& Items, std::string& OutError)
	{
		const JsonValue* Arr = Root.Find("buildings");
		if (!Arr || !Arr->IsArray()) { OutError = "buildings.json: missing 'buildings' array"; return false; }
		for (const JsonValue& J : Arr->Items())
		{
			BuildingDef D;
			D.Id = J.GetString("id");
			if (D.Id.empty()) { OutError = "buildings.json: building without id"; return false; }
			D.Name = J.GetString("name", D.Id);
			D.Description = J.GetString("desc");
			D.Category = BuildCategoryFromString(J.GetString("category", "foundation"));
			D.Snap = BuildingDbDetail::SnapFromString(J.GetString("snap", "free"));
			D.Size = BuildingDbDetail::ReadVec3(J.Find("size"), Vec3(2.0f, 2.0f, 2.0f));
			D.MaxHealth = J.GetFloat("health", 300.0f);
			D.MaxSlopeDeg = J.GetFloat("max_slope", 30.0f);
			D.bRequiresGround = J.GetBool("requires_ground", true);
			D.bProvidesRoof = J.GetBool("roof", false);
			D.bBlocksMovement = J.GetBool("blocks", true);
			D.Station = J.GetString("station");
			D.StorageSlots = J.GetInt("storage", 0);
			D.bIsBed = J.GetBool("bed", false);
			D.bIsFarmPlot = J.GetBool("farm", false);
			D.LightRadius = J.GetFloat("light", 0.0f);
			D.HeatRadius = J.GetFloat("heat", 0.0f);
			D.FuelCapacity = J.GetFloat("fuel_capacity", 0.0f);
			D.TrapDamage = J.GetFloat("trap_damage", 0.0f);
			D.Material = J.GetString("material", "wood");
			D.bUnlockedByDefault = J.GetBool("unlocked", true);
			if (const JsonValue* Cost = J.Find("cost"))
			{
				for (const JsonValue& C : Cost->Items())
				{
					ItemAmount A{ C.GetString("item"), C.GetInt("count", 1) };
					if (!Items.Contains(A.ItemId)) { OutError = "buildings.json: '" + D.Id + "' costs unknown item '" + A.ItemId + "'"; return false; }
					D.Cost.push_back(A);
				}
			}
			if (const JsonValue* Prefab = J.Find("prefab"))
			{
				for (const JsonValue& P : Prefab->Items())
				{
					PrefabPart Part;
					Part.PieceId = P.GetString("piece");
					Part.Offset = BuildingDbDetail::ReadVec3(P.Find("offset"), Vec3());
					Part.Yaw = P.GetFloat("yaw", 0.0f);
					D.Prefab.push_back(Part);
				}
			}
			Defs.push_back(D);
		}
		// Prefab parts must reference existing non-prefab pieces.
		for (const BuildingDef& D : Defs)
		{
			for (const PrefabPart& P : D.Prefab)
			{
				const BuildingDef* Part = Find(P.PieceId);
				if (!Part || !Part->Prefab.empty()) { OutError = "buildings.json: prefab '" + D.Id + "' has invalid part '" + P.PieceId + "'"; return false; }
			}
		}
		return true;
	}

	const BuildingDef* BuildingDatabase::Find(const std::string& Id) const
	{
		for (const BuildingDef& D : Defs) { if (D.Id == Id) { return &D; } }
		return nullptr;
	}

	Vec3 BuildRules::RotateYaw(const Vec3& V, float YawDeg)
	{
		const float R = YawDeg * kDegToRad;
		const float C = std::cos(R);
		const float S = std::sin(R);
		return Vec3(V.X * C - V.Y * S, V.X * S + V.Y * C, V.Z);
	}

	PieceTransform BuildRules::SnapToGrid(const PieceTransform& In)
	{
		PieceTransform Out = In;
		Out.Position.X = std::round(In.Position.X / GridSize) * GridSize;
		Out.Position.Y = std::round(In.Position.Y / GridSize) * GridSize;
		Out.Yaw = std::round(In.Yaw / 90.0f) * 90.0f;
		while (Out.Yaw < 0.0f) { Out.Yaw += 360.0f; }
		while (Out.Yaw >= 360.0f) { Out.Yaw -= 360.0f; }
		return Out;
	}

	std::vector<PieceTransform> BuildRules::SnapCandidates(const BuildingDef& ExistingDef, const PieceTransform& Existing, const BuildingDef& NewDef)
	{
		std::vector<PieceTransform> Out;
		const Vec3& S = ExistingDef.Size;
		const auto Add = [&Out, &Existing](const Vec3& LocalOffset, float LocalYaw)
		{
			PieceTransform T;
			T.Position = Existing.Position + RotateYaw(LocalOffset, Existing.Yaw);
			T.Yaw = Existing.Yaw + LocalYaw;
			Out.push_back(T);
		};

		const EBuildCategory EC = ExistingDef.Category;
		const EBuildCategory NC = NewDef.Category;
		const bool bNewIsWallLike = NC == EBuildCategory::Wall || NC == EBuildCategory::Door;

		if (EC == EBuildCategory::Foundation)
		{
			if (NC == EBuildCategory::Foundation)
			{
				Add(Vec3(S.X, 0.0f, 0.0f), 0.0f);
				Add(Vec3(-S.X, 0.0f, 0.0f), 0.0f);
				Add(Vec3(0.0f, S.Y, 0.0f), 0.0f);
				Add(Vec3(0.0f, -S.Y, 0.0f), 0.0f);
			}
			else if (bNewIsWallLike)
			{
				Add(Vec3(0.0f, S.Y * 0.5f, S.Z), 0.0f);
				Add(Vec3(0.0f, -S.Y * 0.5f, S.Z), 0.0f);
				Add(Vec3(S.X * 0.5f, 0.0f, S.Z), 90.0f);
				Add(Vec3(-S.X * 0.5f, 0.0f, S.Z), 90.0f);
			}
			else if (NC == EBuildCategory::Roof)
			{
				Add(Vec3(0.0f, 0.0f, S.Z + 2.5f), 0.0f); // standard wall height
			}
			else if (NewDef.Snap == ESnapMode::OnTop || NC == EBuildCategory::Stairs)
			{
				Add(Vec3(0.0f, 0.0f, S.Z), 0.0f);
			}
		}
		else if (EC == EBuildCategory::Wall || EC == EBuildCategory::Door)
		{
			if (NC == EBuildCategory::Roof)
			{
				// Roof square centered on either side of the wall at its top.
				Add(Vec3(0.0f, NewDef.Size.Y * 0.5f, S.Z), 0.0f);
				Add(Vec3(0.0f, -NewDef.Size.Y * 0.5f, S.Z), 0.0f);
			}
			else if (bNewIsWallLike)
			{
				Add(Vec3(0.0f, 0.0f, S.Z), 0.0f);        // stack (second storey)
				Add(Vec3(S.X, 0.0f, 0.0f), 0.0f);        // continue the wall line
				Add(Vec3(-S.X, 0.0f, 0.0f), 0.0f);
			}
		}
		else if (EC == EBuildCategory::Roof && NC == EBuildCategory::Roof)
		{
			Add(Vec3(S.X, 0.0f, 0.0f), 0.0f);
			Add(Vec3(-S.X, 0.0f, 0.0f), 0.0f);
			Add(Vec3(0.0f, S.Y, 0.0f), 0.0f);
			Add(Vec3(0.0f, -S.Y, 0.0f), 0.0f);
		}
		else if (EC == EBuildCategory::Fence && NC == EBuildCategory::Fence)
		{
			Add(Vec3(S.X, 0.0f, 0.0f), 0.0f);
			Add(Vec3(-S.X, 0.0f, 0.0f), 0.0f);
		}
		return Out;
	}

	bool BuildRules::BestSnap(const std::vector<PieceTransform>& Candidates, const Vec3& Aim, float MaxDistance, PieceTransform& Out)
	{
		float Best = MaxDistance;
		bool bFound = false;
		for (const PieceTransform& C : Candidates)
		{
			const float D = (C.Position - Aim).Length();
			if (D < Best) { Best = D; Out = C; bFound = true; }
		}
		return bFound;
	}

	EPlacementFail BuildRules::Validate(const BuildingDef& Def, const PlacementProbe& Probe)
	{
		if (Probe.DistanceToPlayer > MaxPlaceDistance + 4.0f) { return EPlacementFail::TooFar; }
		if (Probe.bInsideTribeTerritory) { return EPlacementFail::TribeTerritory; }
		if (Probe.bInDeepWater) { return EPlacementFail::Water; }
		if (!Probe.bSupportedByStructure)
		{
			if (Def.bRequiresGround && !Probe.bHitGround) { return EPlacementFail::NoGround; }
			if (Probe.bHitGround && Probe.GroundSlopeDeg > Def.MaxSlopeDeg) { return EPlacementFail::TooSteep; }
			if (Def.bRequiresGround && Probe.GapToGround > MaxGap) { return EPlacementFail::Floating; }
			// Walls/roofs can never stand on their own.
			if (Def.Category == EBuildCategory::Wall || Def.Category == EBuildCategory::Roof || Def.Category == EBuildCategory::Door)
			{
				return EPlacementFail::Floating;
			}
		}
		if (Probe.bOverlapsBlocking) { return EPlacementFail::Overlap; }
		return EPlacementFail::None;
	}

	EPlacementFail BuildRules::ValidateWithCost(const BuildingDef& Def, const PlacementProbe& Probe, const Inventory& Inv)
	{
		const EPlacementFail F = Validate(Def, Probe);
		if (F != EPlacementFail::None) { return F; }
		return Inv.HasAll(Def.Cost) ? EPlacementFail::None : EPlacementFail::MissingMaterials;
	}
}
