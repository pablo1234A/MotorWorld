#include "SimInventory.h"

#include <cmath>

namespace IUSim
{
	namespace InventoryDetail
	{
		const ItemStack& EmptyStack()
		{
			static const ItemStack Empty;
			return Empty;
		}
	}

	Inventory::Inventory(const ItemDatabase* InDb, int32_t NumSlotsIn, float InMaxWeight)
	{
		Init(InDb, NumSlotsIn, InMaxWeight);
	}

	void Inventory::Init(const ItemDatabase* InDb, int32_t NumSlotsIn, float InMaxWeight)
	{
		Db = InDb;
		Slots.assign(static_cast<size_t>(NumSlotsIn > 0 ? NumSlotsIn : 0), ItemStack());
		MaxWeight = InMaxWeight;
		Touch();
	}

	float Inventory::WeightOf(const std::string& ItemId, int32_t Count) const
	{
		const ItemDef* D = Db ? Db->Find(ItemId) : nullptr;
		return D ? D->Weight * static_cast<float>(Count) : 0.0f;
	}

	int32_t Inventory::MaxStackOf(const std::string& ItemId) const
	{
		const ItemDef* D = Db ? Db->Find(ItemId) : nullptr;
		if (!D) { return 1; }
		return D->HasDurability() ? 1 : D->MaxStack;
	}

	float Inventory::DefaultDurability(const std::string& ItemId) const
	{
		const ItemDef* D = Db ? Db->Find(ItemId) : nullptr;
		return (D && D->HasDurability()) ? D->MaxDurability : -1.0f;
	}

	int32_t Inventory::SlotCapacityFor(const std::string& ItemId) const
	{
		const int32_t MaxStack = MaxStackOf(ItemId);
		int32_t Capacity = 0;
		for (const ItemStack& S : Slots)
		{
			if (S.IsEmpty()) { Capacity += MaxStack; }
			else if (S.ItemId == ItemId) { Capacity += std::max(0, MaxStack - S.Count); }
		}
		return Capacity;
	}

	int32_t Inventory::WeightCapacityFor(const std::string& ItemId) const
	{
		if (MaxWeight <= 0.0f) { return 1 << 30; }
		const ItemDef* D = Db ? Db->Find(ItemId) : nullptr;
		if (!D || D->Weight <= 0.0f) { return 1 << 30; }
		const float Free = MaxWeight * HardCapFactor - GetTotalWeight();
		if (Free <= 0.0f) { return 0; }
		return static_cast<int32_t>(std::floor(Free / D->Weight + 1e-4f));
	}

	bool Inventory::CanAdd(const std::string& ItemId, int32_t Count) const
	{
		if (Count <= 0) { return true; }
		if (Db && !Db->Contains(ItemId)) { return false; }
		return SlotCapacityFor(ItemId) >= Count && WeightCapacityFor(ItemId) >= Count;
	}

	int32_t Inventory::AddItem(const std::string& ItemId, int32_t Count, float Durability)
	{
		if (Count <= 0 || ItemId.empty()) { return 0; }
		if (Db && !Db->Contains(ItemId)) { return Count; }

		int32_t Remaining = std::min(Count, WeightCapacityFor(ItemId));
		const int32_t RejectedByWeight = Count - Remaining;
		const int32_t MaxStack = MaxStackOf(ItemId);
		const float Dur = Durability >= 0.0f ? Durability : DefaultDurability(ItemId);

		// 1) Top up existing stacks.
		if (MaxStack > 1)
		{
			for (ItemStack& S : Slots)
			{
				if (Remaining <= 0) { break; }
				if (!S.IsEmpty() && S.ItemId == ItemId && S.Count < MaxStack)
				{
					const int32_t Moved = std::min(Remaining, MaxStack - S.Count);
					S.Count += Moved;
					Remaining -= Moved;
				}
			}
		}
		// 2) Fill empty slots.
		for (ItemStack& S : Slots)
		{
			if (Remaining <= 0) { break; }
			if (S.IsEmpty())
			{
				const int32_t Moved = std::min(Remaining, MaxStack);
				S.ItemId = ItemId;
				S.Count = Moved;
				S.Durability = Dur;
				Remaining -= Moved;
			}
		}
		if (Remaining != Count - RejectedByWeight) { Touch(); }
		return Remaining + RejectedByWeight;
	}

