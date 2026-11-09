#include "SimItems.h"

namespace IUSim
{
	const char* ItemCategoryToString(EItemCategory C)
	{
		switch (C)
		{
		case EItemCategory::Material: return "Material";
		case EItemCategory::Food: return "Food";
		case EItemCategory::Tool: return "Tool";
		case EItemCategory::Weapon: return "Weapon";
		case EItemCategory::Ammo: return "Ammo";
		case EItemCategory::Medicine: return "Medicine";
		case EItemCategory::Seed: return "Seed";
		case EItemCategory::Placeable: return "Placeable";
		case EItemCategory::Armor: return "Armor";
		case EItemCategory::Special: return "Special";
		case EItemCategory::Quest: return "Quest";
		}
		return "Material";
	}

	EItemCategory ItemCategoryFromString(const std::string& S)
	{
		if (S == "Food") { return EItemCategory::Food; }
		if (S == "Tool") { return EItemCategory::Tool; }
		if (S == "Weapon") { return EItemCategory::Weapon; }
		if (S == "Ammo") { return EItemCategory::Ammo; }
		if (S == "Medicine") { return EItemCategory::Medicine; }
		if (S == "Seed") { return EItemCategory::Seed; }
		if (S == "Placeable") { return EItemCategory::Placeable; }
		if (S == "Armor") { return EItemCategory::Armor; }
		if (S == "Special") { return EItemCategory::Special; }
		if (S == "Quest") { return EItemCategory::Quest; }
		return EItemCategory::Material;
	}

	EToolType ToolTypeFromString(const std::string& S)
	{
		if (S == "axe") { return EToolType::Axe; }
		if (S == "pickaxe") { return EToolType::Pickaxe; }
		if (S == "knife") { return EToolType::Knife; }
		if (S == "hoe") { return EToolType::Hoe; }
		if (S == "rod") { return EToolType::FishingRod; }
		if (S == "spear") { return EToolType::Spear; }
		if (S == "torch") { return EToolType::Torch; }
		if (S == "water") { return EToolType::WaterContainer; }
		if (S == "hammer") { return EToolType::Hammer; }
		return EToolType::None;
	}

	const char* ToolTypeToString(EToolType T)
	{
		switch (T)
		{
		case EToolType::Axe: return "axe";
		case EToolType::Pickaxe: return "pickaxe";
		case EToolType::Knife: return "knife";
		case EToolType::Hoe: return "hoe";
		case EToolType::FishingRod: return "rod";
		case EToolType::Spear: return "spear";
		case EToolType::Torch: return "torch";
		case EToolType::WaterContainer: return "water";
		case EToolType::Hammer: return "hammer";
		case EToolType::None: break;
		}
		return "none";
	}

	bool ItemDef::HasTag(const std::string& Tag) const
	{
		for (const std::string& T : Tags) { if (T == Tag) { return true; } }
		return false;
	}

	namespace ItemDbDetail
	{
		EArmorSlot ArmorSlotFromString(const std::string& S)
		{
			if (S == "head") { return EArmorSlot::Head; }
			if (S == "body") { return EArmorSlot::Body; }
			if (S == "legs") { return EArmorSlot::Legs; }
			return EArmorSlot::None;
		}
	}

	bool ItemDatabase::LoadFromJson(const JsonValue& Root, std::string& OutError)
	{
		const JsonValue* Arr = Root.Find("items");
		if (!Arr || !Arr->IsArray()) { OutError = "items.json: missing 'items' array"; return false; }

		for (const JsonValue& J : Arr->Items())
		{
			ItemDef D;
			D.Id = J.GetString("id");
			if (D.Id.empty()) { OutError = "items.json: item without id"; return false; }
			if (Find(D.Id)) { OutError = "items.json: duplicate id '" + D.Id + "'"; return false; }
			D.Name = J.GetString("name", D.Id);
			D.Description = J.GetString("desc");
			D.Category = ItemCategoryFromString(J.GetString("category", "Material"));
			D.Weight = J.GetFloat("weight", 0.1f);
			D.MaxStack = J.GetInt("stack", 1);
			if (D.MaxStack < 1) { D.MaxStack = 1; }
			D.MaxDurability = J.GetFloat("durability", 0.0f);
			D.Value = J.GetFloat("value", 1.0f);
			D.FuelSeconds = J.GetFloat("fuel", 0.0f);
			D.CookResult = J.GetString("cook_result");
			D.CookSeconds = J.GetFloat("cook_time", 20.0f);
			D.SeedCrop = J.GetString("seed_crop");
			D.PlaceBuilding = J.GetString("place");
			D.Tags = J.GetStringArray("tags");
			D.MeshHint = J.GetString("mesh", "pouch");

			if (const JsonValue* F = J.Find("food"))
			{
				D.bHasFood = true;
				D.Food.Calories = F->GetFloat("calories");
				D.Food.Hydration = F->GetFloat("hydration");
				D.Food.Health = F->GetFloat("health");
				D.Food.Energy = F->GetFloat("energy");
				D.Food.PoisonChance = F->GetFloat("poison_chance");
				D.Food.PoisonAmount = F->GetFloat("poison", 25.0f);
				D.Food.InfectionChance = F->GetFloat("infection_chance");
				D.Food.Warmth = F->GetFloat("warmth");
			}
			if (const JsonValue* M = J.Find("medicine"))
			{
				D.bHasMedicine = true;
				D.Medicine.bStopsBleeding = M->GetBool("stops_bleeding");
				D.Medicine.bFixesFracture = M->GetBool("fixes_fracture");
				D.Medicine.CuresPoison = M->GetFloat("cures_poison");
				D.Medicine.CuresInfection = M->GetFloat("cures_infection");
				D.Medicine.Heal = M->GetFloat("heal");
			}
			if (const JsonValue* T = J.Find("tool"))
			{
				D.Tool.Type = ToolTypeFromString(T->GetString("type"));
				D.Tool.Tier = T->GetInt("tier", 1);
				D.Tool.HarvestMultiplier = T->GetFloat("harvest", 1.0f);
			}
			if (const JsonValue* W = J.Find("weapon"))
			{
				D.Weapon.Kind = W->GetString("kind", "melee") == "ranged" ? EWeaponKind::Ranged : EWeaponKind::Melee;
				D.Weapon.Damage = W->GetFloat("damage", 5.0f);
				D.Weapon.AttackInterval = W->GetFloat("interval", 0.8f);
				D.Weapon.StaminaCost = W->GetFloat("stamina", 10.0f);
				D.Weapon.Reach = W->GetFloat("reach", 1.6f);
				D.Weapon.BlockReduction = W->GetFloat("block", 0.3f);
				D.Weapon.ProjectileSpeed = W->GetFloat("projectile_speed", 0.0f);
				D.Weapon.AmmoItem = W->GetString("ammo");
				D.Weapon.BleedChance = W->GetFloat("bleed_chance", 0.0f);
			}
			if (const JsonValue* A = J.Find("armor"))
			{
				D.Armor.Slot = ItemDbDetail::ArmorSlotFromString(A->GetString("slot"));
				D.Armor.Protection = A->GetFloat("protection");
				D.Armor.Insulation = A->GetFloat("insulation");
			}
			AddItem(D);
		}
		return true;
	}

	void ItemDatabase::AddItem(const ItemDef& Def)
	{
		IndexById[Def.Id] = Items.size();
		Items.push_back(Def);
	}

	const ItemDef* ItemDatabase::Find(const std::string& Id) const
	{
		const auto It = IndexById.find(Id);
		return It == IndexById.end() ? nullptr : &Items[It->second];
	}
}
