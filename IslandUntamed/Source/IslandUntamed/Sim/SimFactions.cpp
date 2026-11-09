#include "SimFactions.h"

namespace IUSim
{
	const char* AttitudeToString(EAttitude A)
	{
		switch (A)
		{
		case EAttitude::Hostile: return "Hostil";
		case EAttitude::Unfriendly: return "Recelosa";
		case EAttitude::Neutral: return "Neutral";
		case EAttitude::Friendly: return "Amistosa";
		case EAttitude::Allied: return "Aliada";
		}
		return "";
	}

	namespace FactionDetail
	{
		ETemperament TemperamentFromString(const std::string& S)
		{
			if (S == "peaceful") { return ETemperament::Peaceful; }
			if (S == "aggressive") { return ETemperament::Aggressive; }
			return ETemperament::Territorial;
		}
	}

	bool FactionSystem::LoadFromJson(const JsonValue& Root, std::string& OutError)
	{
		const JsonValue* Arr = Root.Find("tribes");
		if (!Arr || !Arr->IsArray()) { OutError = "tribes.json: missing 'tribes' array"; return false; }
		for (const JsonValue& J : Arr->Items())
		{
			TribeDef D;
			D.Id = J.GetString("id");
			if (D.Id.empty()) { OutError = "tribes.json: tribe without id"; return false; }
			D.Name = J.GetString("name", D.Id);
			D.Description = J.GetString("desc");
			D.HomeBiome = J.GetString("biome", "Jungle");
			D.Temperament = FactionDetail::TemperamentFromString(J.GetString("temperament", "territorial"));
			D.StartReputation = J.GetFloat("start_rep", 0.0f);
			D.TerritoryRadius = J.GetFloat("territory", 220.0f);
			D.InnerRadius = J.GetFloat("inner", 60.0f);
			D.Population = J.GetInt("population", 12);
			D.bTrades = J.GetBool("trades", false);
			D.Color = J.GetString("color", "#aa5533");
			D.Rules = J.GetStringArray("rules");
			D.TradeGoods = J.GetStringArray("trade_goods");
			D.Wants = J.GetStringArray("wants");
			if (const JsonValue* Rel = J.Find("relations"))
			{
				for (const auto& M : Rel->Members()) { D.Relations[M.first] = M.second.AsFloat(); }
			}
			Defs.push_back(D);
		}
		ResetRuntime();
		return true;
	}

	void FactionSystem::ResetRuntime()
	{
		Runtime.clear();
		for (const TribeDef& D : Defs)
		{
			TribeRuntime R;
			R.Reputation = D.StartReputation;
			R.Village.Population = D.Population;
			R.Village.MaxPopulation = D.Population;
			R.Relations = D.Relations;
			Runtime[D.Id] = R;
		}
		HoursSinceRaidCheck = 0.0f;
	}

	const TribeDef* FactionSystem::FindDef(const std::string& Id) const
	{
		for (const TribeDef& D : Defs) { if (D.Id == Id) { return &D; } }
		return nullptr;
	}

	TribeRuntime* FactionSystem::FindRuntime(const std::string& Id)
	{
		const auto It = Runtime.find(Id);
		return It == Runtime.end() ? nullptr : &It->second;
	}

	const TribeRuntime* FactionSystem::FindRuntime(const std::string& Id) const
	{
		const auto It = Runtime.find(Id);
		return It == Runtime.end() ? nullptr : &It->second;
	}

	float FactionSystem::GetReputation(const std::string& TribeId) const
	{
		const TribeRuntime* R = FindRuntime(TribeId);
		return R ? R->Reputation : 0.0f;
	}

	EAttitude FactionSystem::AttitudeFromReputation(float Rep)
	{
		if (Rep < -40.0f) { return EAttitude::Hostile; }
		if (Rep < -10.0f) { return EAttitude::Unfriendly; }
		if (Rep < 25.0f) { return EAttitude::Neutral; }
		if (Rep < 60.0f) { return EAttitude::Friendly; }
		return EAttitude::Allied;
	}

	EAttitude FactionSystem::GetAttitude(const std::string& TribeId) const
	{
		return AttitudeFromReputation(GetReputation(TribeId));
	}

	bool FactionSystem::IsHostileToPlayer(const std::string& TribeId) const
	{
		const TribeRuntime* R = FindRuntime(TribeId);
		if (!R) { return false; }
		if (AttitudeFromReputation(R->Reputation) == EAttitude::Hostile) { return true; }
		// An alarmed village attacks anyone who is not a friend.
		return R->Village.Alarm > 0.6f && R->Reputation < 25.0f;
	}

	bool FactionSystem::AreTribesHostile(const std::string& A, const std::string& B) const
	{
		if (A == B) { return false; }
		const TribeRuntime* R = FindRuntime(A);
		if (!R) { return false; }
		const auto It = R->Relations.find(B);
		return It != R->Relations.end() && It->second < -40.0f;
	}

