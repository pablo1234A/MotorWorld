// Island Untamed - a tribe village: procedural layout per culture, stores,
// totem, guard posts/patrols and the resident simulation level of detail
// (residents exist only while the player is near; the abstract village state
// lives in the faction system and keeps evolving when far away).
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Gameplay/IUInteractable.h"
#include "Sim/SimCore.h"
#include "Sim/SimIsland.h"
#include "IUVillage.generated.h"

class AIUTribeNPC;
class AIUContainer;

UCLASS()
class ISLANDUNTAMED_API AIUVillage : public AActor
{
	GENERATED_BODY()

public:
	AIUVillage();
	virtual void Tick(float DeltaSeconds) override;

	void SetupVillage(const IUSim::PointOfInterest& Poi);

	const FString& GetTribeId() const { return TribeId; }
	FVector GetCenter() const { return GetActorLocation(); }
	FVector GetFireLocation() const { return FireLocation; }
	float GetTerritoryRadiusCm() const { return TerritoryRadiusCm; }
	float GetInnerRadiusCm() const { return InnerRadiusCm; }
	const TArray<TWeakObjectPtr<AIUTribeNPC>>& GetResidents() const { return Residents; }

	/** 0 work spot, 1 patrol point, 2 fire, 3 hut/bed, 4 guard post. */
	FVector GetSpot(int32 Kind, uint32 Seed, float TimeInState) const;
	FString RandomChatter(IUSim::Rng& Random) const;

	bool IsWitnessed(const AActor* Suspect) const;
	void RaiseAlarm(AActor* Threat);
	void OnResidentDied(AIUTribeNPC* Resident, AActor* Killer);

private:
	void BuildLayout(const IUSim::PointOfInterest& Poi);
	void SpawnResidents();
	void DespawnResidents();

	UPROPERTY() TObjectPtr<USceneComponent> Root;
	FString TribeId;
	FString VillageName;
	float TerritoryRadiusCm = 22000.0f;
	float InnerRadiusCm = 6000.0f;
	FVector FireLocation = FVector::ZeroVector;
	TArray<FVector> WorkSpots;
	TArray<FVector> PatrolPoints;
	TArray<FVector> HutSpots;
	TArray<FVector> GuardPosts;
	TArray<TWeakObjectPtr<AIUTribeNPC>> Residents;
	TArray<FString> Chatter;
	bool bResidentsSpawned = false;
	float CheckTimer = 0.0f;
	int32 SpawnCounter = 0;
};

/** The sacred totem of a village. Destroying it is a grave offence. */
UCLASS()
class ISLANDUNTAMED_API AIUTribeTotem : public AActor
{
	GENERATED_BODY()

public:
	AIUTribeTotem();
	FString TribeId;
	TWeakObjectPtr<AIUVillage> Village;
	virtual float TakeDamage(float DamageAmount, struct FDamageEvent const& DamageEvent, AController* EventInstigator, AActor* DamageCauser) override;

private:
	UPROPERTY() TObjectPtr<USceneComponent> Root;
	float Health = 400.0f;
};
