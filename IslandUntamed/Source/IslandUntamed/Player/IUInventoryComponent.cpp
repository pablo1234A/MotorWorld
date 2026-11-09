#include "Player/IUInventoryComponent.h"

#include "Core/IUGameInstance.h"
#include "Core/IUTypes.h"
#include "Gameplay/IUWorldItem.h"
#include "World/IUWorldSubsystem.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"

UIUInventoryComponent::UIUInventoryComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
}

void UIUInventoryComponent::Setup(int32 NumSlots, float MaxWeightKg, bool bWithEquipment, bool bInIsPlayer)
{
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	const IUSim::ItemDatabase* Items = Db ? &Db->Items : nullptr;
	Storage.Init(Items, NumSlots, MaxWeightKg);
	bHasEquipment = bWithEquipment;
	bIsPlayer = bInIsPlayer;
	EquipmentSlots.Init(Items, bWithEquipment ? 3 : 0, 0.0f);
	OnChanged.Broadcast();
}

int32 UIUInventoryComponent::AddItem(const std::string& ItemId, int32 Count, float Durability, bool bNotify)
{
	const int32 Left = Storage.AddItem(ItemId, Count, Durability);
	const int32 Added = Count - Left;
	if (Added > 0)
	{
		bDirtyForSave = true;
		if (bIsPlayer)
		{
			if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this))
			{
				WS->BroadcastEvent(IUSim::EGameEvent::Acquire, ItemId, Added);
				if (bNotify)
				{
					const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
					const IUSim::ItemDef* Def = Db ? Db->Items.Find(ItemId) : nullptr;
					WS->NotifyPickup(Def ? IU::ToFString(Def->Name) : IU::ToFString(ItemId), Added);
				}
			}
		}
		OnChanged.Broadcast();
	}
	return Left;
}

void UIUInventoryComponent::GiveOrDrop(const std::string& ItemId, int32 Count, float Durability)
{
	const int32 Left = AddItem(ItemId, Count, Durability);
	if (Left > 0 && GetOwner())
	{
		const FVector Loc = GetOwner()->GetActorLocation() + GetOwner()->GetActorForwardVector() * 80.0f;
		AIUWorldItem::SpawnItem(GetWorld(), Loc, ItemId, Left, Durability);
		if (bIsPlayer)
		{
			if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this))
			{
				WS->Notify(NSLOCTEXT("IU", "InvFullDrop", "Inventario lleno: objetos al suelo").ToString(), IU::Palette::Bad);
			}
		}
	}
}

int32 UIUInventoryComponent::RemoveItem(const std::string& ItemId, int32 Count)
{
	const int32 Removed = Storage.RemoveItem(ItemId, Count);
	if (Removed > 0) { bDirtyForSave = true; OnChanged.Broadcast(); }
	return Removed;
}

void UIUInventoryComponent::DropSlot(int32 Slot, int32 Count)
{
	const IUSim::ItemStack Stack = Storage.GetSlot(Slot);
	if (Stack.IsEmpty() || !GetOwner()) { return; }
	const int32 Removed = Storage.RemoveFromSlot(Slot, Count <= 0 ? Stack.Count : Count);
	if (Removed <= 0) { return; }
	const FVector Loc = GetOwner()->GetActorLocation() + GetOwner()->GetActorForwardVector() * 100.0f + FVector(0, 0, 20);
	AIUWorldItem::SpawnItem(GetWorld(), Loc, Stack.ItemId, Removed, Stack.Durability);
	bDirtyForSave = true;
	OnChanged.Broadcast();
}

