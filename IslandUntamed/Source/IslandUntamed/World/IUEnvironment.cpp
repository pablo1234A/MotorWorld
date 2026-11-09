#include "World/IUEnvironment.h"

#include "Audio/IUAudioDirector.h"
#include "Core/IUAssets.h"
#include "Core/IUTypes.h"
#include "Player/IUCharacter.h"
#include "Player/IUSurvivalComponent.h"
#include "World/IUWorldSubsystem.h"
#include "Camera/PlayerCameraManager.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/PostProcessComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/VolumetricCloudComponent.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "Kismet/KismetMaterialLibrary.h"
#include "Materials/MaterialParameterCollection.h"

namespace IUEnvironmentLocal
{
	constexpr int32 RainDrops = 700;
	constexpr float RainBox = 3000.0f;
	constexpr float RainHeight = 1800.0f;
}

AIUEnvironment::AIUEnvironment()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickGroup = TG_PostUpdateWork;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;

	Sun = CreateDefaultSubobject<UDirectionalLightComponent>(TEXT("Sun"));
	Sun->SetupAttachment(Root);
	Sun->SetMobility(EComponentMobility::Movable);
	Sun->SetAtmosphereSunLight(true);
	Sun->SetAtmosphereSunLightIndex(0);
	Sun->SetIntensity(10.0f);
	Sun->SetLightColor(FLinearColor(1.0f, 0.96f, 0.9f));
	Sun->SetDynamicShadowCascades(4);
	Sun->bUseInsetShadowsForMovableObjects = true;

	Moon = CreateDefaultSubobject<UDirectionalLightComponent>(TEXT("Moon"));
	Moon->SetupAttachment(Root);
	Moon->SetMobility(EComponentMobility::Movable);
	Moon->SetAtmosphereSunLight(true);
	Moon->SetAtmosphereSunLightIndex(1);
	Moon->SetIntensity(0.25f);
	Moon->SetLightColor(FLinearColor(0.55f, 0.65f, 1.0f));
	Moon->SetCastShadows(true);

	Atmosphere = CreateDefaultSubobject<USkyAtmosphereComponent>(TEXT("Atmosphere"));
	Atmosphere->SetupAttachment(Root);

	SkyLight = CreateDefaultSubobject<USkyLightComponent>(TEXT("SkyLight"));
	SkyLight->SetupAttachment(Root);
	SkyLight->SetMobility(EComponentMobility::Movable);
	SkyLight->bRealTimeCapture = true;
	SkyLight->SourceType = ESkyLightSourceType::SLS_CapturedScene;
	SkyLight->SetIntensity(1.0f);

	Fog = CreateDefaultSubobject<UExponentialHeightFogComponent>(TEXT("Fog"));
	Fog->SetupAttachment(Root);
	Fog->SetFogDensity(0.012f);
	Fog->SetFogHeightFalloff(0.15f);
	Fog->SetVolumetricFog(true);

	Clouds = CreateDefaultSubobject<UVolumetricCloudComponent>(TEXT("Clouds"));
	Clouds->SetupAttachment(Root);

	PostProcess = CreateDefaultSubobject<UPostProcessComponent>(TEXT("PostProcess"));
	PostProcess->SetupAttachment(Root);
	PostProcess->bUnbound = true;

	Rain = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("Rain"));
	Rain->SetupAttachment(Root);
	Rain->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Rain->SetCastShadow(false);

	LightningLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("Lightning"));
	LightningLight->SetupAttachment(Root);
	LightningLight->SetIntensity(0.0f);
	LightningLight->SetAttenuationRadius(60000.0f);
	LightningLight->SetLightColor(FLinearColor(0.8f, 0.85f, 1.0f));
	LightningLight->SetCastShadows(false);
}

void AIUEnvironment::BeginPlay()
{
	Super::BeginPlay();
	if (UIUAssets* Assets = UIUAssets::Get(this))
	{
		Rain->SetStaticMesh(Assets->GetMesh(EIUShape::Cube));
		Rain->SetMaterial(0, Assets->GetMaterial(FLinearColor(0.6f, 0.65f, 0.75f), EIUMaterialKind::Water));
	}
	RainOffsets.SetNum(IUEnvironmentLocal::RainDrops);
	for (int32 I = 0; I < RainOffsets.Num(); ++I)
	{
		RainOffsets[I] = FVector(FMath::FRandRange(-IUEnvironmentLocal::RainBox, IUEnvironmentLocal::RainBox), FMath::FRandRange(-IUEnvironmentLocal::RainBox, IUEnvironmentLocal::RainBox), FMath::FRandRange(-300.0f, IUEnvironmentLocal::RainHeight));
		Rain->AddInstance(FTransform(FRotator::ZeroRotator, FVector(0, 0, -100000), FVector(0.012f, 0.012f, 0.7f)));
	}
}

