// Island Untamed - AI controller shared by animals and tribe members.
//
// Perception: UAIPerceptionComponent (sight + hearing).
// Decision:   IUSim::AnimalBrain / IUSim::NpcBrain (pure, unit-tested state
//             selection) evaluated at a rate that depends on the distance to
//             the player (AI level of detail).
// Execution:  steering on the analytic heightfield (no navmesh needed for the
//             runtime-generated island): obstacle probing, water avoidance,
//             leash to home, flying for birds.
#pragma once

#include "CoreMinimal.h"
#include "AIController.h"
#include "Perception/AIPerceptionTypes.h"
#include "Sim/SimCreatures.h"
#include "IUCreatureAIController.generated.h"

class UAIPerceptionComponent;
class UAISenseConfig_Sight;
class UAISenseConfig_Hearing;
class AIUCreature;

UCLASS()
class ISLANDUNTAMED_API AIUCreatureAIController : public AAIController
{
	GENERATED_BODY()

public:
	AIUCreatureAIController();
	virtual void Tick(float DeltaSeconds) override;
	IUSim::EAIState GetState() const { return State; }
	AActor* GetTarget() const { return Target.Get(); }
	/** Re-reads sight/hearing ranges from the creature (call after configuring its stats). */
	void RefreshSenses();
	/** External stimulus (village alarm, thrown stone...). */
	void AlertTo(AActor* Threat);

protected:
	virtual void OnPossess(APawn* InPawn) override;

private:
	UFUNCTION()
	void OnPerception(AActor* Actor, FAIStimulus Stimulus);

	void Decide();
	void Execute(float DeltaSeconds);
	AActor* SelectTarget(float& OutDistance) const;
	void MoveTowards(const FVector& Destination, bool bRun, float AcceptRadius);
	void MoveAwayFrom(const FVector& From, bool bRun);
	FVector PickWanderPoint(float RadiusCm);
	FVector VillagePoint(int32 Kind) const;
	void FaceLocation(const FVector& Location, float DeltaSeconds);

	UPROPERTY(VisibleAnywhere) TObjectPtr<UAIPerceptionComponent> Perception;
	UPROPERTY() TObjectPtr<UAISenseConfig_Sight> SightConfig;
	UPROPERTY() TObjectPtr<UAISenseConfig_Hearing> HearingConfig;

	TWeakObjectPtr<AIUCreature> Creature;
	TWeakObjectPtr<AActor> Target;
	TMap<TWeakObjectPtr<AActor>, double> Seen; // actor -> last time sensed
	FVector NoiseLocation = FVector::ZeroVector;
	double NoiseTime = -100.0;

	IUSim::EAIState State = IUSim::EAIState::Idle;
	bool bRun = false;
	float TimeInState = 0.0f;
	float DecisionTimer = 0.0f;
	FVector Destination = FVector::ZeroVector;
	bool bHasDestination = false;
	float StuckTimer = 0.0f;
	FVector LastPosition = FVector::ZeroVector;
	float AvoidSign = 1.0f;
	IUSim::Rng Random;
};
