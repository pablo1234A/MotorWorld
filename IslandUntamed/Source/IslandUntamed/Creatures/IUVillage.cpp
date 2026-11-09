#include "Creatures/IUVillage.h"

#include "IslandUntamed.h"
#include "Core/IUAssets.h"
#include "Core/IUTypes.h"
#include "Creatures/IUCreatureAIController.h"
#include "Creatures/IUTribeNPC.h"
#include "Gameplay/IUContainer.h"
#include "Gameplay/IULoreNote.h"
#include "Player/IUCharacter.h"
#include "Player/IUInventoryComponent.h"
#include "World/IUPOIBuilder.h"
#include "World/IUPropActor.h"
#include "World/IUStorySubsystem.h"
#include "World/IUVisuals.h"
#include "World/IUWorldSubsystem.h"
#include "Components/CapsuleComponent.h"
#include "Engine/DamageEvents.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"

namespace IUVillageLocal
{
	using namespace IUVisuals::Colors;
	constexpr float SpawnDistance = 26000.0f;
	constexpr float DespawnDistance = 36000.0f;
	constexpr int32 MaxActiveResidents = 12;

	const TCHAR* KairuNames[] = { TEXT("Ama Teru"), TEXT("Noa"), TEXT("Kele"), TEXT("Iwi"), TEXT("Rangi"), TEXT("Moana"), TEXT("Tavi"), TEXT("Hine"), TEXT("Poe"), TEXT("Kai"), TEXT("Lani"), TEXT("Mere") };
	const TCHAR* VeshNames[] = { TEXT("Gran Vesh"), TEXT("Orrak"), TEXT("Sesh"), TEXT("Tauk"), TEXT("Imra"), TEXT("Kesh"), TEXT("Duun"), TEXT("Varra"), TEXT("Lok"), TEXT("Neshi"), TEXT("Brak"), TEXT("Yeli") };
	const TCHAR* AshNames[] = { TEXT("Voz del Crater"), TEXT("Kharr"), TEXT("Ezza"), TEXT("Mordu"), TEXT("Ssyl"), TEXT("Tharg"), TEXT("Ruun"), TEXT("Vexa"), TEXT("Grol"), TEXT("Ishk"), TEXT("Draa"), TEXT("Uul") };
}

AIUVillage::AIUVillage()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickInterval = 1.0f;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;
}

void AIUVillage::SetupVillage(const IUSim::PointOfInterest& Poi)
{
	TribeId = IU::ToFString(Poi.TribeId);
	VillageName = IU::ToFString(Poi.Name);
	if (const UIUStorySubsystem* Story = UIUStorySubsystem::Get(this))
	{
		if (const IUSim::TribeDef* Def = Story->Factions().FindDef(Poi.TribeId))
		{
			TerritoryRadiusCm = Def->TerritoryRadius * IU::MetersToCm;
			InnerRadiusCm = Def->InnerRadius * IU::MetersToCm;
		}
	}
	if (TribeId == TEXT("kairu"))
	{
		Chatter = { TEXT("Las redes vienen llenas hoy."), TEXT("La marea cambia, como todo."), TEXT("¿Has visto la luz azul anoche?"), TEXT("El de la tormenta sigue vivo..."), TEXT("Comparte tu pescado y seras de la familia.") };
	}
	else if (TribeId == TEXT("veshka"))
	{
		Chatter = { TEXT("El jaguar caza de noche. Nosotros tambien."), TEXT("El extranjero huele a miedo."), TEXT("Las flechas no se fallan dos veces."), TEXT("Los de la Ceniza se acercan cada luna."), TEXT("La selva da, la selva quita.") };
	}
	else
	{
		Chatter = { TEXT("El pulso del volcan nos llama."), TEXT("Cada once latidos, la isla respira."), TEXT("El fuego reclama a los de fuera."), TEXT("La Voz del Crater lo ha visto en suenos."), TEXT("Nadie abandona la Ceniza.") };
	}
	if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this))
	{
		WS->RegisterVillage(this);
	}
	BuildLayout(Poi);
}