	int32_t Inventory::RemoveItem(const std::string& ItemId, int32_t Count)
	{
		int32_t Removed = 0;
		for (int32_t I = NumSlots() - 1; I >= 0 && Removed < Count; --I)
		{
			ItemStack& S = Slots[static_cast<size_t>(I)];
			if (S.IsEmpty() || S.ItemId != ItemId) { continue; }
			const int32_t Take = std::min(Count - Removed, S.Count);
			S.Count -= Take;
			Removed += Take;
			if (S.Count <= 0) { S.Clear(); }
		}
		if (Removed > 0) { Touch(); }
		return Removed;
	}

	int32_t Inventory::RemoveFromSlot(int32_t Slot, int32_t Count)
	{
		if (!IsValidSlot(Slot) || Count <= 0) { return 0; }
		ItemStack& S = Slots[static_cast<size_t>(Slot)];
		if (S.IsEmpty()) { return 0; }
		const int32_t Take = std::min(Count, S.Count);
		S.Count -= Take;
		if (S.Count <= 0) { S.Clear(); }
		Touch();
		return Take;
	}

	int32_t Inventory::CountItem(const std::string& ItemId) const
	{
		int32_t Total = 0;
		for (const ItemStack& S : Slots) { if (!S.IsEmpty() && S.ItemId == ItemId) { Total += S.Count; } }
		return Total;
	}

	bool Inventory::HasAll(const std::vector<ItemAmount>& Requirements) const
	{
		for (const ItemAmount& R : Requirements)
		{
			// Requirements may list the same item twice; aggregate them.
			int32_t Needed = 0;
			for (const ItemAmount& R2 : Requirements) { if (R2.ItemId == R.ItemId) { Needed += R2.Count; } }
			if (CountItem(R.ItemId) < Needed) { return false; }
		}
		return true;
	}

	bool Inventory::ConsumeAll(const std::vector<ItemAmount>& Requirements)
	{
		if (!HasAll(Requirements)) { return false; }
		for (const ItemAmount& R : Requirements) { RemoveItem(R.ItemId, R.Count); }
		return true;
	}

	bool Inventory::MoveSlot(int32_t From, int32_t To)
	{
		if (!IsValidSlot(From) || !IsValidSlot(To) || From == To) { return false; }
		ItemStack& A = Slots[static_cast<size_t>(From)];
		ItemStack& B = Slots[static_cast<size_t>(To)];
		if (A.IsEmpty()) { return false; }
		if (!B.IsEmpty() && B.ItemId == A.ItemId)
		{
			const int32_t MaxStack = MaxStackOf(A.ItemId);
			if (B.Count < MaxStack)
			{
				const int32_t Moved = std::min(A.Count, MaxStack - B.Count);
				B.Count += Moved;
				A.Count -= Moved;
				if (A.Count <= 0) { A.Clear(); }
				Touch();
				return true;
			}
		}
		std::swap(A, B);
		Touch();
		return true;
	}

	bool Inventory::SplitStack(int32_t From, int32_t Amount)
	{
		if (!IsValidSlot(From)) { return false; }
		ItemStack& A = Slots[static_cast<size_t>(From)];
		if (A.IsEmpty() || Amount <= 0 || Amount >= A.Count) { return false; }
		const int32_t Empty = FindFirstEmptySlot();
		if (Empty < 0) { return false; }
		ItemStack& B = Slots[static_cast<size_t>(Empty)];
		B.ItemId = A.ItemId;
		B.Count = Amount;
		B.Durability = A.Durability;
		A.Count -= Amount;
		Touch();
		return true;
	}

	int32_t Inventory::TransferSlotTo(Inventory& Other, int32_t Slot, int32_t Count)
	{
		if (!IsValidSlot(Slot) || &Other == this) { return 0; }
		ItemStack& S = Slots[static_cast<size_t>(Slot)];
		if (S.IsEmpty()) { return 0; }
		const int32_t Wanted = (Count <= 0 || Count > S.Count) ? S.Count : Count;
		const std::string Id = S.ItemId;
		const float Dur = S.Durability;
		const int32_t NotAdded = Other.AddItem(Id, Wanted, Dur);
		const int32_t Moved = Wanted - NotAdded;
		if (Moved > 0)
		{
			S.Count -= Moved;
			if (S.Count <= 0) { S.Clear(); }
			Touch();
		}
		return Moved;
	}

