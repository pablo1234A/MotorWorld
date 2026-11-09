#include "World/IUCave.h"

#include "Core/IUAssets.h"
#include "Core/IUTypes.h"
#include "Gameplay/IUContainer.h"
#include "Gameplay/IULoreNote.h"
#include "Player/IUCharacter.h"
#include "World/IUIslandWorld.h"
#include "World/IUPropActor.h"
#include "World/IUResourceActor.h"
#include "World/IUStorySubsystem.h"
#include "World/IUVisuals.h"
#include "World/IUWorldSubsystem.h"
#include "Components/BoxComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SphereComponent.h"
#include "Engine/World.h"

namespace IUCaveLocal
{
	const FLinearColor Rock(0.16f, 0.15f, 0.14f);
	const FLinearColor RockLight(0.24f, 0.22f, 0.20f);
}

AIUCave::AIUCave()
{
	PrimaryActorTick.bCanEverTick = false;
	UBoxComponent* Box = CreateDefaultSubobject<UBoxComponent>(TEXT("Mouth"));
	Box->InitBoxExtent(FVector(150, 250, 200));
	Box->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Box->SetCollisionResponseToAllChannels(ECR_Ignore);
	Box->SetCollisionResponseToChannel(IU_TRACE_INTERACT, ECR_Block);
	Root = Box;
	RootComponent = Root;
}

void AIUCave::Setup(const IUSim::PointOfInterest& Poi, int32 CaveIndex)
{
	PoiId = IU::ToFString(Poi.Id);
	CaveName = IU::ToFString(Poi.Name);
	Index = CaveIndex;
	InteriorOrigin = FVector(CaveIndex * 30000.0, 0.0, IU::CavePocketZ);

	// Entrance: a dark mouth framed by boulders.
	TArray<FIUShapePart> Parts;
	Parts.Add(FIUShapePart(EIUShape::Sphere, FVector(0, -330, 150), FVector(400, 300, 420), IUCaveLocal::RockLight, true));
	Parts.Add(FIUShapePart(EIUShape::Sphere, FVector(0, 330, 150), FVector(400, 300, 420), IUCaveLocal::RockLight, true));
	Parts.Add(FIUShapePart(EIUShape::Sphere, FVector(-40, 0, 420), FVector(500, 900, 260), IUCaveLocal::Rock, true));
	Parts.Add(FIUShapePart(EIUShape::Cube, FVector(-60, 0, 150), FVector(20, 420, 320), FLinearColor(0.005f, 0.005f, 0.005f), false));
	if (UIUAssets* Assets = UIUAssets::Get(this)) { Assets->BuildParts(this, Root, Parts, true); }
}

FText AIUCave::GetInteractText(const AIUCharacter* By) const
{
	return FText::FromString(FString::Printf(TEXT("Entrar en %s"), *CaveName));
}

void AIUCave::Interact(AIUCharacter* By)
{
	EnterCave(By);
}

void AIUCave::AddBox(TArray<FIUShapePart>& Parts, const FVector& Center, const FVector& Size) const
{
	Parts.Add(FIUShapePart(EIUShape::Cube, Center, Size, IUCaveLocal::Rock, true));
}

