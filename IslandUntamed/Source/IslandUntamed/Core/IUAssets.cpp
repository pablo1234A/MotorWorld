#include "Core/IUAssets.h"

#include "IslandUntamed.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/CollisionProfile.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "Materials/Material.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialParameterCollection.h"
#include "Misc/PackageName.h"

namespace IUAssetsLocal
{
	const FName ColorParam(TEXT("Color"));

	uint32 ColorKey(const FLinearColor& C, EIUMaterialKind Kind)
	{
		const FColor Q = C.ToFColor(false);
		return (static_cast<uint32>(Q.R) << 24) ^ (static_cast<uint32>(Q.G) << 16) ^ (static_cast<uint32>(Q.B) << 8) ^ (static_cast<uint32>(Kind) * 2654435761U);
	}
}

UIUAssets* UIUAssets::Get(const UObject* WorldContext)
{
	if (!WorldContext) { return nullptr; }
	const UWorld* World = GEngine ? GEngine->GetWorldFromContextObject(WorldContext, EGetWorldErrorMode::ReturnNull) : nullptr;
	const UGameInstance* GI = World ? World->GetGameInstance() : nullptr;
	return GI ? GI->GetSubsystem<UIUAssets>() : nullptr;
}

UMaterialInterface* UIUAssets::LoadOptional(const TCHAR* Path) const
{
	// LoadObject logs a warning when missing; check the package first to keep logs clean.
	if (!FPackageName::DoesPackageExist(FString(Path).Left(FString(Path).Find(TEXT(".")))))
	{
		return nullptr;
	}
	return LoadObject<UMaterialInterface>(nullptr, Path);
}

void UIUAssets::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	CubeMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
	SphereMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	CylinderMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	ConeMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cone.Cone"));
	PlaneMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Plane.Plane"));

	// Project materials (created by Scripts/setup_content.py). All optional.
	SolidParent = LoadOptional(TEXT("/Game/IslandUntamed/Materials/M_IU_Solid.M_IU_Solid"));
	FoliageParent = LoadOptional(TEXT("/Game/IslandUntamed/Materials/M_IU_Foliage.M_IU_Foliage"));
	EmissiveParent = LoadOptional(TEXT("/Game/IslandUntamed/Materials/M_IU_Emissive.M_IU_Emissive"));
	WaterParent = LoadOptional(TEXT("/Game/IslandUntamed/Materials/M_IU_Water.M_IU_Water"));
	TerrainMaterial = LoadOptional(TEXT("/Game/IslandUntamed/Materials/M_IU_Terrain.M_IU_Terrain"));
	GhostParent = LoadOptional(TEXT("/Game/IslandUntamed/Materials/M_IU_Ghost.M_IU_Ghost"));
	if (FPackageName::DoesPackageExist(TEXT("/Game/IslandUntamed/Materials/MPC_IU_Environment")))
	{
		EnvironmentCollection = LoadObject<UMaterialParameterCollection>(nullptr, TEXT("/Game/IslandUntamed/Materials/MPC_IU_Environment.MPC_IU_Environment"));
	}
	bProjectMaterials = SolidParent != nullptr;

	// Engine fallbacks.
	UMaterialInterface* BasicShape = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
	if (!SolidParent) { SolidParent = BasicShape; }
	if (!FoliageParent) { FoliageParent = SolidParent; }
	if (!EmissiveParent) { EmissiveParent = SolidParent; }
	if (!WaterParent) { WaterParent = SolidParent; }
	if (!GhostParent) { GhostParent = SolidParent; }
	if (!TerrainMaterial && GEngine) { TerrainMaterial = static_cast<UMaterialInterface*>(GEngine->VertexColorMaterial); }
	if (!TerrainMaterial) { TerrainMaterial = SolidParent; }

	UE_LOG(LogIsland, Log, TEXT("IUAssets: project materials %s"), bProjectMaterials ? TEXT("found") : TEXT("missing (using engine fallbacks; run Scripts/setup_content.py)"));
}

UStaticMesh* UIUAssets::GetMesh(EIUShape Shape) const
{
	switch (Shape)
	{
	case EIUShape::Cube: return CubeMesh;
	case EIUShape::Sphere: return SphereMesh;
	case EIUShape::Cylinder: return CylinderMesh;
	case EIUShape::Cone: return ConeMesh;
	case EIUShape::Plane: return PlaneMesh;
	}
	return CubeMesh;
}

