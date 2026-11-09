#include "Player/IUCharacter.h"

#include "IslandUntamed.h"
#include "Audio/IUAudioDirector.h"
#include "Core/IUAssets.h"
#include "Core/IUGameInstance.h"
#include "Core/IUPlayerController.h"
#include "Core/IUTypes.h"
#include "Player/IUBuildComponent.h"
#include "Player/IUCombatComponent.h"
#include "Player/IUCraftingComponent.h"
#include "Player/IUFishingComponent.h"
#include "Player/IUInteractionComponent.h"
#include "Player/IUInventoryComponent.h"
#include "Player/IUSurvivalComponent.h"
#include "World/IUIslandWorld.h"
#include "World/IUResourceActor.h"
#include "World/IUVisuals.h"
#include "World/IUWorldSubsystem.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/DamageEvents.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Perception/AISense_Hearing.h"
#include "Sim/SimCombat.h"

namespace IUCharacterLocal
{
	constexpr float WalkSpeed = 380.0f;
	constexpr float SprintSpeed = 680.0f;
	constexpr float CrouchSpeed = 190.0f;
	constexpr float SwimSpeed = 300.0f;
	constexpr float EyeHeight = 70.0f;
}

AIUCharacter::AIUCharacter()
{
	PrimaryActorTick.bCanEverTick = true;
	GetCapsuleComponent()->InitCapsuleSize(38.0f, 92.0f);
	GetCapsuleComponent()->SetCollisionResponseToChannel(IU_TRACE_INTERACT, ECR_Ignore);
	GetMesh()->SetVisibility(false);
	bUseControllerRotationYaw = true;

	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(GetCapsuleComponent());
	Camera->SetRelativeLocation(FVector(0, 0, IUCharacterLocal::EyeHeight));
	Camera->bUsePawnControlRotation = true;
	Camera->SetFieldOfView(90.0f);

	HandRoot = CreateDefaultSubobject<USceneComponent>(TEXT("HandRoot"));
	HandRoot->SetupAttachment(Camera);
	HandRoot->SetRelativeLocation(FVector(45, 22, -24));

	TorchLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("TorchLight"));
	TorchLight->SetupAttachment(Camera);
	TorchLight->SetRelativeLocation(FVector(40, 25, 10));
	TorchLight->SetIntensity(5000.0f);
	TorchLight->SetAttenuationRadius(1300.0f);
	TorchLight->SetLightColor(FLinearColor(1.0f, 0.6f, 0.3f));
	TorchLight->SetCastShadows(true);
	TorchLight->SetVisibility(false);

	Survival = CreateDefaultSubobject<UIUSurvivalComponent>(TEXT("Survival"));
	Inventory = CreateDefaultSubobject<UIUInventoryComponent>(TEXT("Inventory"));
	Interaction = CreateDefaultSubobject<UIUInteractionComponent>(TEXT("Interaction"));
	Combat = CreateDefaultSubobject<UIUCombatComponent>(TEXT("Combat"));
	Build = CreateDefaultSubobject<UIUBuildComponent>(TEXT("Build"));
	Fishing = CreateDefaultSubobject<UIUFishingComponent>(TEXT("Fishing"));
	Crafting = CreateDefaultSubobject<UIUCraftingComponent>(TEXT("Crafting"));

	UCharacterMovementComponent* Move = GetCharacterMovement();
	Move->MaxWalkSpeed = IUCharacterLocal::WalkSpeed;
	Move->MaxWalkSpeedCrouched = IUCharacterLocal::CrouchSpeed;
	Move->MaxFlySpeed = IUCharacterLocal::SwimSpeed;
	Move->JumpZVelocity = 460.0f;
	Move->AirControl = 0.25f;
	Move->GetNavAgentPropertiesRef().bCanCrouch = true;
	Move->SetWalkableFloorAngle(48.0f);
	Move->MaxStepHeight = 50.0f;
	Move->BrakingDecelerationFlying = 1200.0f;
}

