#include "SimCreatures.h"

namespace IUSim
{
	namespace CreatureDetail
	{
		ETemperamentAnimal TemperamentFromString(const std::string& S)
		{
			if (S == "defensive") { return ETemperamentAnimal::Defensive; }
			if (S == "aggressive") { return ETemperamentAnimal::Aggressive; }
			if (S == "predator") { return ETemperamentAnimal::Predator; }
			return ETemperamentAnimal::Skittish;
		}
		EActivityCycle CycleFromString(const std::string& S)
		{
			if (S == "nocturnal") { return EActivityCycle::Nocturnal; }
			if (S == "always") { return EActivityCycle::Always; }
			return EActivityCycle::Diurnal;
		}
	}

	const char* AIStateToString(EAIState S)
	{
		switch (S)
		{
		case EAIState::Idle: return "Idle";
		case EAIState::Wander: return "Wander";
		case EAIState::Graze: return "Graze";
		case EAIState::Sleep: return "Sleep";
		case EAIState::Alert: return "Alert";
		case EAIState::Flee: return "Flee";
		case EAIState::Chase: return "Chase";
		case EAIState::Attack: return "Attack";
		case EAIState::ReturnHome: return "ReturnHome";
		case EAIState::Work: return "Work";
		case EAIState::Patrol: return "Patrol";
		case EAIState::Socialize: return "Socialize";
		case EAIState::Cook: return "Cook";
		case EAIState::Guard: return "Guard";
		case EAIState::Investigate: return "Investigate";
		case EAIState::Warn: return "Warn";
		case EAIState::Hunt: return "Hunt";
		}
		return "";
	}

	bool AnimalDatabase::LoadFromJson(const JsonValue& Root, std::string& OutError)
	{
		const JsonValue* Arr = Root.Find("animals");
		if (!Arr || !Arr->IsArray()) { OutError = "animals.json: missing 'animals' array"; return false; }
		for (const JsonValue& J : Arr->Items())
		{
			AnimalDef D;
			D.Id = J.GetString("id");
			if (D.Id.empty()) { OutError = "animals.json: animal without id"; return false; }
			D.Name = J.GetString("name", D.Id);
			D.Biomes = J.GetStringArray("biomes");
			D.Temperament = CreatureDetail::TemperamentFromString(J.GetString("temperament", "skittish"));
			D.Cycle = CreatureDetail::CycleFromString(J.GetString("cycle", "diurnal"));
			D.Health = J.GetFloat("health", 50.0f);
			D.WalkSpeed = J.GetFloat("walk", 2.0f);
			D.RunSpeed = J.GetFloat("run", 7.0f);
			D.Damage = J.GetFloat("damage", 0.0f);
			D.Venom = J.GetFloat("venom", 0.0f);
			D.AttackRange = J.GetFloat("attack_range", 1.5f);
			D.AttackInterval = J.GetFloat("attack_interval", 1.4f);
			D.SightRadius = J.GetFloat("sight", 25.0f);
			D.HearingRadius = J.GetFloat("hearing", 30.0f);
			D.AggroRadius = J.GetFloat("aggro", 15.0f);
			D.GroupMin = J.GetInt("group_min", 1);
			D.GroupMax = J.GetInt("group_max", 1);
			D.SpawnWeight = J.GetFloat("spawn_weight", 1.0f);
			D.Scale = J.GetFloat("scale", 1.0f);
			D.bFlying = J.GetBool("flying", false);
			D.Color = J.GetString("color", "#8a6a4a");
			D.Shape = J.GetString("shape", "quadruped");
			if (const JsonValue* Loot = J.Find("loot"))
			{
				for (const JsonValue& L : Loot->Items())
				{
					LootEntry E;
					E.ItemId = L.GetString("item");
					E.Min = L.GetInt("min", 1);
					E.Max = L.GetInt("max", E.Min);
					E.Chance = L.GetFloat("chance", 1.0f);
					D.Loot.push_back(E);
				}
			}
			Defs.push_back(D);
		}
		return true;
	}

	const AnimalDef* AnimalDatabase::Find(const std::string& Id) const
	{
		for (const AnimalDef& D : Defs) { if (D.Id == Id) { return &D; } }
		return nullptr;
	}

	bool AnimalBrain::IsActiveTime(const AnimalDef& Def, bool bNight)
	{
		switch (Def.Cycle)
		{
		case EActivityCycle::Diurnal: return !bNight;
		case EActivityCycle::Nocturnal: return bNight;
		case EActivityCycle::Always: return true;
		}
		return true;
	}

