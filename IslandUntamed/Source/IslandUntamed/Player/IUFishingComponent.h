// Island Untamed - rod fishing: cast to a real water zone, wait for a bite,
// strike, then manage line tension while reeling (IUSim::FishingSession).
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Sim/SimFishing.h"
#include "IUFishingComponent.generated.h"

class AIUPropActor;

UCLASS(ClassGroup = (IslandUntamed))
class ISLANDUNTAMED_API UIUFishingComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UIUFishingComponent();
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	void Primary(bool bPressed);
	void Cancel();
	bool IsActive() const { return Session.GetState() != IUSim::EFishingState::Idle; }
	const IUSim::FishingSession& GetSession() const { return Session; }
	IUSim::EWaterZone GetZone() const { return Zone; }

private:
	bool FindCastPoint(FVector& OutPoint) const;
	void Finish();

	IUSim::FishingSession Session;
	IUSim::EWaterZone Zone = IUSim::EWaterZone::None;
	FVector BobberLocation = FVector::ZeroVector;
	UPROPERTY() TObjectPtr<AIUPropActor> Bobber;
	bool bReelHeld = false;
	float BobTime = 0.0f;
};
