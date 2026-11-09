#include "SimSurvival.h"

namespace IUSim
{
	namespace SurvivalDetail
	{
		float NeedMultiplier(EActivity A)
		{
			switch (A)
			{
			case EActivity::Idle: return 1.0f;
			case EActivity::Walk: return 1.2f;
			case EActivity::Sprint: return 2.0f;
			case EActivity::Swim: return 2.2f;
			case EActivity::Work: return 1.6f;
			case EActivity::Combat: return 1.8f;
			}
			return 1.0f;
		}

		float EnergyDrainPerHour(EActivity A)
		{
			switch (A)
			{
			case EActivity::Idle: return 0.0f;
			case EActivity::Walk: return 4.0f;
			case EActivity::Sprint: return 40.0f;
			case EActivity::Swim: return 35.0f;
			case EActivity::Work: return 22.0f;
			case EActivity::Combat: return 30.0f;
			}
			return 0.0f;
		}

		float ActivityHeat(EActivity A)
		{
			switch (A)
			{
			case EActivity::Sprint: return 4.0f;
			case EActivity::Swim: return 1.0f;
			case EActivity::Work: return 2.5f;
			case EActivity::Combat: return 3.0f;
			case EActivity::Walk: return 1.0f;
			case EActivity::Idle: return 0.0f;
			}
			return 0.0f;
		}
	}

	void SurvivalModel::TickTemperature(float GameHours, const SurvivalEnvironment& Env)
	{
		SurvivalState& S = State;

		// --- Wetness
		if (Env.bInWater)
		{
			S.Wetness = 1.0f;
		}
		else if (Env.RainIntensity > 0.05f && !Env.bSheltered)
		{
			S.Wetness = Clamp01(S.Wetness + Env.RainIntensity * 2.0f * GameHours);
		}
		else
		{
			const float DryRate = 0.5f + Env.FireHeat * 3.0f + std::max(0.0f, Env.AmbientTempC - 20.0f) * 0.05f;
			S.Wetness = Clamp01(S.Wetness - DryRate * GameHours);
		}

		// --- Perceived temperature
		const float ShelterFactor = Env.bSheltered ? 0.3f : 1.0f;
		const float WindChill = std::max(0.0f, Env.WindSpeed - 2.0f) * 0.5f * ShelterFactor * (1.0f + S.Wetness);
		float Felt = Env.AmbientTempC
			+ SurvivalDetail::ActivityHeat(Env.Activity)
			+ Env.FireHeat * 18.0f
			+ Env.Insulation
			- S.Wetness * 7.0f
			- WindChill;
		if (Env.bInWater) { Felt -= 4.0f; }
		if (Env.bSleepingInBed) { Felt += 4.0f; }

		const float Equilibrium = 37.0f + Clampf((Felt - 22.0f) * 0.12f, -8.0f, 4.0f);
		S.BodyTempC = MoveToward(S.BodyTempC, Equilibrium, 1.5f * GameHours);
	}

