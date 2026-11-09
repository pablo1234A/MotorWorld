// Island Untamed - an item stack lying in the world (drops, loot, overflow).
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Gameplay/IUInteractable.h"
#include "Sim/SimJson.h"
#include "IUWorldItem.generated.h"

class USphereComponent;

UCLASS()
class ISLANDUNTAMED_API AIUWorldItem : public AActor, public IIUInteractable
{
	GENERATED_BODY()

public:
	AIUWorldItem();

	/** Spawns an item stack, snapped to the ground below Location. */
	static AIUWorldItem* SpawnItem(UWorld* World, const FVector& Location, const std::string& ItemId, int32 Count, float Durability = -1.0f);

	void InitItem(const std::string& InItemId, int32 InCount, float InDurability);

	virtual FText GetInteractText(const AIUCharacter* By) const override;
	virtual void Interact(AIUCharacter* By) override;

	const std::string& GetItemId() const { return ItemId; }
	int32 GetCount() const { return Count; }

	IUSim::JsonValue ToJson() const;

	/** Items spawned by world generation (not saved: regenerated). */
	bool bTransient = false;

private:
	UPROPERTY(VisibleAnywhere) TObjectPtr<USphereComponent> Collision;

	std::string ItemId;
	int32 Count = 0;
	float Durability = -1.0f;
};
