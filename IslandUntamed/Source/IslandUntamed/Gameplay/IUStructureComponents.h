// Island Untamed - feature components attached to structures by data.
#pragma once

#include "CoreMinimal.h"
#include "Components/SceneComponent.h"
#include "Sim/SimBuilding.h"
#include "Sim/SimFarming.h"
#include "IUStructureComponents.generated.h"

class AIUCharacter;
class UIUInventoryComponent;
class UPointLightComponent;
class UStaticMeshComponent;
class USphereComponent;

// ---------------------------------------------------------------------------------------------
/** Fuel, light, heat and cooking for campfires, torches and furnaces. */
UCLASS()
class ISLANDUNTAMED_API UIUFireComponent : public USceneComponent
{
	GENERATED_BODY()

public:
	UIUFireComponent();
	void InitFire(const IUSim::BuildingDef& Def, bool bStartLit);
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	bool IsLit() const { return bLit; }
	float GetFuel() const { return Fuel; }
	float GetFuelCapacity() const { return Capacity; }
	UIUInventoryComponent* GetCookingSlots() const { return Cooking; }
	/** Cooking progress 0..1 for a cooking slot (UI). */
	float GetCookProgress(int32 Slot) const;

	FText GetSecondaryText(const AIUCharacter* By) const;
	void InteractSecondary(AIUCharacter* By);
	bool AddFuelFrom(AIUCharacter* By);
	void SetLit(bool bInLit);

	IUSim::JsonValue ToJson() const;
	void FromJson(const IUSim::JsonValue& J);

private:
	void UpdateVisuals();

	UPROPERTY() TObjectPtr<UPointLightComponent> Light;
	UPROPERTY() TObjectPtr<UIUInventoryComponent> Cooking;
	TArray<float> CookTimers;
	float Fuel = 0.0f;
	float Capacity = 600.0f;
	float BaseIntensity = 6000.0f;
	float FlickerTime = 0.0f;
	bool bLit = false;
	bool bSheltered = false;
	float ShelterCheckTimer = 0.0f;
};

// ---------------------------------------------------------------------------------------------
/** Farm plot: tilling, planting, watering, fertilizing, growth and harvest. */
UCLASS()
class ISLANDUNTAMED_API UIUFarmPlotComponent : public USceneComponent
{
	GENERATED_BODY()

public:
	UIUFarmPlotComponent();
	FText GetInteractText(const AIUCharacter* By) const;
	void Interact(AIUCharacter* By);
	const IUSim::FarmPlot& GetPlot() const { return Plot; }

	IUSim::JsonValue ToJson() const;
	void FromJson(const IUSim::JsonValue& J);

protected:
	virtual void OnRegister() override;
	virtual void OnUnregister() override;

private:
	void OnHours(float Hours);
	void RefreshVisual();
	const IUSim::CropDef* CurrentCrop() const;

	IUSim::FarmPlot Plot;
	UPROPERTY() TArray<TObjectPtr<UStaticMeshComponent>> CropParts;
	int32 VisualStage = -1;
	std::string VisualCrop;
	FDelegateHandle HoursHandle;
	bool bSheltered = false;
};

// ---------------------------------------------------------------------------------------------
UCLASS()
class ISLANDUNTAMED_API UIUDoorComponent : public USceneComponent
{
	GENERATED_BODY()

public:
	UIUDoorComponent();
	void BuildLeaf();
	void Toggle();
	bool IsOpen() const { return bOpen; }
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

private:
	UPROPERTY() TObjectPtr<USceneComponent> Hinge;
	bool bOpen = false;
	float Angle = 0.0f;
};

// ---------------------------------------------------------------------------------------------
UCLASS()
class ISLANDUNTAMED_API UIUTrapComponent : public USceneComponent
{
	GENERATED_BODY()

public:
	UIUTrapComponent();
	void InitTrap(float InDamage, const FVector& SizeCm);

private:
	UFUNCTION()
	void OnOverlap(UPrimitiveComponent* OverlappedComp, AActor* OtherActor, UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult);

	UPROPERTY() TObjectPtr<USphereComponent> Trigger;
	float Damage = 30.0f;
	int32 UsesLeft = 6;
	double LastTriggerTime = -100.0;
};