void AIUCharacter::BeginPlay()
{
	Super::BeginPlay();
	Inventory->Setup(30, 45.0f, true, true);
	Inventory->DisplayName = NSLOCTEXT("IU", "Backpack", "Mochila");
	Inventory->OnChanged.AddWeakLambda(this, [this]() { UpdateHeldVisual(); });
	Survival->OnDeath.AddUObject(this, &AIUCharacter::HandleDeath);
	if (const UIUGameInstance* GI = UIUGameInstance::Get(this)) { Camera->SetFieldOfView(GI->FieldOfView); }
}

AIUPlayerController* AIUCharacter::GetIUController() const
{
	return Cast<AIUPlayerController>(GetController());
}

void AIUCharacter::ResetForNewGame(const FVector& Location, const FRotator& Rotation)
{
	Survival->ResetForNewGame();
	Inventory->Setup(30, 45.0f, true, true);
	SelectedSlot = 0;
	bDeathHandled = false;
	TeleportPlayer(Location, Rotation);
	GetCharacterMovement()->SetMovementMode(MOVE_Walking);
	UpdateHeldVisual();
}

// ------------------------------------------------------------------------------------------------
// Tick
// ------------------------------------------------------------------------------------------------

void AIUCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);

	if (bWaitingForGround)
	{
		AIUIslandWorld* IslandActor = WS ? WS->GetIslandActor() : nullptr;
		const bool bReady = IU::IsUnderground(GetActorLocation()) || !IslandActor || IslandActor->IsGroundReady(GetActorLocation());
		GetCharacterMovement()->SetMovementMode(bReady ? MOVE_Walking : MOVE_None);
		if (bReady) { bWaitingForGround = false; }
	}

	UpdateWater(DeltaSeconds);
	UpdateMovementSpeed();
	UpdateHand(DeltaSeconds);
	DamageFlash = FMath::Max(0.0f, DamageFlash - DeltaSeconds * 1.5f);

	// Activity for the survival model.
	const float Speed = GetVelocity().Size2D();
	IUSim::EActivity Activity = IUSim::EActivity::Idle;
	if (bSwimming) { Activity = IUSim::EActivity::Swim; }
	else if (Combat->IsInCombatRecently()) { Activity = IUSim::EActivity::Combat; }
	else if (Combat->IsWorkingRecently() || Crafting->IsCrafting()) { Activity = IUSim::EActivity::Work; }
	else if (Speed > 450.0f) { Activity = IUSim::EActivity::Sprint; }
	else if (Speed > 20.0f) { Activity = IUSim::EActivity::Walk; }
	Survival->Activity = Activity;

	// Footsteps and noise.
	if (Speed > 20.0f && GetCharacterMovement()->IsMovingOnGround())
	{
		FootstepTimer -= DeltaSeconds * Speed / 300.0f;
		if (FootstepTimer <= 0.0f)
		{
			FootstepTimer = 1.0f;
			PlayActionSound(IsInWater() ? TEXT("step_water") : TEXT("step"));
		}
	}
	NoiseTimer -= DeltaSeconds;
	if (NoiseTimer <= 0.0f && Speed > 450.0f)
	{
		NoiseTimer = 0.6f;
		MakeNoiseEvent(0.8f, 1800.0f);
	}

	// Torches burn down while held.
	const bool bTorch = IsHoldingLitTorch();
	TorchLight->SetVisibility(bTorch);
	if (bTorch)
	{
		TorchLight->SetIntensity(4500.0f + 800.0f * FMath::Sin(GetWorld()->GetTimeSeconds() * 17.0f));
		TorchBurnAccumulator += DeltaSeconds;
		if (TorchBurnAccumulator >= 1.0f)
		{
			TorchBurnAccumulator = 0.0f;
			if (WearHeldItem(1.0f) && WS) { WS->Notify(TEXT("La antorcha se ha consumido"), IU::Palette::TextDim); }
		}
	}
}

