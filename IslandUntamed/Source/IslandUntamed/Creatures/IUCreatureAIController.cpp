#include "Creatures/IUCreatureAIController.h"

#include "Core/IUTypes.h"
#include "Creatures/IUAnimal.h"
#include "Creatures/IUCreature.h"
#include "Creatures/IUTribeNPC.h"
#include "Creatures/IUVillage.h"
#include "Player/IUCharacter.h"
#include "World/IUStorySubsystem.h"
#include "World/IUWorldSubsystem.h"
#include "Components/CapsuleComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Perception/AIPerceptionComponent.h"
#include "Perception/AISenseConfig_Hearing.h"
#include "Perception/AISense_Hearing.h"
#include "Perception/AISenseConfig_Sight.h"

AIUCreatureAIController::AIUCreatureAIController()
{
	PrimaryActorTick.bCanEverTick = true;
	Perception = CreateDefaultSubobject<UAIPerceptionComponent>(TEXT("Perception"));
	SightConfig = CreateDefaultSubobject<UAISenseConfig_Sight>(TEXT("Sight"));
	SightConfig->SightRadius = 2500.0f;
	SightConfig->LoseSightRadius = 3000.0f;
	SightConfig->PeripheralVisionAngleDegrees = 75.0f;
	SightConfig->SetMaxAge(8.0f);
	SightConfig->DetectionByAffiliation.bDetectEnemies = true;
	SightConfig->DetectionByAffiliation.bDetectNeutrals = true;
	SightConfig->DetectionByAffiliation.bDetectFriendlies = true;
	HearingConfig = CreateDefaultSubobject<UAISenseConfig_Hearing>(TEXT("Hearing"));
	HearingConfig->HearingRange = 3000.0f;
	HearingConfig->SetMaxAge(5.0f);
	HearingConfig->DetectionByAffiliation.bDetectEnemies = true;
	HearingConfig->DetectionByAffiliation.bDetectNeutrals = true;
	HearingConfig->DetectionByAffiliation.bDetectFriendlies = true;
	Perception->ConfigureSense(*SightConfig);
	Perception->ConfigureSense(*HearingConfig);
	Perception->SetDominantSense(SightConfig->GetSenseImplementation());
	SetPerceptionComponent(*Perception);
}

void AIUCreatureAIController::OnPossess(APawn* InPawn)
{
	Super::OnPossess(InPawn);
	Creature = Cast<AIUCreature>(InPawn);
	Random.Seed(static_cast<uint64>(reinterpret_cast<UPTRINT>(InPawn)) ^ 0x51EDULL);
	RefreshSenses();
	if (AIUCreature* C = Creature.Get())
	{
		if (C->HomeLocation.IsZero()) { C->HomeLocation = C->GetActorLocation(); }
		LastPosition = C->GetActorLocation();
	}
	Perception->OnTargetPerceptionUpdated.AddUniqueDynamic(this, &AIUCreatureAIController::OnPerception);
	DecisionTimer = Random.Range(0.0f, 0.5f);
}

void AIUCreatureAIController::RefreshSenses()
{
	const AIUCreature* C = Creature.Get();
	if (!C) { return; }
	SightConfig->SightRadius = C->GetSightRadiusCm();
	SightConfig->LoseSightRadius = C->GetSightRadiusCm() * 1.25f;
	HearingConfig->HearingRange = C->GetHearingRadiusCm();
	Perception->ConfigureSense(*SightConfig);
	Perception->ConfigureSense(*HearingConfig);
	Perception->RequestStimuliListenerUpdate();
}

void AIUCreatureAIController::OnPerception(AActor* Actor, FAIStimulus Stimulus)
{
	if (!Actor || Actor == GetPawn()) { return; }
	const double Now = GetWorld()->GetTimeSeconds();
	if (Stimulus.Type == UAISense::GetSenseID<UAISense_Hearing>())
	{
		NoiseLocation = Stimulus.StimulusLocation;
		NoiseTime = Now;
		return;
	}
	if (Stimulus.WasSuccessfullySensed()) { Seen.Add(Actor, Now); }
}