void AIUVillage::BuildLayout(const IUSim::PointOfInterest& Poi)
{
	using namespace IUVillageLocal;
	UWorld* World = GetWorld();
	const UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	const IUSim::IslandModel* Island = WS ? WS->GetIsland() : nullptr;
	if (!World || !Island) { return; }

	const FVector Center = GetActorLocation();
	// Gate faces the island center; the sea is behind for coastal villages.
	const FVector2D Inland = FVector2D(-Poi.Position.X, -Poi.Position.Y).GetSafeNormal();
	const float GateYaw = FMath::RadiansToDegrees(FMath::Atan2(Inland.Y, Inland.X));
	const auto Ground = [Island, &Poi](float Angle, float RadiusM)
	{
		return IUPOIBuilder::GroundAt(*Island, Poi, FVector2D(FMath::Cos(Angle) * RadiusM, FMath::Sin(Angle) * RadiusM), 0.0f);
	};
	const float GateAngle = FMath::DegreesToRadians(GateYaw);
	const bool bKairu = TribeId == TEXT("kairu");
	const bool bAsh = TribeId == TEXT("ashborn");

	// --- Central fire.
	FireLocation = Center;
	{
		TArray<FIUShapePart> Fire;
		for (int32 I = 0; I < 9; ++I)
		{
			const float A = I / 9.0f * 2.0f * PI;
			Fire.Add(FIUShapePart(EIUShape::Sphere, FVector(FMath::Cos(A) * 110, FMath::Sin(A) * 110, 15), FVector(45, 40, 32), StoneDark, false));
		}
		FIUShapePart FlamePart(EIUShape::Cone, FVector(0, 0, 70), FVector(90, 90, 140), Flame, false);
		FlamePart.Material = EIUMaterialKind::Emissive;
		Fire.Add(FlamePart);
		for (int32 I = 0; I < 5; ++I)
		{
			const float A = I / 5.0f * 2.0f * PI + 0.3f;
			Fire.Add(FIUShapePart(EIUShape::Cylinder, FVector(FMath::Cos(A) * 380, FMath::Sin(A) * 380, 25), FVector(40, 40, 200), Wood, true, FRotator(90, FMath::RadiansToDegrees(A) + 90, 0)));
		}
		if (AIUPropActor* Prop = AIUPropActor::Spawn(World, Center, 0.0f, Fire))
		{
			Prop->AddLight(FVector(0, 0, 160), FLinearColor(1.0f, 0.5f, 0.2f), 14000.0f, 2400.0f, true);
		}
	}

	// --- Huts on a ring (landward half for the coastal Kairu).
	const int32 HutCount = bAsh ? 6 : 7;
	for (int32 I = 0; I < HutCount; ++I)
	{
		const float Spread = bKairu ? PI : 2.0f * PI * 0.85f;
		const float A = GateAngle + (bKairu ? -Spread * 0.5f : PI - Spread * 0.5f) + Spread * (I + 0.5f) / HutCount + (bKairu ? 0.0f : 0.0f);
		const float RadiusM = bKairu ? 26.0f : 30.0f;
		const FVector Pos = Ground(A, RadiusM);
		HutSpots.Add(Pos);
		TArray<FIUShapePart> Hut;
		if (bKairu)
		{
			for (int32 P = 0; P < 4; ++P) { Hut.Add(FIUShapePart(EIUShape::Cylinder, FVector((P & 1) ? 220 : -220, (P & 2) ? 220 : -220, 90), FVector(22, 22, 180), WoodDark)); }
			Hut.Add(FIUShapePart(EIUShape::Cube, FVector(0, 0, 190), FVector(520, 520, 25), Wood));
			Hut.Add(FIUShapePart(EIUShape::Cube, FVector(0, 0, 330), FVector(440, 440, 260), Wood * 1.1f));
			Hut.Add(FIUShapePart(EIUShape::Cone, FVector(0, 0, 560), FVector(680, 680, 260), Dry));
			for (int32 S = 0; S < 5; ++S) { Hut.Add(FIUShapePart(EIUShape::Cube, FVector(330 + S * 20, 0, 30 + S * 36), FVector(40, 140, 15), WoodDark)); }
		}
		else if (bAsh)
		{
			Hut.Add(FIUShapePart(EIUShape::Cube, FVector(0, 0, 170), FVector(560, 460, 340), FLinearColor(0.12f, 0.11f, 0.11f)));
			Hut.Add(FIUShapePart(EIUShape::Cube, FVector(0, 0, 360), FVector(620, 520, 40), FLinearColor(0.2f, 0.12f, 0.08f)));
			Hut.Add(FIUShapePart(EIUShape::Cube, FVector(281, 0, 110), FVector(4, 120, 220), FLinearColor(0.01f, 0.01f, 0.01f), false));
		}
		else
		{
			Hut.Add(FIUShapePart(EIUShape::Cylinder, FVector(0, 0, 150), FVector(520, 520, 300), FLinearColor(0.32f, 0.24f, 0.14f)));
			Hut.Add(FIUShapePart(EIUShape::Cone, FVector(0, 0, 420), FVector(700, 700, 300), FLinearColor(0.42f, 0.36f, 0.18f)));
			Hut.Add(FIUShapePart(EIUShape::Cube, FVector(262, 0, 100), FVector(4, 110, 200), FLinearColor(0.02f, 0.02f, 0.02f), false));
		}
		AIUPropActor::Spawn(World, Pos, FMath::RadiansToDegrees(A) + 180.0f, Hut);
	}

	// --- Defences: palisade (Vesh'ka) or stone walls (Ashborn) with a gate gap facing inland.
	if (!bKairu)
	{
		TArray<FIUShapePart> Wall;
		const float RadiusM = 55.0f;
		const int32 Segments = bAsh ? 56 : 110;
		for (int32 I = 0; I < Segments; ++I)
		{
			const float A = I / static_cast<float>(Segments) * 2.0f * PI;
			const float Delta = FMath::Abs(FMath::FindDeltaAngleRadians(A, GateAngle));
			if (Delta < 0.09f) { continue; } // gate
			const FVector Pos = Ground(A, RadiusM) - Center;
			if (bAsh) { Wall.Add(FIUShapePart(EIUShape::Cube, Pos + FVector(0, 0, 170), FVector(80, 640, 380), FLinearColor(0.1f, 0.09f, 0.09f), true, FRotator(0, FMath::RadiansToDegrees(A), 0))); }
			else { Wall.Add(FIUShapePart(EIUShape::Cylinder, Pos + FVector(0, 0, 220), FVector(38, 38, 460 + (I % 3) * 30), FLinearColor(0.28f, 0.19f, 0.1f))); }
		}
		AIUPropActor::Spawn(World, Center, 0.0f, Wall);
		const FVector Gate = Ground(GateAngle, RadiusM + 2.0f);
		GuardPosts.Add(Gate + FVector(FMath::Cos(GateAngle + PI * 0.5f) * 450, FMath::Sin(GateAngle + PI * 0.5f) * 450, 0));
		GuardPosts.Add(Gate - FVector(FMath::Cos(GateAngle + PI * 0.5f) * 450, FMath::Sin(GateAngle + PI * 0.5f) * 450, 0));
		if (bAsh)
		{
			TArray<FIUShapePart> Brazier;
			Brazier.Add(FIUShapePart(EIUShape::Cylinder, FVector(0, 0, 60), FVector(70, 70, 120), StoneDark));
			FIUShapePart F(EIUShape::Cone, FVector(0, 0, 160), FVector(60, 60, 90), Flame, false);
			F.Material = EIUMaterialKind::Emissive;
			Brazier.Add(F);
			for (const FVector& Post : GuardPosts)
			{
				if (AIUPropActor* B = AIUPropActor::Spawn(World, Post, 0.0f, Brazier)) { B->AddLight(FVector(0, 0, 200), FLinearColor(1.0f, 0.4f, 0.1f), 8000.0f, 1500.0f); }
			}
		}
	}
	else
	{
		// Canoes on the beach and fish drying racks.
		for (int32 I = 0; I < 3; ++I)
		{
			const FVector Pos = Ground(GateAngle + PI + (I - 1) * 0.35f, 42.0f);
			AIUPropActor::Spawn(World, Pos, FMath::RadiansToDegrees(GateAngle) + 90.0f,
				{ FIUShapePart(EIUShape::Sphere, FVector(0, 0, 25), FVector(600, 110, 70), WoodDark), FIUShapePart(EIUShape::Cylinder, FVector(0, 120, 30), FVector(10, 10, 300), Wood, false, FRotator(90, 0, 0)) });
			WorkSpots.Add(Pos);
		}
		GuardPosts.Add(Ground(GateAngle, 40.0f));
		GuardPosts.Add(Ground(GateAngle + 0.8f, 40.0f));
	}

	// --- Patrol ring and work spots.
	for (int32 I = 0; I < 8; ++I) { PatrolPoints.Add(Ground(I / 8.0f * 2.0f * PI, bKairu ? 40.0f : 46.0f)); }
	for (int32 I = 0; I < 6; ++I) { WorkSpots.Add(Ground(I * 1.1f + 0.4f, 12.0f + (I % 3) * 7.0f)); }

	// --- Stores (stealing from them has consequences) and the sacred totem.
	const TArray<FIUShapePart> StoreVisual = { FIUShapePart(EIUShape::Cylinder, FVector(0, 0, 0), FVector(140, 140, 110), FLinearColor(0.45f, 0.36f, 0.2f)),
		FIUShapePart(EIUShape::Cone, FVector(0, 0, 90), FVector(170, 170, 60), Dry, false) };
	const char* StoreItems[3][3] = {
		{ "cooked_fish", "rope", "coconut" },
		{ "hide", "arrow", "herbs" },
		{ "obsidian", "charcoal", "crystal" } };
	const int32 Culture = bKairu ? 0 : (bAsh ? 2 : 1);
	for (int32 S = 0; S < 2; ++S)
	{
		const FVector Pos = Ground(GateAngle + PI * 0.5f + S * PI, 9.0f) + FVector(0, 0, 55);
		FActorSpawnParameters SP;
		SP.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		if (AIUContainer* Store = World->SpawnActor<AIUContainer>(AIUContainer::StaticClass(), Pos, FRotator::ZeroRotator, SP))
		{
			Store->Setup(FString::Printf(TEXT("village:%s:%d"), *TribeId, S), FText::FromString(FString::Printf(TEXT("Almacen de %s"), *VillageName)), StoreVisual, 12, TribeId);
			for (int32 K = 0; K < 3; ++K) { Store->GetStorage()->AddItem(StoreItems[Culture][K], K == 2 && Culture == 2 ? 1 : 5, -1.0f, false); }
			Store->FinishLoot();
		}
	}
	{
		const FVector Pos = Ground(GateAngle + PI, 8.0f);
		FActorSpawnParameters SP;
		SP.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		if (AIUTribeTotem* Totem = World->SpawnActor<AIUTribeTotem>(AIUTribeTotem::StaticClass(), Pos, FRotator(0, GateYaw, 0), SP))
		{
			Totem->TribeId = TribeId;
			Totem->Village = this;
			TArray<FIUShapePart> T;
			const FLinearColor Paint = bKairu ? FLinearColor(0.15f, 0.4f, 0.7f) : (bAsh ? FLinearColor(0.6f, 0.1f, 0.05f) : FLinearColor(0.85f, 0.82f, 0.72f));
			T.Add(FIUShapePart(EIUShape::Cylinder, FVector(0, 0, 300), FVector(90, 90, 600), Wood));
			T.Add(FIUShapePart(EIUShape::Sphere, FVector(0, 0, 620), FVector(130), Paint));
			T.Add(FIUShapePart(EIUShape::Cube, FVector(0, 0, 450), FVector(260, 30, 40), Paint, false));
			if (UIUAssets* Assets = UIUAssets::Get(this)) { Assets->BuildParts(Totem, Totem->GetRootComponent(), T, true); }
		}
	}
	// Lore placed in the village.
	if (const UIUStorySubsystem* Story = UIUStorySubsystem::Get(this))
	{
		for (const FIULoreDoc& Doc : Story->GetLore())
		{
			if (Doc.PoiId != IU::ToFString(Poi.Id)) { continue; }
			FActorSpawnParameters SP;
			SP.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
			if (AIULoreNote* Note = World->SpawnActor<AIULoreNote>(AIULoreNote::StaticClass(), Ground(GateAngle + PI * 0.25f, 6.0f) + FVector(0, 0, 80), FRotator::ZeroRotator, SP))
			{
				Note->Setup(Doc.Id);
			}
		}
	}
	UE_LOG(LogIsland, Log, TEXT("Village %s built (%d huts)"), *VillageName, HutSpots.Num());
}