FVector UIUAssets::NativeSize(EIUShape Shape)
{
	return Shape == EIUShape::Plane ? FVector(100.0, 100.0, 1.0) : FVector(100.0);
}

UMaterialInterface* UIUAssets::GetMaterial(const FLinearColor& Color, EIUMaterialKind Kind)
{
	const uint32 Key = IUAssetsLocal::ColorKey(Color, Kind);
	if (TObjectPtr<UMaterialInstanceDynamic>* Found = MaterialCache.Find(Key))
	{
		return Found->Get();
	}
	UMaterialInterface* Parent = SolidParent;
	switch (Kind)
	{
	case EIUMaterialKind::Foliage: Parent = FoliageParent; break;
	case EIUMaterialKind::Emissive: Parent = EmissiveParent; break;
	case EIUMaterialKind::Water: Parent = WaterParent; break;
	case EIUMaterialKind::Solid: break;
	}
	if (!Parent) { return nullptr; }
	UMaterialInstanceDynamic* MID = UMaterialInstanceDynamic::Create(Parent, this);
	MID->SetVectorParameterValue(IUAssetsLocal::ColorParam, Color);
	MaterialCache.Add(Key, MID);
	return MID;
}

UMaterialInterface* UIUAssets::GetTerrainMaterial() const
{
	return TerrainMaterial;
}

UMaterialInterface* UIUAssets::GetWaterMaterial()
{
	if (!WaterMID && WaterParent)
	{
		WaterMID = UMaterialInstanceDynamic::Create(WaterParent, this);
		WaterMID->SetVectorParameterValue(IUAssetsLocal::ColorParam, FLinearColor(0.02f, 0.16f, 0.24f));
	}
	return WaterMID;
}

UMaterialInterface* UIUAssets::GetGhostMaterial(bool bValid)
{
	TObjectPtr<UMaterialInstanceDynamic>& Slot = bValid ? GhostValidMID : GhostInvalidMID;
	if (!Slot && GhostParent)
	{
		Slot = UMaterialInstanceDynamic::Create(GhostParent, this);
		Slot->SetVectorParameterValue(IUAssetsLocal::ColorParam, bValid ? FLinearColor(0.15f, 0.9f, 0.3f, 0.4f) : FLinearColor(0.95f, 0.15f, 0.1f, 0.4f));
	}
	return Slot;
}

TArray<UStaticMeshComponent*> UIUAssets::BuildParts(AActor* Owner, USceneComponent* Parent, const TArray<FIUShapePart>& Parts, bool bCastShadows)
{
	TArray<UStaticMeshComponent*> Out;
	if (!Owner || !Parent) { return Out; }
	Out.Reserve(Parts.Num());
	for (const FIUShapePart& P : Parts)
	{
		UStaticMeshComponent* C = NewObject<UStaticMeshComponent>(Owner);
		C->SetStaticMesh(GetMesh(P.Shape));
		C->SetupAttachment(Parent);
		C->SetRelativeLocation(P.Offset);
		C->SetRelativeRotation(P.Rotation);
		C->SetRelativeScale3D(P.Size / NativeSize(P.Shape));
		C->SetMaterial(0, GetMaterial(P.Color, P.Material));
		C->SetCastShadow(bCastShadows);
		if (P.bCollision)
		{
			C->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
			C->SetCollisionProfileName(UCollisionProfile::BlockAll_ProfileName);
			C->SetCollisionResponseToChannel(ECC_GameTraceChannel1, ECR_Block);
		}
		else
		{
			C->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
			C->SetCollisionResponseToAllChannels(ECR_Ignore);
			C->SetCollisionResponseToChannel(ECC_GameTraceChannel1, ECR_Block);
			C->SetCollisionResponseToChannel(ECC_Visibility, ECR_Block);
		}
		if (!P.Tag.IsNone()) { C->ComponentTags.Add(P.Tag); }
		C->RegisterComponent();
		Owner->AddInstanceComponent(C);
		Out.Add(C);
	}
	return Out;
}
