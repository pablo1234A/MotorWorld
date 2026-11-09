// Island Untamed - Simulation Core
// Recipe database and crafting resolution (data: Content/Data/recipes.json).
#pragma once

#include "SimInventory.h"

#include <set>
#include <string>
#include <vector>

namespace IUSim
{
	/** Crafting stations. "Hand" means no station required. */
	enum class EStation : uint8_t { Hand, Campfire, Workbench, Furnace, DryingRack, Tribe };

	EStation StationFromString(const std::string& S);
	const char* StationToString(EStation S);

	struct Recipe
	{
		std::string Id;
		std::string Name;
		std::string Category;               // UI grouping: Tools, Weapons, Survival, Food, Medicine, Materials
		std::vector<ItemAmount> Inputs;
		std::vector<ItemAmount> Outputs;
		EStation Station = EStation::Hand;
		EToolType RequiredTool = EToolType::None; // tool that must be in inventory (not consumed)
		float CraftSeconds = 2.0f;
		bool bUnlockedByDefault = true;     // otherwise unlocked by quests/discoveries
	};

	enum class ECraftFail : uint8_t { None, UnknownRecipe, Locked, MissingStation, MissingTool, MissingItems, NoSpace };

	struct CraftCheck
	{
		ECraftFail Fail = ECraftFail::None;
		std::vector<ItemAmount> Missing;
		bool Ok() const { return Fail == ECraftFail::None; }
	};

	const char* CraftFailToText(ECraftFail F);

	class RecipeBook
	{
	public:
		bool LoadFromJson(const JsonValue& Root, const ItemDatabase& Items, std::string& OutError);
		const Recipe* Find(const std::string& Id) const;
		const std::vector<Recipe>& All() const { return Recipes; }

	private:
		std::vector<Recipe> Recipes;
	};

	/** Context describing what the crafter currently has access to. */
	struct CraftContext
	{
		std::set<EStation> Stations;            // stations in range (Hand always implied)
		const std::set<std::string>* Unlocked = nullptr; // unlocked recipe ids
	};

	class Crafting
	{
	public:
		static CraftCheck Check(const Recipe& R, const Inventory& Inv, const CraftContext& Ctx);
		/**
		 * Consumes inputs and adds outputs. Any output that does not fit is reported in OutOverflow
		 * so the engine layer can drop it into the world (nothing is ever lost).
		 */
		static CraftCheck Craft(const Recipe& R, Inventory& Inv, const CraftContext& Ctx, std::vector<ItemAmount>& OutOverflow);
		static bool HasTool(const Inventory& Inv, EToolType Tool);
	};
}