	const AnimalDef* AnimalDatabase::RollForBiome(const std::string& Biome, bool bNight, Rng& Random) const
	{
		float Total = 0.0f;
		std::vector<const AnimalDef*> Candidates;
		for (const AnimalDef& D : Defs)
		{
			bool bMatch = false;
			for (const std::string& B : D.Biomes) { if (B == Biome) { bMatch = true; break; } }
			if (!bMatch) { continue; }
			// Inactive animals still exist (sleeping) but are rarer to encounter.
			const float W = D.SpawnWeight * (AnimalBrain::IsActiveTime(D, bNight) ? 1.0f : 0.35f);
			Candidates.push_back(&D);
			Total += W;
		}
		if (Candidates.empty()) { return nullptr; }
		float Pick = Random.NextFloat() * Total;
		for (const AnimalDef* D : Candidates)
		{
			Pick -= D->SpawnWeight * (AnimalBrain::IsActiveTime(*D, bNight) ? 1.0f : 0.35f);
			if (Pick <= 0.0f) { return D; }
		}
		return Candidates.back();
	}

	BrainOutput AnimalBrain::Decide(const AnimalDef& Def, const BrainInput& In, EAIState Current, Rng& Random)
	{
		BrainOutput Out;
		const bool bActive = IsActiveTime(Def, In.bNight);
		const bool bLowHealth = In.HealthFraction < 0.3f;

		// Leash: never chase too far from home.
		if ((Current == EAIState::Chase || Current == EAIState::Attack) && In.DistanceFromHome > In.LeashRadius)
		{
			Out.State = EAIState::ReturnHome;
			Out.bRun = true;
			return Out;
		}

		if (In.bHasTarget && In.bTargetIsThreat)
		{
			switch (Def.Temperament)
			{
			case ETemperamentAnimal::Skittish:
				if (In.TargetDistance < Def.SightRadius || In.bRecentlyDamaged) { Out.State = EAIState::Flee; Out.bRun = true; return Out; }
				break;
			case ETemperamentAnimal::Defensive:
				if (In.bRecentlyDamaged && !bLowHealth)
				{
					Out.State = In.TargetDistance <= Def.AttackRange ? EAIState::Attack : EAIState::Chase;
					Out.bRun = true;
					return Out;
				}
				if (bLowHealth || In.TargetDistance < Def.AggroRadius * 0.5f) { Out.State = EAIState::Flee; Out.bRun = true; return Out; }
				if (In.TargetDistance < Def.AggroRadius) { Out.State = EAIState::Alert; return Out; }
				break;
			case ETemperamentAnimal::Aggressive:
			case ETemperamentAnimal::Predator:
			{
				if (bLowHealth) { Out.State = EAIState::Flee; Out.bRun = true; return Out; }
				// Predators are bold at their active time, cautious otherwise.
				const float Aggro = Def.AggroRadius * (bActive ? 1.0f : 0.5f);
				if (In.TargetDistance <= Def.AttackRange) { Out.State = EAIState::Attack; Out.bRun = true; return Out; }
				if (In.TargetDistance < Aggro || In.bRecentlyDamaged || Current == EAIState::Chase)
				{
					// Stalk first (walk), sprint for the final approach.
					Out.State = Def.Temperament == ETemperamentAnimal::Predator && In.TargetDistance > Aggro * 0.5f && !In.bRecentlyDamaged ? EAIState::Hunt : EAIState::Chase;
					Out.bRun = Out.State == EAIState::Chase;
					return Out;
				}
				if (In.TargetDistance < Def.SightRadius) { Out.State = EAIState::Alert; return Out; }
				break;
			}
			}
		}

		if (In.bHeardNoise && Def.Temperament == ETemperamentAnimal::Skittish) { Out.State = EAIState::Alert; return Out; }

		// Keep fleeing for a while after the threat is gone.
		if (Current == EAIState::Flee && In.TimeInState < 6.0f) { Out.State = EAIState::Flee; Out.bRun = true; return Out; }
		if (In.DistanceFromHome > In.LeashRadius) { Out.State = EAIState::ReturnHome; return Out; }

		if (!bActive) { Out.State = EAIState::Sleep; return Out; }

		// Idle routine: alternate wander / graze / idle with minimum durations.
		const bool bRoutine = Current == EAIState::Wander || Current == EAIState::Graze || Current == EAIState::Idle;
		if (bRoutine && In.TimeInState < 8.0f) { Out.State = Current; return Out; }
		const float R = Random.NextFloat();
		Out.State = R < 0.45f ? EAIState::Wander : (R < 0.8f ? EAIState::Graze : EAIState::Idle);
		return Out;
	}

