// Island Untamed - lootable container placed by world generation (crash
// cargo, ruin altars, village stores). Player chests are AIUStructure pieces.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Gameplay/IUInteractable.h"
#include "Core/IUAssets.h"
#include "IUContainer.generated.h"

class UIUInventoryComponent;
class UBoxComponent;

UCLASS()
class ISLANDUNTAMED_API AIUContainer : public AActor, public IIUInteractable
{
	GENERATED_BODY()

public:
	AIUContainer();

	/** Builds the visual and storage. PersistentId must be unique and stable across runs. */
	void Setup(const FString& InPersistentId, const FText& InName, const TArray<FIUShapePart>& Visual, int32 Slots, const FString& InOwnerTribe = FString());

	virtual FText GetInteractText(const AIUCharacter* By) const override;
	virtual void Interact(AIUCharacter* By) override;

	UIUInventoryComponent* GetStorage() const { return Storage; }
	/** Call after filling the generated loot: restores the saved contents if the player already looted it. */
	void FinishLoot();
	/** Re-applies saved contents, or the generated loot if this container was never touched in the save. */
	void ReloadFromSave();

	/** Optional key item required to open (e.g. the Meridian keycard). */
	std::string RequiredKeyItem;

private:
	UPROPERTY(VisibleAnywhere) TObjectPtr<UBoxComponent> Bounds;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UIUInventoryComponent> Storage;
	FString GeneratedLootJson;
};