void AIUEnvironment::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	UpdateSky(DeltaSeconds);
}

void AIUEnvironment::UpdateSky(float DeltaSeconds)
{
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!WS) { return; }
	const IUSim::WorldClock& Clock = WS->GetClock();
	const IUSim::WeatherParams& W = Clock.GetParams();

	APlayerCameraManager* Cam = UGameplayStatics::GetPlayerCameraManager(this, 0);
	const FVector CamLoc = Cam ? Cam->GetCameraLocation() : FVector::ZeroVector;
	const bool bUnderground = IU::IsUnderground(CamLoc);
	const float WaterZ = WS->GetWaterLevelCm(CamLoc.X, CamLoc.Y);
	const bool bUnderwater = !bUnderground && CamLoc.Z < WaterZ - 5.0f;

	// --- Sun & moon.
	const float Elevation = Clock.GetSunElevationDeg();
	const float Azimuth = Clock.GetSunAzimuthDeg();
	Sun->SetWorldRotation(FRotator(-Elevation, Azimuth, 0.0f));
	Moon->SetWorldRotation(FRotator(-FMath::Max(10.0f, -Elevation * 0.8f), Azimuth + 180.0f, 0.0f));
	const float Daylight = Clock.GetDaylight();
	SmoothedDaylight = FMath::FInterpTo(SmoothedDaylight, Daylight, DeltaSeconds, 2.0f);
	const float CloudDim = 1.0f - W.CloudCover * 0.65f;
	Sun->SetIntensity(bUnderground ? 0.0f : 10.0f * SmoothedDaylight * CloudDim);
	Moon->SetIntensity(bUnderground ? 0.0f : 0.35f * (1.0f - SmoothedDaylight) * (1.0f - W.CloudCover * 0.6f));
	// Warm light at golden hours.
	const float Golden = FMath::Clamp(1.0f - FMath::Abs(Elevation - 6.0f) / 18.0f, 0.0f, 1.0f);
	Sun->SetLightColor(FMath::Lerp(FLinearColor(1.0f, 0.96f, 0.9f), FLinearColor(1.0f, 0.62f, 0.35f), Golden));

	// --- Sky light: keep nights readable (moonlit) but dark; caves get only local light.
	const float SkyIntensity = bUnderground ? 0.03f : FMath::Lerp(0.35f, 1.0f, SmoothedDaylight) * (1.0f - W.Rain * 0.25f);
	SkyLight->SetIntensity(SkyIntensity + LightningFlash * 6.0f);

	// --- Fog and clouds.
	const float FogDensity = bUnderground ? 0.0f : (0.008f + W.Fog * 0.07f + W.Rain * 0.015f) * (bUnderwater ? 20.0f : 1.0f);
	Fog->SetFogDensity(FogDensity);
	Fog->SetVisibility(!bUnderground);
	Clouds->SetVisibility(!bUnderground);
	Atmosphere->SetVisibility(!bUnderground);

	// --- Wind/wetness for project materials (foliage sway, wet surfaces).
	if (UMaterialParameterCollection* MPC = UIUAssets::Get(this) ? UIUAssets::Get(this)->GetEnvironmentCollection() : nullptr)
	{
		UKismetMaterialLibrary::SetScalarParameterValue(this, MPC, FName(TEXT("WindStrength")), W.Wind / 14.0f);
		UKismetMaterialLibrary::SetScalarParameterValue(this, MPC, FName(TEXT("Wetness")), W.Rain);
	}

	// --- Lightning & thunder.
	LightningFlash = FMath::Max(0.0f, LightningFlash - DeltaSeconds * 5.0f);
	LightningLight->SetIntensity(LightningFlash * 2.0e7f);
	if (!bUnderground && W.LightningChancePerSecond > 0.0f && FMath::FRand() < W.LightningChancePerSecond * DeltaSeconds)
	{
		TriggerLightning(CamLoc);
	}
	if (ThunderDelay > 0.0f)
	{
		ThunderDelay -= DeltaSeconds;
		if (ThunderDelay <= 0.0f)
		{
			if (AIUAudioDirector* Audio = AIUAudioDirector::Get(this)) { Audio->PlayCue(FName(TEXT("thunder")), ThunderLocation); }
		}
	}

	bool bSheltered = bUnderground;
	if (!bUnderground)
	{
		SkyCaptureTimer -= DeltaSeconds;
	}
	if (const APawn* Pawn = UGameplayStatics::GetPlayerPawn(this, 0))
	{
		if (const AIUCharacter* Character = Cast<AIUCharacter>(Pawn))
		{
			bSheltered = bSheltered || (Character->GetSurvival() && Character->GetSurvival()->LastEnvironment().bSheltered);
		}
	}
	UpdateRain(DeltaSeconds, bUnderground ? 0.0f : W.Rain, CamLoc, bSheltered);
	UpdatePostProcess(DeltaSeconds, bUnderwater, bUnderground);
}

