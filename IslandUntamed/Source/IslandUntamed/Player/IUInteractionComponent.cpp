#include "Player/IUInteractionComponent.h"

#include "Core/IUGameInstance.h"
#include "Core/IUTypes.h"
#include "Gameplay/IUInteractable.h"
#include "Player/IUCharacter.h"
#include "Player/IUCombatComponent.h"
#include "Player/IUInventoryComponent.h"
#include "Player/IUSurvivalComponent.h"
#include "World/IUIslandWorld.h"
#include "World/IUWorldSubsystem.h"
#include "Camera/CameraComponent.h"
#include "Engine/World.h"

namespace IUInteractionLocal
{
	constexpr float TraceLength = 350.0f;
}

UIUInteractionComponent::UIUInteractionComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.TickInterval = 0.05f;
}

void UIUInteractionComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	UpdateFocus();
}

bool UIUInteractionComponent::FindWater(FVector& OutPoint, bool& bOutSalt) const
{
	const AIUCharacter* Character = Cast<AIUCharacter>(GetOwner());
	const UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!Character || !WS || IU::IsUnderground(Character->GetActorLocation())) { return false; }
	if (Character->IsSwimming() || Character->GetWaterDepthCm() > 40.0f)
	{
		OutPoint = Character->GetActorLocation();
		bOutSalt = WS->GetBiomeAt(OutPoint) != IUSim::EBiome::River && WS->GetBiomeAt(OutPoint) != IUSim::EBiome::Lake && WS->GetBiomeAt(OutPoint) != IUSim::EBiome::Swamp;
		return true;
	}
	const FVector Start = Character->GetCamera()->GetComponentLocation();
	const FVector Dir = Character->GetCamera()->GetForwardVector();
	for (float D = 50.0f; D <= IUInteractionLocal::TraceLength; D += 25.0f)
	{
		const FVector P = Start + Dir * D;
		const float Water = WS->GetWaterLevelCm(P.X, P.Y);
		const float Ground = WS->GetGroundHeightCm(P.X, P.Y);
		if (P.Z <= Water + 5.0f && Water - Ground > 20.0f)
		{
			OutPoint = P;
			const IUSim::EBiome B = WS->GetBiomeAt(P);
			bOutSalt = !(B == IUSim::EBiome::River || B == IUSim::EBiome::Lake || B == IUSim::EBiome::Swamp);
			return true;
		}
		if (P.Z < Ground) { break; }
	}
	return false;
}