void AIUCreatureAIController::AlertTo(AActor* Threat)
{
	if (!Threat) { return; }
	Seen.Add(Threat, GetWorld()->GetTimeSeconds());
	NoiseLocation = Threat->GetActorLocation();
	NoiseTime = GetWorld()->GetTimeSeconds();
	DecisionTimer = 0.0f;
}

AActor* AIUCreatureAIController::SelectTarget(float& OutDistance) const
{
	const AIUCreature* C = Creature.Get();
	OutDistance = 1.0e9f;
	if (!C) { return nullptr; }
	const double Now = GetWorld()->GetTimeSeconds();
	AActor* Best = nullptr;
	float BestScore = 1.0e9f;
	for (const TPair<TWeakObjectPtr<AActor>, double>& Pair : Seen)
	{
		AActor* A = Pair.Key.Get();
		if (!A || Now - Pair.Value > 10.0) { continue; }
		if (const AIUCreature* Other = Cast<AIUCreature>(A)) { if (!Other->IsAlive()) { continue; } }
		const bool bRelevant = C->IsThreatenedBy(A) || C->IsHostileTo(A) || A->IsA<AIUCharacter>();
		if (!bRelevant) { continue; }
		const float D = FVector::Dist(A->GetActorLocation(), C->GetActorLocation());
		// Hostile targets first, then by distance.
		const float Score = D - (C->IsHostileTo(A) ? 5000.0f : 0.0f);
		if (Score < BestScore) { BestScore = Score; Best = A; OutDistance = D; }
	}
	// The attacker is always known.
	if (!Best && C->LastAttacker() && Now - C->GetLastDamageTime() < 10.0)
	{
		Best = C->LastAttacker();
		OutDistance = FVector::Dist(Best->GetActorLocation(), C->GetActorLocation());
	}
	return Best;
}

void AIUCreatureAIController::Decide()
{
	AIUCreature* C = Creature.Get();
	if (!C || !C->IsAlive()) { return; }
	const UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	const double Now = GetWorld()->GetTimeSeconds();

	float Distance = 0.0f;
	AActor* NewTarget = SelectTarget(Distance);
	Target = NewTarget;

	IUSim::BrainInput In;
	In.bHasTarget = NewTarget != nullptr;
	In.TargetDistance = Distance * IU::CmToMeters;
	In.bTargetIsThreat = NewTarget && C->IsThreatenedBy(NewTarget);
	In.bTargetIsHostile = NewTarget && C->IsHostileTo(NewTarget);
	In.bHeardNoise = Now - NoiseTime < 4.0;
	In.bRecentlyDamaged = Now - C->GetLastDamageTime() < 6.0;
	In.HealthFraction = C->GetHealthFraction();
	In.DistanceFromHome = FVector::Dist2D(C->GetActorLocation(), C->HomeLocation) * IU::CmToMeters;
	In.LeashRadius = C->LeashRadiusCm * IU::CmToMeters;
	In.bNight = WS ? WS->GetClock().IsNight() : false;
	In.Hour = WS ? WS->GetClock().GetHour() : 12.0f;
	In.TimeInState = TimeInState;

	IUSim::BrainOutput Out;
	if (AIUAnimal* Animal = Cast<AIUAnimal>(C))
	{
		if (const IUSim::AnimalDef* Def = Animal->GetDef())
		{
			// Lit fires scare animals: treat proximity to fire like a threat.
			if (WS && WS->GetFireHeatAt(C->GetActorLocation()) > 0.2f && Def->Temperament != IUSim::ETemperamentAnimal::Aggressive)
			{
				In.bHasTarget = true;
				In.bTargetIsThreat = true;
				In.TargetDistance = FMath::Min(In.TargetDistance, 5.0f);
				In.bRecentlyDamaged = Def->Temperament == IUSim::ETemperamentAnimal::Skittish;
			}
			Out = IUSim::AnimalBrain::Decide(*Def, In, State, Random);
		}
	}
	else if (AIUTribeNPC* NPC = Cast<AIUTribeNPC>(C))
	{
		const AIUVillage* Village = NPC->GetVillage();
		if (NewTarget && Village)
		{
			const float D2 = FVector::Dist2D(NewTarget->GetActorLocation(), Village->GetCenter());
			In.bTargetInTerritory = D2 < Village->GetTerritoryRadiusCm();
			In.bTargetInInner = D2 < Village->GetInnerRadiusCm();
		}
		const UIUStorySubsystem* Story = UIUStorySubsystem::Get(this);
		const IUSim::TribeRuntime* Runtime = Story ? Story->Factions().FindRuntime(IU::ToStd(NPC->GetTribeId())) : nullptr;
		In.VillageAlarm = Runtime ? Runtime->Village.Alarm : 0.0f;
		In.WarnTime = NPC->GetWarnTime();
		// Friends of the tribe are never warned.
		if (NewTarget && NewTarget->IsA<AIUCharacter>() && Story && Story->Factions().GetAttitude(IU::ToStd(NPC->GetTribeId())) >= IUSim::EAttitude::Friendly)
		{
			In.bTargetInInner = false;
		}
		Out = IUSim::NpcBrain::Decide(NPC->GetRole(), NPC->IsTerritorial(), In, State, NPC->GetSeed());
	}

	if (Out.State != State)
	{
		State = Out.State;
		TimeInState = 0.0f;
		bHasDestination = false;
	}
	bRun = Out.bRun;
	C->AnimState = State;
}

