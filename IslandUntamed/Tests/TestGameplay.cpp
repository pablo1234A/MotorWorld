#include "TestFramework.h"
#include "TestShared.h"

#include "SimBuilding.h"
#include "SimCombat.h"
#include "SimCreatures.h"
#include "SimFactions.h"
#include "SimFarming.h"
#include "SimFishing.h"
#include "SimQuests.h"
#include "SimSurvival.h"

using namespace IUSim;

IU_TEST(Survival_NeedsAndStarvation)
{
	SurvivalModel M;
	SurvivalEnvironment Env;
	const float Sat0 = M.State.Satiety;
	M.Tick(5.0f, 0.0f, Env, 0.0f);
	EXPECT_NEAR(M.State.Satiety, Sat0 - 20.0f, 0.01);
	EXPECT_LT(M.State.Hydration, 80.0f);
	// Long time without food and water kills.
	for (int I = 0; I < 200 && !M.IsDead(); ++I) { M.Tick(1.0f, 0.0f, Env, 0.0f); }
	EXPECT_TRUE(M.IsDead());
	EXPECT_TRUE((M.GetWarnings(0.0f) & Warn_Starving) != 0);
	EXPECT_TRUE((M.GetWarnings(0.0f) & Warn_Dehydrated) != 0);
}

IU_TEST(Survival_RainHypothermiaAndFire)
{
	SurvivalModel Cold;
	SurvivalEnvironment Storm;
	Storm.AmbientTempC = 14.0f;
	Storm.RainIntensity = 1.0f;
	Storm.WindSpeed = 14.0f;
	for (int I = 0; I < 12; ++I) { Cold.Tick(0.5f, 0.0f, Storm, 0.0f); }
	EXPECT_GT(Cold.State.Wetness, 0.9f);
	EXPECT_LT(Cold.State.BodyTempC, 35.0f);
	EXPECT_TRUE((Cold.GetWarnings(0.0f) & Warn_Hypothermia) != 0);
	EXPECT_GT(Cold.ComputeEffects(0.0f).ColdTint, 0.5f);

	// Same storm, but sheltered next to a fire: body stays warm and dries.
	SurvivalModel Warm;
	SurvivalEnvironment Camp = Storm;
	Camp.bSheltered = true;
	Camp.FireHeat = 1.0f;
	Warm.State.Wetness = 1.0f;
	for (int I = 0; I < 12; ++I) { Warm.Tick(0.5f, 0.0f, Camp, 0.0f); }
	EXPECT_LT(Warm.State.Wetness, 0.1f);
	EXPECT_GT(Warm.State.BodyTempC, 36.5f);
}

