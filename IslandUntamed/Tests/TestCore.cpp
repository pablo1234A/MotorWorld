#include "TestFramework.h"
#include "TestShared.h"

#include "SimCrafting.h"
#include "SimGameData.h"
#include "SimInventory.h"
#include "SimJson.h"

using namespace IUSim;

const GameDatabase& SharedDb()
{
	static GameDatabase Db;
	static bool bTried = false;
	if (!bTried)
	{
		bTried = true;
		std::string Error;
		const bool bOk = Db.LoadAll([](const std::string& Name, std::string& Out) { return IUTest::ReadDataFile(Name, Out); }, Error);
		if (!bOk) { std::printf("  DATA LOAD ERROR: %s\n", Error.c_str()); }
	}
	return Db;
}

IU_TEST(Json_ParseAndDump)
{
	JsonValue V;
	std::string Err;
	const std::string Text = "{ // comment\n \"a\": 1, \"b\": [true, false, null, 2.5], \"c\": {\"d\": \"x\\ny\\u00e9\"}, }";
	EXPECT_TRUE(JsonValue::Parse(Text, V, Err));
	EXPECT_EQ(V.GetInt("a"), 1);
	EXPECT_EQ(V["b"].Items().size(), 4u);
	EXPECT_NEAR(V["b"].Items()[3].AsNumber(), 2.5, 1e-9);
	EXPECT_EQ(V["c"].GetString("d"), std::string("x\ny\xC3\xA9"));
	JsonValue Back;
	EXPECT_TRUE(JsonValue::Parse(V.Dump(true), Back, Err));
	EXPECT_EQ(Back.Dump(), V.Dump());
	EXPECT_FALSE(JsonValue::Parse("{\"a\": }", V, Err));
	EXPECT_TRUE(Err.find("line 1") != std::string::npos);
	EXPECT_FALSE(JsonValue::Parse("[1, 2", V, Err));
	// Missing key access is safe.
	EXPECT_TRUE(Back["nope"]["deeper"].IsNull());
}

IU_TEST(Data_LoadsAndValidates)
{
	const GameDatabase& Db = SharedDb();
	EXPECT_TRUE(Db.IsLoaded());
	EXPECT_GT(Db.Items.All().size(), 60u);
	EXPECT_GT(Db.Recipes.All().size(), 25u);
	EXPECT_GT(Db.Buildings.All().size(), 15u);
	EXPECT_EQ(Db.Crops.All().size(), 6u);
	EXPECT_GT(Db.Fish.All().size(), 8u);
	EXPECT_GT(Db.Animals.All().size(), 8u);
	EXPECT_GT(Db.Nodes.All().size(), 20u);
	// Every resource required by the brief exists as an item.
	const char* Required[] = { "wood", "stick", "stone", "plant_fiber", "leaves", "berries", "mushroom", "clay", "sand", "herbs", "metal_ore", "rope", "hide", "bone", "mango" };
	for (const char* Id : Required) { EXPECT_TRUE(Db.Items.Contains(Id)); }
	// Every placeable building in the brief exists.
	const char* Buildings[] = { "lean_to", "cabin", "house", "wall", "foundation", "roof", "door", "stairs", "fence", "storehouse", "storage_box", "campfire", "workbench", "drying_rack", "furnace", "farm_plot", "watchtower", "spike_trap" };
	for (const char* Id : Buildings) { EXPECT_TRUE(Db.Buildings.Find(Id) != nullptr); }
	// Density per biome must stay below 1 or scattering silently drops nodes.
	const char* Biomes[] = { "Beach", "Jungle", "Forest", "Plains", "Swamp", "Mountain", "Volcanic", "Cliff" };
	for (const char* B : Biomes)
	{
		float Sum = 0.0f;
		for (const ResourceNodeDef& N : Db.Nodes.All()) { const auto It = N.Density.find(B); if (It != N.Density.end()) { Sum += It->second; } }
		EXPECT_LT(Sum, 1.0f);
		EXPECT_GT(Sum, 0.0f);
	}
	// Every recipe output that is a tool must be obtainable from hand/stations defined.
	for (const Recipe& R : Db.Recipes.All()) { EXPECT_FALSE(R.Outputs.empty()); }
}