void AIUCreatureAIController::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	AIUCreature* C = Creature.Get();
	if (!C || !C->IsAlive()) { return; }

	// AI level of detail: think less often far from the player.
	const APawn* Player = UGameplayStatics::GetPlayerPawn(this, 0);
	const float PlayerDist = Player ? FVector::Dist(Player->GetActorLocation(), C->GetActorLocation()) : 0.0f;
	const float Interval = PlayerDist < 4000.0f ? 0.25f : (PlayerDist < 10000.0f ? 0.6f : 1.5f);
	C->SetActorTickInterval(PlayerDist > 12000.0f ? 0.2f : 0.0f);

	TimeInState += DeltaSeconds;
	DecisionTimer -= DeltaSeconds;
	if (DecisionTimer <= 0.0f)
	{
		DecisionTimer = Interval;
		Decide();
	}
	Execute(DeltaSeconds);
}

FVector AIUCreatureAIController::PickWanderPoint(float RadiusCm)
{
	const AIUCreature* C = Creature.Get();
	for (int32 Try = 0; Try < 8; ++Try)
	{
		const float A = Random.Range(0.0f, 2.0f * PI);
		const float R = Random.Range(RadiusCm * 0.3f, RadiusCm);
		const FVector P = C->HomeLocation + FVector(FMath::Cos(A) * R, FMath::Sin(A) * R, 0.0f);
		if (C->IsLocationWalkable(P)) { return P; }
	}
	return C->HomeLocation;
}

FVector AIUCreatureAIController::VillagePoint(int32 Kind) const
{
	const AIUTribeNPC* NPC = Cast<AIUTribeNPC>(Creature.Get());
	const AIUVillage* V = NPC ? NPC->GetVillage() : nullptr;
	if (!V) { return Creature.IsValid() ? Creature->HomeLocation : FVector::ZeroVector; }
	return V->GetSpot(Kind, NPC->GetSeed(), TimeInState);
}

void AIUCreatureAIController::FaceLocation(const FVector& Location, float DeltaSeconds)
{
	AIUCreature* C = Creature.Get();
	const FVector Dir = (Location - C->GetActorLocation()).GetSafeNormal2D();
	if (Dir.IsNearlyZero()) { return; }
	const FRotator Wanted = Dir.Rotation();
	C->SetActorRotation(FMath::RInterpTo(C->GetActorRotation(), FRotator(0, Wanted.Yaw, 0), DeltaSeconds, 6.0f));
}

