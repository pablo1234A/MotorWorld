// Island Untamed - Simulation Core
// Tribes, reputation with the player, inter-tribe diplomacy and abstract
// village simulation (population, alarm, stockpile, raids between tribes).
// Data: Content/Data/tribes.json
#pragma once

#include "SimCore.h"
#include "SimJson.h"

#include <map>
#include <string>
#include <vector>

namespace IUSim
{
	enum class ETemperament : uint8_t { Peaceful, Territorial, Aggressive };
	enum class EAttitude : uint8_t { Hostile, Unfriendly, Neutral, Friendly, Allied };

	const char* AttitudeToString(EAttitude A);

	/** Actions with social consequences. */
	enum class ESocialEvent : uint8_t
	{
		Trespass,          // entered the inner village area
		TheftWitnessed,    // stole from a village store and was seen
		TheftUnseen,       // stole without being seen (discovered later)
		Assault,           // hit a member
		Murder,            // killed a member
		KillLeader,        // killed the chief
		DestroyStructure,  // destroyed a village building
		Gift,              // gave items (Magnitude = barter value)
		Trade,             // fair trade
		HelpQuest,         // completed a task for the tribe
		DefendVillage,     // killed attackers inside the village
	};

	struct TribeDef
	{
		std::string Id;
		std::string Name;
		std::string Description;
		std::string HomeBiome;
		ETemperament Temperament = ETemperament::Territorial;
		float StartReputation = 0.0f;
		float TerritoryRadius = 220.0f;   // meters: outer warning radius
		float InnerRadius = 60.0f;        // meters: village core
		int32_t Population = 12;
		bool bTrades = false;
		std::string Color;                // "#rrggbb" for banners / clothing
		std::vector<std::string> Rules;   // social rules shown in the journal
		std::map<std::string, float> Relations; // other tribe id -> -100..100
		std::vector<std::string> TradeGoods;    // items they offer
		std::vector<std::string> Wants;         // items they value x2
	};

	struct VillageState
	{
		int32_t Population = 12;
		int32_t MaxPopulation = 12;
		float Alarm = 0.0f;          // 0..1 (guards alert, NPCs flee/fight)
		float Food = 50.0f;          // abstract stockpile
		float Wood = 50.0f;
		bool bLeaderAlive = true;
		int32_t DestroyedStructures = 0;
		std::vector<int32_t> LootedStores;  // indices of stores emptied by the player
	};

	struct TribeRuntime
	{
		float Reputation = 0.0f;     // -100..100
		bool bDiscovered = false;
		bool bPlayerKnowsRules = false;
		VillageState Village;
		std::map<std::string, float> Relations; // runtime copy, can evolve
	};

	struct SocialOutcome
	{
		float ReputationDelta = 0.0f;
		bool bBecameHostile = false;
		bool bBecameAllied = false;
	};

	class FactionSystem
	{
	public:
		bool LoadFromJson(const JsonValue& Root, std::string& OutError);
		void ResetRuntime();

		const std::vector<TribeDef>& GetDefs() const { return Defs; }
		const TribeDef* FindDef(const std::string& Id) const;
		TribeRuntime* FindRuntime(const std::string& Id);
		const TribeRuntime* FindRuntime(const std::string& Id) const;

		float GetReputation(const std::string& TribeId) const;
		EAttitude GetAttitude(const std::string& TribeId) const;
		static EAttitude AttitudeFromReputation(float Rep);
		/** Will tribe members attack the player on sight? Takes the current village alarm into account. */
		bool IsHostileToPlayer(const std::string& TribeId) const;
		/** Will members of A attack members of B? */
		bool AreTribesHostile(const std::string& A, const std::string& B) const;

		/**
		 * Applies a social event. Magnitude scales value-based events (gift/theft).
		 * Propagates to other tribes according to their relation with the victim.
		 */
		SocialOutcome ApplyEvent(const std::string& TribeId, ESocialEvent Event, float Magnitude = 1.0f);

		/** Per-hour abstract simulation (alarm decay, population regrowth, raids). Returns textual news. */
		std::vector<std::string> TickHours(float GameHours, Rng& Random);

		/** Barter value of an item for a tribe (wanted goods worth more). */
		float ValueFor(const std::string& TribeId, const std::string& ItemId, float BaseValue) const;

		JsonValue ToJson() const;
		void FromJson(const JsonValue& J);

	private:
		float DeltaFor(const TribeDef& Def, ESocialEvent Event, float Magnitude) const;

		std::vector<TribeDef> Defs;
		std::map<std::string, TribeRuntime> Runtime;
		float HoursSinceRaidCheck = 0.0f;
	};
}
