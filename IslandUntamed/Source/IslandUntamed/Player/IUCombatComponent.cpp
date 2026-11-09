#include "Player/IUCombatComponent.h"

#include "Core/IUGameInstance.h"
#include "Core/IUTypes.h"
#include "Creatures/IUCreature.h"
#include "Creatures/IUVillage.h"
#include "Gameplay/IUArrowProjectile.h"
#include "Gameplay/IUStructure.h"
#include "Player/IUCharacter.h"
#include "Player/IUInteractionComponent.h"
#include "Player/IUInventoryComponent.h"
#include "Player/IUSurvivalComponent.h"
#include "World/IUIslandWorld.h"
#include "World/IUResourceActor.h"
#include "World/IUWorldSubsystem.h"
#include "Camera/CameraComponent.h"
#include "Engine/World.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/DamageType.h"
#include "Kismet/GameplayStatics.h"

namespace IUCombatLocal
{
	constexpr float FistDamage = 5.0f;
	constexpr float FistReach = 1.4f;
	constexpr float FistInterval = 0.55f;
	constexpr float FistStamina = 5.0f;
	constexpr float DodgeStamina = 20.0f;
}

UIUCombatComponent::UIUCombatComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
}

AIUCharacter* UIUCombatComponent::GetCharacter() const
{
	return Cast<AIUCharacter>(GetOwner());
}

bool UIUCombatComponent::IsDodging() const
{
	return GetWorld() && GetWorld()->GetTimeSeconds() < DodgeUntil;
}

bool UIUCombatComponent::IsInCombatRecently() const
{
	return GetWorld() && GetWorld()->GetTimeSeconds() - LastCombatTime < 3.0;
}

bool UIUCombatComponent::IsWorkingRecently() const
{
	return GetWorld() && GetWorld()->GetTimeSeconds() - LastWorkTime < 1.5;
}

float UIUCombatComponent::GetBowCharge() const
{
	return bDrawing && GetWorld() ? FMath::Clamp(static_cast<float>(GetWorld()->GetTimeSeconds() - DrawStart) / 1.1f, 0.0f, 1.0f) : 0.0f;
}

void UIUCombatComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	AIUCharacter* Character = GetCharacter();
	if (!Character) { return; }
	if (SwingTime > 0.0f)
	{
		SwingTime = FMath::Max(0.0f, SwingTime - DeltaTime);
		Character->HandSwing = 1.0f - SwingTime / SwingDuration;
	}
	else
	{
		Character->HandSwing = bDrawing ? GetBowCharge() * 0.25f : 0.0f;
	}
	if (bHitPending)
	{
		HitDelay -= DeltaTime;
		if (HitDelay <= 0.0f)
		{
			bHitPending = false;
			PerformMeleeHit();
		}
	}
	// Blocking drains a little stamina and stops regeneration.
	if (bBlocking)
	{
		IUSim::SurvivalState& S = Character->GetSurvival()->Model().State;
		S.Stamina = FMath::Max(0.0f, S.Stamina - 4.0f * DeltaTime);
		if (S.Stamina <= 0.0f) { bBlocking = false; }
	}
}

void UIUCombatComponent::CancelActions()
{
	bBlocking = false;
	bDrawing = false;
	bHitPending = false;
}

void UIUCombatComponent::SetBlocking(bool bInBlocking)
{
	const AIUCharacter* Character = GetCharacter();
	const IUSim::ItemDef* Def = Character ? Character->GetHeldItemDef() : nullptr;
	// Bows cannot block; everything else (including fists) can.
	if (Def && Def->Weapon.Kind == IUSim::EWeaponKind::Ranged) { bBlocking = false; return; }
	bBlocking = bInBlocking && Character && Character->GetSurvival()->Model().State.Stamina > 5.0f;
}

void UIUCombatComponent::Dodge()
{
	AIUCharacter* Character = GetCharacter();
	if (!Character || IsDodging() || !Character->GetCharacterMovement()->IsMovingOnGround()) { return; }
	if (!Character->GetSurvival()->Model().SpendStamina(IUCombatLocal::DodgeStamina)) { return; }
	FVector Dir = Character->GetLastMovementInputVector().GetSafeNormal2D();
	if (Dir.IsNearlyZero()) { Dir = -Character->GetActorForwardVector(); }
	Character->LaunchCharacter(Dir * 950.0f + FVector(0, 0, 160.0f), true, true);
	DodgeUntil = GetWorld()->GetTimeSeconds() + 0.35;
	LastCombatTime = GetWorld()->GetTimeSeconds();
	Character->PlayActionSound(TEXT("dodge"));
}