void AIUCreatureAIController::MoveTowards(const FVector& Dest, bool bInRun, float AcceptRadius)
{
	AIUCreature* C = Creature.Get();
	FVector ToDest = Dest - C->GetActorLocation();
	const bool bFlying = C->GetCharacterMovement()->MovementMode == MOVE_Flying;
	if (!bFlying) { ToDest.Z = 0.0f; }
	if (ToDest.Size() <= AcceptRadius) { bHasDestination = false; return; }
	C->GetCharacterMovement()->MaxWalkSpeed = bInRun ? C->GetRunSpeed() : C->GetWalkSpeed();
	C->GetCharacterMovement()->MaxFlySpeed = C->GetRunSpeed();
	FVector Dir = ToDest.GetSafeNormal();

	// Probe ahead: blocked or unwalkable (water, cliffs) => steer around.
	const FVector Start = C->GetActorLocation();
	const FVector Ahead = Start + Dir * 250.0f;
	FHitResult Hit;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(IUCreatureProbe), false, C);
	const bool bBlocked = GetWorld()->LineTraceSingleByChannel(Hit, Start, Ahead, ECC_WorldStatic, Params) && !bFlying;
	if (bBlocked || (!bFlying && !C->IsLocationWalkable(Ahead)))
	{
		Dir = Dir.RotateAngleAxis(65.0f * AvoidSign, FVector::UpVector);
	}
	C->AddMovementInput(Dir, 1.0f);
}

void AIUCreatureAIController::MoveAwayFrom(const FVector& From, bool bInRun)
{
	AIUCreature* C = Creature.Get();
	FVector Away = (C->GetActorLocation() - From).GetSafeNormal2D();
	if (Away.IsNearlyZero()) { Away = C->GetActorForwardVector(); }
	MoveTowards(C->GetActorLocation() + Away * 1500.0f, bInRun, 10.0f);
}

