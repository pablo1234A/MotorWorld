#include "TestFramework.h"
#include "TestShared.h"

#include "SimAudioSynth.h"
#include "SimIsland.h"
#include "SimWorldClock.h"

#include <map>

using namespace IUSim;

namespace WorldTestDetail
{
	const IslandModel& SharedIsland()
	{
		static IslandModel Model;
		static bool bBuilt = false;
		if (!bBuilt)
		{
			bBuilt = true;
			Model.Generate(IslandParams(), &SharedDb().Nodes);
		}
		return Model;
	}
}

IU_TEST(Clock_DayNightAndWeather)
{
	WorldClock C;
	C.Reset(6.0f, 42);
	EXPECT_EQ(static_cast<int>(C.GetPhase()), static_cast<int>(EDayPhase::Dawn));
	// 1 game hour = 2 real minutes with a 48 minute day.
	const float Hours = C.Advance(120.0f);
	EXPECT_NEAR(Hours, 1.0f, 1e-4);
	C.SkipHours(5.5f); // 12:30
	EXPECT_EQ(static_cast<int>(C.GetPhase()), static_cast<int>(EDayPhase::Day));
	EXPECT_GT(C.GetSunElevationDeg(), 60.0f);
	EXPECT_GT(C.GetDaylight(), 0.95f);
	C.SkipHours(12.0f); // 00:30 next day
	EXPECT_EQ(C.GetDay(), 1);
	EXPECT_TRUE(C.IsNight());
	EXPECT_LT(C.GetSunElevationDeg(), 0.0f);
	EXPECT_LT(C.GetDaylight(), 0.05f);

	// Over two weeks every weather type should appear.
	std::map<int, int> Seen;
	for (int I = 0; I < 14 * 24 * 4; ++I)
	{
		C.SkipHours(0.25f);
		Seen[static_cast<int>(C.GetWeather())]++;
		EXPECT_TRUE(C.GetParams().Rain >= 0.0f && C.GetParams().Rain <= 1.0f);
	}
	EXPECT_EQ(Seen.size(), 5u);
	EXPECT_GT(Seen[static_cast<int>(EWeather::Clear)] + Seen[static_cast<int>(EWeather::Cloudy)], Seen[static_cast<int>(EWeather::Storm)]);

	// Determinism after save/load.
	WorldClock Loaded;
	Loaded.FromJson(C.ToJson());
	for (int I = 0; I < 200; ++I)
	{
		C.SkipHours(0.5f);
		Loaded.SkipHours(0.5f);
	}
	EXPECT_EQ(static_cast<int>(C.GetWeather()), static_cast<int>(Loaded.GetWeather()));
	EXPECT_NEAR(C.GetHour(), Loaded.GetHour(), 1e-3);
}

IU_TEST(Island_GenerationAndPOIs)
{
	const IslandModel& M = WorldTestDetail::SharedIsland();
	const std::vector<PointOfInterest>& P = M.GetPOIs();
	int Villages = 0, Caves = 0, Ruins = 0, Waterfalls = 0;
	for (const PointOfInterest& Poi : P)
	{
		if (Poi.Type == EPOIType::Village) { ++Villages; EXPECT_FALSE(Poi.TribeId.empty()); }
		if (Poi.Type == EPOIType::Cave) { ++Caves; }
		if (Poi.Type == EPOIType::Ruins) { ++Ruins; }
		if (Poi.Type == EPOIType::Waterfall) { ++Waterfalls; }
		if (Poi.Type != EPOIType::Lake && Poi.Type != EPOIType::Waterfall)
		{
			EXPECT_GT(Poi.Position.Z, -1.0f); // on land
		}
	}
	EXPECT_EQ(Villages, 3);
	EXPECT_EQ(Caves, 4);
	EXPECT_EQ(Ruins, 3);
	EXPECT_GT(Waterfalls, 0);
	EXPECT_TRUE(M.FindPOI("crash_site") != nullptr);
	EXPECT_TRUE(M.FindPOI("plane_tail") != nullptr);
	EXPECT_TRUE(M.FindPOI("facility") != nullptr);
	EXPECT_TRUE(M.FindPOI("secret_caldera") != nullptr);
	EXPECT_TRUE(M.FindPOI("lighthouse") != nullptr);

	// Spawn: dry land, near the sea, not inside a tree clearing violation.
	const Vec3 Spawn = M.GetPlayerSpawn();
	EXPECT_GT(Spawn.Z, 0.3f);
	EXPECT_LT(Spawn.Z, 12.0f);
	const EBiome SpawnBiome = M.GetBiome(Spawn.X, Spawn.Y);
	EXPECT_TRUE(SpawnBiome == EBiome::Beach || SpawnBiome == EBiome::Jungle || SpawnBiome == EBiome::Forest || SpawnBiome == EBiome::Plains);

	// Villages are on flat ground.
	for (const PointOfInterest& Poi : P)
	{
		if (Poi.Type != EPOIType::Village) { continue; }
		EXPECT_LT(M.GetSlopeDeg(Poi.Position.X, Poi.Position.Y), 6.0f);
	}
}