IU_TEST(Survival_SleepFoodMedicine)
{
	const GameDatabase& Db = SharedDb();
	SurvivalModel M;
	Rng R(7);
	M.State.Rest = 10.0f;
	SurvivalEnvironment Sleep;
	Sleep.bSleeping = true;
	Sleep.bSleepingInBed = true;
	M.Tick(6.0f, 0.0f, Sleep, 0.0f);
	EXPECT_GT(M.State.Rest, 90.0f);

	M.State.Satiety = 10.0f;
	EXPECT_TRUE(M.Consume(*Db.Items.Find("cooked_meat"), R));
	EXPECT_NEAR(M.State.Satiety, 42.0f, 0.01);

	// Red berries poison most of the time.
	int Poisoned = 0;
	for (int I = 0; I < 50; ++I)
	{
		SurvivalModel T;
		T.Consume(*Db.Items.Find("red_berries"), R);
		if (T.State.Poison > 0.0f) { ++Poisoned; }
	}
	EXPECT_GT(Poisoned, 25);
	EXPECT_LT(Poisoned, 48);

	M.State.Poison = 60.0f;
	M.State.Bleeding = 0.5f;
	M.Consume(*Db.Items.Find("herbal_poultice"), R);
	EXPECT_NEAR(M.State.Poison, 10.0f, 0.01);
	M.Consume(*Db.Items.Find("bandage"), R);
	EXPECT_NEAR(M.State.Bleeding, 0.0f, 1e-6);

	// Bleeding drains health and dirty wounds become infection.
	SurvivalModel W;
	W.State.Bleeding = 0.6f;
	W.State.Satiety = 30.0f;
	SurvivalEnvironment Idle;
	W.Tick(1.0f, 0.0f, Idle, 0.0f);
	EXPECT_LT(W.State.Health, 85.0f);
	for (int I = 0; I < 6; ++I) { W.Tick(1.0f, 0.0f, Idle, 0.0f); }
	EXPECT_GT(W.State.Infection, 5.0f);
	const float InfBefore = W.State.Infection;
	W.Consume(*Db.Items.Find("antiseptic_tea"), R);
	EXPECT_LT(W.State.Infection, InfBefore);

	// Falls.
	SurvivalModel F;
	Rng FR(3);
	EXPECT_NEAR(F.ApplyFallDamage(9.0f, FR), 0.0, 1e-6);
	EXPECT_GT(F.ApplyFallDamage(16.0f, FR), 40.0f);
	F.State.bFracture = true;
	EXPECT_FALSE(F.ComputeEffects(0.0f).bCanSprint);
	EXPECT_LT(F.ComputeEffects(0.0f).MoveSpeedMultiplier, 0.7f);

	// Serialization.
	SurvivalModel Copy;
	Copy.FromJson(W.ToJson());
	EXPECT_NEAR(Copy.State.Infection, W.State.Infection, 1e-4);
	EXPECT_NEAR(Copy.State.Health, W.State.Health, 1e-4);
}

IU_TEST(Survival_StaminaAndSprint)
{
	SurvivalModel M;
	SurvivalEnvironment Run;
	Run.Activity = EActivity::Sprint;
	for (int I = 0; I < 10; ++I) { M.Tick(0.001f, 1.0f, Run, 0.0f); }
	EXPECT_LT(M.State.Stamina, 0.1f);
	SurvivalEnvironment Rest;
	for (int I = 0; I < 6; ++I) { M.Tick(0.001f, 1.0f, Rest, 0.0f); }
	EXPECT_GT(M.State.Stamina, 90.0f);
	EXPECT_TRUE(M.SpendStamina(10.0f));
	// Overloaded -> slower, no sprint.
	const SurvivalEffects Fx = M.ComputeEffects(1.4f);
	EXPECT_FALSE(Fx.bCanSprint);
	EXPECT_LT(Fx.MoveSpeedMultiplier, 0.7f);
}

IU_TEST(Farming_GrowthCycle)
{
	const GameDatabase& Db = SharedDb();
	const CropDef* Corn = Db.Crops.Find("corn");
	EXPECT_TRUE(Corn != nullptr);
	if (!Corn) { return; }
	FarmPlot Plot;
	EXPECT_FALSE(Plot.Plant(*Corn));
	EXPECT_TRUE(Plot.Till());
	EXPECT_TRUE(Plot.Plant(*Corn));
	PlotEnvironment Env;
	Env.AmbientTempC = 26.0f;
	Plot.Water = 1.0f;
	Plot.Fertilize(0.6f);
	float Hours = 0.0f;
	while (!Plot.CanHarvest() && Hours < 200.0f)
	{
		Plot.Tick(1.0f, Env, Corn);
		if (Plot.Water < 0.4f) { Plot.AddWater(0.5f); }
		Hours += 1.0f;
	}
	EXPECT_TRUE(Plot.CanHarvest());
	EXPECT_LT(Hours, 60.0f);          // fertilised + watered grows faster than nominal
	EXPECT_EQ(Plot.GetVisualStage(), 3);
	Rng R(1);
	const HarvestResult H = Plot.Harvest(*Corn, R);
	EXPECT_EQ(H.ProduceItem, std::string("corn"));
	EXPECT_GT(H.ProduceCount, 0);
	EXPECT_GT(H.SeedCount, 0);
	EXPECT_EQ(static_cast<int>(Plot.State), static_cast<int>(EPlotState::Tilled));

	// Drought kills the plant; rain prevents it.
	FarmPlot Dry;
	Dry.Till(); Dry.Plant(*Corn); Dry.Water = 0.0f;
	for (int I = 0; I < 80; ++I) { Dry.Tick(1.0f, Env, Corn); }
	EXPECT_EQ(static_cast<int>(Dry.State), static_cast<int>(EPlotState::Dead));
	FarmPlot Rainy;
	Rainy.Till(); Rainy.Plant(*Corn); Rainy.Water = 0.0f;
	PlotEnvironment Rain = Env;
	Rain.RainIntensity = 0.3f;
	for (int I = 0; I < 30; ++I) { Rainy.Tick(1.0f, Rain, Corn); }
	EXPECT_EQ(static_cast<int>(Rainy.State), static_cast<int>(EPlotState::Growing));
	EXPECT_GT(Rainy.Growth, 0.3f);

	// Perennial regrows.
	const CropDef* Mango = Db.Crops.Find("mango_tree");
	FarmPlot Tree;
	Tree.Till(); Tree.Plant(*Mango); Tree.Growth = 1.0f; Tree.State = EPlotState::Harvestable;
	Tree.Harvest(*Mango, R);
	EXPECT_EQ(static_cast<int>(Tree.State), static_cast<int>(EPlotState::Growing));
	EXPECT_NEAR(Tree.Growth, 0.5f, 1e-6);

	FarmPlot Loaded;
	Loaded.FromJson(Rainy.ToJson());
	EXPECT_NEAR(Loaded.Growth, Rainy.Growth, 1e-4);
	EXPECT_EQ(Loaded.CropId, std::string("corn"));
}