FVector AIUVillage::GetSpot(int32 Kind, uint32 Seed, float TimeInState) const
{
	const TArray<FVector>* List = nullptr;
	switch (Kind)
	{
	case 0: List = &WorkSpots; break;
	case 1: List = &PatrolPoints; break;
	case 2: return FireLocation + FVector(FMath::Cos(Seed * 0.7f) * 350.0f, FMath::Sin(Seed * 0.7f) * 350.0f, 0.0f);
	case 3: List = &HutSpots; break;
	case 4: List = GuardPosts.Num() > 0 ? &GuardPosts : &PatrolPoints; break;
	default: break;
	}
	if (!List || List->Num() == 0) { return GetActorLocation(); }
	// Patrols advance through the ring over time; others pick a stable personal spot.
	const int32 Index = Kind == 1 ? (static_cast<int32>(Seed) + static_cast<int32>(TimeInState / 12.0f)) % List->Num() : static_cast<int32>(Seed % static_cast<uint32>(List->Num()));
	return (*List)[Index];
}

FString AIUVillage::RandomChatter(IUSim::Rng& Random) const
{
	return Chatter.Num() > 0 ? Chatter[Random.RangeInt(0, Chatter.Num() - 1)] : FString();
}

void AIUVillage::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	const APawn* Player = UGameplayStatics::GetPlayerPawn(this, 0);
	if (!Player) { return; }
	const float Dist = FVector::Dist2D(Player->GetActorLocation(), GetActorLocation());
	if (!bResidentsSpawned && Dist < IUVillageLocal::SpawnDistance && !IU::IsUnderground(Player->GetActorLocation())) { SpawnResidents(); }
	else if (bResidentsSpawned && (Dist > IUVillageLocal::DespawnDistance || IU::IsUnderground(Player->GetActorLocation()))) { DespawnResidents(); }
	Residents.RemoveAll([](const TWeakObjectPtr<AIUTribeNPC>& R) { return !R.IsValid(); });
}

