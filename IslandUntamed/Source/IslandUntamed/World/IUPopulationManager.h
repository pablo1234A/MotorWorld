// Island Untamed - wildlife population around the player (simulation LOD).
// Animals only exist within a bubble around the player; outside it the
// population is abstract. Spawning is biome/time aware and capped.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "IUPopulationManager.generated.h"

class AIUAnimal;

UCLASS()
class ISLANDUNTAMED_API AIUPopulationManager : public AActor
{
	GENERATED_BODY()

public:
	AIUPopulationManager();
	virtual void Tick(float DeltaSeconds) override;
	int32 GetActiveCount() const { return Animals.Num(); }
	/** Removes every animal (new game / load). */
	void ClearAll();

	UPROPERTY(EditAnywhere, Category = "Population") int32 MaxAnimals = 26;
	UPROPERTY(EditAnywhere, Category = "Population") float SpawnMinDistance = 6000.0f;
	UPROPERTY(EditAnywhere, Category = "Population") float SpawnMaxDistance = 16000.0f;
	UPROPERTY(EditAnywhere, Category = "Population") float DespawnDistance = 26000.0f;

private:
	void SpawnGroup(const FVector& PlayerLocation);
	TArray<TWeakObjectPtr<AIUAnimal>> Animals;
	float Timer = 0.0f;
};