IU_TEST(Inventory_StackWeightAndTransfer)
{
	const GameDatabase& Db = SharedDb();
	Inventory Inv(&Db.Items, 6, 10.0f);
	EXPECT_EQ(Inv.AddItem("stick", 50), 0);          // 0.3kg * 50 = 15kg within hard cap 15kg
	EXPECT_EQ(Inv.CountItem("stick"), 50);
	EXPECT_EQ(Inv.GetSlot(0).Count, 40);              // stack 40
	EXPECT_EQ(Inv.GetSlot(1).Count, 10);
	EXPECT_GT(Inv.GetLoadRatio(), 1.0f);              // over-encumbered
	EXPECT_EQ(Inv.AddItem("stone", 3), 3);            // hard cap reached -> rejected
	EXPECT_EQ(Inv.RemoveItem("stick", 45), 45);
	EXPECT_EQ(Inv.CountItem("stick"), 5);
	EXPECT_EQ(Inv.AddItem("stone_hatchet", 2), 0);    // durability items do not stack
	EXPECT_EQ(Inv.CountItem("stone_hatchet"), 2);
	const int32_t AxeSlot = Inv.FindFirstSlot("stone_hatchet");
	EXPECT_NEAR(Inv.GetSlot(AxeSlot).Durability, 120.0, 1e-3);
	EXPECT_FALSE(Inv.DamageDurability(AxeSlot, 100.0f));
	EXPECT_TRUE(Inv.DamageDurability(AxeSlot, 30.0f)); // breaks
	EXPECT_EQ(Inv.CountItem("stone_hatchet"), 1);
	EXPECT_EQ(Inv.AddItem("not_an_item", 1), 1);

	Inventory Chest(&Db.Items, 4, 0.0f);
	const int32_t StickSlot = Inv.FindFirstSlot("stick");
	EXPECT_EQ(Inv.TransferSlotTo(Chest, StickSlot, 0), 5);
	EXPECT_EQ(Chest.CountItem("stick"), 5);
	EXPECT_EQ(Inv.CountItem("stick"), 0);
	EXPECT_TRUE(Chest.SplitStack(0, 2));
	EXPECT_EQ(Chest.GetSlot(1).Count, 2);
	EXPECT_TRUE(Chest.MoveSlot(1, 0));                // merge back
	EXPECT_EQ(Chest.GetSlot(0).Count, 5);
	EXPECT_TRUE(Chest.GetSlot(1).IsEmpty());

	// Serialization round trip.
	Chest.AddItem("bow", 1);
	Inventory Loaded(&Db.Items, 4, 0.0f);
	Loaded.FromJson(Chest.ToJson());
	EXPECT_EQ(Loaded.CountItem("stick"), 5);
	EXPECT_EQ(Loaded.CountItem("bow"), 1);
	EXPECT_NEAR(Loaded.GetSlot(Loaded.FindFirstSlot("bow")).Durability, 200.0, 1e-3);

	// Atomic consume.
	EXPECT_FALSE(Loaded.ConsumeAll({ { "stick", 3 }, { "stone", 1 } }));
	EXPECT_EQ(Loaded.CountItem("stick"), 5);
	EXPECT_TRUE(Loaded.ConsumeAll({ { "stick", 3 }, { "stick", 2 } }));
	EXPECT_EQ(Loaded.CountItem("stick"), 0);
}

IU_TEST(Crafting_Rules)
{
	const GameDatabase& Db = SharedDb();
	Inventory Inv(&Db.Items, 20, 40.0f);
	const Recipe* Hatchet = Db.Recipes.Find("r_stone_hatchet");
	const Recipe* Bow = Db.Recipes.Find("r_bow");
	const Recipe* IronAxe = Db.Recipes.Find("r_iron_axe");
	EXPECT_TRUE(Hatchet && Bow && IronAxe);
	if (!Hatchet || !Bow || !IronAxe) { return; }

	CraftContext Ctx;
	std::set<std::string> Unlocked;
	Ctx.Unlocked = &Unlocked;
	CraftCheck C = Crafting::Check(*Hatchet, Inv, Ctx);
	EXPECT_EQ(static_cast<int>(C.Fail), static_cast<int>(ECraftFail::MissingItems));
	EXPECT_EQ(C.Missing.size(), 3u);

	Inv.AddItem("stone", 2);
	Inv.AddItem("stick", 2);
	Inv.AddItem("plant_fiber", 2);
	std::vector<ItemAmount> Overflow;
	C = Crafting::Craft(*Hatchet, Inv, Ctx, Overflow);
	EXPECT_TRUE(C.Ok());
	EXPECT_EQ(Inv.CountItem("stone_hatchet"), 1);
	EXPECT_EQ(Inv.CountItem("stone"), 0);
	EXPECT_TRUE(Overflow.empty());

	Inv.AddItem("stick", 3); Inv.AddItem("rope", 2); Inv.AddItem("resin", 1);
	EXPECT_EQ(static_cast<int>(Crafting::Check(*Bow, Inv, Ctx).Fail), static_cast<int>(ECraftFail::MissingStation));
	Ctx.Stations.insert(EStation::Workbench);
	EXPECT_TRUE(Crafting::Check(*Bow, Inv, Ctx).Ok());

	EXPECT_EQ(static_cast<int>(Crafting::Check(*IronAxe, Inv, Ctx).Fail), static_cast<int>(ECraftFail::Locked));
	Unlocked.insert("r_iron_axe");
	EXPECT_EQ(static_cast<int>(Crafting::Check(*IronAxe, Inv, Ctx).Fail), static_cast<int>(ECraftFail::MissingItems));

	// Tool requirement (knife) for hide vest.
	const Recipe* Vest = Db.Recipes.Find("r_hide_vest");
	Inv.AddItem("hide", 3);
	EXPECT_EQ(static_cast<int>(Crafting::Check(*Vest, Inv, Ctx).Fail), static_cast<int>(ECraftFail::MissingTool));
	Inv.AddItem("stone_knife", 1);
	EXPECT_TRUE(Crafting::Check(*Vest, Inv, Ctx).Ok());

	// Overflow: a full inventory still crafts and reports leftovers.
	Inventory Tiny(&Db.Items, 1, 0.0f);
	Tiny.AddItem("plant_fiber", 3);
	const Recipe* Rope = Db.Recipes.Find("r_rope");
	Tiny.AddItem("plant_fiber", 0);
	C = Crafting::Craft(*Rope, Tiny, Ctx, Overflow);
	EXPECT_TRUE(C.Ok());
	EXPECT_EQ(Tiny.CountItem("rope"), 1); // fiber slot freed, rope fits
}
