// Island Untamed - crafting queue (real items, real time, real requirements).
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Sim/SimCrafting.h"
#include "IUCraftingComponent.generated.h"

UCLASS(ClassGroup = (IslandUntamed))
class ISLANDUNTAMED_API UIUCraftingComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UIUCraftingComponent();
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	/** Current crafting context (stations around the player, unlocked recipes). */
	IUSim::CraftContext MakeContext() const;
	IUSim::CraftCheck Check(const IUSim::Recipe& R) const;
	/** Queues a recipe if it can currently be crafted. */
	bool Enqueue(const std::string& RecipeId, int32 Count = 1);
	void CancelAll() { Queue.Reset(); Progress = 0.0f; }
	bool IsCrafting() const { return Queue.Num() > 0; }
	float GetProgress() const;
	std::string GetCurrentRecipe() const { return Queue.Num() > 0 ? Queue[0] : std::string(); }
	int32 GetQueueLength() const { return Queue.Num(); }

private:
	TArray<std::string> Queue;
	float Progress = 0.0f;
	mutable std::set<std::string> UnlockedCache;
};