	void SurvivalModel::Tick(float GameHours, float RealSeconds, const SurvivalEnvironment& Env, float LoadRatio)
	{
		if (IsDead()) { return; }
		SurvivalState& S = State;
		const SurvivalTuning& T = Tuning;

		TickTemperature(GameHours, Env);

		// --- Needs
		const float Mult = Env.bSleeping ? 0.6f : SurvivalDetail::NeedMultiplier(Env.Activity);
		const float ColdMult = S.BodyTempC < 36.0f ? 1.3f : 1.0f;
		const float HeatMult = (Env.AmbientTempC > 30.0f || S.BodyTempC > 37.8f) ? 1.5f : 1.0f;
		S.Satiety = Clampf(S.Satiety - T.SatietyLossPerHour * Mult * ColdMult * GameHours, 0.0f, 100.0f);
		S.Hydration = Clampf(S.Hydration - T.HydrationLossPerHour * Mult * HeatMult * GameHours, 0.0f, 100.0f);

		if (Env.bSleeping)
		{
			const float BedMult = Env.bSleepingInBed ? 1.4f : 1.0f;
			S.Rest = Clampf(S.Rest + T.RestGainSleepPerHour * BedMult * GameHours, 0.0f, 100.0f);
			S.Energy = Clampf(S.Energy + 40.0f * GameHours, 0.0f, 100.0f);
		}
		else
		{
			S.Rest = Clampf(S.Rest - T.RestLossPerHour * GameHours, 0.0f, 100.0f);
			const float Drain = SurvivalDetail::EnergyDrainPerHour(Env.Activity) * (LoadRatio > 1.0f ? 1.5f : 1.0f);
			const float FoodFactor = S.Satiety > 20.0f ? 1.0f : 0.3f;
			const float Recover = (Env.Activity == EActivity::Idle || Env.Activity == EActivity::Walk) ? T.EnergyRecoverPerHour * FoodFactor : 0.0f;
			S.Energy = Clampf(S.Energy + (Recover - Drain) * GameHours, 0.0f, 100.0f);
		}

		// --- Conditions
		float DamagePerHour = 0.0f;
		if (S.Satiety <= 0.0f) { DamagePerHour += T.StarvationDamagePerHour; }
		if (S.Hydration <= 0.0f) { DamagePerHour += T.DehydrationDamagePerHour; }
		if (S.Rest <= 0.0f) { DamagePerHour += 2.0f; }

		if (S.Bleeding > 0.0f)
		{
			DamagePerHour += T.BleedDamagePerHour * S.Bleeding;
			S.WoundDirt = Clamp01(S.WoundDirt + 0.15f * GameHours * (Env.bInWater ? 2.0f : 1.0f));
			// Minor cuts clot by themselves.
			if (S.Bleeding < 0.3f) { S.Bleeding = std::max(0.0f, S.Bleeding - 0.25f * GameHours); }
		}
		if (S.Poison > 0.0f)
		{
			DamagePerHour += T.PoisonDamagePerHour * (S.Poison / 100.0f);
			S.Poison = std::max(0.0f, S.Poison - 8.0f * GameHours);
		}
		// Dirty wounds turn into infection over time.
		if (S.WoundDirt > 0.0f)
		{
			S.Infection = Clampf(S.Infection + S.WoundDirt * 6.0f * GameHours, 0.0f, 100.0f);
			S.WoundDirt = std::max(0.0f, S.WoundDirt - 0.05f * GameHours);
		}
		if (S.Infection > 0.0f)
		{
			DamagePerHour += T.InfectionDamagePerHour * (S.Infection / 100.0f) * 2.0f;
			if (S.Infection < 20.0f && S.Satiety > 50.0f && S.Hydration > 50.0f)
			{
				S.Infection = std::max(0.0f, S.Infection - 2.0f * GameHours); // immune system wins
			}
			else
			{
				S.Infection = Clampf(S.Infection + 2.5f * GameHours, 0.0f, 100.0f); // spreads
			}
		}
		if (S.BodyTempC < 35.0f) { DamagePerHour += T.HypothermiaDamagePerHour * (35.0f - S.BodyTempC); }
		if (S.BodyTempC > 39.0f) { DamagePerHour += T.HyperthermiaDamagePerHour * (S.BodyTempC - 39.0f); }

		const bool bHealthy = S.Satiety > 40.0f && S.Hydration > 40.0f && S.Bleeding <= 0.0f && S.Poison < 5.0f
			&& S.Infection < 10.0f && S.BodyTempC > 35.5f && S.BodyTempC < 38.5f;
		const float Regen = bHealthy ? T.NaturalRegenPerHour * (Env.bSleeping ? 3.0f : 1.0f) : 0.0f;

		S.Health = Clampf(S.Health + (Regen - DamagePerHour) * GameHours, 0.0f, S.MaxHealth);

		// --- Stamina (real time scale)
		const SurvivalEffects Fx = ComputeEffects(LoadRatio);
		S.MaxStamina = 100.0f * Fx.MaxStaminaFraction;
		if (Env.Activity == EActivity::Sprint)
		{
			S.Stamina -= T.SprintStaminaPerSecond * RealSeconds;
		}
		else if (Env.Activity == EActivity::Swim)
		{
			S.Stamina -= 4.0f * RealSeconds;
		}
		else if (Env.Activity != EActivity::Combat)
		{
			S.Stamina += T.StaminaRegenPerSecond * Fx.StaminaRegenMultiplier * RealSeconds;
		}
		S.Stamina = Clampf(S.Stamina, 0.0f, S.MaxStamina);
		// Drowning: swimming with no stamina hurts quickly.
		if (Env.Activity == EActivity::Swim && S.Stamina <= 0.0f)
		{
			S.Health = Clampf(S.Health - 6.0f * RealSeconds, 0.0f, S.MaxHealth);
		}
	}