int32 UIUInventoryComponent::TransferTo(UIUInventoryComponent* Other, int32 Slot, int32 Count)
{
	if (!Other || Other == this) { return 0; }
	const IUSim::ItemStack Stack = Storage.GetSlot(Slot);
	const int32 Moved = Storage.TransferSlotTo(Other->Storage, Slot, Count);
	if (Moved > 0)
	{
		bDirtyForSave = true;
		Other->bDirtyForSave = true;
		if (Other->bIsPlayer)
		{
			if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this))
			{
				WS->BroadcastEvent(IUSim::EGameEvent::Acquire, Stack.ItemId, Moved);
				WS->OnContainerLooted(this, Stack.ItemId, Moved);
			}
		}
		OnChanged.Broadcast();
		Other->OnChanged.Broadcast();
	}
	return Moved;
}

bool UIUInventoryComponent::EquipFromSlot(int32 Slot)
{
	if (!bHasEquipment) { return false; }
	const IUSim::ItemStack Stack = Storage.GetSlot(Slot);
	const IUSim::ItemDatabase* Items = Storage.GetDatabase();
	const IUSim::ItemDef* Def = (Items && !Stack.IsEmpty()) ? Items->Find(Stack.ItemId) : nullptr;
	if (!Def || Def->Armor.Slot == IUSim::EArmorSlot::None) { return false; }
	const int32 EquipIndex = static_cast<int32>(Def->Armor.Slot) - 1;
	const IUSim::ItemStack Previous = EquipmentSlots.GetSlot(EquipIndex);
	Storage.RemoveFromSlot(Slot, 1);
	IUSim::ItemStack NewStack = Stack;
	NewStack.Count = 1;
	EquipmentSlots.SetSlot(EquipIndex, NewStack);
	if (!Previous.IsEmpty())
	{
		GiveOrDrop(Previous.ItemId, 1, Previous.Durability);
	}
	bDirtyForSave = true;
	OnChanged.Broadcast();
	return true;
}

bool UIUInventoryComponent::UnequipToStorage(EIUEquipSlot Slot)
{
	const int32 Index = static_cast<int32>(Slot);
	const IUSim::ItemStack Stack = EquipmentSlots.GetSlot(Index);
	if (Stack.IsEmpty() || !Storage.CanAdd(Stack.ItemId, 1)) { return false; }
	EquipmentSlots.RemoveFromSlot(Index, 1);
	Storage.AddItem(Stack.ItemId, 1, Stack.Durability);
	OnChanged.Broadcast();
	return true;
}

float UIUInventoryComponent::GetArmorProtection() const
{
	float Total = 0.0f;
	const IUSim::ItemDatabase* Items = EquipmentSlots.GetDatabase();
	for (int32 I = 0; I < EquipmentSlots.NumSlots() && Items; ++I)
	{
		const IUSim::ItemStack& S = EquipmentSlots.GetSlot(I);
		if (const IUSim::ItemDef* D = S.IsEmpty() ? nullptr : Items->Find(S.ItemId)) { Total += D->Armor.Protection; }
	}
	return FMath::Min(Total, 0.8f);
}

float UIUInventoryComponent::GetArmorInsulation() const
{
	float Total = 0.0f;
	const IUSim::ItemDatabase* Items = EquipmentSlots.GetDatabase();
	for (int32 I = 0; I < EquipmentSlots.NumSlots() && Items; ++I)
	{
		const IUSim::ItemStack& S = EquipmentSlots.GetSlot(I);
		if (const IUSim::ItemDef* D = S.IsEmpty() ? nullptr : Items->Find(S.ItemId)) { Total += D->Armor.Insulation; }
	}
	return Total;
}

IUSim::JsonValue UIUInventoryComponent::ToJson() const
{
	IUSim::JsonValue J = IUSim::JsonValue::MakeObject();
	J.Set("storage", Storage.ToJson());
	if (bHasEquipment) { J.Set("equipment", EquipmentSlots.ToJson()); }
	return J;
}

void UIUInventoryComponent::FromJson(const IUSim::JsonValue& J)
{
	Storage.FromJson(J["storage"]);
	if (bHasEquipment) { EquipmentSlots.FromJson(J["equipment"]); }
	bDirtyForSave = true;
	OnChanged.Broadcast();
}