IU_TEST(Factions_ReputationAndConsequences)
{
	const GameDatabase& Db = SharedDb();
	FactionSystem F;
	std::string Err;
	EXPECT_TRUE(F.LoadFromJson(Db.TribesJson, Err));
	EXPECT_EQ(F.GetDefs().size(), 3u);
	EXPECT_EQ(static_cast<int>(F.GetAttitude("kairu")), static_cast<int>(EAttitude::Neutral));
	EXPECT_EQ(static_cast<int>(F.GetAttitude("veshka")), static_cast<int>(EAttitude::Unfriendly));
	EXPECT_TRUE(F.IsHostileToPlayer("ashborn"));
	EXPECT_FALSE(F.IsHostileToPlayer("kairu"));

	// Stealing seen by the Vesh'ka turns them hostile quickly, raises alarm.
	const SocialOutcome O = F.ApplyEvent("veshka", ESocialEvent::TheftWitnessed, 20.0f);
	EXPECT_LT(O.ReputationDelta, -10.0f);
	EXPECT_GT(F.FindRuntime("veshka")->Village.Alarm, 0.4f);
	F.ApplyEvent("veshka", ESocialEvent::Assault);
	EXPECT_TRUE(F.IsHostileToPlayer("veshka"));

	// Killing Ashborn warriors pleases their enemies.
	const float KairuBefore = F.GetReputation("kairu");
	F.ApplyEvent("ashborn", ESocialEvent::Murder);
	EXPECT_GT(F.GetReputation("kairu"), KairuBefore);
	EXPECT_EQ(F.FindRuntime("ashborn")->Village.Population, 15);

	// Gifts and help make allies.
	for (int I = 0; I < 6; ++I) { F.ApplyEvent("kairu", ESocialEvent::HelpQuest); }
	EXPECT_EQ(static_cast<int>(F.GetAttitude("kairu")), static_cast<int>(EAttitude::Allied));
	EXPECT_NEAR(F.ValueFor("kairu", "hide", 4.0f), 8.0f, 1e-6);

	// Alarm decays, raids generate news, state persists.
	Rng R(99);
	std::vector<std::string> News;
	for (int I = 0; I < 20; ++I)
	{
		const std::vector<std::string> N = F.TickHours(12.0f, R);
		News.insert(News.end(), N.begin(), N.end());
	}
	EXPECT_LT(F.FindRuntime("veshka")->Village.Alarm, 0.05f);
	EXPECT_FALSE(News.empty());
	FactionSystem Loaded;
	Loaded.LoadFromJson(Db.TribesJson, Err);
	Loaded.FromJson(F.ToJson());
	EXPECT_NEAR(Loaded.GetReputation("kairu"), F.GetReputation("kairu"), 1e-3);
	EXPECT_EQ(Loaded.FindRuntime("ashborn")->Village.Population, F.FindRuntime("ashborn")->Village.Population);
}