void AIUCreatureAIController::Execute(float DeltaSeconds)
{
	AIUCreature* C = Creature.Get();
	AActor* T = Target.Get();
	AIUAnimal* Animal = Cast<AIUAnimal>(C);
	const bool bBird = Animal && Animal->IsFlying();

	// Stuck detection flips the avoidance side.
	StuckTimer += DeltaSeconds;
	if (StuckTimer > 1.5f)
	{
		if (FVector::Dist2D(LastPosition, C->GetActorLocation()) < 40.0f && bHasDestination) { AvoidSign = -AvoidSign; bHasDestination = false; }
		LastPosition = C->GetActorLocation();
		StuckTimer = 0.0f;
	}

	// Birds take off when fleeing and land otherwise.
	if (bBird)
	{
		UCharacterMovementComponent* Move = C->GetCharacterMovement();
		if (State == IUSim::EAIState::Flee && Move->MovementMode != MOVE_Flying) { Move->SetMovementMode(MOVE_Flying); }
		if (State != IUSim::EAIState::Flee && Move->MovementMode == MOVE_Flying && TimeInState > 4.0f) { Move->SetMovementMode(MOVE_Falling); }
		if (Move->MovementMode == MOVE_Flying)
		{
			const UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
			const float Ground = WS ? WS->GetGroundHeightCm(C->GetActorLocation().X, C->GetActorLocation().Y) : 0.0f;
			const float Climb = (Ground + 1800.0f > C->GetActorLocation().Z) ? 1.0f : 0.0f;
			C->AddMovementInput(FVector::UpVector, Climb);
		}
	}

	switch (State)
	{
	case IUSim::EAIState::Wander:
	case IUSim::EAIState::Hunt:
	{
		if (State == IUSim::EAIState::Hunt && T) { MoveTowards(T->GetActorLocation(), false, C->GetAttackRangeCm()); break; }
		if (!bHasDestination)
		{
			const bool bHunterNpc = Cast<AIUTribeNPC>(C) != nullptr;
			Destination = PickWanderPoint(bHunterNpc ? 11000.0f : 2500.0f);
			bHasDestination = true;
		}
		MoveTowards(Destination, false, 150.0f);
		break;
	}
	case IUSim::EAIState::Flee:
		if (T) { MoveAwayFrom(T->GetActorLocation(), true); }
		else if (FVector::Dist2D(NoiseLocation, C->GetActorLocation()) < 4000.0f) { MoveAwayFrom(NoiseLocation, true); }
		else if (Cast<AIUTribeNPC>(C)) { MoveTowards(VillagePoint(3), true, 150.0f); }
		break;
	case IUSim::EAIState::Chase:
		if (T)
		{
			MoveTowards(T->GetActorLocation(), true, C->GetAttackRangeCm() * 0.7f);
			C->TryAttack(T);
		}
		break;
	case IUSim::EAIState::Attack:
		if (T)
		{
			FaceLocation(T->GetActorLocation(), DeltaSeconds);
			if (!C->TryAttack(T) && FVector::Dist2D(T->GetActorLocation(), C->GetActorLocation()) > C->GetAttackRangeCm() + 60.0f)
			{
				MoveTowards(T->GetActorLocation(), true, C->GetAttackRangeCm() * 0.7f);
			}
		}
		break;
	case IUSim::EAIState::Alert:
	case IUSim::EAIState::Warn:
		if (T) { FaceLocation(T->GetActorLocation(), DeltaSeconds); }
		if (State == IUSim::EAIState::Warn)
		{
			if (AIUTribeNPC* NPC = Cast<AIUTribeNPC>(C))
			{
				// Walk up to the intruder and stand in their way.
				if (T && FVector::Dist2D(T->GetActorLocation(), C->GetActorLocation()) > 400.0f) { MoveTowards(T->GetActorLocation(), false, 350.0f); }
				NPC->TickWarning(DeltaSeconds, T);
			}
		}
		break;
	case IUSim::EAIState::Investigate:
		MoveTowards(NoiseLocation, bRun, 300.0f);
		break;
	case IUSim::EAIState::ReturnHome:
		MoveTowards(C->HomeLocation, bRun, 400.0f);
		break;
	case IUSim::EAIState::Patrol:
		if (!bHasDestination) { Destination = VillagePoint(1); bHasDestination = true; }
		MoveTowards(Destination, false, 200.0f);
		break;
	case IUSim::EAIState::Work:
		if (!bHasDestination) { Destination = VillagePoint(0); bHasDestination = true; }
		MoveTowards(Destination, false, 150.0f);
		if (!bHasDestination && FMath::Fmod(TimeInState, 3.0f) < DeltaSeconds) { C->PlayGesture(); }
		break;
	case IUSim::EAIState::Cook:
	case IUSim::EAIState::Socialize:
	{
		const FVector Fire = VillagePoint(2);
		if (FVector::Dist2D(Fire, C->GetActorLocation()) > 450.0f) { MoveTowards(Fire, false, 400.0f); }
		else { FaceLocation(Fire, DeltaSeconds); }
		if (State == IUSim::EAIState::Socialize)
		{
			if (AIUTribeNPC* NPC = Cast<AIUTribeNPC>(C))
			{
				if (NPC->GetSpeech().IsEmpty() && Random.Chance(0.002f))
				{
					AIUVillage* V = NPC->GetVillage();
					NPC->Say(V ? V->RandomChatter(Random) : FString(TEXT("...")), 4.0f);
				}
			}
		}
		break;
	}
	case IUSim::EAIState::Guard:
	{
		const FVector Post = VillagePoint(4);
		if (FVector::Dist2D(Post, C->GetActorLocation()) > 250.0f) { MoveTowards(Post, false, 200.0f); }
		break;
	}
	case IUSim::EAIState::Sleep:
		if (Cast<AIUTribeNPC>(C))
		{
			const FVector Bed = VillagePoint(3);
			if (FVector::Dist2D(Bed, C->GetActorLocation()) > 250.0f) { MoveTowards(Bed, false, 200.0f); C->AnimState = IUSim::EAIState::Wander; }
			else { C->AnimState = IUSim::EAIState::Sleep; }
		}
		break;
	case IUSim::EAIState::Idle:
	case IUSim::EAIState::Graze:
		break;
	}
}
