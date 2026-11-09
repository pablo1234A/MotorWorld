// Island Untamed - inventory component used by the player, chests, storehouses,
// village stores, cooking fires and loot containers. Wraps IUSim::Inventory.
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Sim/SimInventory.h"
#include "IUInventoryComponent.generated.h"

DECLARE_MULTICAST_DELEGATE(FIUOnInventoryChanged);

UENUM()
enum class EIUEquipSlot : uint8
{
	Head = 0,
	Body = 1,
	Legs = 2
};

UCLASS(ClassGroup = (IslandUntamed), meta = (BlueprintSpawnableComponent))
class ISLANDUNTAMED_API UIUInventoryComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UIUInventoryComponent();

	/** Initializes the storage. MaxWeightKg <= 0 => unlimited. bWithEquipment adds armour slots (player). */
	void Setup(int32 NumSlots, float MaxWeightKg, bool bWithEquipment, bool bInIsPlayer);

	IUSim::Inventory& Inv() { return Storage; }
	const IUSim::Inventory& Inv() const { return Storage; }
	IUSim::Inventory& Equipment() { return EquipmentSlots; }
	const IUSim::Inventory& Equipment() const { return EquipmentSlots; }
	bool HasEquipment() const { return bHasEquipment; }

	/** Adds items; fires Acquire events for the player; returns the amount that did not fit. */
	int32 AddItem(const std::string& ItemId, int32 Count, float Durability = -1.0f, bool bNotify = true);
	/** Adds items and drops whatever does not fit at the owner's feet. */
	void GiveOrDrop(const std::string& ItemId, int32 Count, float Durability = -1.0f);
	int32 RemoveItem(const std::string& ItemId, int32 Count);
	int32 CountItem(const std::string& ItemId) const { return Storage.CountItem(ItemId); }

	/** Drops a slot (or part of it) into the world in front of the owner. */
	void DropSlot(int32 Slot, int32 Count);
	/** Moves a slot between this and another inventory (chest transfer). */
	int32 TransferTo(UIUInventoryComponent* Other, int32 Slot, int32 Count = 0);

	/** Equips an armour item from a storage slot (swaps with the equipped one). */
	bool EquipFromSlot(int32 Slot);
	bool UnequipToStorage(EIUEquipSlot Slot);
	float GetArmorProtection() const;
	float GetArmorInsulation() const;

	/** Notify listeners (HUD) after external mutation of Inv(). */
	void MarkChanged() { OnChanged.Broadcast(); }

	FIUOnInventoryChanged OnChanged;

	/** Display name for container UIs. */
	UPROPERTY(EditAnywhere, Category = "Inventory") FText DisplayName;
	/** Tribe owning this container (stealing from it has consequences). Empty = nobody. */
	FString OwnerTribe;
	/** Stable id for persistence of POI/village containers. */
	FString PersistentId;
	/** True once the contents differ from the generated loot (only then it is saved). */
	bool bDirtyForSave = false;

	IUSim::JsonValue ToJson() const;
	void FromJson(const IUSim::JsonValue& J);

private:
	IUSim::Inventory Storage;
	IUSim::Inventory EquipmentSlots;
	bool bHasEquipment = false;
	bool bIsPlayer = false;
};