	bool SurvivalModel::Consume(const ItemDef& Item, Rng& Random)
	{
		bool bApplied = false;
		SurvivalState& S = State;
		if (Item.bHasFood)
		{
			const FoodStats& F = Item.Food;
			S.Satiety = Clampf(S.Satiety + F.Calories, 0.0f, 100.0f);
			S.Hydration = Clampf(S.Hydration + F.Hydration, 0.0f, 100.0f);
			S.Energy = Clampf(S.Energy + F.Energy, 0.0f, 100.0f);
			S.Health = Clampf(S.Health + F.Health, 0.0f, S.MaxHealth);
			S.BodyTempC = Clampf(S.BodyTempC + F.Warmth * 0.3f, 30.0f, 41.0f);
			if (F.PoisonChance > 0.0f && Random.Chance(F.PoisonChance)) { S.Poison = Clampf(S.Poison + F.PoisonAmount, 0.0f, 100.0f); }
			if (F.InfectionChance > 0.0f && Random.Chance(F.InfectionChance)) { S.Infection = Clampf(S.Infection + 15.0f, 0.0f, 100.0f); }
			bApplied = true;
		}
		if (Item.bHasMedicine)
		{
			const MedicineStats& M = Item.Medicine;
			if (M.bStopsBleeding) { S.Bleeding = 0.0f; S.WoundDirt = std::max(0.0f, S.WoundDirt - 0.5f); }
			if (M.bFixesFracture) { S.bFracture = false; }
			S.Poison = std::max(0.0f, S.Poison - M.CuresPoison);
			S.Infection = std::max(0.0f, S.Infection - M.CuresInfection);
			S.Health = Clampf(S.Health + M.Heal, 0.0f, S.MaxHealth);
			bApplied = true;
		}
		return bApplied;
	}

	float SurvivalModel::ApplyDamage(float Amount, bool bCanBleed, Rng& Random)
	{
		if (Amount <= 0.0f || IsDead()) { return 0.0f; }
		const float Before = State.Health;
		State.Health = Clampf(State.Health - Amount, 0.0f, State.MaxHealth);
		if (bCanBleed && Amount >= 8.0f && Random.Chance(Clamp01(Amount / 60.0f)))
		{
			State.Bleeding = Clamp01(State.Bleeding + Amount / 50.0f);
			State.WoundDirt = Clamp01(State.WoundDirt + Amount / 100.0f);
		}
		return Before - State.Health;
	}

	float SurvivalModel::ApplyFallDamage(float FallSpeedMs, Rng& Random)
	{
		if (FallSpeedMs <= 10.0f) { return 0.0f; }
		const float Damage = (FallSpeedMs - 10.0f) * 8.0f;
		if (FallSpeedMs > 14.0f && Random.Chance(Clamp01((FallSpeedMs - 14.0f) / 8.0f))) { State.bFracture = true; }
		return ApplyDamage(Damage, false, Random);
	}

	void SurvivalModel::Heal(float Amount)
	{
		State.Health = Clampf(State.Health + Amount, 0.0f, State.MaxHealth);
	}

	bool SurvivalModel::SpendStamina(float Amount)
	{
		if (State.Stamina < Amount) { return false; }
		State.Stamina -= Amount;
		return true;
	}

	uint32_t SurvivalModel::GetWarnings(float LoadRatio) const
	{
		const SurvivalState& S = State;
		uint32_t W = Warn_None;
		if (S.Satiety < 25.0f) { W |= Warn_Hungry; }
		if (S.Satiety <= 0.0f) { W |= Warn_Starving; }
		if (S.Hydration < 25.0f) { W |= Warn_Thirsty; }
		if (S.Hydration <= 0.0f) { W |= Warn_Dehydrated; }
		if (S.Rest < 25.0f) { W |= Warn_Tired; }
		if (S.Rest <= 5.0f) { W |= Warn_Exhausted; }
		if (S.Energy < 15.0f) { W |= Warn_LowEnergy; }
		if (S.BodyTempC < 36.2f) { W |= Warn_Cold; }
		if (S.BodyTempC < 35.0f) { W |= Warn_Hypothermia; }
		if (S.BodyTempC > 37.8f) { W |= Warn_Hot; }
		if (S.BodyTempC > 39.0f) { W |= Warn_Hyperthermia; }
		if (S.Bleeding > 0.0f) { W |= Warn_Bleeding; }
		if (S.bFracture) { W |= Warn_Fracture; }
		if (S.Poison > 5.0f) { W |= Warn_Poisoned; }
		if (S.Infection > 10.0f) { W |= Warn_Infected; }
		if (S.Wetness > 0.4f) { W |= Warn_Wet; }
		if (LoadRatio > 1.0f) { W |= Warn_Overloaded; }
		return W;
	}

