// Island Untamed - runtime asset access.
//
// The project ships without binary art assets: every visual is assembled from
// the engine's basic shapes (/Engine/BasicShapes) with dynamic material
// instances. If Scripts/setup_content.py has been run in the editor, the
// project materials (/Game/IslandUntamed/Materials: terrain with vertex colors,
// foliage with wind, water, emissive, ghost) are used instead. Artists can
// replace any of them without touching code.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "IUAssets.generated.h"

class UStaticMesh;
class UMaterialInterface;
class UMaterialInstanceDynamic;
class UMaterialParameterCollection;

UENUM()
enum class EIUShape : uint8
{
	Cube,
	Sphere,
	Cylinder,
	Cone,
	Plane
};

UENUM()
enum class EIUMaterialKind : uint8
{
	Solid,     // lit opaque (BasicShapeMaterial or M_IU_Solid)
	Foliage,   // wind animated if M_IU_Foliage exists
	Emissive,  // glows if M_IU_Emissive exists
	Water
};

/** One primitive of an assembled visual. Units: centimeters, relative to the owner. */
struct FIUShapePart
{
	EIUShape Shape = EIUShape::Cube;
	FVector Offset = FVector::ZeroVector;
	FRotator Rotation = FRotator::ZeroRotator;
	FVector Size = FVector(100.0);   // final size in cm (not scale)
	FLinearColor Color = FLinearColor::Gray;
	EIUMaterialKind Material = EIUMaterialKind::Solid;
	bool bCollision = true;
	FName Tag = NAME_None;           // used by procedural animation (e.g. "LegFL")

	FIUShapePart() = default;
	FIUShapePart(EIUShape InShape, const FVector& InOffset, const FVector& InSize, const FLinearColor& InColor, bool bInCollision = true, const FRotator& InRot = FRotator::ZeroRotator)
		: Shape(InShape), Offset(InOffset), Rotation(InRot), Size(InSize), Color(InColor), bCollision(bInCollision) {}
};

UCLASS()
class ISLANDUNTAMED_API UIUAssets : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	static UIUAssets* Get(const UObject* WorldContext);

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;

	UStaticMesh* GetMesh(EIUShape Shape) const;
	/** Native size of the engine basic shape (all are 100 cm). */
	static FVector NativeSize(EIUShape Shape);

	/** Cached dynamic material with the given color. */
	UMaterialInterface* GetMaterial(const FLinearColor& Color, EIUMaterialKind Kind = EIUMaterialKind::Solid);
	UMaterialInterface* GetTerrainMaterial() const;
	UMaterialInterface* GetWaterMaterial();
	/** Placement preview material (green valid / red invalid). */
	UMaterialInterface* GetGhostMaterial(bool bValid);
	/** Optional global parameter collection (wind, wetness) used by project materials. */
	UMaterialParameterCollection* GetEnvironmentCollection() const { return EnvironmentCollection; }
	bool HasProjectMaterials() const { return bProjectMaterials; }

	/**
	 * Creates static mesh components for every part, attached to Parent.
	 * Returns the created components (same order as Parts).
	 */
	TArray<class UStaticMeshComponent*> BuildParts(AActor* Owner, USceneComponent* Parent, const TArray<FIUShapePart>& Parts, bool bCastShadows = true);

private:
	UMaterialInterface* LoadOptional(const TCHAR* Path) const;

	UPROPERTY() TObjectPtr<UStaticMesh> CubeMesh;
	UPROPERTY() TObjectPtr<UStaticMesh> SphereMesh;
	UPROPERTY() TObjectPtr<UStaticMesh> CylinderMesh;
	UPROPERTY() TObjectPtr<UStaticMesh> ConeMesh;
	UPROPERTY() TObjectPtr<UStaticMesh> PlaneMesh;

	UPROPERTY() TObjectPtr<UMaterialInterface> SolidParent;
	UPROPERTY() TObjectPtr<UMaterialInterface> FoliageParent;
	UPROPERTY() TObjectPtr<UMaterialInterface> EmissiveParent;
	UPROPERTY() TObjectPtr<UMaterialInterface> WaterParent;
	UPROPERTY() TObjectPtr<UMaterialInterface> TerrainMaterial;
	UPROPERTY() TObjectPtr<UMaterialInterface> GhostParent;
	UPROPERTY() TObjectPtr<UMaterialParameterCollection> EnvironmentCollection;

	UPROPERTY() TMap<uint32, TObjectPtr<UMaterialInstanceDynamic>> MaterialCache;
	UPROPERTY() TObjectPtr<UMaterialInstanceDynamic> WaterMID;
	UPROPERTY() TObjectPtr<UMaterialInstanceDynamic> GhostValidMID;
	UPROPERTY() TObjectPtr<UMaterialInstanceDynamic> GhostInvalidMID;

	bool bProjectMaterials = false;
};
