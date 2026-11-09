#include "SimResources.h"

namespace IUSim
{
	namespace ResourceDetail
	{
		bool ParseLoot(const JsonValue* Arr, const ItemDatabase& Items, std::vector<LootEntry>& Out, const std::string& NodeId, std::string& OutError)
		{
			if (!Arr || !Arr->IsArray()) { return true; }
			for (const JsonValue& L : Arr->Items())
			{
				LootEntry E;
				E.ItemId = L.GetString("item");
				E.Min = L.GetInt("min", 1);
				E.Max = L.GetInt("max", E.Min);
				E.Chance = L.GetFloat("chance", 1.0f);
				if (!Items.Contains(E.ItemId)) { OutError = "nodes.json: node '" + NodeId + "' yields unknown item '" + E.ItemId + "'"; return false; }
				Out.push_back(E);
			}
			return true;
		}
	}

	bool ResourceDatabase::LoadFromJson(const JsonValue& Root, const ItemDatabase& Items, std::string& OutError)
	{
		const JsonValue* Arr = Root.Find("nodes");
		if (!Arr || !Arr->IsArray()) { OutError = "nodes.json: missing 'nodes' array"; return false; }
		for (const JsonValue& J : Arr->Items())
		{
			ResourceNodeDef D;
			D.Id = J.GetString("id");
			if (D.Id.empty()) { OutError = "nodes.json: node without id"; return false; }
			D.Name = J.GetString("name", D.Id);
			D.Visual = J.GetString("visual", "rock");
			D.Tool = ToolTypeFromString(J.GetString("tool"));
			D.MinTier = J.GetInt("min_tier", 0);
			D.bHandHarvestable = J.GetBool("hand", D.Tool == EToolType::None);
			D.Hits = J.GetInt("hits", 3);
			D.RegrowHours = J.GetFloat("regrow_hours", 72.0f);
			D.ScaleMin = J.GetFloat("scale_min", 0.8f);
			D.ScaleMax = J.GetFloat("scale_max", 1.2f);
			D.bBlocking = J.GetBool("blocking", true);
			D.bDecorOnly = J.GetBool("decor", false);
			D.CullDistance = J.GetFloat("cull", 600.0f);
			if (!ResourceDetail::ParseLoot(J.Find("per_hit"), Items, D.PerHit, D.Id, OutError)) { return false; }
			if (!ResourceDetail::ParseLoot(J.Find("final"), Items, D.Final, D.Id, OutError)) { return false; }
			if (const JsonValue* Dens = J.Find("density"))
			{
				for (const auto& M : Dens->Members()) { D.Density[M.first] = M.second.AsFloat(); }
			}
			Defs.push_back(D);
		}
		return true;
	}

	const ResourceNodeDef* ResourceDatabase::Find(const std::string& Id) const
	{
		const int32_t I = IndexOf(Id);
		return I >= 0 ? &Defs[static_cast<size_t>(I)] : nullptr;
	}

	int32_t ResourceDatabase::IndexOf(const std::string& Id) const
	{
		for (size_t I = 0; I < Defs.size(); ++I) { if (Defs[I].Id == Id) { return static_cast<int32_t>(I); } }
		return -1;
	}

	std::vector<ItemAmount> RollLoot(const std::vector<LootEntry>& Loot, Rng& Random, float Multiplier)
	{
		std::vector<ItemAmount> Out;
		for (const LootEntry& L : Loot)
		{
			if (!Random.Chance(L.Chance)) { continue; }
			const int32_t Base = Random.RangeInt(L.Min, L.Max);
			const int32_t Count = static_cast<int32_t>(std::lround(static_cast<float>(Base) * Multiplier));
			if (Count > 0) { Out.push_back(ItemAmount{ L.ItemId, Count }); }
		}
		return Out;
	}

	HarvestHit ResolveHarvestHit(const ResourceNodeDef& Def, EToolType Tool, int32_t ToolTier, float ToolMultiplier, int32_t& RemainingHits, Rng& Random)
	{
		HarvestHit Hit;
		const bool bRightTool = Def.Tool == EToolType::None || (Tool == Def.Tool && ToolTier >= Def.MinTier);
		if (!bRightTool && !Def.bHandHarvestable)
		{
			Hit.bWrongTool = true;
			return Hit;
		}
		// Bare hands on a tool node: partial yield, no depletion progress beyond 1 hit at a time.
		const float YieldMult = bRightTool ? ToolMultiplier : 0.5f;
		const int32_t Power = bRightTool ? std::max(1, static_cast<int32_t>(std::lround(ToolMultiplier))) : 1;
		Hit.Items = RollLoot(Def.PerHit, Random, YieldMult);
		RemainingHits -= Power;
		if (RemainingHits <= 0)
		{
			RemainingHits = 0;
			Hit.bDepleted = true;
			const std::vector<ItemAmount> Final = RollLoot(Def.Final, Random, bRightTool ? 1.0f : 0.5f);
			Hit.Items.insert(Hit.Items.end(), Final.begin(), Final.end());
		}
		return Hit;
	}
}
