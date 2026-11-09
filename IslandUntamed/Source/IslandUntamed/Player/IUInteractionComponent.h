// Island Untamed - what the player is looking at and what [E]/[F] do.
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "IUInteractionComponent.generated.h"

class AIUCharacter;
class UPrimitiveComponent;

UENUM()
enum class EIUFocusKind : uint8
{
	None,
	Actor,     // IIUInteractable
	Resource,  // instanced resource node
	Water      // drinkable / fillable water surface
};

UCLASS(ClassGroup = (IslandUntamed))
class ISLANDUNTAMED_API UIUInteractionComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UIUInteractionComponent();
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	void Interact();
	void InteractSecondary();
	/** Fills the clay flask at a water source (2 units of unboiled water). */
	void FillFlask();

	EIUFocusKind GetFocusKind() const { return FocusKind; }
	const FText& GetPrimaryText() const { return PrimaryText; }
	const FText& GetSecondaryText() const { return SecondaryText; }
	AActor* GetFocusActor() const { return FocusActor.Get(); }
	/** Resource under the crosshair (for melee harvesting). */
	UPrimitiveComponent* GetFocusComponent() const { return FocusComponent.Get(); }
	int32 GetFocusItem() const { return FocusItem; }

private:
	void UpdateFocus();
	bool FindWater(FVector& OutPoint, bool& bOutSalt) const;
	void Drink();

	TWeakObjectPtr<AActor> FocusActor;
	TWeakObjectPtr<UPrimitiveComponent> FocusComponent;
	int32 FocusItem = INDEX_NONE;
	EIUFocusKind FocusKind = EIUFocusKind::None;
	FText PrimaryText;
	FText SecondaryText;
	bool bWaterSalt = false;
};
