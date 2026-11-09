// Island Untamed - sky, lighting, weather visuals and screen effects.
//
// Physically based sky (SkyAtmosphere + real-time SkyLight capture), sun and
// moon driven by IUSim::WorldClock, volumetric fog and clouds, rain streaks,
// lightning, and a post-process layer that visualizes the survivor's state
// (low health vignette, cold tint, sickness, damage flash, underwater).
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "IUEnvironment.generated.h"

class UDirectionalLightComponent;
class USkyAtmosphereComponent;
class USkyLightComponent;
class UExponentialHeightFogComponent;
class UVolumetricCloudComponent;
class UPostProcessComponent;
class UInstancedStaticMeshComponent;
class UPointLightComponent;

UCLASS()
class ISLANDUNTAMED_API AIUEnvironment : public AActor
{
	GENERATED_BODY()

public:
	AIUEnvironment();
	virtual void Tick(float DeltaSeconds) override;

	/** 0..1 lightning flash currently visible (HUD/audio hooks). */
	float GetLightning() const { return LightningFlash; }

protected:
	virtual void BeginPlay() override;

private:
	void UpdateSky(float DeltaSeconds);
	void UpdateRain(float DeltaSeconds, float Intensity, const FVector& CameraLocation, bool bSheltered);
	void UpdatePostProcess(float DeltaSeconds, bool bUnderwater, bool bUnderground);
	void TriggerLightning(const FVector& Around);

	UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> Root;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UDirectionalLightComponent> Sun;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UDirectionalLightComponent> Moon;
	UPROPERTY(VisibleAnywhere) TObjectPtr<USkyAtmosphereComponent> Atmosphere;
	UPROPERTY(VisibleAnywhere) TObjectPtr<USkyLightComponent> SkyLight;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UExponentialHeightFogComponent> Fog;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UVolumetricCloudComponent> Clouds;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UPostProcessComponent> PostProcess;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UInstancedStaticMeshComponent> Rain;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UPointLightComponent> LightningLight;

	TArray<FVector> RainOffsets;
	float LightningFlash = 0.0f;
	float ThunderDelay = -1.0f;
	FVector ThunderLocation = FVector::ZeroVector;
	float SmoothedDaylight = 1.0f;
	float SkyCaptureTimer = 0.0f;
};