void AIUEnvironment::TriggerLightning(const FVector& Around)
{
	const float Angle = FMath::FRandRange(0.0f, 2.0f * PI);
	const float Dist = FMath::FRandRange(2000.0f, 25000.0f);
	ThunderLocation = Around + FVector(FMath::Cos(Angle) * Dist, FMath::Sin(Angle) * Dist, 0.0f);
	LightningLight->SetWorldLocation(ThunderLocation + FVector(0, 0, 60000.0f));
	LightningFlash = 1.0f;
	ThunderDelay = Dist / 34300.0f; // speed of sound
}

void AIUEnvironment::UpdateRain(float DeltaSeconds, float Intensity, const FVector& CameraLocation, bool bSheltered)
{
	using namespace IUEnvironmentLocal;
	const int32 Visible = FMath::RoundToInt(Intensity * RainDrops);
	const float Speed = 1100.0f + Intensity * 500.0f;
	const UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	const float Wind = WS ? WS->GetClock().GetParams().Wind : 0.0f;
	const FVector Slant(Wind * 18.0f, Wind * 6.0f, 0.0f);
	for (int32 I = 0; I < RainOffsets.Num(); ++I)
	{
		FVector& O = RainOffsets[I];
		O.Z -= Speed * DeltaSeconds;
		O += Slant * DeltaSeconds;
		if (O.Z < -300.0f)
		{
			O = FVector(FMath::FRandRange(-RainBox, RainBox), FMath::FRandRange(-RainBox, RainBox), RainHeight);
		}
		const bool bShow = I < Visible && !(bSheltered && FMath::Abs(O.X) < 400.0f && FMath::Abs(O.Y) < 400.0f);
		const FVector Location = bShow ? CameraLocation + O : FVector(0, 0, -100000.0f);
		const FRotator Tilt(-Wind * 2.0f, 0.0f, 0.0f);
		Rain->UpdateInstanceTransform(I, FTransform(Tilt, Location, FVector(0.012f, 0.012f, 0.7f)), true, false, true);
	}
	Rain->MarkRenderStateDirty();
}

void AIUEnvironment::UpdatePostProcess(float DeltaSeconds, bool bUnderwater, bool bUnderground)
{
	FPostProcessSettings& S = PostProcess->Settings;
	const AIUCharacter* Character = Cast<AIUCharacter>(UGameplayStatics::GetPlayerPawn(this, 0));
	float Vignette = 0.4f;
	float Saturation = 1.0f;
	FLinearColor Gain(1.0f, 1.0f, 1.0f, 1.0f);
	float Fringe = 0.0f;
	if (Character && Character->GetSurvival())
	{
		const IUSim::SurvivalEffects& Fx = Character->GetSurvival()->Effects();
		Vignette += Fx.LowHealthVignette * 0.9f + Character->GetDamageFlash() * 0.5f;
		Saturation -= Fx.LowHealthVignette * 0.6f + Fx.SicknessTint * 0.3f;
		Gain = FLinearColor(1.0f - Fx.ColdTint * 0.15f + Character->GetDamageFlash() * 0.4f, 1.0f - Fx.ColdTint * 0.05f + Fx.SicknessTint * 0.08f, 1.0f + Fx.ColdTint * 0.2f, 1.0f);
		Fringe = Fx.SicknessTint * 3.0f + Fx.VisionBlur * 2.0f;
	}
	if (bUnderwater)
	{
		Gain = FLinearColor(0.45f, 0.75f, 0.95f, 1.0f);
		Saturation *= 0.8f;
	}
	S.bOverride_VignetteIntensity = true;
	S.VignetteIntensity = FMath::Clamp(Vignette, 0.0f, 1.5f);
	S.bOverride_ColorSaturation = true;
	S.ColorSaturation = FVector4(Saturation, Saturation, Saturation, 1.0f);
	S.bOverride_ColorGain = true;
	S.ColorGain = FVector4(Gain.R, Gain.G, Gain.B, 1.0f);
	S.bOverride_SceneFringeIntensity = true;
	S.SceneFringeIntensity = FMath::Clamp(Fringe, 0.0f, 5.0f);
	// Help the eye adapt at night and in caves without making them bright.
	S.bOverride_AutoExposureBias = true;
	S.AutoExposureBias = bUnderground ? 1.0f : FMath::Lerp(0.8f, 0.0f, SmoothedDaylight);
	S.bOverride_BloomIntensity = true;
	S.BloomIntensity = 0.6f + LightningFlash;
}