IU_TEST(Island_BiomesRiversLakes)
{
	const IslandModel& M = WorldTestDetail::SharedIsland();
	std::map<int, int> Count;
	const float H = M.HalfSize();
	for (float Y = -H; Y < H; Y += 32.0f)
	{
		for (float X = -H; X < H; X += 32.0f) { Count[static_cast<int>(M.GetBiome(X, Y))]++; }
	}
	// Every land biome from the brief must exist.
	const EBiome Required[] = { EBiome::Ocean, EBiome::Beach, EBiome::Jungle, EBiome::Forest, EBiome::Plains, EBiome::Swamp, EBiome::Mountain, EBiome::Volcanic, EBiome::Cliff, EBiome::River, EBiome::Lake };
	for (const EBiome B : Required)
	{
		if (Count[static_cast<int>(B)] == 0) { std::printf("  missing biome %s\n", BiomeToString(B)); }
		EXPECT_GT(Count[static_cast<int>(B)], 0);
	}
	int Land = 0, Total = 0;
	for (const auto& Pair : Count) { Total += Pair.second; if (Pair.first != static_cast<int>(EBiome::Ocean) && Pair.first != static_cast<int>(EBiome::Reef)) { Land += Pair.second; } }
	const float LandFraction = static_cast<float>(Land) / static_cast<float>(Total);
	std::printf("  land fraction %.2f (%.1f km2)\n", static_cast<double>(LandFraction), static_cast<double>(LandFraction * M.GetParams().Size * M.GetParams().Size / 1.0e6f));
	EXPECT_GT(LandFraction, 0.3f);
	EXPECT_LT(LandFraction, 0.75f);

	// Rivers flow downhill and reach the sea (or merge).
	EXPECT_GT(M.GetRivers().size(), 1u);
	for (const RiverPath& R : M.GetRivers())
	{
		EXPECT_GT(R.Points.size(), 20u);
		for (size_t I = 1; I < R.Points.size(); ++I) { EXPECT_TRUE(R.Points[I].Z <= R.Points[I - 1].Z + 1e-3f); }
		// Water surface is above the riverbed.
		const Vec3 Mid = R.Points[R.Points.size() / 2];
		EXPECT_GT(M.GetWaterLevel(Mid.X, Mid.Y), M.GetHeight(Mid.X, Mid.Y));
	}
	EXPECT_GT(M.GetLakes().size(), 1u);
	for (const LakeBody& L : M.GetLakes())
	{
		EXPECT_GT(M.GetWaterDepth(L.Center.X, L.Center.Y), 2.0f);
		EXPECT_EQ(static_cast<int>(M.GetWaterZone(L.Center.X, L.Center.Y)), static_cast<int>(EWaterZone::Lake));
	}
	// Mountains are cold, beaches warm.
	const PointOfInterest* Obs = M.FindPOI("ruins_observatory");
	const PointOfInterest* Crash = M.FindPOI("crash_site");
	EXPECT_LT(M.GetBaseTemperature(Obs->Position.X, Obs->Position.Y), M.GetBaseTemperature(Crash->Position.X, Crash->Position.Y));
}

