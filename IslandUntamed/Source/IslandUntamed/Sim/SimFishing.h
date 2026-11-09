// Island Untamed - Simulation Core
// Fishing: species tables per water zone and the rod "tension" minigame.
// Data: Content/Data/fish.json
#pragma once

#include "SimCore.h"
#include "SimJson.h"

#include <string>
#include <vector>

namespace IUSim
{
	enum class EWaterZone : uint8_t { None, Sea, Reef, River, Lake, Swamp };
	EWaterZone WaterZoneFromString(const std::string& S);
	const char* WaterZoneToString(EWaterZone Z);

	struct FishSpecies
	{
		std::string Id;
		std::string Name;
		std::string Item;            // raw item produced
		std::vector<EWaterZone> Zones;
		float MinWeight = 0.3f;      // kg
		float MaxWeight = 2.0f;
		float Rarity = 1.0f;         // relative weight in the zone table
		int32_t ActiveTime = 0;      // 0 any, 1 day, 2 night
		float Strength = 0.4f;       // 0..1 pull strength
		float Stamina = 6.0f;        // seconds of full fight
		bool bSpearable = true;      // visible in shallow water
	};

	class FishDatabase
	{
	public:
		bool LoadFromJson(const JsonValue& Root, std::string& OutError);
		const FishSpecies* Find(const std::string& Id) const;
		const std::vector<FishSpecies>& All() const { return Species; }
		/** Weighted random pick for a zone and time; returns nullptr if nothing lives there. */
		const FishSpecies* Roll(EWaterZone Zone, bool bNight, Rng& Random) const;
	private:
		std::vector<FishSpecies> Species;
	};

	enum class EFishingState : uint8_t { Idle, Waiting, Bite, Reeling, Caught, Escaped, LineSnapped };

	/**
	 * One rod fishing attempt. Drive with Tick(dt, bReelHeld).
	 *  - Waiting: random bite timer.
	 *  - Bite: player must press reel within the window to hook.
	 *  - Reeling: holding reel pulls the fish but raises tension; fish surges
	 *    raise tension further. Tension >= 1 snaps the line; letting it go slack
	 *    for too long lets the fish escape. Distance 0 => caught.
	 */
	class FishingSession
	{
	public:
		void Begin(const FishSpecies* InFish, float InWeight, float BaitBonus, uint64_t Seed);
		void Tick(float Dt, bool bReelHeld);
		/** Player input during Bite to set the hook. */
		void Strike();
		void Cancel() { State = EFishingState::Idle; }

		EFishingState GetState() const { return State; }
		float GetTension() const { return Tension; }
		float GetDistance() const { return Distance; }   // 0..1 (1 = far)
		float GetSlack() const { return SlackTime; }
		const FishSpecies* GetFish() const { return Fish; }
		float GetWeight() const { return Weight; }
		bool IsSurging() const { return SurgeTime > 0.0f; }
		bool IsFinished() const { return State == EFishingState::Caught || State == EFishingState::Escaped || State == EFishingState::LineSnapped; }

		float BiteWindow = 1.4f;
		float MaxSlackSeconds = 2.5f;

	private:
		EFishingState State = EFishingState::Idle;
		const FishSpecies* Fish = nullptr;
		float Weight = 0.0f;
		float WaitTime = 0.0f;
		float BiteTime = 0.0f;
		float Tension = 0.0f;
		float Distance = 1.0f;
		float SlackTime = 0.0f;
		float SurgeTime = 0.0f;
		float SurgeCooldown = 2.0f;
		float FishStamina = 6.0f;
		Rng Random;
	};
}