IU_TEST(Quests_MainStoryFlow)
{
	const GameDatabase& Db = SharedDb();
	QuestLog Q;
	std::string Err;
	EXPECT_TRUE(Q.LoadFromJson(Db.QuestsJson, Err));
	float KairuRep = 0.0f;
	const ReputationQuery Rep = [&KairuRep](const std::string& Tribe) { return Tribe == "kairu" ? KairuRep : 0.0f; };
	std::vector<QuestUpdate> U = Q.Refresh(Rep);
	EXPECT_EQ(static_cast<int>(Q.GetState("main_01")), static_cast<int>(EQuestState::Active));
	EXPECT_EQ(Q.TrackedQuest, std::string("main_01"));
	// Sequential: crafting first does not count.
	Q.OnEvent(GameEvent{ EGameEvent::Craft, "stone_hatchet", 1 }, Rep);
	EXPECT_EQ(Q.CurrentObjectiveIndex("main_01"), 0);
	Q.OnEvent(GameEvent{ EGameEvent::Acquire, "stick", 3 }, Rep);
	Q.OnEvent(GameEvent{ EGameEvent::Acquire, "stone", 1 }, Rep);
	Q.OnEvent(GameEvent{ EGameEvent::Acquire, "stone", 1 }, Rep);
	Q.OnEvent(GameEvent{ EGameEvent::Acquire, "plant_fiber", 2 }, Rep);
	Q.OnEvent(GameEvent{ EGameEvent::Craft, "stone_hatchet", 1 }, Rep);
	U = Q.OnEvent(GameEvent{ EGameEvent::Consume, "coconut", 1 }, Rep);
	EXPECT_EQ(static_cast<int>(Q.GetState("main_01")), static_cast<int>(EQuestState::Completed));
	bool bRewarded = false;
	for (const QuestUpdate& X : U) { if (X.Type == EQuestUpdateType::Completed && X.QuestId == "main_01" && X.Reward && !X.Reward->Items.empty()) { bRewarded = true; } }
	EXPECT_TRUE(bRewarded);
	EXPECT_EQ(static_cast<int>(Q.GetState("main_02")), static_cast<int>(EQuestState::Active));
	EXPECT_EQ(static_cast<int>(Q.GetState("side_fisher")), static_cast<int>(EQuestState::Available));

	// Event-started side quest.
	Q.OnEvent(GameEvent{ EGameEvent::Talk, "kairu", 1 }, Rep);
	EXPECT_EQ(static_cast<int>(Q.GetState("side_fisher")), static_cast<int>(EQuestState::Active));

	Q.OnEvent(GameEvent{ EGameEvent::Build, "campfire", 1 }, Rep);
	Q.OnEvent(GameEvent{ EGameEvent::Build, "lean_to", 1 }, Rep);
	Q.OnEvent(GameEvent{ EGameEvent::Sleep, "", 1 }, Rep);
	Q.OnEvent(GameEvent{ EGameEvent::Discover, "plane_tail", 1 }, Rep);
	Q.OnEvent(GameEvent{ EGameEvent::Acquire, "flight_recorder", 1 }, Rep);
	EXPECT_EQ(static_cast<int>(Q.GetState("main_03")), static_cast<int>(EQuestState::Completed)); // optional read skipped
	EXPECT_TRUE(Q.HasFlag("has_recorder"));
	EXPECT_EQ(static_cast<int>(Q.GetState("main_06")), static_cast<int>(EQuestState::Active));  // non-linear branch opened

	Q.OnEvent(GameEvent{ EGameEvent::Discover, "type:village", 1 }, Rep);
	Q.OnEvent(GameEvent{ EGameEvent::Talk, "veshka", 1 }, Rep);
	EXPECT_EQ(static_cast<int>(Q.GetState("main_04")), static_cast<int>(EQuestState::Completed));
	EXPECT_EQ(static_cast<int>(Q.GetState("main_05a")), static_cast<int>(EQuestState::Active));
	EXPECT_EQ(static_cast<int>(Q.GetState("main_05b")), static_cast<int>(EQuestState::Active));

	// Decision: allying with the Kairu fails the Vesh'ka path.
	KairuRep = 65.0f;
	U = Q.Refresh(Rep);
	EXPECT_EQ(static_cast<int>(Q.GetState("main_05a")), static_cast<int>(EQuestState::Completed));
	EXPECT_EQ(static_cast<int>(Q.GetState("main_05b")), static_cast<int>(EQuestState::Failed));
	EXPECT_TRUE(Q.HasFlag("ally_kairu"));

	QuestLog Loaded;
	Loaded.LoadFromJson(Db.QuestsJson, Err);
	Loaded.FromJson(Q.ToJson());
	EXPECT_EQ(static_cast<int>(Loaded.GetState("main_05b")), static_cast<int>(EQuestState::Failed));
	EXPECT_TRUE(Loaded.HasFlag("ally_kairu"));
	EXPECT_EQ(Loaded.FindProgress("side_fisher")->Counts.size(), 2u);
}

