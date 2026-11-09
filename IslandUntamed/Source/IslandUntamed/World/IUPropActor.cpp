#include "World/IUPropActor.h"

#include "Components/PointLightComponent.h"
#include "Engine/World.h"

AIUPropActor::AIUPropActor()
{
	PrimaryActorTick.bCanEverTick = false;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;
}

AIUPropActor* AIUPropActor::Spawn(UWorld* World, const FVector& Location, float Yaw, const TArray<FIUShapePart>& Parts, bool bCastShadows)
{
	if (!World) { return nullptr; }
	FActorSpawnParameters SP;
	SP.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	AIUPropActor* Prop = World->SpawnActor<AIUPropActor>(AIUPropActor::StaticClass(), Location, FRotator(0, Yaw, 0), SP);
	if (Prop)
	{
		if (UIUAssets* Assets = UIUAssets::Get(World)) { Assets->BuildParts(Prop, Prop->Root, Parts, bCastShadows); }
	}
	return Prop;
}

UPointLightComponent* AIUPropActor::AddLight(const FVector& Offset, const FLinearColor& Color, float Intensity, float Radius, bool bShadows)
{
	UPointLightComponent* L = NewObject<UPointLightComponent>(this);
	L->SetupAttachment(Root);
	L->SetRelativeLocation(Offset);
	L->SetLightColor(Color);
	L->SetIntensity(Intensity);
	L->SetAttenuationRadius(Radius);
	L->SetCastShadows(bShadows);
	L->RegisterComponent();
	AddInstanceComponent(L);
	return L;
}