void AIUCave::BuildInterior()
{
	if (bInteriorBuilt) { return; }
	bInteriorBuilt = true;
	UWorld* World = GetWorld();
	IUSim::Rng Rand(static_cast<uint64>(Index) * 7919ULL + 13ULL);
	TArray<FIUShapePart> Parts;
	// --- Main hall 36 x 28 x 12 m (floor at local Z = 0).
	const float HX = 1800.0f, HY = 1400.0f, HH = 1200.0f;
	AddBox(Parts, FVector(0, 0, -50), FVector(HX * 2, HY * 2, 100));                 // floor
	AddBox(Parts, FVector(0, 0, HH + 50), FVector(HX * 2, HY * 2, 100));             // ceiling
	AddBox(Parts, FVector(-HX - 50, 0, HH * 0.5f), FVector(100, HY * 2, HH));         // west
	AddBox(Parts, FVector(0, -HY - 50, HH * 0.5f), FVector(HX * 2, 100, HH));         // south (exit side)
	// East wall with an opening (5 m) towards chamber B.
	AddBox(Parts, FVector(HX + 50, -900, HH * 0.5f), FVector(100, 1000, HH));
	AddBox(Parts, FVector(HX + 50, 900, HH * 0.5f), FVector(100, 1000, HH));
	AddBox(Parts, FVector(HX + 50, 0, 950), FVector(100, 800, 500));
	// North wall with an opening towards chamber A.
	AddBox(Parts, FVector(-1150, HY + 50, HH * 0.5f), FVector(1300, 100, HH));
	AddBox(Parts, FVector(1150, HY + 50, HH * 0.5f), FVector(1300, 100, HH));
	AddBox(Parts, FVector(0, HY + 50, 950), FVector(1000, 100, 500));
	// --- Chamber A (north) 14 x 12 x 7 m.
	const FVector A(0, HY + 700, 0);
	AddBox(Parts, A + FVector(0, 0, -50), FVector(1400, 1200, 100));
	AddBox(Parts, A + FVector(0, 0, 750), FVector(1400, 1200, 100));
	AddBox(Parts, A + FVector(-750, 0, 350), FVector(100, 1200, 700));
	AddBox(Parts, A + FVector(750, 0, 350), FVector(100, 1200, 700));
	AddBox(Parts, A + FVector(0, 650, 350), FVector(1400, 100, 700));
	// --- Chamber B (east) 12 x 14 x 7 m.
	const FVector B(HX + 700, 0, 0);
	AddBox(Parts, B + FVector(0, 0, -50), FVector(1200, 1400, 100));
	AddBox(Parts, B + FVector(0, 0, 750), FVector(1200, 1400, 100));
	AddBox(Parts, B + FVector(650, 0, 350), FVector(100, 1400, 700));
	AddBox(Parts, B + FVector(0, -750, 350), FVector(1200, 100, 700));
	AddBox(Parts, B + FVector(0, 750, 350), FVector(1200, 100, 700));
	// Stalagmites and stalactites.
	for (int32 I = 0; I < 26; ++I)
	{
		const FVector P(Rand.Range(-HX + 200, HX - 200), Rand.Range(-HY + 300, HY - 200), 0);
		const float H = Rand.Range(120.0f, 480.0f);
		const bool bUp = Rand.Chance(0.5f);
		Parts.Add(FIUShapePart(EIUShape::Cone, P + FVector(0, 0, bUp ? H * 0.5f : HH - H * 0.5f), FVector(H * 0.35f, H * 0.35f, H), IUCaveLocal::RockLight, bUp, FRotator(bUp ? 0.0f : 180.0f, 0, 0)));
	}
	// Exit glow on the south wall.
	FIUShapePart Exit(EIUShape::Cube, FVector(0, -HY + 10, 220), FVector(400, 10, 440), FLinearColor(0.9f, 0.85f, 0.7f), false);
	Exit.Material = EIUMaterialKind::Emissive;
	Parts.Add(Exit);

	AIUPropActor* Shell = AIUPropActor::Spawn(World, InteriorOrigin, 0.0f, Parts, true);
	if (Shell)
	{
		Shell->AddLight(FVector(0, -HY + 300, 300), FLinearColor(0.9f, 0.85f, 0.75f), 2500.0f, 1500.0f);
		const bool bCrystal = PoiId == TEXT("cave_crystal");
		const bool bLava = PoiId == TEXT("cave_lava");
		const FLinearColor Glow = bLava ? FLinearColor(1.0f, 0.35f, 0.05f) : (bCrystal ? FLinearColor(0.25f, 0.55f, 1.0f) : FLinearColor(0.2f, 0.9f, 0.8f));
		for (int32 I = 0; I < 6; ++I)
		{
			const FVector P(Rand.Range(-HX + 300, HX - 300), Rand.Range(-HY + 300, HY - 300), 80);
			Shell->AddLight(P, Glow, 1800.0f, 1200.0f);
		}
		Shell->AddLight(A + FVector(0, 0, 300), Glow, 2200.0f, 1400.0f);
		Shell->AddLight(B + FVector(0, 0, 300), Glow, 2200.0f, 1400.0f);
	}

	// Resources: ore everywhere, crystals in the crystal grotto, obsidian in the lava tube.
	for (int32 I = 0; I < 8; ++I)
	{
		const FVector P = InteriorOrigin + FVector(Rand.Range(-HX + 250, HX - 250), Rand.Range(-HY + 250, HY - 250), 0);
		std::string Node = "ore_iron";
		if (PoiId == TEXT("cave_crystal") && I % 2 == 0) { Node = "crystal_node"; }
		if (PoiId == TEXT("cave_lava") && I % 2 == 0) { Node = "obsidian_rock"; }
		if (I == 7) { Node = "glow_mushroom_patch"; }
		AIUResourceActor::Spawn(World, P, Rand.Range(0.0f, 360.0f), Rand.Range(0.8f, 1.3f), Node);
	}
	AIUResourceActor::Spawn(World, InteriorOrigin + B + FVector(200, 300, 0), 0.0f, 1.2f, "crystal_node");

	// Loot and lore in chamber A.
	if (UIUStorySubsystem* Story = UIUStorySubsystem::Get(this))
	{
		for (const FIULootTable& Loot : Story->GetPoiLoot())
		{
			if (Loot.PoiId != PoiId) { continue; }
			FActorSpawnParameters SP;
			SP.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
			if (AIUContainer* C = World->SpawnActor<AIUContainer>(AIUContainer::StaticClass(), InteriorOrigin + A + FVector(0, 300, 40), FRotator::ZeroRotator, SP))
			{
				C->Setup(FString::Printf(TEXT("poi:%s"), *PoiId), FText::FromString(TEXT("Hueco en la roca")), IUVisuals::ResourceParts("boulder"), 12);
				for (const IUSim::ItemAmount& Item : Loot.Items) { C->GetStorage()->AddItem(Item.ItemId, Item.Count, -1.0f, false); }
				C->FinishLoot();
			}
		}
		for (const FIULoreDoc& Doc : Story->GetLore())
		{
			if (Doc.PoiId != PoiId) { continue; }
			FActorSpawnParameters SP;
			SP.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
			if (AIULoreNote* Note = World->SpawnActor<AIULoreNote>(AIULoreNote::StaticClass(), InteriorOrigin + A + FVector(-300, 200, 30), FRotator::ZeroRotator, SP))
			{
				Note->Setup(Doc.Id);
			}
		}
	}

	// Exit trigger.
	InteriorSpawn = InteriorOrigin + FVector(0, -HY + 350, 120);
	FActorSpawnParameters SP;
	SP.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	if (AIUCaveExit* ExitActor = World->SpawnActor<AIUCaveExit>(AIUCaveExit::StaticClass(), InteriorOrigin + FVector(0, -HY + 80, 150), FRotator::ZeroRotator, SP))
	{
		ExitActor->Cave = this;
	}
}

