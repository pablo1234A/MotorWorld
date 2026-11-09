#include "Player/IUFishingComponent.h"

#include "Core/IUGameInstance.h"
#include "Core/IUTypes.h"
#include "Player/IUCharacter.h"
#include "Player/IUInventoryComponent.h"
#include "World/IUPropActor.h"
#include "World/IUWorldSubsystem.h"
#include "Camera/CameraComponent.h"
#include "Engine/World.h"

UIUFishingComponent::UIUFishingComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
}

bool UIUFishingComponent::FindCastPoint(FVector& OutPoint) const
{
	const AIUCharacter* Character = Cast<AIUCharacter>(GetOwner());
	const UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!Character || !WS || IU::IsUnderground(Character->GetActorLocation())) { return false; }
	const FVector Start = Character->GetCamera()->GetComponentLocation();
	FVector Dir = Character->GetCamera()->GetForwardVector();
	Dir.Z = FMath::Min(Dir.Z, -0.08f); // casts arc down towards the water
	Dir.Normalize();
	for (float D = 200.0f; D <= 1800.0f; D += 50.0f)
	{
		const FVector P = Start + Dir * D;
		const float Water = WS->GetWaterLevelCm(P.X, P.Y);
		const float Ground = WS->GetGroundHeightCm(P.X, P.Y);
		if (P.Z <= Water + 30.0f)
		{
			if (Water - Ground < 60.0f) { return false; }
			OutPoint = FVector(P.X, P.Y, Water);
			return true;
		}
		if (P.Z < Ground) { return false; }
	}
	return false;
}

void UIUFishingComponent::Primary(bool bPressed)
{
	AIUCharacter* Character = Cast<AIUCharacter>(GetOwner());
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	if (!Character || !WS || !Db) { return; }
	bReelHeld = bPressed;
	if (!bPressed) { return; }

	switch (Session.GetState())
	{
	case IUSim::EFishingState::Idle:
	{
		FVector Point;
		if (!FindCastPoint(Point))
		{
			WS->Notify(TEXT("Apunta a agua profunda para lanzar"), IU::Palette::TextDim);
			return;
		}
		Zone = WS->GetIsland()->GetWaterZone(Point.X * IU::CmToMeters, Point.Y * IU::CmToMeters);
		if (Zone == IUSim::EWaterZone::None) { Zone = IUSim::EWaterZone::Sea; }
		const IUSim::FishSpecies* Fish = Db->Fish.Roll(Zone, WS->GetClock().IsNight(), WS->GetRandom());
		const float Weight = Fish ? WS->GetRandom().Range(Fish->MinWeight, Fish->MaxWeight) : 0.0f;
		// Rain makes fish bite more.
		const float Bait = WS->GetClock().GetParams().Rain * 0.5f;
		Session.Begin(Fish, Weight, Bait, WS->GetRandom().NextU32());
		BobberLocation = Point;
		if (!Bobber)
		{
			TArray<FIUShapePart> Parts;
			Parts.Add(FIUShapePart(EIUShape::Sphere, FVector::ZeroVector, FVector(9), FLinearColor(0.9f, 0.1f, 0.05f), false));
			Parts.Add(FIUShapePart(EIUShape::Sphere, FVector(0, 0, 5), FVector(6), FLinearColor::White, false));
			Bobber = AIUPropActor::Spawn(GetWorld(), Point, 0.0f, Parts, false);
		}
		else
		{
			Bobber->SetActorHiddenInGame(false);
			Bobber->SetActorLocation(Point);
		}
		Character->PlayActionSound(TEXT("cast"));
		Character->WearHeldItem(1.0f);
		break;
	}
	case IUSim::EFishingState::Waiting:
	case IUSim::EFishingState::Bite:
		Session.Strike();
		if (Session.GetState() == IUSim::EFishingState::Reeling) { Character->PlayActionSound(TEXT("hook")); }
		break;
	default:
		break;
	}
}

void UIUFishingComponent::Cancel()
{
	Session.Cancel();
	bReelHeld = false;
	if (Bobber) { Bobber->SetActorHiddenInGame(true); }
}

void UIUFishingComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	if (!IsActive()) { return; }
	AIUCharacter* Character = Cast<AIUCharacter>(GetOwner());
	if (!Character) { return; }
	const IUSim::ItemDef* Held = Character->GetHeldItemDef();
	if (!Held || Held->Tool.Type != IUSim::EToolType::FishingRod || FVector::Dist2D(Character->GetActorLocation(), BobberLocation) > 2500.0f)
	{
		Cancel();
		return;
	}
	const IUSim::EFishingState Before = Session.GetState();
	Session.Tick(DeltaTime, bReelHeld && Session.GetState() == IUSim::EFishingState::Reeling);
	if (Before != IUSim::EFishingState::Bite && Session.GetState() == IUSim::EFishingState::Bite) { Character->PlayActionSound(TEXT("bite")); }

	// Bobber motion: gentle bob, plunges on bites, gets dragged while reeling.
	BobTime += DeltaTime;
	if (Bobber)
	{
		FVector L = BobberLocation;
		L.Z += FMath::Sin(BobTime * 3.0f) * 2.0f;
		if (Session.GetState() == IUSim::EFishingState::Bite) { L.Z -= 8.0f + FMath::Sin(BobTime * 25.0f) * 4.0f; }
		if (Session.GetState() == IUSim::EFishingState::Reeling)
		{
			const FVector ToPlayer = (Character->GetActorLocation() - BobberLocation).GetSafeNormal2D();
			L += ToPlayer * (1.0f - Session.GetDistance()) * FVector::Dist2D(Character->GetActorLocation(), BobberLocation) * 0.8f;
			L += FVector(FMath::Sin(BobTime * 7.0f), FMath::Cos(BobTime * 5.0f), 0.0f) * (Session.IsSurging() ? 40.0f : 10.0f);
		}
		Bobber->SetActorLocation(L);
	}
	if (Session.IsFinished()) { Finish(); }
}

void UIUFishingComponent::Finish()
{
	AIUCharacter* Character = Cast<AIUCharacter>(GetOwner());
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (Character && WS)
	{
		const IUSim::FishSpecies* Fish = Session.GetFish();
		switch (Session.GetState())
		{
		case IUSim::EFishingState::Caught:
			if (Fish)
			{
				const int32 Count = Fish->Item == "raw_fish" ? FMath::Max(1, FMath::RoundToInt(Session.GetWeight() / 0.8f)) : 1;
				Character->GetInventory()->GiveOrDrop(Fish->Item, Count);
				WS->BroadcastEvent(IUSim::EGameEvent::Catch, Fish->Id, 1);
				WS->Notify(FString::Printf(TEXT("¡Has pescado: %s (%.1f kg)!"), *IU::ToFString(Fish->Name), Session.GetWeight()), IU::Palette::Good);
				Character->PlayActionSound(TEXT("catch"));
			}
			break;
		case IUSim::EFishingState::LineSnapped:
			WS->Notify(TEXT("¡El sedal se ha roto!"), IU::Palette::Bad);
			Character->WearHeldItem(10.0f);
			break;
		case IUSim::EFishingState::Escaped:
			WS->Notify(TEXT("El pez se ha escapado"), IU::Palette::TextDim);
			break;
		default:
			break;
		}
	}
	Cancel();
}
