#include "World/IUIntroDirector.h"

#include "Audio/IUAudioDirector.h"
#include "Core/IUTypes.h"
#include "World/IUPropActor.h"
#include "World/IUVisuals.h"
#include "World/IUWorldSubsystem.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Camera/PlayerCameraManager.h"
#include "Components/PointLightComponent.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"

namespace IUIntroLocal
{
	constexpr float CrashTime = 15.0f;
	constexpr float BlackTime = 4.0f;

	struct FLine { float Time; const TCHAR* Text; };
	const FLine Lines[] = {
		{ 0.5f, TEXT("Vuelo IU-417. Pacifico Sur. 03:12") },
		{ 4.0f, TEXT("Piloto: \"Senores pasajeros, abrochense los cinturones. Atravesamos una zona de tormenta.\"") },
		{ 8.0f, TEXT("La brujula gira sin control. Hay una luz azul bajo las nubes.") },
		{ 11.0f, TEXT("Piloto: \"¡Preparense para el impacto! ¡Cabeza abajo!\"") },
		{ 15.5f, TEXT("") },
		{ 17.0f, TEXT("...") },
	};
}

AIUIntroDirector::AIUIntroDirector()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bTickEvenWhenPaused = false;
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
}

void AIUIntroDirector::BuildCabin()
{
	using namespace IUVisuals::Colors;
	TArray<FIUShapePart> Parts;
	const FLinearColor Wall(0.78f, 0.78f, 0.76f);
	const FLinearColor Seat(0.08f, 0.12f, 0.35f);
	// Fuselage interior (hollow box) 30 m long.
	Parts.Add(FIUShapePart(EIUShape::Cube, FVector(0, 0, -20), FVector(3000, 420, 40), FLinearColor(0.2f, 0.2f, 0.22f)));
	Parts.Add(FIUShapePart(EIUShape::Cube, FVector(0, 0, 260), FVector(3000, 420, 40), Wall));
	Parts.Add(FIUShapePart(EIUShape::Cube, FVector(0, 230, 120), FVector(3000, 40, 300), Wall));
	Parts.Add(FIUShapePart(EIUShape::Cube, FVector(0, -230, 120), FVector(3000, 40, 300), Wall));
	Parts.Add(FIUShapePart(EIUShape::Cube, FVector(1520, 0, 120), FVector(40, 420, 300), Wall));
	Parts.Add(FIUShapePart(EIUShape::Cube, FVector(-1520, 0, 120), FVector(40, 420, 300), Wall));
	// Windows (dark, lightning shows through the light outside).
	for (int32 I = 0; I < 14; ++I)
	{
		FIUShapePart Win(EIUShape::Cube, FVector(-1300 + I * 200, -208, 150), FVector(40, 6, 60), FLinearColor(0.05f, 0.07f, 0.12f), false);
		Win.Material = EIUMaterialKind::Emissive;
		Parts.Add(Win);
	}
	// Seat rows.
	for (int32 Row = 0; Row < 12; ++Row)
	{
		for (int32 Side = -1; Side <= 1; Side += 2)
		{
			for (int32 Col = 0; Col < 2; ++Col)
			{
				const FVector Base(-1100 + Row * 190, Side * (70 + Col * 60), 0);
				Parts.Add(FIUShapePart(EIUShape::Cube, Base + FVector(0, 0, 25), FVector(55, 50, 50), Seat));
				Parts.Add(FIUShapePart(EIUShape::Cube, Base + FVector(-25, 0, 80), FVector(12, 50, 110), Seat));
			}
		}
	}
	// Overhead bins.
	Parts.Add(FIUShapePart(EIUShape::Cube, FVector(0, 170, 215), FVector(2800, 70, 50), Wall * 0.9f));
	Parts.Add(FIUShapePart(EIUShape::Cube, FVector(0, -170, 215), FVector(2800, 70, 50), Wall * 0.9f));
	Cabin = AIUPropActor::Spawn(GetWorld(), CabinOrigin, 0.0f, Parts, true);
	if (Cabin)
	{
		for (int32 I = 0; I < 6; ++I)
		{
			CabinLights.Add(Cabin->AddLight(FVector(-1200 + I * 480, 0, 230), FLinearColor(1.0f, 0.93f, 0.8f), 3000.0f, 900.0f, false));
		}
	}
}