IU_TEST(Fishing_ZonesAndMinigame)
{
	const GameDatabase& Db = SharedDb();
	Rng R(5);
	int Reef = 0;
	for (int I = 0; I < 200; ++I)
	{
		const FishSpecies* F = Db.Fish.Roll(EWaterZone::Reef, false, R);
		EXPECT_TRUE(F != nullptr);
		if (F && F->Id == "parrotfish") { ++Reef; }
		const FishSpecies* Night = Db.Fish.Roll(EWaterZone::Reef, true, R);
		EXPECT_TRUE(Night == nullptr || Night->Id != "parrotfish");
	}
	EXPECT_GT(Reef, 20);
	EXPECT_TRUE(Db.Fish.Roll(EWaterZone::None, false, R) == nullptr);

	// A sensible player policy (reel while tension < 0.75) catches most fish.
	int Caught = 0;
	int Snapped = 0;
	for (int Trial = 0; Trial < 100; ++Trial)
	{
		FishingSession S;
		const FishSpecies* F = Db.Fish.Roll(EWaterZone::Sea, false, R);
		S.Begin(F, R.Range(F->MinWeight, F->MaxWeight), 0.0f, static_cast<uint64_t>(Trial) + 11U);
		bool bReel = false;
		for (int Step = 0; Step < 6000 && !S.IsFinished(); ++Step)
		{
			if (S.GetState() == EFishingState::Bite) { S.Strike(); }
			if (S.GetTension() > 0.75f) { bReel = false; }
			else if (S.GetTension() < 0.45f) { bReel = true; }
			S.Tick(0.02f, bReel && !S.IsSurging());
		}
		if (S.GetState() == EFishingState::Caught) { ++Caught; }
		if (S.GetState() == EFishingState::LineSnapped) { ++Snapped; }
	}
	EXPECT_GT(Caught, 70);
	EXPECT_LT(Snapped, 30);
	std::printf("  rod policy: %d caught, %d snapped of 100\n", Caught, Snapped);
	// Brute force always snaps or escapes.
	int BruteCaught = 0;
	for (int Trial = 0; Trial < 50; ++Trial)
	{
		FishingSession S;
		const FishSpecies* F = Db.Fish.Find("grouper");
		S.Begin(F, 12.0f, 0.0f, static_cast<uint64_t>(Trial) + 500U);
		for (int Step = 0; Step < 6000 && !S.IsFinished(); ++Step)
		{
			if (S.GetState() == EFishingState::Bite) { S.Strike(); }
			S.Tick(0.02f, true);
		}
		if (S.GetState() == EFishingState::Caught) { ++BruteCaught; }
	}
	EXPECT_LT(BruteCaught, 10);
	// Missing the bite window lets the fish escape.
	FishingSession Miss;
	Miss.Begin(Db.Fish.Find("mackerel"), 0.5f, 0.0f, 1U);
	for (int Step = 0; Step < 2000 && !Miss.IsFinished(); ++Step) { Miss.Tick(0.02f, false); }
	EXPECT_EQ(static_cast<int>(Miss.GetState()), static_cast<int>(EFishingState::Escaped));
}

