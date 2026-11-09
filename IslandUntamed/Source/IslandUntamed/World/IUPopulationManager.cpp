#include "World/IUPopulationManager.h"

#include "Core/IUGameInstance.h"
#include "Core/IUTypes.h"
#include "Creatures/IUAnimal.h"
#include "Creatures/IUCreatureAIController.h"
#include "World/IUWorldSubsystem.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"

AIUPopulationManager::AIUPopulationManager()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickInterval = 0.5f;
}

void AIUPopulationManager::ClearAll()
{
	for (const TWeakObjectPtr<AIUAnimal>& A : Animals)
	{
		if (A.IsValid())
		{
			if (AController* C = A->GetController()) { C->Destroy(); }
			A->Destroy();
		}
	}
	Animals.Reset();
}

void AIUPopulationManager::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	const APawn* Player = UGameplayStatics::GetPlayerPawn(this, 0);
	if (!WS || !Player || WS->Flow != EIUGameFlow::Playing) { return; }
	const FVector P = Player->GetActorLocation();

	Animals.RemoveAll([](const TWeakObjectPtr<AIUAnimal>& A) { return !A.IsValid(); });
	// Despawn far animals (and corpses nobody cares about).
	for (int32 I = Animals.Num() - 1; I >= 0; --I)
	{
		AIUAnimal* A = Animals[I].Get();
		if (FVector::Dist2D(A->GetActorLocation(), P) > DespawnDistance || A->GetActorLocation().Z < -50000.0f)
		{
			if (AController* C = A->GetController()) { C->Destroy(); }
			A->Destroy();
			Animals.RemoveAt(I);
		}
	}
	if (IU::IsUnderground(P)) { return; }

	Timer -= DeltaSeconds;
	if (Timer > 0.0f) { return; }
	Timer = 2.0f;
	const int32 Target = WS->GetClock().IsNight() ? MaxAnimals * 2 / 3 : MaxAnimals;
	if (Animals.Num() < Target) { SpawnGroup(P); }
}

void AIUPopulationManager::SpawnGroup(const FVector& PlayerLocation)
{
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	if (!WS || !Db || !WS->GetIsland()) { return; }
	IUSim::Rng& R = WS->GetRandom();
	for (int32 Try = 0; Try < 6; ++Try)
	{
		const float Angle = R.Range(0.0f, 2.0f * PI);
		const float Dist = R.Range(SpawnMinDistance, SpawnMaxDistance);
		const float X = PlayerLocation.X + FMath::Cos(Angle) * Dist;
		const float Y = PlayerLocation.Y + FMath::Sin(Angle) * Dist;
		const IUSim::EBiome Biome = WS->GetIsland()->GetBiome(X * IU::CmToMeters, Y * IU::CmToMeters);
		if (Biome == IUSim::EBiome::Ocean || Biome == IUSim::EBiome::Reef || Biome == IUSim::EBiome::River || Biome == IUSim::EBiome::Lake) { continue; }
		if (WS->FindVillageAt(FVector(X, Y, 0), false)) { continue; } // keep villages free of wildlife
		const IUSim::AnimalDef* Def = Db->Animals.RollForBiome(IUSim::BiomeToString(Biome), WS->GetClock().IsNight(), R);
		if (!Def) { continue; }
		const int32 Count = R.RangeInt(Def->GroupMin, Def->GroupMax);
		for (int32 I = 0; I < Count; ++I)
		{
			const float GX = X + R.Range(-600.0f, 600.0f);
			const float GY = Y + R.Range(-600.0f, 600.0f);
			const FVector Loc(GX, GY, WS->GetGroundHeightCm(GX, GY) + 150.0f);
			FActorSpawnParameters SP;
			SP.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;
			AIUAnimal* Animal = GetWorld()->SpawnActor<AIUAnimal>(AIUAnimal::StaticClass(), Loc, FRotator(0, R.Range(0.0f, 360.0f), 0), SP);
			if (!Animal) { continue; }
			Animal->InitAnimal(Def->Id);
			Animal->HomeLocation = Loc;
			if (AIUCreatureAIController* AIC = Cast<AIUCreatureAIController>(Animal->GetController())) { AIC->RefreshSenses(); }
			Animals.Add(Animal);
		}
		return;
	}
}