void AIUVillage::SpawnResidents()
{
	using namespace IUVillageLocal;
	bResidentsSpawned = true;
	const UIUStorySubsystem* Story = UIUStorySubsystem::Get(this);
	const IUSim::TribeRuntime* Runtime = Story ? Story->Factions().FindRuntime(IU::ToStd(TribeId)) : nullptr;
	if (!Runtime) { return; }
	const int32 Count = FMath::Min(Runtime->Village.Population, MaxActiveResidents);
	const TCHAR** Names = TribeId == TEXT("kairu") ? KairuNames : (TribeId == TEXT("veshka") ? VeshNames : AshNames);
	UWorld* World = GetWorld();
	for (int32 I = 0; I < Count; ++I)
	{
		IUSim::ENpcRole Role = IUSim::ENpcRole::Gatherer;
		if (I == 0 && Runtime->Village.bLeaderAlive) { Role = IUSim::ENpcRole::Chief; }
		else if (I == 1) { Role = IUSim::ENpcRole::Cook; }
		else if (I % 3 == 2) { Role = IUSim::ENpcRole::Guard; }
		else if (I % 5 == 3) { Role = IUSim::ENpcRole::Hunter; }
		else if (I == Count - 1) { Role = IUSim::ENpcRole::Elder; }
		const uint32 Seed = IUSim::Hash2D(I, SpawnCounter++, IUSim::HashString(IU::ToStd(TribeId)));
		FVector Pos = HutSpots.Num() > 0 ? HutSpots[I % HutSpots.Num()] : GetActorLocation();
		Pos += FVector(FMath::Cos(Seed * 0.13f) * 300.0f, FMath::Sin(Seed * 0.13f) * 300.0f, 120.0f);
		FActorSpawnParameters SP;
		SP.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;
		AIUTribeNPC* NPC = World->SpawnActor<AIUTribeNPC>(AIUTribeNPC::StaticClass(), Pos, FRotator(0, Seed % 360, 0), SP);
		if (!NPC) { continue; }
		NPC->InitNPC(TribeId, Role, this, Seed, Names[I % MaxActiveResidents]);
		if (AIUCreatureAIController* AIC = Cast<AIUCreatureAIController>(NPC->GetController())) { AIC->RefreshSenses(); }
		Residents.Add(NPC);
	}
}