	int32_t Inventory::TransferAllTo(Inventory& Other)
	{
		int32_t Total = 0;
		for (int32_t I = 0; I < NumSlots(); ++I) { Total += TransferSlotTo(Other, I, 0); }
		return Total;
	}

	bool Inventory::SetSlot(int32_t Index, const ItemStack& Stack)
	{
		if (!IsValidSlot(Index)) { return false; }
		if (!Stack.IsEmpty() && Db && !Db->Contains(Stack.ItemId)) { return false; }
		Slots[static_cast<size_t>(Index)] = Stack;
		Touch();
		return true;
	}

	bool Inventory::DamageDurability(int32_t Slot, float Amount)
	{
		if (!IsValidSlot(Slot)) { return false; }
		ItemStack& S = Slots[static_cast<size_t>(Slot)];
		if (S.IsEmpty() || S.Durability < 0.0f) { return false; }
		S.Durability -= Amount;
		Touch();
		if (S.Durability <= 0.0f)
		{
			S.Clear();
			return true;
		}
		return false;
	}

	int32_t Inventory::FindFirstSlot(const std::string& ItemId) const
	{
		for (int32_t I = 0; I < NumSlots(); ++I)
		{
			const ItemStack& S = Slots[static_cast<size_t>(I)];
			if (!S.IsEmpty() && S.ItemId == ItemId) { return I; }
		}
		return -1;
	}

	int32_t Inventory::FindFirstEmptySlot() const
	{
		for (int32_t I = 0; I < NumSlots(); ++I) { if (Slots[static_cast<size_t>(I)].IsEmpty()) { return I; } }
		return -1;
	}

	const ItemStack& Inventory::GetSlot(int32_t Index) const
	{
		return IsValidSlot(Index) ? Slots[static_cast<size_t>(Index)] : InventoryDetail::EmptyStack();
	}

	float Inventory::GetTotalWeight() const
	{
		float W = 0.0f;
		for (const ItemStack& S : Slots) { if (!S.IsEmpty()) { W += WeightOf(S.ItemId, S.Count); } }
		return W;
	}

	float Inventory::GetLoadRatio() const
	{
		return MaxWeight > 0.0f ? GetTotalWeight() / MaxWeight : 0.0f;
	}

	void Inventory::Clear()
	{
		for (ItemStack& S : Slots) { S.Clear(); }
		Touch();
	}

	JsonValue Inventory::ToJson() const
	{
		JsonValue J = JsonValue::MakeObject();
		J.Set("slots", JsonValue::MakeNumber(static_cast<double>(Slots.size())));
		JsonValue Arr = JsonValue::MakeArray();
		for (size_t I = 0; I < Slots.size(); ++I)
		{
			const ItemStack& S = Slots[I];
			if (S.IsEmpty()) { continue; }
			JsonValue E = JsonValue::MakeObject();
			E.Set("i", JsonValue::MakeNumber(static_cast<double>(I)));
			E.Set("id", JsonValue::MakeString(S.ItemId));
			E.Set("n", JsonValue::MakeNumber(S.Count));
			if (S.Durability >= 0.0f) { E.Set("d", JsonValue::MakeNumber(S.Durability)); }
			Arr.Push(E);
		}
		J.Set("items", Arr);
		return J;
	}

	void Inventory::FromJson(const JsonValue& J)
	{
		Clear();
		const JsonValue* Arr = J.Find("items");
		if (!Arr || !Arr->IsArray()) { return; }
		for (const JsonValue& E : Arr->Items())
		{
			const int32_t Index = E.GetInt("i", -1);
			const std::string Id = E.GetString("id");
			const int32_t Count = E.GetInt("n", 0);
			if (Db && !Db->Contains(Id)) { continue; } // item removed from data: drop silently
			if (IsValidSlot(Index) && Count > 0)
			{
				ItemStack& S = Slots[static_cast<size_t>(Index)];
				S.ItemId = Id;
				S.Count = std::min(Count, MaxStackOf(Id));
				S.Durability = E.GetFloat("d", -1.0f);
			}
			else if (Count > 0)
			{
				AddItem(Id, Count, E.GetFloat("d", -1.0f)); // slot count shrank between versions
			}
		}
		Touch();
	}
}
