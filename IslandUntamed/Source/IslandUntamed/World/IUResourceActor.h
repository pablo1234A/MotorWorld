// Island Untamed - a single harvestable resource actor (used inside caves and
// special locations where instanced foliage is not appropriate).
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Gameplay/IUInteractable.h"
#include "World/IUIslandWorld.h"
#include "IUResourceActor.generated.h"

UCLASS()
class ISLANDUNTAMED_API AIUResourceActor : public AActor, public IIUInteractable
{
	GENERATED_BODY()

public:
	AIUResourceActor();
	static AIUResourceActor* Spawn(UWorld* World, const FVector& Location, float Yaw, float Scale, const std::string& NodeId);

	const IUSim::ResourceNodeDef* GetNodeDef() const;
	FIUHarvestOutcome Harvest(IUSim::EToolType Tool, int32 ToolTier, float ToolMultiplier);

	virtual FText GetInteractText(const AIUCharacter* By) const override;
	virtual void Interact(AIUCharacter* By) override;

private:
	UPROPERTY() TObjectPtr<USceneComponent> Root;
	std::string NodeId;
	int32 HitsLeft = 3;
};