IU_TEST(Building_SnapAndValidate)
{
	const GameDatabase& Db = SharedDb();
	const BuildingDef* Foundation = Db.Buildings.Find("foundation");
	const BuildingDef* Wall = Db.Buildings.Find("wall");
	const BuildingDef* Roof = Db.Buildings.Find("roof");
	const BuildingDef* Campfire = Db.Buildings.Find("campfire");
	PieceTransform Base;
	Base.Position = Vec3(10.0f, 4.0f, 2.0f);
	Base.Yaw = 90.0f;
	const std::vector<PieceTransform> Walls = BuildRules::SnapCandidates(*Foundation, Base, *Wall);
	EXPECT_EQ(Walls.size(), 4u);
	for (const PieceTransform& T : Walls)
	{
		EXPECT_NEAR(T.Position.Z, 2.4f, 1e-4);
		EXPECT_NEAR((T.Position.XY() - Base.Position.XY()).Length(), 1.0f, 1e-3);
	}
	const std::vector<PieceTransform> Floors = BuildRules::SnapCandidates(*Foundation, Base, *Foundation);
	EXPECT_EQ(Floors.size(), 4u);
	PieceTransform Best;
	EXPECT_TRUE(BuildRules::BestSnap(Floors, Vec3(10.2f, 6.1f, 2.0f), 3.0f, Best));
	EXPECT_NEAR(Best.Position.Y, 6.0f, 1e-3);
	EXPECT_EQ(BuildRules::SnapCandidates(*Wall, Walls[0], *Roof).size(), 2u);

	const PieceTransform G = BuildRules::SnapToGrid(PieceTransform{ Vec3(3.1f, -0.9f, 5.0f), 47.0f });
	EXPECT_NEAR(G.Position.X, 4.0f, 1e-4);
	EXPECT_NEAR(G.Position.Y, 0.0f, 1e-4);
	EXPECT_NEAR(G.Yaw, 90.0f, 1e-4);

	PlacementProbe P;
	P.bHitGround = true;
	P.GroundSlopeDeg = 5.0f;
	EXPECT_EQ(static_cast<int>(BuildRules::Validate(*Campfire, P)), static_cast<int>(EPlacementFail::None));
	P.GroundSlopeDeg = 40.0f;
	EXPECT_EQ(static_cast<int>(BuildRules::Validate(*Campfire, P)), static_cast<int>(EPlacementFail::TooSteep));
	P.GroundSlopeDeg = 5.0f; P.GapToGround = 1.0f;
	EXPECT_EQ(static_cast<int>(BuildRules::Validate(*Campfire, P)), static_cast<int>(EPlacementFail::Floating));
	P.GapToGround = 0.0f; P.bOverlapsBlocking = true;
	EXPECT_EQ(static_cast<int>(BuildRules::Validate(*Campfire, P)), static_cast<int>(EPlacementFail::Overlap));
	PlacementProbe Air;
	EXPECT_EQ(static_cast<int>(BuildRules::Validate(*Wall, Air)), static_cast<int>(EPlacementFail::Floating));
	Air.bSupportedByStructure = true;
	EXPECT_EQ(static_cast<int>(BuildRules::Validate(*Wall, Air)), static_cast<int>(EPlacementFail::None));
	P.bOverlapsBlocking = false; P.bInsideTribeTerritory = true;
	EXPECT_EQ(static_cast<int>(BuildRules::Validate(*Campfire, P)), static_cast<int>(EPlacementFail::TribeTerritory));

	Inventory Inv(&Db.Items, 10, 0.0f);
	P.bInsideTribeTerritory = false;
	EXPECT_EQ(static_cast<int>(BuildRules::ValidateWithCost(*Campfire, P, Inv)), static_cast<int>(EPlacementFail::MissingMaterials));
	Inv.AddItem("stone", 5); Inv.AddItem("stick", 4);
	EXPECT_EQ(static_cast<int>(BuildRules::ValidateWithCost(*Campfire, P, Inv)), static_cast<int>(EPlacementFail::None));

	// Prefab cabin covers the brief: floors + walls + door + roof.
	const BuildingDef* Cabin = Db.Buildings.Find("cabin");
	int Walls2 = 0, Doors = 0, Roofs = 0, Floors2 = 0;
	for (const PrefabPart& Part : Cabin->Prefab)
	{
		if (Part.PieceId == "wall") { ++Walls2; }
		if (Part.PieceId == "door") { ++Doors; }
		if (Part.PieceId == "roof") { ++Roofs; }
		if (Part.PieceId == "foundation") { ++Floors2; }
	}
	EXPECT_EQ(Floors2, 4); EXPECT_EQ(Walls2, 7); EXPECT_EQ(Doors, 1); EXPECT_EQ(Roofs, 4);
}

