// Island Untamed - building placement: preview ghost, grid/edge snapping,
// support/slope/overlap/territory validation and cost payment.
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Sim/SimBuilding.h"
#include "IUBuildComponent.generated.h"

class AIUPropActor;
class AIUStructure;

UCLASS(ClassGroup = (IslandUntamed))
class ISLANDUNTAMED_API UIUBuildComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UIUBuildComponent();
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	void Begin(const std::string& BuildingId);
	void Cancel();
	void Confirm();
	void Rotate(float Direction);
	void DeconstructTarget();

	bool IsActive() const { return bActive; }
	bool IsPlacementValid() const { return LastFail == IUSim::EPlacementFail::None; }
	IUSim::EPlacementFail GetLastFail() const { return LastFail; }
	const std::string& GetBuildingId() const { return BuildingId; }
	/** Unlocked buildings available in the build menu. */
	TArray<const IUSim::BuildingDef*> GetAvailableBuildings() const;
	bool IsUnlocked(const IUSim::BuildingDef& Def) const;

private:
	void UpdatePlacement();
	void RebuildPreview();
	void SetPreviewValid(bool bValid);
	IUSim::PlacementProbe Probe(const IUSim::BuildingDef& Def, const FTransform& Candidate, const AActor* SnapParent) const;

	bool bActive = false;
	std::string BuildingId;
	float RotationOffset = 0.0f;
	FTransform Target;
	IUSim::EPlacementFail LastFail = IUSim::EPlacementFail::NoGround;
	bool bPreviewValid = true;
	UPROPERTY() TObjectPtr<AIUPropActor> Preview;
	TArray<class UStaticMeshComponent*> PreviewParts;
};