void AIUCharacter::UpdateWater(float DeltaSeconds)
{
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!WS || IU::IsUnderground(GetActorLocation()))
	{
		WaterDepthCm = 0.0f;
		if (bSwimming) { bSwimming = false; GetCharacterMovement()->SetMovementMode(MOVE_Falling); }
		return;
	}
	const FVector Loc = GetActorLocation();
	WaterSurfaceZ = WS->GetWaterLevelCm(Loc.X, Loc.Y);
	const float FeetZ = Loc.Z - GetCapsuleComponent()->GetScaledCapsuleHalfHeight();
	WaterDepthCm = WaterSurfaceZ - FeetZ;

	UCharacterMovementComponent* Move = GetCharacterMovement();
	if (!bSwimming && WaterDepthCm > 145.0f && Move->MovementMode != MOVE_None)
	{
		bSwimming = true;
		Move->SetMovementMode(MOVE_Flying);
		PlayActionSound(TEXT("splash"));
	}
	else if (bSwimming && WaterDepthCm < 115.0f)
	{
		bSwimming = false;
		Move->SetMovementMode(MOVE_Walking);
	}
	if (bSwimming)
	{
		// Buoyancy: keep the head around the surface, never fly above it.
		const float HeadZ = Loc.Z + IUCharacterLocal::EyeHeight;
		if (HeadZ > WaterSurfaceZ + 15.0f && Move->Velocity.Z > 0.0f) { Move->Velocity.Z = 0.0f; }
		if (HeadZ < WaterSurfaceZ - 20.0f) { Move->Velocity.Z = FMath::Min(Move->Velocity.Z + 300.0f * DeltaSeconds, 120.0f); }
	}
}

void AIUCharacter::UpdateMovementSpeed()
{
	const IUSim::SurvivalEffects& Fx = Survival->Effects();
	const bool bCanSprint = bSprintHeld && Fx.bCanSprint && Survival->Model().State.Stamina > 5.0f && !bIsCrouched && !Build->IsActive();
	float Speed = bCanSprint ? IUCharacterLocal::SprintSpeed : IUCharacterLocal::WalkSpeed;
	Speed *= Fx.MoveSpeedMultiplier;
	if (IsInWater() && !bSwimming) { Speed *= 0.7f; }
	if (Combat->IsBlocking() || Combat->IsDrawingBow()) { Speed *= 0.55f; }
	GetCharacterMovement()->MaxWalkSpeed = Speed;
	GetCharacterMovement()->MaxFlySpeed = IUCharacterLocal::SwimSpeed * Fx.MoveSpeedMultiplier * (bCanSprint ? 1.4f : 1.0f);
}

void AIUCharacter::Landed(const FHitResult& Hit)
{
	Super::Landed(Hit);
	const float FallSpeed = -GetCharacterMovement()->Velocity.Z * IU::CmToMeters;
	if (FallSpeed > 10.0f && !IsInWater())
	{
		UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
		const bool bHadFracture = Survival->Model().State.bFracture;
		IUSim::Rng R(static_cast<uint64>(GetWorld()->GetTimeSeconds() * 1000.0));
		Survival->Model().ApplyFallDamage(FallSpeed, R);
		DamageFlash = 1.0f;
		PlayActionSound(TEXT("hurt"));
		if (WS && !bHadFracture && Survival->Model().State.bFracture) { WS->Notify(TEXT("¡Te has fracturado una pierna! Usa una ferula."), IU::Palette::Bad); }
	}
	PlayActionSound(TEXT("land"));
}

// ------------------------------------------------------------------------------------------------
// Input
// ------------------------------------------------------------------------------------------------

void AIUCharacter::InputMove(const FVector2D& Axis)
{
	if (bControlLocked || IsDead()) { return; }
	const FRotator Yaw(0, GetControlRotation().Yaw, 0);
	if (bSwimming)
	{
		// Swim towards where the camera looks.
		const FRotator Full = GetControlRotation();
		AddMovementInput(Full.Vector(), Axis.Y);
		AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::Y), Axis.X);
		return;
	}
	AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::X), Axis.Y);
	AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::Y), Axis.X);
}

