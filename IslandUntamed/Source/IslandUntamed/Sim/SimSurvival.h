// Island Untamed - Simulation Core
// Physiological model of the survivor: needs, body temperature and medical
// conditions. Time is expressed in GAME HOURS so tuning is independent of the
// real-time length of a day.
#pragma once

#include "SimCore.h"
#include "SimItems.h"

namespace IUSim
{
	enum class EActivity : uint8_t { Idle, Walk, Sprint, Swim, Work, Combat };

	/** Environmental inputs for one tick, gathered by the engine layer. */
	struct SurvivalEnvironment
	{
		float AmbientTempC = 26.0f;  // already includes biome, altitude, time of day
		float RainIntensity = 0.0f;  // 0..1
		float WindSpeed = 0.0f;      // m/s
		bool bInWater = false;
		bool bSheltered = false;     // roof above the player
		float FireHeat = 0.0f;       // 0..1 proximity to a lit fire
		float Insulation = 0.0f;     // from armour/clothes, degrees C
		EActivity Activity = EActivity::Idle;
		bool bSleeping = false;
		bool bSleepingInBed = false; // sleeping in a proper shelter/bed recovers better
	};

	struct SurvivalTuning
	{
		float SatietyLossPerHour = 4.0f;
		float HydrationLossPerHour = 6.0f;
		float RestLossPerHour = 4.2f;          // ~ 24h awake empties it
		float RestGainSleepPerHour = 14.0f;
		float EnergyRecoverPerHour = 20.0f;
		float StarvationDamagePerHour = 6.0f;
		float DehydrationDamagePerHour = 10.0f;
		float BleedDamagePerHour = 30.0f;
		float PoisonDamagePerHour = 12.0f;
		float InfectionDamagePerHour = 5.0f;
		float HypothermiaDamagePerHour = 8.0f;
		float HyperthermiaDamagePerHour = 6.0f;
		float NaturalRegenPerHour = 3.0f;
		float StaminaRegenPerSecond = 18.0f;
		float SprintStaminaPerSecond = 12.0f;
	};

	/** Condition flags exposed to the HUD. */
	enum ESurvivalWarning : uint32_t
	{
		Warn_None = 0,
		Warn_Hungry = 1 << 0,
		Warn_Starving = 1 << 1,
		Warn_Thirsty = 1 << 2,
		Warn_Dehydrated = 1 << 3,
		Warn_Tired = 1 << 4,
		Warn_Exhausted = 1 << 5,
		Warn_Cold = 1 << 6,
		Warn_Hypothermia = 1 << 7,
		Warn_Hot = 1 << 8,
		Warn_Hyperthermia = 1 << 9,
		Warn_Bleeding = 1 << 10,
		Warn_Fracture = 1 << 11,
		Warn_Poisoned = 1 << 12,
		Warn_Infected = 1 << 13,
		Warn_Wet = 1 << 14,
		Warn_Overloaded = 1 << 15,
		Warn_LowEnergy = 1 << 16,
	};

	/** Gameplay modifiers derived from the current state. */
	struct SurvivalEffects
	{
		float MoveSpeedMultiplier = 1.0f;
		float StaminaRegenMultiplier = 1.0f;
		float MaxStaminaFraction = 1.0f;
		float DamageMultiplier = 1.0f;       // outgoing damage
		float VisionBlur = 0.0f;             // 0..1 screen effects
		float ColdTint = 0.0f;
		float SicknessTint = 0.0f;
		float LowHealthVignette = 0.0f;
		bool bCanSprint = true;
	};

	struct SurvivalState
	{
		float Health = 100.0f;
		float MaxHealth = 100.0f;
		float Satiety = 80.0f;     // Hambre (100 = full)
		float Hydration = 80.0f;   // Sed (100 = hydrated)
		float Energy = 100.0f;     // physical energy, drained by exertion
		float Rest = 90.0f;        // Sueno (100 = well rested)
		float Stamina = 100.0f;    // short-term resistance
		float MaxStamina = 100.0f;
		float BodyTempC = 37.0f;
		float Wetness = 0.0f;      // 0..1
		float Bleeding = 0.0f;     // 0..1 severity
		bool bFracture = false;
		float Poison = 0.0f;       // 0..100
		float Infection = 0.0f;    // 0..100
		float WoundDirt = 0.0f;    // untreated wounds -> infection risk
	};

	class SurvivalModel
	{
	public:
		SurvivalState State;
		SurvivalTuning Tuning;

		/**
		 * Advances the model.
		 * @param GameHours   elapsed in-game hours (needs)
		 * @param RealSeconds elapsed real seconds (stamina, which is action-scale)
		 */
		void Tick(float GameHours, float RealSeconds, const SurvivalEnvironment& Env, float LoadRatio);

		/** Applies a consumable. Rng is used for poison/infection rolls. Returns false if the item has no effect. */
		bool Consume(const ItemDef& Item, Rng& Random);

		/** Raw damage application with medical side effects. Returns real damage applied. */
		float ApplyDamage(float Amount, bool bCanBleed, Rng& Random);
		float ApplyFallDamage(float FallSpeedMs, Rng& Random);
		void Heal(float Amount);

		/** Tries to spend stamina; returns false if not enough. */
		bool SpendStamina(float Amount);
		/** Drains energy for heavy actions (harvesting, building, combat). */
		void SpendEnergy(float Amount) { State.Energy = Clampf(State.Energy - Amount, 0.0f, 100.0f); }

		bool IsDead() const { return State.Health <= 0.0f; }
		uint32_t GetWarnings(float LoadRatio) const;
		SurvivalEffects ComputeEffects(float LoadRatio) const;

		/** Can the player go to sleep right now (not in combat, rest below threshold)? */
		bool CanSleep() const { return State.Rest < 85.0f; }

		JsonValue ToJson() const;
		void FromJson(const JsonValue& J);

	private:
		void TickTemperature(float GameHours, const SurvivalEnvironment& Env);
	};
}
