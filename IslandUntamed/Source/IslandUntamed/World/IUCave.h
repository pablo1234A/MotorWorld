// Island Untamed - explorable caves. The entrance sits on the island; the
// interior is a pocket space built far below the world on first entry.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Core/IUAssets.h"
#include "Gameplay/IUInteractable.h"
#include "Sim/SimIsland.h"
#include "IUCave.generated.h"

UCLASS()
class ISLANDUNTAMED_API AIUCave : public AActor, public IIUInteractable
{
	GENERATED_BODY()

public:
	AIUCave();
	void Setup(const IUSim::PointOfInterest& Poi, int32 CaveIndex);

	virtual FText GetInteractText(const AIUCharacter* By) const override;
	virtual void Interact(AIUCharacter* By) override;

	void EnterCave(AIUCharacter* By);
	void ExitCave(AIUCharacter* By);
	const FString& GetPoiId() const { return PoiId; }

private:
	void BuildInterior();
	void AddBox(TArray<FIUShapePart>& Parts, const FVector& Center, const FVector& Size) const;

	UPROPERTY() TObjectPtr<USceneComponent> Root;
	FString PoiId;
	FString CaveName;
	int32 Index = 0;
	FVector InteriorOrigin = FVector::ZeroVector;
	FVector InteriorSpawn = FVector::ZeroVector;
	bool bInteriorBuilt = false;
};

UCLASS()
class ISLANDUNTAMED_API AIUCaveExit : public AActor, public IIUInteractable
{
	GENERATED_BODY()

public:
	AIUCaveExit();
	TWeakObjectPtr<AIUCave> Cave;
	virtual FText GetInteractText(const AIUCharacter* By) const override { return NSLOCTEXT("IU", "ExitCave", "Salir de la cueva"); }
	virtual void Interact(AIUCharacter* By) override { if (Cave.IsValid()) { Cave->ExitCave(By); } }

private:
	UPROPERTY() TObjectPtr<class USphereComponent> Collision;
};