void AIUCharacter::InputLook(const FVector2D& Axis)
{
	if (bControlLocked || IsDead()) { return; }
	const UIUGameInstance* GI = UIUGameInstance::Get(this);
	const float Sens = GI ? GI->MouseSensitivity : 1.0f;
	const float InvertY = (GI && GI->bInvertY) ? -1.0f : 1.0f;
	AddControllerYawInput(Axis.X * Sens);
	AddControllerPitchInput(-Axis.Y * Sens * InvertY);
}

void AIUCharacter::InputJump(bool bPressed)
{
	if (bControlLocked || IsDead()) { return; }
	if (bSwimming)
	{
		if (bPressed) { AddMovementInput(FVector::UpVector, 1.0f); }
		return;
	}
	if (bPressed && Survival->Model().SpendStamina(8.0f)) { Jump(); }
	else if (!bPressed) { StopJumping(); }
}

void AIUCharacter::InputSprint(bool bPressed) { bSprintHeld = bPressed; }

void AIUCharacter::InputCrouch()
{
	if (bControlLocked || bSwimming) { return; }
	if (bIsCrouched) { UnCrouch(); } else { Crouch(); }
}

void AIUCharacter::InputPrimary(bool bPressed)
{
	if (bControlLocked || IsDead()) { return; }
	if (Build->IsActive()) { if (bPressed) { Build->Confirm(); } return; }
	const IUSim::ItemDef* Def = GetHeldItemDef();
	if (Def && Def->Tool.Type == IUSim::EToolType::FishingRod) { Fishing->Primary(bPressed); return; }
	if (Def && Def->Weapon.Kind == IUSim::EWeaponKind::Ranged) { Combat->BowInput(bPressed); return; }
	if (!bPressed) { return; }
	if (Def && (Def->bHasFood || Def->bHasMedicine) && Def->Category != IUSim::EItemCategory::Tool && Def->Category != IUSim::EItemCategory::Weapon)
	{
		UseHeldConsumable();
		return;
	}
	if (Def && Def->Tool.Type == IUSim::EToolType::WaterContainer) { Interaction->FillFlask(); return; }
	Combat->StartMeleeAttack();
}

void AIUCharacter::InputSecondary(bool bPressed)
{
	if (bControlLocked || IsDead()) { return; }
	if (Build->IsActive()) { if (bPressed) { Build->Cancel(); } return; }
	if (Fishing->IsActive()) { if (bPressed) { Fishing->Cancel(); } return; }
	Combat->SetBlocking(bPressed);
}

void AIUCharacter::InputInteract()
{
	if (bControlLocked || IsDead()) { return; }
	Interaction->Interact();
}

void AIUCharacter::InputInteractSecondary()
{
	if (bControlLocked || IsDead()) { return; }
	Interaction->InteractSecondary();
}

void AIUCharacter::InputDodge()
{
	if (bControlLocked || IsDead() || bSwimming) { return; }
	Combat->Dodge();
}

void AIUCharacter::InputRotateBuild(float Direction)
{
	if (Build->IsActive()) { Build->Rotate(Direction); }
}

void AIUCharacter::InputDeconstruct()
{
	if (Build->IsActive()) { Build->DeconstructTarget(); }
}

void AIUCharacter::SelectHotbar(int32 Index)
{
	if (Index < 0 || Index > 7) { return; }
	if (SelectedSlot != Index)
	{
		Fishing->Cancel();
		Combat->CancelActions();
	}
	SelectedSlot = Index;
	UpdateHeldVisual();
}

void AIUCharacter::CycleHotbar(int32 Direction)
{
	SelectHotbar((SelectedSlot + Direction + 8) % 8);
}

void AIUCharacter::DropSelected()
{
	if (bControlLocked) { return; }
	Inventory->DropSlot(SelectedSlot, 0);
}

