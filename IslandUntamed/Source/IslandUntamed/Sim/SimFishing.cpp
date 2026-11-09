#include "SimFishing.h"

namespace IUSim
{
	EWaterZone WaterZoneFromString(const std::string& S)
	{
		if (S == "sea") { return EWaterZone::Sea; }
		if (S == "reef") { return EWaterZone::Reef; }
		if (S == "river") { return EWaterZone::River; }
		if (S == "lake") { return EWaterZone::Lake; }
		if (S == "swamp") { return EWaterZone::Swamp; }
		return EWaterZone::None;
	}

	const char* WaterZoneToString(EWaterZone Z)
	{
		switch (Z)
		{
		case EWaterZone::Sea: return "Mar";
		case EWaterZone::Reef: return "Arrecife";
		case EWaterZone::River: return "Rio";
		case EWaterZone::Lake: return "Lago";
		case EWaterZone::Swamp: return "Pantano";
		case EWaterZone::None: break;
		}
		return "";
	}

	bool FishDatabase::LoadFromJson(const JsonValue& Root, std::string& OutError)
	{
		const JsonValue* Arr = Root.Find("fish");
		if (!Arr || !Arr->IsArray()) { OutError = "fish.json: missing 'fish' array"; return false; }
		for (const JsonValue& J : Arr->Items())
		{
			FishSpecies F;
			F.Id = J.GetString("id");
			if (F.Id.empty()) { OutError = "fish.json: species without id"; return false; }
			F.Name = J.GetString("name", F.Id);
			F.Item = J.GetString("item", "raw_fish");
			for (const std::string& Z : J.GetStringArray("zones")) { F.Zones.push_back(WaterZoneFromString(Z)); }
			F.MinWeight = J.GetFloat("min_kg", 0.3f);
			F.MaxWeight = J.GetFloat("max_kg", 2.0f);
			F.Rarity = J.GetFloat("rarity", 1.0f);
			const std::string Time = J.GetString("time", "any");
			F.ActiveTime = Time == "day" ? 1 : (Time == "night" ? 2 : 0);
			F.Strength = J.GetFloat("strength", 0.4f);
			F.Stamina = J.GetFloat("stamina", 6.0f);
			F.bSpearable = J.GetBool("spearable", true);
			Species.push_back(F);
		}
		return true;
	}

	const FishSpecies* FishDatabase::Find(const std::string& Id) const
	{
		for (const FishSpecies& F : Species) { if (F.Id == Id) { return &F; } }
		return nullptr;
	}

	const FishSpecies* FishDatabase::Roll(EWaterZone Zone, bool bNight, Rng& Random) const
	{
		float Total = 0.0f;
		std::vector<const FishSpecies*> Candidates;
		for (const FishSpecies& F : Species)
		{
			bool bInZone = false;
			for (const EWaterZone Z : F.Zones) { if (Z == Zone) { bInZone = true; break; } }
			if (!bInZone) { continue; }
			if ((F.ActiveTime == 1 && bNight) || (F.ActiveTime == 2 && !bNight)) { continue; }
			Candidates.push_back(&F);
			Total += F.Rarity;
		}
		if (Candidates.empty() || Total <= 0.0f) { return nullptr; }
		float Pick = Random.NextFloat() * Total;
		for (const FishSpecies* F : Candidates)
		{
			Pick -= F->Rarity;
			if (Pick <= 0.0f) { return F; }
		}
		return Candidates.back();
	}

	void FishingSession::Begin(const FishSpecies* InFish, float InWeight, float BaitBonus, uint64_t Seed)
	{
		Random.Seed(Seed);
		Fish = InFish;
		Weight = InWeight;
		State = EFishingState::Waiting;
		// Bait shortens the wait (BaitBonus 0..1).
		WaitTime = Random.Range(3.0f, 12.0f) * (1.0f - 0.5f * Clamp01(BaitBonus));
		BiteTime = 0.0f;
		Tension = 0.0f;
		Distance = 1.0f;
		SlackTime = 0.0f;
		SurgeTime = 0.0f;
		SurgeCooldown = Random.Range(1.0f, 2.5f);
		FishStamina = Fish ? Fish->Stamina * (0.7f + Clamp01(Weight / std::max(0.1f, Fish->MaxWeight)) * 0.6f) : 1.0f;
		if (!Fish) { WaitTime = 1.0e9f; } // nothing bites here
	}

	void FishingSession::Strike()
	{
		if (State == EFishingState::Bite)
		{
			State = EFishingState::Reeling;
			Tension = 0.3f;
		}
		else if (State == EFishingState::Waiting)
		{
			// Striking too early scares the fish: restart the wait.
			WaitTime += Random.Range(2.0f, 4.0f);
		}
	}

	void FishingSession::Tick(float Dt, bool bReelHeld)
	{
		switch (State)
		{
		case EFishingState::Waiting:
			WaitTime -= Dt;
			if (WaitTime <= 0.0f) { State = EFishingState::Bite; BiteTime = BiteWindow; }
			break;
		case EFishingState::Bite:
			BiteTime -= Dt;
			if (BiteTime <= 0.0f) { State = EFishingState::Escaped; }
			break;
		case EFishingState::Reeling:
		{
			const float Strength = Fish ? Fish->Strength : 0.3f;
			// Surges: periodic violent pulls while the fish still has stamina.
			if (SurgeTime > 0.0f)
			{
				SurgeTime -= Dt;
			}
			else
			{
				SurgeCooldown -= Dt;
				if (SurgeCooldown <= 0.0f && FishStamina > 0.0f)
				{
					SurgeTime = Random.Range(0.6f, 1.4f) * (0.5f + Strength);
					SurgeCooldown = Random.Range(1.5f, 3.5f) * (1.2f - Strength * 0.5f);
				}
			}
			const bool bSurging = SurgeTime > 0.0f;
			const float Tired = FishStamina > 0.0f ? 1.0f : 0.35f;

			if (bReelHeld)
			{
				Tension += (0.25f + (bSurging ? 0.9f * Strength : 0.15f * Strength)) * Tired * Dt;
				Distance -= (bSurging ? 0.02f : 0.11f + (1.0f - Strength) * 0.06f) * Dt;
				SlackTime = 0.0f;
			}
			else
			{
				Tension -= 0.45f * Dt;
				Distance += (bSurging ? 0.08f * Strength : 0.01f) * Dt;
				if (Tension < 0.1f) { SlackTime += Dt; }
			}
			FishStamina -= Dt * (bReelHeld ? 1.0f : 0.5f) * (bSurging ? 1.6f : 1.0f);
			Tension = Clamp01(Tension);
			Distance = Clampf(Distance, 0.0f, 1.2f);

			if (Tension >= 1.0f) { State = EFishingState::LineSnapped; }
			else if (Distance >= 1.2f || SlackTime >= MaxSlackSeconds) { State = EFishingState::Escaped; }
			else if (Distance <= 0.0f) { State = EFishingState::Caught; }
			break;
		}
		default:
			break;
		}
	}
}
