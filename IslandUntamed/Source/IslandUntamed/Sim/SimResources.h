// Island Untamed - Simulation Core
// Harvestable world resources (trees, rocks, bushes, ore...). Each node type
// defines what it yields, which tool is needed and how densely it appears in
// every biome. Data: Content/Data/nodes.json
#pragma once

#include "SimCreatures.h"
#include "SimItems.h"

#include <map>
#include <string>
#include <vector>

namespace IUSim
{
	struct ResourceNodeDef
	{
		std::string Id;
		std::string Name;
		std::string Visual;              // palm, jungle_tree, broadleaf, pine, dead_tree, bush, berry_bush, rock, boulder, ore, clay, reeds, mushroom, herb, fiber, driftwood, grass, fern, sulfur, crystal
		EToolType Tool = EToolType::None;// required tool (None = hands)
		int32_t MinTier = 0;
		bool bHandHarvestable = true;    // can be gathered without tool (slower / partial)
		int32_t Hits = 3;                // hits to deplete
		float RegrowHours = 72.0f;       // <= 0 never regrows
		std::vector<LootEntry> PerHit;   // yielded on every hit
		std::vector<LootEntry> Final;    // yielded when depleted
		std::map<std::string, float> Density; // biome -> probability per scatter cell
		float ScaleMin = 0.8f;
		float ScaleMax = 1.2f;
		bool bBlocking = true;           // has collision (trees/rocks) or not (grass/herbs)
		bool bDecorOnly = false;         // non-interactive decoration (grass, ferns)
		float CullDistance = 600.0f;     // meters
	};

	class ResourceDatabase
	{
	public:
		bool LoadFromJson(const JsonValue& Root, const ItemDatabase& Items, std::string& OutError);
		const ResourceNodeDef* Find(const std::string& Id) const;
		const ResourceNodeDef* At(size_t Index) const { return Index < Defs.size() ? &Defs[Index] : nullptr; }
		const std::vector<ResourceNodeDef>& All() const { return Defs; }
		int32_t IndexOf(const std::string& Id) const;
	private:
		std::vector<ResourceNodeDef> Defs;
	};

	struct HarvestHit
	{
		std::vector<ItemAmount> Items;
		bool bDepleted = false;
		bool bWrongTool = false;
	};

	/** Resolves a single harvesting hit. RemainingHits is decremented by tool power. */
	HarvestHit ResolveHarvestHit(const ResourceNodeDef& Def, EToolType Tool, int32_t ToolTier, float ToolMultiplier, int32_t& RemainingHits, Rng& Random);
	std::vector<ItemAmount> RollLoot(const std::vector<LootEntry>& Loot, Rng& Random, float Multiplier = 1.0f);
}