void UIUCombatComponent::StartMeleeAttack()
{
	AIUCharacter* Character = GetCharacter();
	if (!Character || bBlocking || bDrawing) { return; }
	const double Now = GetWorld()->GetTimeSeconds();
	if (Now < NextAttackTime) { return; }
	const IUSim::ItemDef* Def = Character->GetHeldItemDef();
	const bool bWeapon = Def && Def->Weapon.Kind == IUSim::EWeaponKind::Melee;
	const float Interval = bWeapon ? Def->Weapon.AttackInterval : IUCombatLocal::FistInterval;
	const float Stamina = bWeapon ? Def->Weapon.StaminaCost : IUCombatLocal::FistStamina;
	if (!Character->GetSurvival()->Model().SpendStamina(Stamina))
	{
		if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this)) { WS->Notify(TEXT("Sin resistencia"), IU::Palette::TextDim); }
		return;
	}
	NextAttackTime = Now + Interval;
	SwingDuration = FMath::Clamp(Interval * 0.8f, 0.3f, 0.8f);
	SwingTime = SwingDuration;
	bHitPending = true;
	HitDelay = SwingDuration * 0.4f;
	Character->PlayActionSound(TEXT("swing"));
}

void UIUCombatComponent::PerformMeleeHit()
{
	AIUCharacter* Character = GetCharacter();
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!Character || !WS) { return; }
	const IUSim::ItemDef* Def = Character->GetHeldItemDef();
	const bool bWeapon = Def && Def->Weapon.Kind == IUSim::EWeaponKind::Melee;
	const float Reach = (bWeapon ? Def->Weapon.Reach : IUCombatLocal::FistReach) * IU::MetersToCm + 40.0f;
	const FVector Start = Character->GetCamera()->GetComponentLocation();
	const FVector Dir = Character->GetCamera()->GetForwardVector();
	FHitResult Hit;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(IUMelee), false, Character);
	const bool bHit = GetWorld()->SweepSingleByChannel(Hit, Start, Start + Dir * Reach, FQuat::Identity, IU_TRACE_INTERACT, FCollisionShape::MakeSphere(18.0f), Params);
	Character->MakeNoiseEvent(1.0f, 2200.0f);

	if (!bHit)
	{
		// Spear fishing: thrust into shallow water.
		if (Def && Def->Tool.Type == IUSim::EToolType::Spear) { TrySpearFishing(Start + Dir * Reach); }
		return;
	}
	AActor* Target = Hit.GetActor();

	// 1) Instanced resources (trees, rocks, bushes).
	if (AIUIslandWorld* IslandActor = WS->GetIslandActor())
	{
		if (IslandActor->GetNodeFromHit(Hit.GetComponent(), Hit.Item))
		{
			const IUSim::EToolType Tool = Def ? Def->Tool.Type : IUSim::EToolType::None;
			const FIUHarvestOutcome Out = IslandActor->HarvestHit(Hit.GetComponent(), Hit.Item, Tool, Def ? Def->Tool.Tier : 0, Def ? Def->Tool.HarvestMultiplier : 1.0f);
			ApplyHarvest(Out, Tool != IUSim::EToolType::None);
			return;
		}
	}
	// 2) Single resource actors (caves).
	if (AIUResourceActor* Res = Cast<AIUResourceActor>(Target))
	{
		HarvestResourceActor(Res, false);
		return;
	}
	// 3) Creatures, totems and other damageable actors (never our own buildings by accident).
	if (Target && (Target->IsA<AIUCreature>() || Target->IsA<AIUTribeTotem>()))
	{
		const float Base = bWeapon ? Def->Weapon.Damage : IUCombatLocal::FistDamage;
		const float Damage = Base * Character->GetSurvival()->Effects().DamageMultiplier;
		UGameplayStatics::ApplyDamage(Target, Damage, Character->GetController(), Character, UDamageType::StaticClass());
		LastCombatTime = GetWorld()->GetTimeSeconds();
		Character->PlayActionSound(TEXT("hit"));
		if (bWeapon) { Character->WearHeldItem(1.0f); }
		return;
	}
	Character->PlayActionSound(TEXT("thud"));
}

void UIUCombatComponent::HarvestFocused(bool bByHand)
{
	AIUCharacter* Character = GetCharacter();
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!Character || !WS) { return; }
	const double Now = GetWorld()->GetTimeSeconds();
	if (Now < NextAttackTime) { return; }
	NextAttackTime = Now + 0.5;
	SwingDuration = 0.4f;
	SwingTime = SwingDuration;
	AIUIslandWorld* IslandActor = WS->GetIslandActor();
	UIUInteractionComponent* Interaction = Character->GetInteraction();
	if (!IslandActor || !Interaction || !Interaction->GetFocusComponent()) { return; }
	const FIUHarvestOutcome Out = IslandActor->HarvestHit(Interaction->GetFocusComponent(), Interaction->GetFocusItem(), IUSim::EToolType::None, 0, 1.0f);
	ApplyHarvest(Out, false);
}

void UIUCombatComponent::HarvestResourceActor(AIUResourceActor* Resource, bool bByHand)
{
	AIUCharacter* Character = GetCharacter();
	if (!Character || !Resource) { return; }
	const IUSim::ItemDef* Def = bByHand ? nullptr : Character->GetHeldItemDef();
	const IUSim::EToolType Tool = Def ? Def->Tool.Type : IUSim::EToolType::None;
	const FIUHarvestOutcome Out = Resource->Harvest(Tool, Def ? Def->Tool.Tier : 0, Def ? Def->Tool.HarvestMultiplier : 1.0f);
	ApplyHarvest(Out, Tool != IUSim::EToolType::None);
}

