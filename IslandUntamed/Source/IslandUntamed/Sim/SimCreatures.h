// Island Untamed - Simulation Core
// Creature definitions (animals) and the decision layer ("brains") for
// animals and tribe NPCs. Brains are pure functions of perception + schedule,
// so behaviour is deterministic and unit-testable; the Unreal AIController
// executes the chosen state (movement, animation, attacks).
// Data: Content/Data/animals.json
#pragma once

#include "SimCore.h"
#include "SimJson.h"

#include <string>
#include <vector>

namespace IUSim
{
	enum class ETemperamentAnimal : uint8_t { Skittish, Defensive, Aggressive, Predator };
	enum class EActivityCycle : uint8_t { Diurnal, Nocturnal, Always };

	struct LootEntry
	{
		std::string ItemId;
		int32_t Min = 1;
		int32_t Max = 1;
		float Chance = 1.0f;
	};

	struct AnimalDef
	{
		std::string Id;
		std::string Name;
		std::vector<std::string> Biomes;
		ETemperamentAnimal Temperament = ETemperamentAnimal::Skittish;
		EActivityCycle Cycle = EActivityCycle::Diurnal;
		float Health = 50.0f;
		float WalkSpeed = 2.0f;   // m/s
		float RunSpeed = 7.0f;
		float Damage = 0.0f;
		float Venom = 0.0f;       // poison applied to the player per bite
		float AttackRange = 1.5f;
		float AttackInterval = 1.4f;
		float SightRadius = 25.0f;
		float HearingRadius = 30.0f;
		float AggroRadius = 15.0f;
		int32_t GroupMin = 1;
		int32_t GroupMax = 1;
		float SpawnWeight = 1.0f;
		float Scale = 1.0f;       // body length in meters
		bool bFlying = false;
		std::string Color;
		std::string Shape;        // quadruped, bird, crab, reptile, feline
		std::vector<LootEntry> Loot;
	};

	class AnimalDatabase
	{
	public:
		bool LoadFromJson(const JsonValue& Root, std::string& OutError);
		const AnimalDef* Find(const std::string& Id) const;
		const std::vector<AnimalDef>& All() const { return Defs; }
		/** Weighted spawn pick for a biome and time. */
		const AnimalDef* RollForBiome(const std::string& Biome, bool bNight, Rng& Random) const;
	private:
		std::vector<AnimalDef> Defs;
	};

	/** Shared AI state vocabulary (engine maps each to movement/animation). */
	enum class EAIState : uint8_t
	{
		Idle, Wander, Graze, Sleep, Alert, Flee, Chase, Attack, ReturnHome,
		Work, Patrol, Socialize, Cook, Guard, Investigate, Warn, Hunt
	};
	const char* AIStateToString(EAIState S);

	/** What the creature currently perceives (filled by AIPerception on the engine side). */
	struct BrainInput
	{
		bool bHasTarget = false;          // a relevant actor (player/enemy/prey) is perceived
		float TargetDistance = 1.0e9f;    // meters
		bool bTargetIsThreat = false;     // target can hurt us
		bool bTargetIsHostile = false;    // we are allowed to attack it
		bool bTargetInTerritory = false;  // (NPC) inside village territory
		bool bTargetInInner = false;      // (NPC) inside village core
		bool bHeardNoise = false;
		bool bRecentlyDamaged = false;
		float HealthFraction = 1.0f;
		float DistanceFromHome = 0.0f;
		float LeashRadius = 80.0f;        // max chase distance from home
		bool bNight = false;
		float Hour = 12.0f;
		float TimeInState = 0.0f;
		float VillageAlarm = 0.0f;        // (NPC)
		float WarnTime = 0.0f;            // (NPC) seconds the player has ignored a warning
	};

	struct BrainOutput
	{
		EAIState State = EAIState::Idle;
		bool bRun = false;
	};

	class AnimalBrain
	{
	public:
		static BrainOutput Decide(const AnimalDef& Def, const BrainInput& In, EAIState Current, Rng& Random);
		static bool IsActiveTime(const AnimalDef& Def, bool bNight);
	};

	enum class ENpcRole : uint8_t { Chief, Guard, Hunter, Gatherer, Cook, Elder };
	ENpcRole NpcRoleFromString(const std::string& S);
	const char* NpcRoleToString(ENpcRole R);

	class NpcBrain
	{
	public:
		/** Daily routine for a role at a given hour (no threats). */
		static EAIState ScheduleState(ENpcRole Role, float Hour, uint32_t PersonalitySeed);
		/**
		 * Full decision: combat/alarm overrides, territorial warnings, then routine.
		 * bTribeTerritorial: aggressive/territorial tribes warn trespassers; peaceful ones ignore.
		 */
		static BrainOutput Decide(ENpcRole Role, bool bTribeTerritorial, const BrainInput& In, EAIState Current, uint32_t PersonalitySeed);
		static bool IsCombatRole(ENpcRole Role) { return Role == ENpcRole::Chief || Role == ENpcRole::Guard || Role == ENpcRole::Hunter; }
		static constexpr float WarnPatienceSeconds = 8.0f;
	};
}
