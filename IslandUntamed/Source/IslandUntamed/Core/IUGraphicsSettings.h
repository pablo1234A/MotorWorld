// Island Untamed - hardware-aware graphics configuration.
// First launch: runs the engine hardware benchmark and applies the suggested
// scalability; "Low" also disables Lumen/virtual shadow maps through the
// scalability groups so the game stays playable on modest GPUs.
#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "IUGraphicsSettings.generated.h"

UCLASS()
class ISLANDUNTAMED_API UIUGraphicsSettings : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	static void ApplyStartupSettings(const UObject* WorldContext);
	/** 0 Low, 1 Medium, 2 High, 3 Epic, 4 Cinematic. */
	static void SetQualityLevel(int32 Level);
	static int32 GetQualityLevel();
	static FString QualityName(int32 Level);
	static void SetFullscreen(bool bFullscreen);
	static bool IsFullscreen();
	static void SetFrameLimit(float Fps);
	static float GetFrameLimit();
	/** Global illumination method actually active (for the settings screen). */
	static FString DescribeLighting();
};