// ------------------------------------------------------------------------------------------------
// Held item
// ------------------------------------------------------------------------------------------------

std::string AIUCharacter::GetHeldItemId() const
{
	const IUSim::ItemStack& S = Inventory->Inv().GetSlot(SelectedSlot);
	return S.IsEmpty() ? std::string() : S.ItemId;
}

const IUSim::ItemDef* AIUCharacter::GetHeldItemDef() const
{
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	const std::string Id = GetHeldItemId();
	return (Db && !Id.empty()) ? Db->Items.Find(Id) : nullptr;
}

bool AIUCharacter::IsHoldingLitTorch() const
{
	const IUSim::ItemDef* Def = GetHeldItemDef();
	return Def && Def->Tool.Type == IUSim::EToolType::Torch && !bSwimming;
}

bool AIUCharacter::UseHeldConsumable()
{
	const std::string Id = GetHeldItemId();
	if (Id.empty() || !Survival->Consume(Id)) { return false; }
	Inventory->RemoveItem(Id, 1);
	PlayActionSound(TEXT("eat"));
	return true;
}

bool AIUCharacter::WearHeldItem(float Amount)
{
	const bool bBroke = Inventory->Inv().DamageDurability(SelectedSlot, Amount);
	Inventory->MarkChanged();
	if (bBroke)
	{
		PlayActionSound(TEXT("break"));
	}
	return bBroke;
}

void AIUCharacter::UpdateHeldVisual()
{
	const std::string Id = GetHeldItemId();
	if (Id == HeldVisualId) { return; }
	HeldVisualId = Id;
	for (UStaticMeshComponent* C : HeldParts) { if (C) { C->DestroyComponent(); } }
	HeldParts.Reset();
	const IUSim::ItemDef* Def = GetHeldItemDef();
	UIUAssets* Assets = UIUAssets::Get(this);
	if (!Def || !Assets) { return; }
	TArray<FIUShapePart> Parts = IUVisuals::ItemParts(Def->MeshHint);
	for (FIUShapePart& P : Parts) { P.bCollision = false; }
	for (UStaticMeshComponent* C : Assets->BuildParts(this, HandRoot, Parts, false))
	{
		C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		HeldParts.Add(C);
	}
}

void AIUCharacter::UpdateHand(float DeltaSeconds)
{
	const float Speed = GetVelocity().Size2D();
	BobPhase += DeltaSeconds * (Speed > 20.0f ? Speed / 55.0f : 1.0f);
	const float BobAmp = Speed > 20.0f ? 1.6f : 0.4f;
	const float Swing = FMath::Sin(HandSwing * PI);
	const FVector Base(45.0f, 22.0f, -24.0f);
	const FVector Bob(0.0f, FMath::Sin(BobPhase) * BobAmp, FMath::Abs(FMath::Cos(BobPhase)) * BobAmp);
	const FVector Block = Combat->IsBlocking() ? FVector(-5, -14, 10) : FVector::ZeroVector;
	HandRoot->SetRelativeLocation(Base + Bob + Block + FVector(Swing * 12.0f, -Swing * 10.0f, Swing * 6.0f));
	HandRoot->SetRelativeRotation(FRotator(-Swing * 70.0f + (Combat->IsBlocking() ? 40.0f : 10.0f), Swing * -15.0f, Combat->IsBlocking() ? -60.0f : 0.0f));
}

// ------------------------------------------------------------------------------------------------
// Damage / death
// ------------------------------------------------------------------------------------------------

