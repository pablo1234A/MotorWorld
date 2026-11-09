// Island Untamed - base class for every living creature (animals and tribe
// members): health, procedural body built from primitives, procedural
// animation (walk cycle, attack lunge, sleep, death) and melee attacks.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "Gameplay/IUInteractable.h"
#include "Sim/SimCreatures.h"
#include "IUCreature.generated.h"

class UStaticMeshComponent;

UENUM()
enum class EIUBodyShape : uint8
{
	Quadruped,
	Feline,
	Reptile,
	Crab,
	Bird,
	Snake,
	Humanoid
};

UCLASS(Abstract)
class ISLANDUNTAMED_API AIUCreature : public ACharacter, public IIUInteractable
{
	GENERATED_BODY()

public:
	AIUCreature();
	virtual void Tick(float DeltaSeconds) override;
	virtual float TakeDamage(float DamageAmount, struct FDamageEvent const& DamageEvent, AController* EventInstigator, AActor* DamageCauser) override;

	bool IsAlive() const { return Health > 0.0f; }
	float GetHealthFraction() const { return MaxHealth > 0.0f ? Health / MaxHealth : 0.0f; }
	/** Would this creature attack Other on sight? */
	virtual bool IsHostileTo(const AActor* Other) const { return false; }
	/** Can this creature be harmed by / scared of Other? */
	virtual bool IsThreatenedBy(const AActor* Other) const;

	/** Brain state set by the AI controller (drives animation). */
	IUSim::EAIState AnimState = IUSim::EAIState::Idle;
	FVector HomeLocation = FVector::ZeroVector;
	float LeashRadiusCm = 8000.0f;
	AActor* LastAttacker() const { return LastDamageCauser.Get(); }
	double GetLastDamageTime() const { return LastDamageTime; }

	/** Tries a melee attack on Target (range/cooldown checked). Returns true if the swing started. */
	bool TryAttack(AActor* Target);
	/** Plays the strike animation without damage (working, gesturing). */
	void PlayGesture() { AttackAnim = 1.0f; }
	float GetAttackRangeCm() const { return AttackRangeCm; }
	float GetWalkSpeed() const { return WalkSpeed; }
	float GetRunSpeed() const { return RunSpeed; }
	float GetSightRadiusCm() const { return SightRadiusCm; }
	float GetHearingRadiusCm() const { return HearingRadiusCm; }

	/** Corpse interaction (butchering) for dead animals; talking for NPCs. */
	virtual FText GetInteractText(const AIUCharacter* By) const override { return FText::GetEmpty(); }
	virtual void Interact(AIUCharacter* By) override {}

	/** Ground height + water level awareness for steering. */
	bool IsLocationWalkable(const FVector& Location) const;

protected:
	/** Builds the body for a shape (sizes scale with BodyLength in cm). */
	void BuildBody(EIUBodyShape Shape, float BodyLengthCm, const FLinearColor& Color, const FLinearColor& Accent);
	void ConfigureStats(float InHealth, float InWalk, float InRun, float InDamage, float InAttackRangeCm, float InAttackInterval, float InSightCm, float InHearingCm);
	virtual void OnDeath(AActor* Killer);
	virtual void ApplyAttackHit(AActor* Target);
	void AnimateBody(float DeltaSeconds);

	UPROPERTY() TObjectPtr<USceneComponent> BodyRoot;
	UPROPERTY() TArray<TObjectPtr<UStaticMeshComponent>> LegParts;
	UPROPERTY() TObjectPtr<UStaticMeshComponent> HeadPart;
	UPROPERTY() TArray<TObjectPtr<UStaticMeshComponent>> WingParts;
	UPROPERTY() TArray<TObjectPtr<UStaticMeshComponent>> ArmParts;

	EIUBodyShape BodyShape = EIUBodyShape::Quadruped;
	float Health = 50.0f;
	float MaxHealth = 50.0f;
	float WalkSpeed = 200.0f;
	float RunSpeed = 600.0f;
	float AttackDamage = 0.0f;
	float AttackRangeCm = 150.0f;
	float AttackInterval = 1.4f;
	float SightRadiusCm = 2500.0f;
	float HearingRadiusCm = 3000.0f;
	float WalkPhase = 0.0f;
	float AttackAnim = 0.0f;
	float DeathAnim = 0.0f;
	double LastAttackTime = -100.0;
	double LastDamageTime = -100.0;
	TWeakObjectPtr<AActor> LastDamageCauser;
	TWeakObjectPtr<AActor> PendingAttackTarget;
	float PendingAttackDelay = -1.0f;
	float BodyBaseHeight = 0.0f;
};
