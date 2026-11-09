// Island Untamed - static decoration assembled from primitive parts
// (wrecks, ruins, buildings of POIs). Optional point light.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Core/IUAssets.h"
#include "IUPropActor.generated.h"

class UPointLightComponent;

UCLASS()
class ISLANDUNTAMED_API AIUPropActor : public AActor
{
	GENERATED_BODY()

public:
	AIUPropActor();

	static AIUPropActor* Spawn(UWorld* World, const FVector& Location, float Yaw, const TArray<FIUShapePart>& Parts, bool bCastShadows = true);
	UPointLightComponent* AddLight(const FVector& Offset, const FLinearColor& Color, float Intensity, float Radius, bool bShadows = false);

private:
	UPROPERTY() TObjectPtr<USceneComponent> Root;
};
