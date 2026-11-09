// Island Untamed - readable document in the world (journals, logs, carvings).
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Gameplay/IUInteractable.h"

#include <string>
#include "IULoreNote.generated.h"

class USphereComponent;
class UPointLightComponent;

UCLASS()
class ISLANDUNTAMED_API AIULoreNote : public AActor, public IIUInteractable
{
	GENERATED_BODY()

public:
	AIULoreNote();
	void Setup(const FString& InDocId);

	virtual FText GetInteractText(const AIUCharacter* By) const override;
	virtual void Interact(AIUCharacter* By) override;

	/** Optional item needed to read (documents behind a locked door). */
	std::string RequiredKeyItem;

private:
	UPROPERTY(VisibleAnywhere) TObjectPtr<USphereComponent> Collision;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UPointLightComponent> Glint;
	FString DocId;
};