IU_TEST(Creatures_Brains)
{
	const GameDatabase& Db = SharedDb();
	Rng R(3);
	const AnimalDef* Deer = Db.Animals.Find("deer");
	const AnimalDef* Boar = Db.Animals.Find("boar");
	const AnimalDef* Jaguar = Db.Animals.Find("jaguar");
	BrainInput In;
	In.bHasTarget = true;
	In.bTargetIsThreat = true;
	In.TargetDistance = 20.0f;
	EXPECT_EQ(static_cast<int>(AnimalBrain::Decide(*Deer, In, EAIState::Graze, R).State), static_cast<int>(EAIState::Flee));
	// Boar ignores at range, retaliates when hit.
	EXPECT_TRUE(AnimalBrain::Decide(*Boar, In, EAIState::Graze, R).State != EAIState::Attack);
	In.bRecentlyDamaged = true;
	In.TargetDistance = 1.0f;
	EXPECT_EQ(static_cast<int>(AnimalBrain::Decide(*Boar, In, EAIState::Alert, R).State), static_cast<int>(EAIState::Attack));
	// Jaguar: dangerous at night, cautious by day.
	BrainInput Night;
	Night.bHasTarget = true; Night.bTargetIsThreat = true; Night.TargetDistance = 20.0f; Night.bNight = true;
	const EAIState NightState = AnimalBrain::Decide(*Jaguar, Night, EAIState::Wander, R).State;
	EXPECT_TRUE(NightState == EAIState::Hunt || NightState == EAIState::Chase);
	Night.bNight = false;
	EXPECT_EQ(static_cast<int>(AnimalBrain::Decide(*Jaguar, Night, EAIState::Wander, R).State), static_cast<int>(EAIState::Alert));
	// Leash: stop chasing far from home.
	Night.DistanceFromHome = 500.0f;
	EXPECT_EQ(static_cast<int>(AnimalBrain::Decide(*Jaguar, Night, EAIState::Chase, R).State), static_cast<int>(EAIState::ReturnHome));
	// Diurnal animals sleep at night when undisturbed.
	BrainInput Calm;
	Calm.bNight = true;
	EXPECT_EQ(static_cast<int>(AnimalBrain::Decide(*Deer, Calm, EAIState::Wander, R).State), static_cast<int>(EAIState::Sleep));

	// NPC routines.
	EXPECT_EQ(static_cast<int>(NpcBrain::ScheduleState(ENpcRole::Gatherer, 2.0f, 4)), static_cast<int>(EAIState::Sleep));
	EXPECT_EQ(static_cast<int>(NpcBrain::ScheduleState(ENpcRole::Gatherer, 9.0f, 4)), static_cast<int>(EAIState::Work));
	EXPECT_EQ(static_cast<int>(NpcBrain::ScheduleState(ENpcRole::Cook, 19.0f, 4)), static_cast<int>(EAIState::Cook));
	EXPECT_EQ(static_cast<int>(NpcBrain::ScheduleState(ENpcRole::Gatherer, 12.5f, 4)), static_cast<int>(EAIState::Socialize));
	// Night-shift guards work at night.
	const EAIState GuardNight = NpcBrain::ScheduleState(ENpcRole::Guard, 2.0f, 1);
	EXPECT_TRUE(GuardNight == EAIState::Guard || GuardNight == EAIState::Patrol);
	BrainInput Intruder;
	Intruder.bHasTarget = true; Intruder.bTargetInInner = true; Intruder.TargetDistance = 10.0f; Intruder.Hour = 10.0f;
	EXPECT_EQ(static_cast<int>(NpcBrain::Decide(ENpcRole::Guard, true, Intruder, EAIState::Patrol, 2).State), static_cast<int>(EAIState::Warn));
	Intruder.bTargetIsHostile = true;
	EXPECT_EQ(static_cast<int>(NpcBrain::Decide(ENpcRole::Guard, true, Intruder, EAIState::Warn, 2).State), static_cast<int>(EAIState::Chase));
	EXPECT_EQ(static_cast<int>(NpcBrain::Decide(ENpcRole::Gatherer, true, Intruder, EAIState::Work, 2).State), static_cast<int>(EAIState::Flee));
}

