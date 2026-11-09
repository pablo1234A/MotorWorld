// Island Untamed - melee (with harvesting), bow, blocking and dodging.
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "IUCombatComponent.generated.h"

class AIUCharacter;
class AIUResourceActor;
struct FIUHarvestOutcome;

UCLASS(ClassGroup = (IslandUntamed))
class ISLANDUNTAMED_API UIUCombatComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UIUCombatComponent();
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	void StartMeleeAttack();
	void SetBlocking(bool bInBlocking);
	void Dodge();
	void BowInput(bool bPressed);
	void CancelActions();

	/** Harvests the resource under the crosshair (E = by hand, click = with the held tool). */
	void HarvestFocused(bool bByHand);
	void HarvestResourceActor(AIUResourceActor* Resource, bool bByHand);

	bool IsBlocking() const { return bBlocking; }
	bool IsDodging() const;
	bool IsDrawingBow() const { return bDrawing; }
	float GetBowCharge() const;
	bool IsInCombatRecently() const;
	bool IsWorkingRecently() const;
	float GetSwingProgress() const { return SwingTime > 0.0f ? 1.0f - SwingTime / SwingDuration : 0.0f; }

private:
	void PerformMeleeHit();
	void ApplyHarvest(const FIUHarvestOutcome& Outcome, bool bTool);
	void TrySpearFishing(const FVector& Point);
	AIUCharacter* GetCharacter() const;

	bool bBlocking = false;
	bool bDrawing = false;
	bool bHitPending = false;
	float SwingTime = 0.0f;
	float SwingDuration = 0.45f;
	float HitDelay = 0.0f;
	double NextAttackTime = 0.0;
	double DrawStart = 0.0;
	double DodgeUntil = -1.0;
	double LastCombatTime = -100.0;
	double LastWorkTime = -100.0;
};