void UIUInteractionComponent::UpdateFocus()
{
	AIUCharacter* Character = Cast<AIUCharacter>(GetOwner());
	if (!Character || !Character->GetCamera()) { return; }
	FocusActor.Reset();
	FocusComponent.Reset();
	FocusItem = INDEX_NONE;
	FocusKind = EIUFocusKind::None;
	PrimaryText = FText::GetEmpty();
	SecondaryText = FText::GetEmpty();

	const FVector Start = Character->GetCamera()->GetComponentLocation();
	const FVector End = Start + Character->GetCamera()->GetForwardVector() * IUInteractionLocal::TraceLength;
	FHitResult Hit;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(IUInteract), false, Character);
	const bool bHit = GetWorld()->SweepSingleByChannel(Hit, Start, End, FQuat::Identity, IU_TRACE_INTERACT, FCollisionShape::MakeSphere(8.0f), Params);

	if (bHit && Hit.GetActor())
	{
		if (IIUInteractable* I = Cast<IIUInteractable>(Hit.GetActor()))
		{
			if (FVector::Dist(Start, Hit.ImpactPoint) <= I->GetInteractRange() + 60.0f)
			{
				FocusActor = Hit.GetActor();
				FocusKind = EIUFocusKind::Actor;
				PrimaryText = I->GetInteractText(Character);
				SecondaryText = I->GetSecondaryText(Character);
				if (PrimaryText.IsEmpty() && SecondaryText.IsEmpty()) { FocusKind = EIUFocusKind::None; }
				else { return; }
			}
		}
		UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
		AIUIslandWorld* IslandActor = WS ? WS->GetIslandActor() : nullptr;
		if (IslandActor)
		{
			if (const IUSim::ResourceNodeDef* Node = IslandActor->GetNodeFromHit(Hit.GetComponent(), Hit.Item))
			{
				if (!Node->bDecorOnly)
				{
					FocusComponent = Hit.GetComponent();
					FocusItem = Hit.Item;
					FocusKind = EIUFocusKind::Resource;
					const FString Name = IU::ToFString(Node->Name);
					if (Node->bHandHarvestable) { PrimaryText = FText::FromString(FString::Printf(TEXT("Recoger %s"), *Name)); }
					else { PrimaryText = FText::FromString(FString::Printf(TEXT("%s  (golpea con: %s)"), *Name, UTF8_TO_TCHAR(IUSim::ToolTypeToString(Node->Tool)))); }
					return;
				}
			}
		}
	}

	FVector WaterPoint;
	if (FindWater(WaterPoint, bWaterSalt))
	{
		FocusKind = EIUFocusKind::Water;
		PrimaryText = bWaterSalt ? NSLOCTEXT("IU", "SaltWater", "Agua salada (no potable)") : NSLOCTEXT("IU", "Drink", "Beber agua");
		if (!bWaterSalt && Character->GetInventory() && Character->GetInventory()->CountItem("water_flask") > 0)
		{
			SecondaryText = NSLOCTEXT("IU", "FillFlask", "Llenar cantimplora");
		}
	}
}

void UIUInteractionComponent::Interact()
{
	AIUCharacter* Character = Cast<AIUCharacter>(GetOwner());
	if (!Character) { return; }
	switch (FocusKind)
	{
	case EIUFocusKind::Actor:
		if (IIUInteractable* I = Cast<IIUInteractable>(FocusActor.Get())) { I->Interact(Character); }
		break;
	case EIUFocusKind::Resource:
		Character->GetCombat()->HarvestFocused(true);
		break;
	case EIUFocusKind::Water:
		Drink();
		break;
	case EIUFocusKind::None:
		break;
	}
}

void UIUInteractionComponent::InteractSecondary()
{
	AIUCharacter* Character = Cast<AIUCharacter>(GetOwner());
	if (!Character) { return; }
	if (FocusKind == EIUFocusKind::Actor)
	{
		if (IIUInteractable* I = Cast<IIUInteractable>(FocusActor.Get())) { I->InteractSecondary(Character); }
	}
	else if (FocusKind == EIUFocusKind::Water)
	{
		FillFlask();
	}
}

void UIUInteractionComponent::Drink()
{
	AIUCharacter* Character = Cast<AIUCharacter>(GetOwner());
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!Character || !WS) { return; }
	if (bWaterSalt)
	{
		IUSim::SurvivalState& S = Character->GetSurvival()->Model().State;
		S.Hydration = FMath::Max(0.0f, S.Hydration - 6.0f);
		WS->Notify(TEXT("El agua de mar te deshidrata aun mas"), IU::Palette::Bad);
		return;
	}
	// Drinking straight from a river or lake: same risks as unboiled water.
	Character->GetSurvival()->Consume("dirty_water");
	Character->PlayActionSound(TEXT("drink"));
}

void UIUInteractionComponent::FillFlask()
{
	AIUCharacter* Character = Cast<AIUCharacter>(GetOwner());
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!Character || !WS || !Character->GetInventory()) { return; }
	FVector Point;
	bool bSalt = false;
	if (Character->GetInventory()->CountItem("water_flask") <= 0) { return; }
	if (!FindWater(Point, bSalt) || bSalt)
	{
		WS->Notify(TEXT("Necesitas agua dulce (rio o lago) para llenar la cantimplora"), IU::Palette::TextDim);
		return;
	}
	Character->GetInventory()->GiveOrDrop("dirty_water", 2);
	Character->PlayActionSound(TEXT("water"));
}