	float FactionSystem::DeltaFor(const TribeDef& Def, ESocialEvent Event, float Magnitude) const
	{
		const float Strict = Def.Temperament == ETemperament::Aggressive ? 1.3f : (Def.Temperament == ETemperament::Peaceful ? 0.8f : 1.0f);
		switch (Event)
		{
		case ESocialEvent::Trespass: return Def.Temperament == ETemperament::Peaceful ? -1.0f : -4.0f * Strict;
		case ESocialEvent::TheftWitnessed: return -(8.0f + Magnitude * 0.5f) * Strict;
		case ESocialEvent::TheftUnseen: return -(2.0f + Magnitude * 0.2f);
		case ESocialEvent::Assault: return -15.0f * Strict;
		case ESocialEvent::Murder: return -35.0f * Strict;
		case ESocialEvent::KillLeader: return -70.0f;
		case ESocialEvent::DestroyStructure: return -12.0f * Strict;
		case ESocialEvent::Gift: return std::min(12.0f, Magnitude * 0.4f) / Strict;
		case ESocialEvent::Trade: return 1.5f;
		case ESocialEvent::HelpQuest: return 15.0f * Magnitude;
		case ESocialEvent::DefendVillage: return 10.0f;
		}
		return 0.0f;
	}

	SocialOutcome FactionSystem::ApplyEvent(const std::string& TribeId, ESocialEvent Event, float Magnitude)
	{
		SocialOutcome Out;
		const TribeDef* Def = FindDef(TribeId);
		TribeRuntime* R = FindRuntime(TribeId);
		if (!Def || !R) { return Out; }

		const EAttitude Before = AttitudeFromReputation(R->Reputation);
		Out.ReputationDelta = DeltaFor(*Def, Event, Magnitude);
		R->Reputation = Clampf(R->Reputation + Out.ReputationDelta, -100.0f, 100.0f);
		R->bDiscovered = true;

		// Village alarm and losses.
		switch (Event)
		{
		case ESocialEvent::Trespass: R->Village.Alarm = Clamp01(R->Village.Alarm + 0.15f); break;
		case ESocialEvent::TheftWitnessed: R->Village.Alarm = Clamp01(R->Village.Alarm + 0.5f); break;
		case ESocialEvent::Assault: R->Village.Alarm = 1.0f; break;
		case ESocialEvent::Murder:
			R->Village.Alarm = 1.0f;
			R->Village.Population = std::max(0, R->Village.Population - 1);
			break;
		case ESocialEvent::KillLeader:
			R->Village.Alarm = 1.0f;
			R->Village.bLeaderAlive = false;
			R->Village.Population = std::max(0, R->Village.Population - 1);
			break;
		case ESocialEvent::DestroyStructure:
			R->Village.Alarm = 1.0f;
			++R->Village.DestroyedStructures;
			break;
		default: break;
		}

		// Diplomacy: enemies of the victim appreciate hostile acts, friends resent them.
		if (Out.ReputationDelta < 0.0f && (Event == ESocialEvent::Murder || Event == ESocialEvent::KillLeader || Event == ESocialEvent::DestroyStructure || Event == ESocialEvent::Assault))
		{
			for (auto& Pair : Runtime)
			{
				if (Pair.first == TribeId) { continue; }
				const auto RelIt = Pair.second.Relations.find(TribeId);
				if (RelIt == Pair.second.Relations.end()) { continue; }
				const float Relation = RelIt->second; // -100..100
				const float Spill = -Out.ReputationDelta * (-Relation / 100.0f) * 0.4f;
				Pair.second.Reputation = Clampf(Pair.second.Reputation + Spill, -100.0f, 100.0f);
			}
		}

		const EAttitude After = AttitudeFromReputation(R->Reputation);
		Out.bBecameHostile = Before != EAttitude::Hostile && After == EAttitude::Hostile;
		Out.bBecameAllied = Before != EAttitude::Allied && After == EAttitude::Allied;
		return Out;
	}

