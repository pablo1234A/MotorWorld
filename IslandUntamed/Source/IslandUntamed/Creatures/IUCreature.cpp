#include "Creatures/IUCreature.h"

#include "Core/IUAssets.h"
#include "Core/IUTypes.h"
#include "Creatures/IUCreatureAIController.h"
#include "Player/IUCharacter.h"
#include "World/IUWorldSubsystem.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/DamageEvents.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/DamageType.h"
#include "Kismet/GameplayStatics.h"

AIUCreature::AIUCreature()
{
	PrimaryActorTick.bCanEverTick = true;
	AIControllerClass = AIUCreatureAIController::StaticClass();
	AutoPossessAI = EAutoPossessAI::PlacedInWorldOrSpawned;
	bUseControllerRotationYaw = false;

	UCharacterMovementComponent* Move = GetCharacterMovement();
	Move->bOrientRotationToMovement = true;
	Move->RotationRate = FRotator(0.0f, 360.0f, 0.0f);
	Move->MaxWalkSpeed = 200.0f;
	Move->bUseRVOAvoidance = true;
	Move->AvoidanceConsiderationRadius = 300.0f;

	GetMesh()->SetVisibility(false);
	GetMesh()->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	GetCapsuleComponent()->SetCollisionResponseToChannel(IU_TRACE_INTERACT, ECR_Block);

	BodyRoot = CreateDefaultSubobject<USceneComponent>(TEXT("BodyRoot"));
	BodyRoot->SetupAttachment(GetCapsuleComponent());
}

void AIUCreature::ConfigureStats(float InHealth, float InWalk, float InRun, float InDamage, float InAttackRangeCm, float InAttackInterval, float InSightCm, float InHearingCm)
{
	MaxHealth = Health = InHealth;
	WalkSpeed = InWalk;
	RunSpeed = InRun;
	AttackDamage = InDamage;
	AttackRangeCm = InAttackRangeCm;
	AttackInterval = InAttackInterval;
	SightRadiusCm = InSightCm;
	HearingRadiusCm = InHearingCm;
	GetCharacterMovement()->MaxWalkSpeed = WalkSpeed;
}