void AIUCave::EnterCave(AIUCharacter* By)
{
	if (!By) { return; }
	BuildInterior();
	By->TeleportPlayer(InteriorSpawn, FRotator(0, 90, 0));
	if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this))
	{
		WS->Notify(FString::Printf(TEXT("%s: necesitaras luz"), *CaveName), IU::Palette::TextDim);
		WS->BroadcastEvent(IUSim::EGameEvent::Custom, IU::ToStd(FString::Printf(TEXT("enter:%s"), *PoiId)), 1);
	}
}

void AIUCave::ExitCave(AIUCharacter* By)
{
	if (!By) { return; }
	const FVector Out = GetActorLocation() + GetActorForwardVector() * 450.0f + FVector(0, 0, 120);
	By->TeleportPlayer(Out, GetActorRotation());
}

AIUCaveExit::AIUCaveExit()
{
	PrimaryActorTick.bCanEverTick = false;
	Collision = CreateDefaultSubobject<USphereComponent>(TEXT("Collision"));
	Collision->InitSphereRadius(160.0f);
	Collision->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Collision->SetCollisionResponseToAllChannels(ECR_Ignore);
	Collision->SetCollisionResponseToChannel(IU_TRACE_INTERACT, ECR_Block);
	RootComponent = Collision;
}