	std::vector<std::string> FactionSystem::TickHours(float GameHours, Rng& Random)
	{
		std::vector<std::string> News;
		for (auto& Pair : Runtime)
		{
			VillageState& V = Pair.second.Village;
			V.Alarm = std::max(0.0f, V.Alarm - 0.08f * GameHours);
			// Food production and consumption.
			V.Food = Clampf(V.Food + (static_cast<float>(V.Population) * 0.12f - static_cast<float>(V.Population) * 0.1f) * GameHours, 0.0f, 200.0f);
			V.Wood = Clampf(V.Wood + 0.5f * GameHours, 0.0f, 200.0f);
			// Slow regrowth when food allows (roughly one member every 2 days).
			if (V.Population < V.MaxPopulation && V.Food > 30.0f && Random.Chance(0.02f * GameHours))
			{
				++V.Population;
				V.Food -= 10.0f;
			}
			// Reputation slowly drifts back toward neutral unless extreme.
			float& Rep = Pair.second.Reputation;
			if (Rep < 0.0f && Rep > -60.0f) { Rep = std::min(0.0f, Rep + 0.2f * GameHours); }
		}

		// Raids between hostile tribes, checked every 12 game hours.
		HoursSinceRaidCheck += GameHours;
		while (HoursSinceRaidCheck >= 12.0f)
		{
			HoursSinceRaidCheck -= 12.0f;
			for (const TribeDef& Attacker : Defs)
			{
				if (Attacker.Temperament != ETemperament::Aggressive) { continue; }
				for (const TribeDef& Target : Defs)
				{
					if (Target.Id == Attacker.Id || !AreTribesHostile(Attacker.Id, Target.Id)) { continue; }
					if (!Random.Chance(0.25f)) { continue; }
					TribeRuntime& A = Runtime[Attacker.Id];
					TribeRuntime& T = Runtime[Target.Id];
					if (A.Village.Population < 4 || T.Village.Population <= 0) { continue; }
					const float AttackPower = static_cast<float>(A.Village.Population) * Random.Range(0.6f, 1.2f);
					const float DefensePower = static_cast<float>(T.Village.Population) * Random.Range(0.7f, 1.3f);
					if (AttackPower > DefensePower)
					{
						T.Village.Population = std::max(0, T.Village.Population - 2);
						T.Village.Food = std::max(0.0f, T.Village.Food - 25.0f);
						A.Village.Food += 20.0f;
						News.push_back(Attacker.Name + " ha asaltado la aldea de " + Target.Name);
					}
					else
					{
						A.Village.Population = std::max(0, A.Village.Population - 2);
						News.push_back(Target.Name + " ha repelido un ataque de " + Attacker.Name);
					}
					T.Village.Alarm = 1.0f;
				}
			}
		}
		return News;
	}

	float FactionSystem::ValueFor(const std::string& TribeId, const std::string& ItemId, float BaseValue) const
	{
		const TribeDef* D = FindDef(TribeId);
		if (!D) { return BaseValue; }
		for (const std::string& W : D->Wants) { if (W == ItemId) { return BaseValue * 2.0f; } }
		return BaseValue;
	}

	JsonValue FactionSystem::ToJson() const
	{
		JsonValue J = JsonValue::MakeObject();
		JsonValue Arr = JsonValue::MakeArray();
		for (const auto& Pair : Runtime)
		{
			const TribeRuntime& R = Pair.second;
			JsonValue T = JsonValue::MakeObject();
			T.Set("id", JsonValue::MakeString(Pair.first));
			T.Set("rep", JsonValue::MakeNumber(R.Reputation));
			T.Set("discovered", JsonValue::MakeBool(R.bDiscovered));
			T.Set("rules_known", JsonValue::MakeBool(R.bPlayerKnowsRules));
			T.Set("pop", JsonValue::MakeNumber(R.Village.Population));
			T.Set("alarm", JsonValue::MakeNumber(R.Village.Alarm));
			T.Set("food", JsonValue::MakeNumber(R.Village.Food));
			T.Set("wood", JsonValue::MakeNumber(R.Village.Wood));
			T.Set("leader", JsonValue::MakeBool(R.Village.bLeaderAlive));
			T.Set("destroyed", JsonValue::MakeNumber(R.Village.DestroyedStructures));
			JsonValue Looted = JsonValue::MakeArray();
			for (const int32_t L : R.Village.LootedStores) { Looted.Push(JsonValue::MakeNumber(L)); }
			T.Set("looted", Looted);
			JsonValue Rel = JsonValue::MakeObject();
			for (const auto& RelPair : R.Relations) { Rel.Set(RelPair.first, JsonValue::MakeNumber(RelPair.second)); }
			T.Set("relations", Rel);
			Arr.Push(T);
		}
		J.Set("tribes", Arr);
		J.Set("raid_timer", JsonValue::MakeNumber(HoursSinceRaidCheck));
		return J;
	}

	void FactionSystem::FromJson(const JsonValue& J)
	{
		ResetRuntime();
		HoursSinceRaidCheck = J.GetFloat("raid_timer", 0.0f);
		const JsonValue* Arr = J.Find("tribes");
		if (!Arr || !Arr->IsArray()) { return; }
		for (const JsonValue& T : Arr->Items())
		{
			TribeRuntime* R = FindRuntime(T.GetString("id"));
			if (!R) { continue; }
			R->Reputation = T.GetFloat("rep");
			R->bDiscovered = T.GetBool("discovered");
			R->bPlayerKnowsRules = T.GetBool("rules_known");
			R->Village.Population = T.GetInt("pop", R->Village.Population);
			R->Village.Alarm = T.GetFloat("alarm");
			R->Village.Food = T.GetFloat("food", 50.0f);
			R->Village.Wood = T.GetFloat("wood", 50.0f);
			R->Village.bLeaderAlive = T.GetBool("leader", true);
			R->Village.DestroyedStructures = T.GetInt("destroyed");
			R->Village.LootedStores.clear();
			if (const JsonValue* L = T.Find("looted"))
			{
				for (const JsonValue& E : L->Items()) { R->Village.LootedStores.push_back(E.AsInt()); }
			}
			if (const JsonValue* Rel = T.Find("relations"))
			{
				for (const auto& M : Rel->Members()) { R->Relations[M.first] = M.second.AsFloat(); }
			}
		}
	}
}