void AIUCreature::BuildBody(EIUBodyShape Shape, float L, const FLinearColor& Color, const FLinearColor& Accent)
{
	BodyShape = Shape;
	UIUAssets* Assets = UIUAssets::Get(this);
	if (!Assets) { return; }

	// Capsule matches the body; the visual root sits on the ground.
	float Radius = L * 0.3f;
	float HalfHeight = L * 0.4f;
	switch (Shape)
	{
	case EIUBodyShape::Humanoid: Radius = 34.0f; HalfHeight = L * 0.5f; break;
	case EIUBodyShape::Reptile: Radius = L * 0.18f; HalfHeight = FMath::Max(Radius, L * 0.15f); break;
	case EIUBodyShape::Snake: Radius = 20.0f; HalfHeight = 20.0f; break;
	case EIUBodyShape::Crab: Radius = L * 0.45f; HalfHeight = L * 0.45f; break;
	case EIUBodyShape::Bird: Radius = L * 0.35f; HalfHeight = L * 0.35f; break;
	default: break;
	}
	Radius = FMath::Max(Radius, 12.0f);
	HalfHeight = FMath::Max(HalfHeight, Radius);
	GetCapsuleComponent()->SetCapsuleSize(Radius, HalfHeight);
	BodyRoot->SetRelativeLocation(FVector(0, 0, -HalfHeight));

	const auto MakeLimb = [this, Assets](const FVector& Hip, const FVector& Size, const FLinearColor& C, bool bArm)
	{
		USceneComponent* Pivot = NewObject<USceneComponent>(this);
		Pivot->SetupAttachment(BodyRoot);
		Pivot->SetRelativeLocation(Hip);
		Pivot->RegisterComponent();
		TArray<FIUShapePart> Limb;
		Limb.Add(FIUShapePart(EIUShape::Cylinder, FVector(0, 0, -Size.Z * 0.5f), Size, C, false));
		TArray<UStaticMeshComponent*> Built = Assets->BuildParts(this, Pivot, Limb, true);
		if (bArm) { ArmParts.Add(Built[0]); }
		else { LegParts.Add(Built[0]); }
	};

	TArray<FIUShapePart> Body;
	switch (Shape)
	{
	case EIUBodyShape::Quadruped:
	case EIUBodyShape::Feline:
	{
		const bool bCat = Shape == EIUBodyShape::Feline;
		const float LegH = L * (bCat ? 0.38f : 0.45f);
		Body.Add(FIUShapePart(EIUShape::Sphere, FVector(0, 0, LegH + L * 0.12f), FVector(L, L * (bCat ? 0.32f : 0.45f), L * (bCat ? 0.32f : 0.42f)), Color, false));
		Body.Add(FIUShapePart(EIUShape::Cylinder, FVector(-L * 0.55f, 0, LegH + L * 0.1f), FVector(L * 0.06f, L * 0.06f, L * (bCat ? 0.6f : 0.2f)), Color, false, FRotator(bCat ? 70.0f : 45.0f, 0, 0)));
		for (int32 I = 0; I < 4; ++I)
		{
			MakeLimb(FVector((I < 2 ? 1 : -1) * L * 0.3f, (I % 2 ? 1 : -1) * L * 0.13f, LegH), FVector(L * 0.1f, L * 0.1f, LegH), Accent, false);
		}
		TArray<FIUShapePart> Head;
		Head.Add(FIUShapePart(EIUShape::Sphere, FVector(L * 0.55f, 0, LegH + L * 0.3f), FVector(L * 0.32f, L * 0.24f, L * 0.24f), Color, false));
		Head.Add(FIUShapePart(EIUShape::Sphere, FVector(L * 0.72f, 0, LegH + L * 0.26f), FVector(L * 0.14f, L * 0.12f, L * 0.1f), Accent, false));
		const TArray<UStaticMeshComponent*> H = Assets->BuildParts(this, BodyRoot, Head, true);
		HeadPart = H[0];
		break;
	}
	case EIUBodyShape::Reptile:
	{
		Body.Add(FIUShapePart(EIUShape::Sphere, FVector(0, 0, L * 0.12f), FVector(L * 0.7f, L * 0.26f, L * 0.16f), Color, false));
		Body.Add(FIUShapePart(EIUShape::Cone, FVector(-L * 0.6f, 0, L * 0.1f), FVector(L * 0.16f, L * 0.12f, L * 0.6f), Color, false, FRotator(90, 0, 0)));
		for (int32 I = 0; I < 4; ++I)
		{
			MakeLimb(FVector((I < 2 ? 1 : -1) * L * 0.2f, (I % 2 ? 1 : -1) * L * 0.15f, L * 0.1f), FVector(L * 0.06f, L * 0.06f, L * 0.1f), Accent, false);
		}
		TArray<FIUShapePart> Head;
		Head.Add(FIUShapePart(EIUShape::Sphere, FVector(L * 0.45f, 0, L * 0.12f), FVector(L * 0.35f, L * 0.16f, L * 0.1f), Color, false));
		HeadPart = Assets->BuildParts(this, BodyRoot, Head, true)[0];
		break;
	}
	case EIUBodyShape::Crab:
	{
		Body.Add(FIUShapePart(EIUShape::Sphere, FVector(0, 0, L * 0.25f), FVector(L * 0.7f, L, L * 0.35f), Color, false));
		Body.Add(FIUShapePart(EIUShape::Sphere, FVector(L * 0.45f, L * 0.4f, L * 0.3f), FVector(L * 0.3f, L * 0.2f, L * 0.2f), Accent, false));
		Body.Add(FIUShapePart(EIUShape::Sphere, FVector(L * 0.45f, -L * 0.4f, L * 0.3f), FVector(L * 0.3f, L * 0.2f, L * 0.2f), Accent, false));
		for (int32 I = 0; I < 6; ++I)
		{
			MakeLimb(FVector((I / 2 - 1) * L * 0.2f, (I % 2 ? 1 : -1) * L * 0.45f, L * 0.25f), FVector(L * 0.06f, L * 0.06f, L * 0.28f), Accent, false);
		}
		break;
	}
	case EIUBodyShape::Bird:
	{
		Body.Add(FIUShapePart(EIUShape::Sphere, FVector(0, 0, L * 0.5f), FVector(L, L * 0.45f, L * 0.45f), Color, false));
		Body.Add(FIUShapePart(EIUShape::Cone, FVector(L * 0.6f, 0, L * 0.55f), FVector(L * 0.12f, L * 0.12f, L * 0.25f), FLinearColor(0.9f, 0.7f, 0.1f), false, FRotator(-90, 0, 0)));
		for (int32 I = 0; I < 2; ++I)
		{
			USceneComponent* Pivot = NewObject<USceneComponent>(this);
			Pivot->SetupAttachment(BodyRoot);
			Pivot->SetRelativeLocation(FVector(0, (I ? 1 : -1) * L * 0.2f, L * 0.6f));
			Pivot->RegisterComponent();
			TArray<FIUShapePart> Wing;
			Wing.Add(FIUShapePart(EIUShape::Cube, FVector(0, (I ? 1 : -1) * L * 0.5f, 0), FVector(L * 0.5f, L, L * 0.04f), Accent, false));
			WingParts.Add(Assets->BuildParts(this, Pivot, Wing, true)[0]);
		}
		break;
	}
	case EIUBodyShape::Snake:
	{
		for (int32 I = 0; I < 7; ++I)
		{
			const float S = L * (0.12f - I * 0.012f);
			Body.Add(FIUShapePart(EIUShape::Sphere, FVector(-I * L * 0.13f, 0, S * 0.5f), FVector(S * 1.6f, S, S), I % 2 ? Accent : Color, false));
		}
		break;
	}
	case EIUBodyShape::Humanoid:
	{
		const float H = L; // height
		for (int32 I = 0; I < 2; ++I)
		{
			MakeLimb(FVector(0, (I ? 1 : -1) * H * 0.07f, H * 0.48f), FVector(H * 0.09f, H * 0.09f, H * 0.47f), FLinearColor(0.32f, 0.2f, 0.13f), false);
			MakeLimb(FVector(0, (I ? 1 : -1) * H * 0.17f, H * 0.78f), FVector(H * 0.07f, H * 0.07f, H * 0.36f), FLinearColor(0.36f, 0.23f, 0.15f), true);
		}
		Body.Add(FIUShapePart(EIUShape::Cylinder, FVector(0, 0, H * 0.64f), FVector(H * 0.2f, H * 0.28f, H * 0.34f), Accent, false));
		Body.Add(FIUShapePart(EIUShape::Cylinder, FVector(0, 0, H * 0.47f), FVector(H * 0.22f, H * 0.3f, H * 0.08f), Color, false));
		TArray<FIUShapePart> Head;
		Head.Add(FIUShapePart(EIUShape::Sphere, FVector(0, 0, H * 0.89f), FVector(H * 0.13f, H * 0.12f, H * 0.15f), FLinearColor(0.36f, 0.23f, 0.15f), false));
		Head.Add(FIUShapePart(EIUShape::Cube, FVector(H * 0.06f, 0, H * 0.9f), FVector(H * 0.02f, H * 0.1f, H * 0.04f), Color, false));
		HeadPart = Assets->BuildParts(this, BodyRoot, Head, true)[0];
		break;
	}
	}
	Assets->BuildParts(this, BodyRoot, Body, true);
}