void AIUVillage::DespawnResidents()
{
	bResidentsSpawned = false;
	for (const TWeakObjectPtr<AIUTribeNPC>& R : Residents)
	{
		if (R.IsValid())
		{
			if (AController* C = R->GetController()) { C->Destroy(); }
			R->Destroy();
		}
	}
	Residents.Reset();
}

bool AIUVillage::IsWitnessed(const AActor* Suspect) const
{
	if (!Suspect) { return false; }
	for (const TWeakObjectPtr<AIUTribeNPC>& R : Residents)
	{
		const AIUTribeNPC* NPC = R.Get();
		if (!NPC || !NPC->IsAlive() || NPC->AnimState == IUSim::EAIState::Sleep) { continue; }
		if (FVector::Dist(NPC->GetActorLocation(), Suspect->GetActorLocation()) > 2500.0f) { continue; }
		FHitResult Hit;
		FCollisionQueryParams Params(SCENE_QUERY_STAT(IUWitness), false, NPC);
		Params.AddIgnoredActor(Suspect);
		const FVector Eye = NPC->GetActorLocation() + FVector(0, 0, 70);
		if (!GetWorld()->LineTraceSingleByChannel(Hit, Eye, Suspect->GetActorLocation() + FVector(0, 0, 50), ECC_Visibility, Params)) { return true; }
	}
	return false;
}