float AIUCharacter::TakeDamage(float DamageAmount, FDamageEvent const& DamageEvent, AController* EventInstigator, AActor* DamageCauser)
{
	if (IsDead() || bControlLocked) { return 0.0f; }
	IUSim::AttackInfo Attack;
	Attack.BaseDamage = DamageAmount;
	IUSim::DefenseInfo Defense;
	Defense.bBlocking = Combat->IsBlocking();
	Defense.bDodging = Combat->IsDodging();
	Defense.Stamina = Survival->Model().State.Stamina;
	Defense.Armor = Inventory->GetArmorProtection();
	const IUSim::ItemDef* Held = GetHeldItemDef();
	Defense.BlockReduction = Held ? Held->Weapon.BlockReduction : 0.2f;
	const IUSim::HitResult R = IUSim::ResolveHit(Attack, Defense);
	if (R.bEvaded) { return 0.0f; }
	Survival->Model().State.Stamina = FMath::Max(0.0f, Survival->Model().State.Stamina - R.StaminaDrain);
	if (R.bBlocked) { PlayActionSound(TEXT("block")); WearHeldItem(1.0f); }
	if (R.bGuardBroken) { Combat->SetBlocking(false); }
	const float Applied = Survival->ApplyDamage(R.Damage, DamageCauser && DamageCauser->IsA<APawn>());
	DamageFlash = FMath::Clamp(Applied / 25.0f, 0.3f, 1.0f);
	if (Applied > 0.0f) { PlayActionSound(TEXT("hurt")); }
	Super::TakeDamage(Applied, DamageEvent, EventInstigator, DamageCauser);
	return Applied;
}

bool AIUCharacter::IsDead() const
{
	return Survival && Survival->IsDead();
}

void AIUCharacter::HandleDeath()
{
	if (bDeathHandled) { return; }
	bDeathHandled = true;
	Fishing->Cancel();
	Build->Cancel();
	GetCharacterMovement()->DisableMovement();
	if (AIUPlayerController* PC = GetIUController()) { PC->OnPlayerDied(); }
}

// ------------------------------------------------------------------------------------------------
// Actions
// ------------------------------------------------------------------------------------------------

void AIUCharacter::PlayActionSound(const TCHAR* Cue)
{
	if (AIUAudioDirector* Audio = AIUAudioDirector::Get(this)) { Audio->PlayCue(FName(Cue), GetActorLocation()); }
}

void AIUCharacter::MakeNoiseEvent(float Loudness, float RangeCm)
{
	UAISense_Hearing::ReportNoiseEvent(GetWorld(), GetActorLocation(), Loudness, this, RangeCm);
}

void AIUCharacter::OpenContainer(UIUInventoryComponent* Container, const FText& Title)
{
	if (AIUPlayerController* PC = GetIUController()) { PC->OpenContainer(Container, Title); }
}

void AIUCharacter::OpenDocument(const FString& DocId)
{
	if (AIUPlayerController* PC = GetIUController()) { PC->OpenDocument(DocId); }
}

void AIUCharacter::OpenTribeDialogue(AIUTribeNPC* NPC)
{
	if (AIUPlayerController* PC = GetIUController()) { PC->OpenTribeDialogue(NPC); }
}

void AIUCharacter::OpenCrafting()
{
	if (AIUPlayerController* PC = GetIUController()) { PC->OpenCraftingScreen(); }
}

void AIUCharacter::Sleep(bool bInBed)
{
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!WS) { return; }
	FText Reason;
	if (!WS->TrySleep(this, bInBed, Reason))
	{
		WS->Notify(Reason.ToString(), IU::Palette::Bad);
		return;
	}
	if (AIUPlayerController* PC = GetIUController()) { PC->PlaySleepFade(); }
}

void AIUCharacter::HarvestActor(AIUResourceActor* Resource)
{
	Combat->HarvestResourceActor(Resource, true);
}

void AIUCharacter::TeleportPlayer(const FVector& Location, const FRotator& Rotation)
{
	SetActorLocation(Location, false, nullptr, ETeleportType::TeleportPhysics);
	if (AController* C = GetController()) { C->SetControlRotation(FRotator(0, Rotation.Yaw, 0)); }
	GetCharacterMovement()->StopMovementImmediately();
	if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this))
	{
		if (AIUIslandWorld* IslandActor = WS->GetIslandActor()) { IslandActor->SetFocus(Location, !IU::IsUnderground(Location)); }
	}
	WaitForGround();
}