void UIUCombatComponent::ApplyHarvest(const FIUHarvestOutcome& Outcome, bool bTool)
{
	AIUCharacter* Character = GetCharacter();
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!Character || !WS || !Outcome.bValid) { return; }
	LastWorkTime = GetWorld()->GetTimeSeconds();
	if (Outcome.bWrongTool)
	{
		WS->Notify(FString::Printf(TEXT("%s: necesitas %s"), *Outcome.NodeName, *Outcome.RequiredTool), IU::Palette::Bad);
		Character->PlayActionSound(TEXT("thud"));
		return;
	}
	for (const IUSim::ItemAmount& A : Outcome.Items) { Character->GetInventory()->GiveOrDrop(A.ItemId, A.Count); }
	Character->GetSurvival()->Model().SpendEnergy(0.6f);
	Character->PlayActionSound(Outcome.RequiredTool == TEXT("axe") ? TEXT("chop") : (Outcome.RequiredTool == TEXT("pickaxe") ? TEXT("mine") : TEXT("gather")));
	if (bTool) { Character->WearHeldItem(1.0f); }
	if (Outcome.bDepleted && Outcome.RequiredTool == TEXT("axe")) { Character->PlayActionSound(TEXT("tree_fall")); }
}

void UIUCombatComponent::TrySpearFishing(const FVector& Point)
{
	AIUCharacter* Character = GetCharacter();
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	if (!Character || !WS || !Db || !WS->GetIsland()) { return; }
	const float Water = WS->GetWaterLevelCm(Point.X, Point.Y);
	const float Ground = WS->GetGroundHeightCm(Point.X, Point.Y);
	if (Point.Z > Water + 20.0f || Water - Ground < 30.0f || Water - Ground > 250.0f) { return; }
	const IUSim::EWaterZone Zone = WS->GetIsland()->GetWaterZone(Point.X * IU::CmToMeters, Point.Y * IU::CmToMeters);
	Character->PlayActionSound(TEXT("splash"));
	if (!WS->GetRandom().Chance(0.3f)) { return; }
	const IUSim::FishSpecies* Fish = Db->Fish.Roll(Zone, WS->GetClock().IsNight(), WS->GetRandom());
	if (!Fish || !Fish->bSpearable) { return; }
	Character->GetInventory()->GiveOrDrop(Fish->Item, 1);
	WS->BroadcastEvent(IUSim::EGameEvent::Catch, Fish->Id, 1);
	WS->Notify(FString::Printf(TEXT("¡Ensartado! %s"), *IU::ToFString(Fish->Name)), IU::Palette::Good);
	Character->WearHeldItem(2.0f);
}

void UIUCombatComponent::BowInput(bool bPressed)
{
	AIUCharacter* Character = GetCharacter();
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!Character || !WS) { return; }
	const IUSim::ItemDef* Def = Character->GetHeldItemDef();
	if (!Def || Def->Weapon.Kind != IUSim::EWeaponKind::Ranged) { return; }
	if (bPressed)
	{
		if (Character->GetInventory()->CountItem(Def->Weapon.AmmoItem) <= 0)
		{
			WS->Notify(TEXT("No tienes flechas"), IU::Palette::Bad);
			return;
		}
		bDrawing = true;
		DrawStart = GetWorld()->GetTimeSeconds();
		Character->PlayActionSound(TEXT("bow_draw"));
		return;
	}
	if (!bDrawing) { return; }
	bDrawing = false;
	const float Charge = GetBowCharge();
	if (Charge < 0.15f) { return; }
	if (!Character->GetSurvival()->Model().SpendStamina(Def->Weapon.StaminaCost)) { return; }
	Character->GetInventory()->RemoveItem(Def->Weapon.AmmoItem, 1);
	const FVector Dir = Character->GetCamera()->GetForwardVector();
	const FVector Start = Character->GetCamera()->GetComponentLocation() + Dir * 60.0f;
	FActorSpawnParameters SP;
	SP.Owner = Character;
	SP.Instigator = Character;
	SP.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	if (AIUArrowProjectile* Arrow = GetWorld()->SpawnActor<AIUArrowProjectile>(AIUArrowProjectile::StaticClass(), Start, Dir.Rotation(), SP))
	{
		const float Speed = Def->Weapon.ProjectileSpeed * IU::MetersToCm * (0.35f + 0.65f * Charge);
		const float Damage = Def->Weapon.Damage * (0.3f + 0.7f * Charge) * Character->GetSurvival()->Effects().DamageMultiplier;
		Arrow->Launch(Dir, Speed, Damage);
	}
	LastCombatTime = GetWorld()->GetTimeSeconds();
	Character->WearHeldItem(1.0f);
	Character->PlayActionSound(TEXT("bow_release"));
	Character->MakeNoiseEvent(0.5f, 1200.0f);
}
