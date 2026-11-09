// Island Untamed - Simulation Core
// Slot-based inventory with stacking, weight, durability and container transfer.
// Used for the player backpack, chests, storage huts and village stockpiles.
#pragma once

#include "SimItems.h"

#include <string>
#include <vector>

namespace IUSim
{
	struct ItemStack
	{
		std::string ItemId;
		int32_t Count = 0;
		float Durability = -1.0f; // absolute durability left; -1 => not tracked

		bool IsEmpty() const { return Count <= 0 || ItemId.empty(); }
		void Clear() { ItemId.clear(); Count = 0; Durability = -1.0f; }
	};

	struct ItemAmount
	{
		std::string ItemId;
		int32_t Count = 0;
	};

	class Inventory
	{
	public:
		Inventory() = default;
		/** MaxWeight <= 0 means unlimited (chests). */
		Inventory(const ItemDatabase* InDb, int32_t NumSlots, float InMaxWeight);

		void Init(const ItemDatabase* InDb, int32_t NumSlots, float InMaxWeight);

		/** Adds items, filling existing stacks first. Returns the amount that did NOT fit. */
		int32_t AddItem(const std::string& ItemId, int32_t Count, float Durability = -1.0f);
		/** True if all Count units fit (slot-wise and within the hard weight cap). */
		bool CanAdd(const std::string& ItemId, int32_t Count) const;
		/** Removes up to Count units, from the last slots first. Returns the amount removed. */
		int32_t RemoveItem(const std::string& ItemId, int32_t Count);
		int32_t RemoveFromSlot(int32_t Slot, int32_t Count);
		int32_t CountItem(const std::string& ItemId) const;
		bool HasAll(const std::vector<ItemAmount>& Requirements) const;
		/** Removes all requirements atomically; returns false (and removes nothing) if any is missing. */
		bool ConsumeAll(const std::vector<ItemAmount>& Requirements);

		/** Swaps or merges two slots. */
		bool MoveSlot(int32_t From, int32_t To);
		/** Moves Amount units from a slot into an empty slot. */
		bool SplitStack(int32_t From, int32_t Amount);
		/** Moves up to Count units of slot Slot into Other. Returns moved amount. Count <= 0 moves all. */
		int32_t TransferSlotTo(Inventory& Other, int32_t Slot, int32_t Count = 0);
		/** Moves everything that fits into Other. Returns number of units moved. */
		int32_t TransferAllTo(Inventory& Other);

		/** Overwrites a slot (equipment placement, save migration). Returns false for invalid index/item. */
		bool SetSlot(int32_t Index, const ItemStack& Stack);

		/** Reduces durability on a slot. Returns true if the item broke and was removed. */
		bool DamageDurability(int32_t Slot, float Amount);

		int32_t FindFirstSlot(const std::string& ItemId) const;
		int32_t FindFirstEmptySlot() const;
		int32_t NumSlots() const { return static_cast<int32_t>(Slots.size()); }
		const ItemStack& GetSlot(int32_t Index) const;
		bool IsValidSlot(int32_t Index) const { return Index >= 0 && Index < NumSlots(); }

		float GetTotalWeight() const;
		float GetMaxWeight() const { return MaxWeight; }
		/** Encumbrance ratio (weight / max). 0 when unlimited. */
		float GetLoadRatio() const;
		/** Hard cap: carrying is refused above MaxWeight * HardCapFactor. */
		static constexpr float HardCapFactor = 1.5f;

		/** Monotonic counter incremented on every change (UI refresh hint). */
		uint32_t GetRevision() const { return Revision; }

		void Clear();
		JsonValue ToJson() const;
		void FromJson(const JsonValue& J);

		const ItemDatabase* GetDatabase() const { return Db; }

	private:
		float WeightOf(const std::string& ItemId, int32_t Count) const;
		int32_t MaxStackOf(const std::string& ItemId) const;
		float DefaultDurability(const std::string& ItemId) const;
		/** How many units of ItemId could be accepted given slots only. */
		int32_t SlotCapacityFor(const std::string& ItemId) const;
		/** How many units could be accepted given weight cap only. */
		int32_t WeightCapacityFor(const std::string& ItemId) const;
		void Touch() { ++Revision; }

		const ItemDatabase* Db = nullptr;
		std::vector<ItemStack> Slots;
		float MaxWeight = 0.0f;
		uint32_t Revision = 0;
	};
}