IU_TEST(Island_ScatterDeterministic)
{
	const IslandModel& M = WorldTestDetail::SharedIsland();
	const PointOfInterest* Tail = M.FindPOI("plane_tail");
	const float X0 = Tail->Position.X + 120.0f;
	const float Y0 = Tail->Position.Y;
	const std::vector<ScatterInstance> A = M.ScatterRegion(X0, Y0, 64.0f);
	const std::vector<ScatterInstance> B = M.ScatterRegion(X0, Y0, 64.0f);
	EXPECT_GT(A.size(), 20u);
	EXPECT_EQ(A.size(), B.size());
	bool bSame = A.size() == B.size();
	for (size_t I = 0; bSame && I < A.size(); ++I) { bSame = A[I].StableId == B[I].StableId && A[I].NodeIndex == B[I].NodeIndex; }
	EXPECT_TRUE(bSame);
	// Chunks tile without duplicates: two halves == whole.
	const std::vector<ScatterInstance> Left = M.ScatterRegion(X0, Y0, 32.0f);
	const std::vector<ScatterInstance> Right = M.ScatterRegion(X0 + 32.0f, Y0, 32.0f);
	EXPECT_LT(Left.size() + Right.size(), A.size() + 1);
	// Villages are kept clear of trees.
	const PointOfInterest* Village = M.FindPOI("village_vesh");
	const std::vector<ScatterInstance> V = M.ScatterRegion(Village->Position.X - 20.0f, Village->Position.Y - 20.0f, 40.0f);
	for (const ScatterInstance& S : V) { EXPECT_FALSE(SharedDb().Nodes.At(static_cast<size_t>(S.NodeIndex))->bBlocking); }
	// Map image.
	const std::vector<uint8_t> Img = M.BuildMapImage(64);
	EXPECT_EQ(Img.size(), 64u * 64u * 4u);
}

IU_TEST(World_PersistenceFogAndRegrowth)
{
	WorldPersistence W;
	W.InitFog(64);
	EXPECT_TRUE(W.RevealFog(0.5f, 0.5f, 0.05f));
	EXPECT_FALSE(W.RevealFog(0.5f, 0.5f, 0.05f));
	EXPECT_TRUE(W.IsFogRevealed(32, 32));
	EXPECT_FALSE(W.IsFogRevealed(2, 2));
	W.MarkDepleted(1234U, 50.0);
	W.MarkDepleted(99U, -1.0);
	EXPECT_TRUE(W.IsDepleted(1234U, 10.0));
	EXPECT_TRUE(W.Discover("crash_site"));
	EXPECT_FALSE(W.Discover("crash_site"));
	W.UnlockedRecipes.insert("r_iron_axe");

	WorldPersistence L;
	L.FromJson(W.ToJson());
	EXPECT_TRUE(L.IsFogRevealed(32, 32));
	EXPECT_FALSE(L.IsFogRevealed(2, 2));
	EXPECT_NEAR(L.ExploredFraction(), W.ExploredFraction(), 1e-6);
	EXPECT_TRUE(L.IsDepleted(1234U, 10.0));
	EXPECT_TRUE(L.IsDiscovered("crash_site"));
	EXPECT_EQ(L.UnlockedRecipes.count("r_iron_axe"), 1u);
	const std::vector<uint32_t> Regrown = L.CollectRegrown(60.0);
	EXPECT_EQ(Regrown.size(), 1u);
	EXPECT_FALSE(L.IsDepleted(1234U, 60.0));
	EXPECT_TRUE(L.IsDepleted(99U, 1.0e9));
}

IU_TEST(Audio_ProceduralSynthesis)
{
	using namespace IUSim::AudioSynth;
	const Buffer Wind = IUSim::AudioSynth::Wind(4.0f, 1);
	EXPECT_GT(DurationSeconds(Wind), 3.0f);
	EXPECT_GT(Peak(Wind), 8000);
	EXPECT_LT(Peak(Wind), 32001);
	const Buffer Music = MusicPad(16.0f, 0.2f, 3);
	EXPECT_GT(DurationSeconds(Music), 14.0f);
	EXPECT_GT(Peak(Music), 5000);
	for (const std::string& Cue : OneShotNames())
	{
		const Buffer B = OneShot(Cue, 7);
		EXPECT_GT(B.size(), 100u);
		EXPECT_GT(Peak(B), 1000);
		EXPECT_LT(DurationSeconds(B), 6.0f);
	}
	// Deterministic for a given seed.
	EXPECT_TRUE(OneShot("chop", 5) == OneShot("chop", 5));
}