bool AIUCreature::IsThreatenedBy(const AActor* Other) const
{
	return Other && Other->IsA<AIUCharacter>();
}

bool AIUCreature::IsLocationWalkable(const FVector& Location) const
{
	const UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!WS || !WS->GetIsland() || IU::IsUnderground(Location)) { return true; }
	const float Ground = WS->GetGroundHeightCm(Location.X, Location.Y);
	const float Water = WS->GetWaterLevelCm(Location.X, Location.Y);
	if (BodyShape != EIUBodyShape::Bird && BodyShape != EIUBodyShape::Reptile && Water - Ground > 70.0f) { return false; }
	const IUSim::Vec3 N = WS->GetIsland()->GetNormal(Location.X * IU::CmToMeters, Location.Y * IU::CmToMeters);
	return N.Z > 0.62f;
}

bool AIUCreature::TryAttack(AActor* Target)
{
	if (!Target || !IsAlive()) { return false; }
	const double Now = GetWorld()->GetTimeSeconds();
	if (Now - LastAttackTime < AttackInterval) { return false; }
	const float Reach = AttackRangeCm + GetCapsuleComponent()->GetScaledCapsuleRadius() + 40.0f;
	if (FVector::Dist2D(Target->GetActorLocation(), GetActorLocation()) > Reach) { return false; }
	LastAttackTime = Now;
	AttackAnim = 1.0f;
	PendingAttackTarget = Target;
	PendingAttackDelay = 0.3f;
	return true;
}

void AIUCreature::ApplyAttackHit(AActor* Target)
{
	UGameplayStatics::ApplyDamage(Target, AttackDamage, GetController(), this, UDamageType::StaticClass());
}

float AIUCreature::TakeDamage(float DamageAmount, FDamageEvent const& DamageEvent, AController* EventInstigator, AActor* DamageCauser)
{
	if (!IsAlive()) { return 0.0f; }
	const float Applied = Super::TakeDamage(DamageAmount, DamageEvent, EventInstigator, DamageCauser);
	Health -= DamageAmount;
	LastDamageTime = GetWorld()->GetTimeSeconds();
	AActor* Causer = EventInstigator && EventInstigator->GetPawn() ? EventInstigator->GetPawn() : DamageCauser;
	if (Causer && Causer->GetOwner() && Causer->GetOwner()->IsA<APawn>()) { Causer = Causer->GetOwner(); } // arrows
	LastDamageCauser = Causer;
	if (Health <= 0.0f)
	{
		Health = 0.0f;
		OnDeath(Causer);
	}
	return Applied;
}