	SurvivalEffects SurvivalModel::ComputeEffects(float LoadRatio) const
	{
		const SurvivalState& S = State;
		SurvivalEffects E;

		if (S.bFracture) { E.MoveSpeedMultiplier *= 0.6f; E.bCanSprint = false; }
		if (LoadRatio > 1.0f) { E.MoveSpeedMultiplier *= Lerpf(1.0f, 0.45f, Clamp01((LoadRatio - 1.0f) / 0.5f)); E.bCanSprint = false; }
		if (S.Energy < 10.0f) { E.MoveSpeedMultiplier *= 0.85f; E.bCanSprint = false; }
		if (S.BodyTempC < 35.0f) { E.MoveSpeedMultiplier *= 0.85f; }

		E.MaxStaminaFraction = 1.0f;
		if (S.Satiety < 20.0f) { E.MaxStaminaFraction -= 0.25f; }
		if (S.Hydration < 20.0f) { E.MaxStaminaFraction -= 0.2f; }
		if (S.Rest < 20.0f) { E.MaxStaminaFraction -= 0.2f; }
		E.MaxStaminaFraction -= (1.0f - S.Energy / 100.0f) * 0.3f;
		E.MaxStaminaFraction = Clampf(E.MaxStaminaFraction, 0.25f, 1.0f);

		E.StaminaRegenMultiplier = Clampf(0.4f + S.Energy / 100.0f * 0.6f, 0.4f, 1.0f);
		if (S.Hydration < 15.0f) { E.StaminaRegenMultiplier *= 0.6f; }

		E.DamageMultiplier = S.Energy < 15.0f ? 0.75f : 1.0f;

		E.VisionBlur = Clamp01((S.Hydration < 10.0f ? 0.4f : 0.0f) + (S.Rest < 10.0f ? 0.4f : 0.0f) + S.Poison / 150.0f);
		E.ColdTint = Clamp01((36.5f - S.BodyTempC) / 2.5f);
		E.SicknessTint = Clamp01(S.Poison / 60.0f + S.Infection / 100.0f);
		E.LowHealthVignette = Clamp01((40.0f - S.Health) / 40.0f);
		return E;
	}

	JsonValue SurvivalModel::ToJson() const
	{
		const SurvivalState& S = State;
		JsonValue J = JsonValue::MakeObject();
		J.Set("health", JsonValue::MakeNumber(S.Health));
		J.Set("max_health", JsonValue::MakeNumber(S.MaxHealth));
		J.Set("satiety", JsonValue::MakeNumber(S.Satiety));
		J.Set("hydration", JsonValue::MakeNumber(S.Hydration));
		J.Set("energy", JsonValue::MakeNumber(S.Energy));
		J.Set("rest", JsonValue::MakeNumber(S.Rest));
		J.Set("stamina", JsonValue::MakeNumber(S.Stamina));
		J.Set("body_temp", JsonValue::MakeNumber(S.BodyTempC));
		J.Set("wetness", JsonValue::MakeNumber(S.Wetness));
		J.Set("bleeding", JsonValue::MakeNumber(S.Bleeding));
		J.Set("fracture", JsonValue::MakeBool(S.bFracture));
		J.Set("poison", JsonValue::MakeNumber(S.Poison));
		J.Set("infection", JsonValue::MakeNumber(S.Infection));
		J.Set("wound_dirt", JsonValue::MakeNumber(S.WoundDirt));
		return J;
	}

	void SurvivalModel::FromJson(const JsonValue& J)
	{
		SurvivalState& S = State;
		S.Health = J.GetFloat("health", 100.0f);
		S.MaxHealth = J.GetFloat("max_health", 100.0f);
		S.Satiety = J.GetFloat("satiety", 80.0f);
		S.Hydration = J.GetFloat("hydration", 80.0f);
		S.Energy = J.GetFloat("energy", 100.0f);
		S.Rest = J.GetFloat("rest", 90.0f);
		S.Stamina = J.GetFloat("stamina", 100.0f);
		S.BodyTempC = J.GetFloat("body_temp", 37.0f);
		S.Wetness = J.GetFloat("wetness", 0.0f);
		S.Bleeding = J.GetFloat("bleeding", 0.0f);
		S.bFracture = J.GetBool("fracture", false);
		S.Poison = J.GetFloat("poison", 0.0f);
		S.Infection = J.GetFloat("infection", 0.0f);
		S.WoundDirt = J.GetFloat("wound_dirt", 0.0f);
	}
}
