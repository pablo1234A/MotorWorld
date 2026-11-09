// Island Untamed - Simulation Core
// GameDatabase: loads and cross-validates every data file.
// WorldPersistence: world-level state that is not owned by an actor
// (harvested nodes, discoveries, fog of war).
#pragma once

#include "SimBuilding.h"
#include "SimCrafting.h"
#include "SimCreatures.h"
#include "SimFactions.h"
#include "SimFarming.h"
#include "SimFishing.h"
#include "SimQuests.h"
#include "SimResources.h"

#include <functional>
#include <set>
#include <string>
#include <unordered_map>
#include <vector>

namespace IUSim
{
	/** Callback that returns the text content of a data file (relative name, e.g. "items.json"). */
	using FileReader = std::function<bool(const std::string& FileName, std::string& OutText)>;

	class GameDatabase
	{
	public:
		ItemDatabase Items;
		RecipeBook Recipes;
		BuildingDatabase Buildings;
		CropDatabase Crops;
		FishDatabase Fish;
		AnimalDatabase Animals;
		ResourceDatabase Nodes;
		JsonValue TribesJson;
		JsonValue QuestsJson;
		JsonValue LoreJson;   // documents / notes found in the world

		/** Loads every data file. Returns false with a precise error message on the first problem. */
		bool LoadAll(const FileReader& Reader, std::string& OutError);
		bool IsLoaded() const { return bLoaded; }

		/** Additional referential checks (seeds -> crops, placeables -> buildings, ...). */
		bool Validate(std::string& OutError) const;

	private:
		bool bLoaded = false;
	};

	class WorldPersistence
	{
	public:
		/** Marks a scatter node as depleted until the given absolute game hour (<0 = forever). */
		void MarkDepleted(uint32_t StableId, double RegrowAtHour) { Depleted[StableId] = RegrowAtHour; }
		bool IsDepleted(uint32_t StableId, double NowHours) const;
		/** Removes entries that have regrown; returns their ids so the engine can re-add instances. */
		std::vector<uint32_t> CollectRegrown(double NowHours);
		size_t NumDepleted() const { return Depleted.size(); }

		bool Discover(const std::string& PoiId) { return Discovered.insert(PoiId).second; }
		bool IsDiscovered(const std::string& PoiId) const { return Discovered.count(PoiId) > 0; }
		const std::set<std::string>& GetDiscovered() const { return Discovered; }

		/** Fog of war on a FogRes x FogRes grid over the island. */
		void InitFog(int32_t Res) { FogRes = Res; Fog.assign(static_cast<size_t>(Res) * static_cast<size_t>(Res), 0); }
		/** Reveals a circle; coordinates normalized 0..1. Returns true if anything new was revealed. */
		bool RevealFog(float U, float V, float RadiusNorm);
		bool IsFogRevealed(int32_t X, int32_t Y) const;
		int32_t GetFogRes() const { return FogRes; }
		float ExploredFraction() const;

		std::set<std::string> UnlockedRecipes;
		std::set<std::string> UnlockedBuildings;
		std::set<std::string> ReadDocuments;

		JsonValue ToJson() const;
		void FromJson(const JsonValue& J);

	private:
		std::unordered_map<uint32_t, double> Depleted;
		std::set<std::string> Discovered;
		std::vector<uint8_t> Fog;
		int32_t FogRes = 0;
	};
}