void AIUCreature::OnDeath(AActor* Killer)
{
	GetCharacterMovement()->StopMovementImmediately();
	GetCharacterMovement()->DisableMovement();
	GetCapsuleComponent()->SetCollisionResponseToChannel(ECC_Pawn, ECR_Ignore);
	DeathAnim = 0.001f;
	SetLifeSpan(600.0f);
}

void AIUCreature::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (PendingAttackDelay > 0.0f)
	{
		PendingAttackDelay -= DeltaSeconds;
		if (PendingAttackDelay <= 0.0f && IsAlive())
		{
			AActor* Target = PendingAttackTarget.Get();
			const float Reach = AttackRangeCm + GetCapsuleComponent()->GetScaledCapsuleRadius() + 80.0f;
			if (Target && FVector::Dist2D(Target->GetActorLocation(), GetActorLocation()) <= Reach) { ApplyAttackHit(Target); }
		}
	}
	AnimateBody(DeltaSeconds);
}

void AIUCreature::AnimateBody(float DeltaSeconds)
{
	if (DeathAnim > 0.0f)
	{
		DeathAnim = FMath::Min(1.0f, DeathAnim + DeltaSeconds * 1.8f);
		BodyRoot->SetRelativeRotation(FRotator(0, 0, 90.0f * DeathAnim));
		return;
	}
	const float Speed = GetVelocity().Size2D();
	const float SpeedRatio = FMath::Clamp(Speed / FMath::Max(RunSpeed, 1.0f), 0.0f, 1.0f);
	WalkPhase += DeltaSeconds * (2.0f + Speed / 45.0f);
	const bool bSleeping = AnimState == IUSim::EAIState::Sleep;
	const float Amp = Speed > 10.0f ? 25.0f + 20.0f * SpeedRatio : 0.0f;

	for (int32 I = 0; I < LegParts.Num(); ++I)
	{
		USceneComponent* Pivot = LegParts[I] ? LegParts[I]->GetAttachParent() : nullptr;
		if (!Pivot) { continue; }
		const bool bOpposite = ((I % 2) != 0) != (((I / 2) % 2) != 0);
		const float Phase = WalkPhase + (bOpposite ? PI : 0.0f);
		const float Pitch = bSleeping ? 70.0f : FMath::Sin(Phase) * Amp;
		Pivot->SetRelativeRotation(FRotator(Pitch, 0, 0));
	}
	for (int32 I = 0; I < ArmParts.Num(); ++I)
	{
		USceneComponent* Pivot = ArmParts[I] ? ArmParts[I]->GetAttachParent() : nullptr;
		if (!Pivot) { continue; }
		const float Swing = FMath::Sin(WalkPhase + (I % 2 ? 0.0f : PI)) * Amp * 0.8f;
		const float Strike = (I == 0) ? AttackAnim * -110.0f : 0.0f;
		Pivot->SetRelativeRotation(FRotator(Swing + Strike, 0, 0));
	}
	for (int32 I = 0; I < WingParts.Num(); ++I)
	{
		USceneComponent* Pivot = WingParts[I] ? WingParts[I]->GetAttachParent() : nullptr;
		if (!Pivot) { continue; }
		const float Flap = (Speed > 50.0f ? 35.0f : 5.0f) * FMath::Sin(WalkPhase * 3.0f);
		Pivot->SetRelativeRotation(FRotator(0, 0, (I ? 1.0f : -1.0f) * Flap));
	}

	AttackAnim = FMath::Max(0.0f, AttackAnim - DeltaSeconds * 2.5f);
	const float Lunge = FMath::Sin(AttackAnim * PI) * 35.0f;
	const float Bob = FMath::Abs(FMath::Sin(WalkPhase)) * 3.0f * SpeedRatio;
	const float SleepDrop = bSleeping ? -GetCapsuleComponent()->GetScaledCapsuleHalfHeight() * 0.35f : 0.0f;
	BodyRoot->SetRelativeLocation(FVector(Lunge, 0, -GetCapsuleComponent()->GetScaledCapsuleHalfHeight() + Bob + SleepDrop));
	if (BodyShape == EIUBodyShape::Snake)
	{
		BodyRoot->SetRelativeRotation(FRotator(0, FMath::Sin(WalkPhase * 1.5f) * 12.0f, 0));
	}
	if (HeadPart)
	{
		const bool bAlert = AnimState == IUSim::EAIState::Alert || AnimState == IUSim::EAIState::Warn;
		const bool bGraze = AnimState == IUSim::EAIState::Graze && BodyShape != EIUBodyShape::Humanoid;
		HeadPart->SetRelativeRotation(FRotator(bGraze ? -35.0f : (bAlert ? 12.0f : 0.0f), 0, 0));
	}
}