IU_TEST(Combat_Resolution)
{
	AttackInfo A;
	A.BaseDamage = 20.0f;
	DefenseInfo D;
	HitResult H = ResolveHit(A, D);
	EXPECT_NEAR(H.Damage, 20.0f, 1e-4);
	EXPECT_TRUE(H.bStagger);
	D.bBlocking = true; D.BlockReduction = 0.5f; D.Stamina = 100.0f;
	H = ResolveHit(A, D);
	EXPECT_TRUE(H.bBlocked);
	EXPECT_NEAR(H.Damage, 10.0f, 1e-4);
	EXPECT_NEAR(H.StaminaDrain, 18.0f, 1e-4);
	D.Stamina = 5.0f;
	H = ResolveHit(A, D);
	EXPECT_TRUE(H.bGuardBroken);
	EXPECT_NEAR(H.Damage, 20.0f, 1e-4);
	D.bDodging = true;
	EXPECT_TRUE(ResolveHit(A, D).bEvaded);
	DefenseInfo Armored; Armored.Armor = 0.25f;
	A.bFromBehind = true;
	EXPECT_NEAR(ResolveHit(A, Armored).Damage, 24.0f, 1e-3);
}

IU_TEST(Resources_Harvesting)
{
	const GameDatabase& Db = SharedDb();
	Rng R(11);
	const ResourceNodeDef* Palm = Db.Nodes.Find("tree_palm");
	const ResourceNodeDef* Bush = Db.Nodes.Find("bush");
	const ResourceNodeDef* Boulder = Db.Nodes.Find("boulder");
	int32_t Hits = Palm->Hits;
	HarvestHit H = ResolveHarvestHit(*Palm, EToolType::None, 0, 1.0f, Hits, R);
	EXPECT_TRUE(H.bWrongTool);
	EXPECT_EQ(Hits, Palm->Hits);
	int Wood = 0;
	while (!H.bDepleted)
	{
		H = ResolveHarvestHit(*Palm, EToolType::Axe, 1, 1.0f, Hits, R);
		for (const ItemAmount& A : H.Items) { if (A.ItemId == "wood") { Wood += A.Count; } }
	}
	EXPECT_GT(Wood, 4);
	Hits = Bush->Hits;
	H = ResolveHarvestHit(*Bush, EToolType::None, 0, 1.0f, Hits, R);
	EXPECT_FALSE(H.bWrongTool);
	EXPECT_FALSE(H.Items.empty());
	Hits = Boulder->Hits;
	EXPECT_TRUE(ResolveHarvestHit(*Boulder, EToolType::Axe, 1, 1.0f, Hits, R).bWrongTool);
	// Iron pickaxe (harvest x2) depletes in fewer hits.
	Hits = Boulder->Hits;
	int Swings = 0;
	bool bDone = false;
	while (!bDone && Swings < 20) { bDone = ResolveHarvestHit(*Boulder, EToolType::Pickaxe, 2, 2.0f, Hits, R).bDepleted; ++Swings; }
	EXPECT_EQ(Swings, 3);
}
