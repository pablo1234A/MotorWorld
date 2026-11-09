// Island Untamed - interaction contract for anything the player can use with [E].
#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "IUInteractable.generated.h"

class AIUCharacter;

UINTERFACE(MinimalAPI, meta = (CannotImplementInterfaceInBlueprint))
class UIUInteractable : public UInterface
{
	GENERATED_BODY()
};

class ISLANDUNTAMED_API IIUInteractable
{
	GENERATED_BODY()

public:
	/** Text shown under the crosshair, e.g. "Recoger Madera". Empty => not interactable now. */
	virtual FText GetInteractText(const AIUCharacter* By) const = 0;
	virtual void Interact(AIUCharacter* By) = 0;
	/** Optional secondary action shown as [F]. */
	virtual FText GetSecondaryText(const AIUCharacter* By) const { return FText::GetEmpty(); }
	virtual void InteractSecondary(AIUCharacter* By) {}
	/** Max interaction distance in cm. */
	virtual float GetInteractRange() const { return 300.0f; }
};
