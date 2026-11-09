// Island Untamed - Simulation Core
// Item definitions (data-driven from Content/Data/items.json).
#pragma once

#include "SimCore.h"
#include "SimJson.h"

#include <string>
#include <unordered_map>
#include <vector>

namespace IUSim
{
	enum class EItemCategory : uint8_t
	{
		Material, Food, Tool, Weapon, Ammo, Medicine, Seed, Placeable, Armor, Special, Quest
	};

	enum class EToolType : uint8_t { None, Axe, Pickaxe, Knife, Hoe, FishingRod, Spear, Torch, WaterContainer, Hammer };
	enum class EWeaponKind : uint8_t { None, Melee, Ranged };
	enum class EArmorSlot : uint8_t { None, Head, Body, Legs };

	const char* ItemCategoryToString(EItemCategory C);
	EItemCategory ItemCategoryFromString(const std::string& S);
	EToolType ToolTypeFromString(const std::string& S);
	const char* ToolTypeToString(EToolType T);

	struct FoodStats
	{
		float Calories = 0.0f;       // satiety points restored (0..100 scale)
		float Hydration = 0.0f;      // hydration points restored
		float Health = 0.0f;         // direct heal
		float Energy = 0.0f;         // energy restored
		float PoisonChance = 0.0f;   // 0..1 chance of food poisoning
		float PoisonAmount = 0.0f;   // poison added when it triggers
		float InfectionChance = 0.0f;// 0..1 (e.g. raw meat, dirty water)
		float Warmth = 0.0f;         // hot meals warm the body (degrees C)
	};

	struct MedicineStats
	{
		bool bStopsBleeding = false;
		bool bFixesFracture = false;
		float CuresPoison = 0.0f;     // amount of poison removed
		float CuresInfection = 0.0f;  // amount of infection removed
		float Heal = 0.0f;
	};

	struct ToolStats
	{
		EToolType Type = EToolType::None;
		int32_t Tier = 0;
		float HarvestMultiplier = 1.0f;
	};

	struct WeaponStats
	{
		EWeaponKind Kind = EWeaponKind::None;
		float Damage = 0.0f;
		float AttackInterval = 0.8f; // seconds between swings
		float StaminaCost = 10.0f;
		float Reach = 1.6f;          // meters (melee)
		float BlockReduction = 0.3f; // fraction of damage blocked
		float ProjectileSpeed = 0.0f;// m/s (ranged)
		std::string AmmoItem;        // ranged ammo id
		float BleedChance = 0.0f;
	};

	struct ArmorStats
	{
		EArmorSlot Slot = EArmorSlot::None;
		float Protection = 0.0f;  // flat fraction 0..1 summed then clamped
		float Insulation = 0.0f;  // degrees C of cold protection
	};

	struct ItemDef
	{
		std::string Id;
		std::string Name;
		std::string Description;
		EItemCategory Category = EItemCategory::Material;
		float Weight = 0.1f;
		int32_t MaxStack = 1;
		float MaxDurability = 0.0f; // 0 => no durability
		float Value = 1.0f;         // barter value with tribes
		float FuelSeconds = 0.0f;   // burn time when used as fuel
		std::string CookResult;     // item produced when cooked
		float CookSeconds = 0.0f;
		std::string SeedCrop;       // crop id if this is a seed
		std::string PlaceBuilding;  // building id if placeable
		std::vector<std::string> Tags;
		std::string MeshHint;       // visual hint for the engine layer (e.g. "rock", "log")
		bool bHasFood = false;
		bool bHasMedicine = false;
		FoodStats Food;
		MedicineStats Medicine;
		ToolStats Tool;
		WeaponStats Weapon;
		ArmorStats Armor;

		bool HasTag(const std::string& Tag) const;
		bool IsStackable() const { return MaxStack > 1; }
		bool HasDurability() const { return MaxDurability > 0.0f; }
	};

	class ItemDatabase
	{
	public:
		/** Loads { "items": [ ... ] }. Returns false with error on malformed data. */
		bool LoadFromJson(const JsonValue& Root, std::string& OutError);
		void AddItem(const ItemDef& Def);

		const ItemDef* Find(const std::string& Id) const;
		bool Contains(const std::string& Id) const { return Find(Id) != nullptr; }
		const std::vector<ItemDef>& All() const { return Items; }

	private:
		std::vector<ItemDef> Items;
		std::unordered_map<std::string, size_t> IndexById;
	};
}