void AIUIntroDirector::StartIntro(const FVector& InWakeLocation, float InWakeYaw)
{
	WakeLocation = InWakeLocation;
	WakeYaw = InWakeYaw;
	// The cabin is staged high above the ocean, south of the island.
	CabinOrigin = FVector(InWakeLocation.X, InWakeLocation.Y - 300000.0f, 150000.0f);
	BuildCabin();
	FActorSpawnParameters SP;
	SP.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	Camera = GetWorld()->SpawnActor<ACameraActor>(ACameraActor::StaticClass(), CabinOrigin + FVector(-1000, 70, 120), FRotator(0, 0, 0), SP);
	if (Camera) { Camera->GetCameraComponent()->SetFieldOfView(80.0f); }
	if (APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0))
	{
		PC->SetViewTarget(Camera);
		if (PC->PlayerCameraManager) { PC->PlayerCameraManager->StartCameraFade(1.0f, 0.0f, 2.0f, FLinearColor::Black, true, false); }
	}
	if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this))
	{
		WS->Flow = EIUGameFlow::Intro;
		WS->GetClock().ForceWeather(IUSim::EWeather::Storm, 2.5f, true);
	}
	Time = 0.0f;
	bRunning = true;
	bCrashed = false;
}

void AIUIntroDirector::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!bRunning) { return; }
	Time += DeltaSeconds;
	using namespace IUIntroLocal;

	for (const FLine& Line : Lines) { if (Time >= Line.Time) { Subtitle = Line.Text; } }

	if (Time < CrashTime && Camera)
	{
		// Turbulence grows over time; the plane pitches down at the end.
		const float Intensity = FMath::Clamp(Time / CrashTime, 0.0f, 1.0f);
		const float T = GetWorld()->GetTimeSeconds();
		const float Shake = 0.3f + Intensity * Intensity * 4.0f;
		const FRotator Rot(FMath::Sin(T * 23.0f) * Shake - Intensity * Intensity * 25.0f, FMath::Sin(T * 17.0f) * Shake * 0.7f, FMath::Sin(T * 11.0f) * Shake * 2.0f);
		Camera->SetActorRotation(Rot);
		Camera->SetActorLocation(CabinOrigin + FVector(-1000, 70, 120) + FVector(0, FMath::Sin(T * 31.0f), FMath::Sin(T * 27.0f)) * Shake * 3.0f);
		// Cabin lights flicker then fail.
		for (int32 I = 0; I < CabinLights.Num(); ++I)
		{
			const bool bOn = Time < 8.0f || (Time < 12.0f && FMath::Sin(T * (13.0f + I)) > 0.2f);
			CabinLights[I]->SetIntensity(bOn ? 3000.0f : (Time > 11.0f ? 400.0f : 0.0f));
			CabinLights[I]->SetLightColor(Time > 11.0f ? FLinearColor(1.0f, 0.1f, 0.05f) : FLinearColor(1.0f, 0.93f, 0.8f));
		}
		if (Time > 11.0f && !bAlarmPlayed)
		{
			bAlarmPlayed = true;
			if (AIUAudioDirector* Audio = AIUAudioDirector::Get(this)) { Audio->PlayCue(TEXT("alarm"), FVector::ZeroVector, false); }
		}
		if (FMath::FRand() < DeltaSeconds * 0.6f)
		{
			if (AIUAudioDirector* Audio = AIUAudioDirector::Get(this)) { Audio->PlayCue(TEXT("thunder"), FVector::ZeroVector, false); }
		}
	}
	else if (!bCrashed)
	{
		bCrashed = true;
		if (AIUAudioDirector* Audio = AIUAudioDirector::Get(this)) { Audio->PlayCue(TEXT("crash"), FVector::ZeroVector, false); }
		if (APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0))
		{
			if (PC->PlayerCameraManager) { PC->PlayerCameraManager->StartCameraFade(0.0f, 1.0f, 0.15f, FLinearColor::White, true, true); }
		}
	}
	else if (Time > CrashTime + 0.4f && Time < CrashTime + 0.6f)
	{
		if (APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0))
		{
			if (PC->PlayerCameraManager) { PC->PlayerCameraManager->StartCameraFade(1.0f, 1.0f, 0.1f, FLinearColor::Black, true, true); }
		}
	}
	else if (Time > CrashTime + BlackTime)
	{
		Finish();
	}
}

void AIUIntroDirector::Skip()
{
	if (bRunning) { Finish(); }
}

void AIUIntroDirector::Finish()
{
	bRunning = false;
	Subtitle.Reset();
	if (Cabin) { Cabin->Destroy(); Cabin = nullptr; }
	CabinLights.Reset();
	if (APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0))
	{
		if (APawn* Pawn = PC->GetPawn()) { PC->SetViewTarget(Pawn); }
		if (PC->PlayerCameraManager) { PC->PlayerCameraManager->StartCameraFade(1.0f, 0.0f, 5.0f, FLinearColor::Black, false, false); }
	}
	if (Camera) { Camera->Destroy(); Camera = nullptr; }
	// The storm calms down over the next hours as the survivor wakes up at dawn.
	if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this)) { WS->GetClock().ForceWeather(IUSim::EWeather::Rain, 1.0f, false); }
	OnFinished.Broadcast();
}