	ENpcRole NpcRoleFromString(const std::string& S)
	{
		if (S == "chief") { return ENpcRole::Chief; }
		if (S == "guard") { return ENpcRole::Guard; }
		if (S == "hunter") { return ENpcRole::Hunter; }
		if (S == "cook") { return ENpcRole::Cook; }
		if (S == "elder") { return ENpcRole::Elder; }
		return ENpcRole::Gatherer;
	}

	const char* NpcRoleToString(ENpcRole R)
	{
		switch (R)
		{
		case ENpcRole::Chief: return "Jefe";
		case ENpcRole::Guard: return "Guardian";
		case ENpcRole::Hunter: return "Cazador";
		case ENpcRole::Gatherer: return "Recolector";
		case ENpcRole::Cook: return "Cocinero";
		case ENpcRole::Elder: return "Anciano";
		}
		return "";
	}

	EAIState NpcBrain::ScheduleState(ENpcRole Role, float Hour, uint32_t PersonalitySeed)
	{
		// Small per-NPC offset so the village does not move in lockstep.
		const float Offset = static_cast<float>(PersonalitySeed % 60U) / 60.0f;
		const float H = Hour + Offset;
		// Guards split into day and night shifts.
		if (Role == ENpcRole::Guard)
		{
			const bool bNightShift = (PersonalitySeed & 1U) != 0U;
			const bool bOnDuty = bNightShift ? (H >= 19.0f || H < 7.0f) : (H >= 7.0f && H < 19.5f);
			if (bOnDuty) { return (PersonalitySeed & 2U) != 0U ? EAIState::Patrol : EAIState::Guard; }
			return (H >= 12.0f && H < 14.0f) ? EAIState::Socialize : EAIState::Sleep;
		}
		if (H >= 22.0f || H < 5.5f) { return EAIState::Sleep; }
		if (H >= 12.0f && H < 13.5f) { return Role == ENpcRole::Cook ? EAIState::Cook : EAIState::Socialize; }
		if (H >= 18.5f) { return Role == ENpcRole::Cook ? EAIState::Cook : EAIState::Socialize; }
		switch (Role)
		{
		case ENpcRole::Chief: return EAIState::Patrol;       // walks around the village
		case ENpcRole::Hunter: return H < 16.0f ? EAIState::Hunt : EAIState::ReturnHome;
		case ENpcRole::Gatherer: return EAIState::Work;
		case ENpcRole::Cook: return (H < 9.0f || H > 16.0f) ? EAIState::Cook : EAIState::Work;
		case ENpcRole::Elder: return EAIState::Socialize;
		case ENpcRole::Guard: break;
		}
		return EAIState::Idle;
	}

	BrainOutput NpcBrain::Decide(ENpcRole Role, bool bTribeTerritorial, const BrainInput& In, EAIState Current, uint32_t PersonalitySeed)
	{
		BrainOutput Out;
		const bool bFighter = IsCombatRole(Role);

		if (Current == EAIState::Chase && In.DistanceFromHome > In.LeashRadius)
		{
			Out.State = EAIState::ReturnHome;
			Out.bRun = true;
			return Out;
		}

		if (In.bHasTarget && In.bTargetIsHostile)
		{
			// Civilians flee unless the village is desperate (high alarm, defending home).
			if (!bFighter && (In.HealthFraction < 0.6f || !(In.VillageAlarm > 0.9f && In.bTargetInInner)))
			{
				Out.State = EAIState::Flee;
				Out.bRun = true;
				return Out;
			}
			if (bFighter && In.HealthFraction < 0.2f) { Out.State = EAIState::Flee; Out.bRun = true; return Out; }
			Out.State = In.TargetDistance <= 2.0f ? EAIState::Attack : EAIState::Chase;
			Out.bRun = true;
			return Out;
		}

		// Territorial warning: guards confront non-hostile intruders in the village core.
		if (In.bHasTarget && bTribeTerritorial && In.bTargetInInner && bFighter)
		{
			Out.State = EAIState::Warn;
			return Out;
		}

		if (In.bRecentlyDamaged || In.bHeardNoise || In.VillageAlarm > 0.5f)
		{
			if (bFighter) { Out.State = EAIState::Investigate; Out.bRun = In.VillageAlarm > 0.5f; return Out; }
			if (In.VillageAlarm > 0.5f) { Out.State = EAIState::Flee; return Out; }
		}

		if (In.bHasTarget && In.TargetDistance < 6.0f && !In.bTargetIsHostile && Role != ENpcRole::Guard)
		{
			// Curious villagers stop and look at the stranger.
			Out.State = EAIState::Alert;
			return Out;
		}

		Out.State = ScheduleState(Role, In.Hour, PersonalitySeed);
		return Out;
	}
}