void AIUVillage::RaiseAlarm(AActor* Threat)
{
	if (UIUStorySubsystem* Story = UIUStorySubsystem::Get(this))
	{
		if (IUSim::TribeRuntime* R = Story->Factions().FindRuntime(IU::ToStd(TribeId))) { R->Village.Alarm = 1.0f; }
	}
	for (const TWeakObjectPtr<AIUTribeNPC>& Res : Residents)
	{
		AIUTribeNPC* NPC = Res.Get();
		if (!NPC || !NPC->IsAlive()) { continue; }
		if (Threat && Threat->IsA<AIUCharacter>() && IUSim::NpcBrain::IsCombatRole(NPC->GetRole())) { NPC->SetAngry(true); }
		if (AIUCreatureAIController* AIC = Cast<AIUCreatureAIController>(NPC->GetController())) { AIC->AlertTo(Threat); }
	}
}

void AIUVillage::OnResidentDied(AIUTribeNPC* Resident, AActor* Killer)
{
	Residents.Remove(Resident);
	// Murder by the player is accounted by the faction event; other deaths reduce population here.
	if (!(Killer && Killer->IsA<AIUCharacter>()))
	{
		if (UIUStorySubsystem* Story = UIUStorySubsystem::Get(this))
		{
			if (IUSim::TribeRuntime* R = Story->Factions().FindRuntime(IU::ToStd(TribeId))) { R->Village.Population = FMath::Max(0, R->Village.Population - 1); }
		}
	}
	RaiseAlarm(Killer);
}

// =============================================================================================

AIUTribeTotem::AIUTribeTotem()
{
	PrimaryActorTick.bCanEverTick = false;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;
}

float AIUTribeTotem::TakeDamage(float DamageAmount, FDamageEvent const& DamageEvent, AController* EventInstigator, AActor* DamageCauser)
{
	const float Applied = Super::TakeDamage(DamageAmount, DamageEvent, EventInstigator, DamageCauser);
	Health -= DamageAmount;
	if (Health <= 0.0f)
	{
		const bool bPlayer = EventInstigator && EventInstigator->GetPawn() && EventInstigator->GetPawn()->IsA<AIUCharacter>();
		if (bPlayer)
		{
			if (UIUStorySubsystem* Story = UIUStorySubsystem::Get(this)) { Story->ApplySocialEvent(TribeId, IUSim::ESocialEvent::DestroyStructure); }
			if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this))
			{
				WS->Notify(TEXT("Has destruido el totem sagrado"), IU::Palette::Bad);
				WS->BroadcastEvent(IUSim::EGameEvent::Custom, IU::ToStd(FString::Printf(TEXT("totem:%s"), *TribeId)), 1);
			}
			if (AIUVillage* V = Village.Get()) { V->RaiseAlarm(EventInstigator->GetPawn()); }
		}
		Destroy();
	}
	return Applied;
}
