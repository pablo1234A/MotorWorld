// Island Untamed - a placed building piece (shelters, walls, fires, chests,
// farm plots, traps...). Features are composed from data: the BuildingDef
// decides which feature components are attached (storage, fire, farm, door,
// trap, bed, crafting station).
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Gameplay/IUInteractable.h"
#include "Sim/SimBuilding.h"
#include "Sim/SimCrafting.h"
#include "IUStructure.generated.h"

class UBoxComponent;
class UIUInventoryComponent;
class UIUFireComponent;
class UIUFarmPlotComponent;
class UIUDoorComponent;
class UIUTrapComponent;
class UStaticMeshComponent;

UCLASS()
class ISLANDUNTAMED_API AIUStructure : public AActor, public IIUInteractable
{
	GENERATED_BODY()

public:
	AIUStructure();

	/** Configures visuals and features. Must be called right after spawning. */
	void InitStructure(const std::string& InBuildingId, bool bFromSave);

	const IUSim::BuildingDef* GetDef() const;
	const std::string& GetBuildingId() const { return BuildingId; }
	float GetHealth() const { return Health; }

	bool IsLitFire() const;
	float GetHeatRadiusCm() const;
	bool IsStationUsable() const;
	IUSim::EStation GetStation() const;
	bool IsBed() const;
	UIUInventoryComponent* GetStorage() const { return Storage; }
	UIUFireComponent* GetFire() const { return Fire; }
	UIUFarmPlotComponent* GetFarm() const { return Farm; }
	const TArray<UStaticMeshComponent*>& GetFlameParts() const { return FlameParts; }

	virtual FText GetInteractText(const AIUCharacter* By) const override;
	virtual void Interact(AIUCharacter* By) override;
	virtual FText GetSecondaryText(const AIUCharacter* By) const override;
	virtual void InteractSecondary(AIUCharacter* By) override;

	virtual float TakeDamage(float DamageAmount, struct FDamageEvent const& DamageEvent, AController* EventInstigator, AActor* DamageCauser) override;
	/** Removes the piece refunding half of its cost to the player. */
	void Deconstruct(AIUCharacter* By);

	IUSim::JsonValue ToJson() const;
	void FromJson(const IUSim::JsonValue& J);

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

private:
	UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> Root;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UBoxComponent> Bounds;
	UPROPERTY() TObjectPtr<UIUInventoryComponent> Storage;
	UPROPERTY() TObjectPtr<UIUFireComponent> Fire;
	UPROPERTY() TObjectPtr<UIUFarmPlotComponent> Farm;
	UPROPERTY() TObjectPtr<UIUDoorComponent> Door;
	UPROPERTY() TObjectPtr<UIUTrapComponent> Trap;
	UPROPERTY() TArray<TObjectPtr<UStaticMeshComponent>> PartComponents;
	TArray<UStaticMeshComponent*> FlameParts;

	std::string BuildingId;
	float Health = 100.0f;
};
