// Island Untamed - streamed procedural world.
//
//  * Terrain: the island is split in 128 m chunks. Every chunk always has a
//    mesh; its LOD (2/4/8/32 m vertex spacing) follows the distance to the
//    player. Skirts hide cracks between LODs. Mesh data is computed on worker
//    threads and uploaded on the game thread with a per-frame budget.
//  * Resources/foliage: one HISM per (resource type, primitive part) for the
//    whole island. Instance slots are recycled through free lists, so chunks
//    can stream in/out without index shuffling and harvest lookups stay O(1).
//  * Water: ocean plane following the camera, river ribbons, lake discs.
//
// This is the runtime equivalent of World Partition + HLOD for a world that
// does not exist as authored level data. See Docs/ARCHITECTURE.md.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Containers/Queue.h"
#include "HAL/ThreadSafeCounter.h"
#include "Sim/SimIsland.h"
#include "Sim/SimItems.h"
#include "IUIslandWorld.generated.h"

class UProceduralMeshComponent;
class UHierarchicalInstancedStaticMeshComponent;
class UStaticMeshComponent;
class AIUCharacter;


/** Mesh data produced by a worker thread for one chunk. */
struct FIUChunkMeshData
{
	FIntPoint Coord;
	int32 Lod = 0;
	uint32 Generation = 0;
	TArray<FVector> Vertices;
	TArray<int32> Triangles;
	TArray<FVector> Normals;
	TArray<FVector2D> UVs;
	TArray<FLinearColor> Colors;
};

/** Scatter (resources/foliage) computed by a worker thread for one chunk. */
struct FIUChunkScatterData
{
	FIntPoint Coord;
	std::vector<IUSim::ScatterInstance> Instances;
};

/** Shared between the actor and worker threads; outlives the actor if jobs are still running. */
struct FIUChunkJobQueue
{
	TQueue<FIUChunkMeshData, EQueueMode::Mpsc> Meshes;
	TQueue<FIUChunkScatterData, EQueueMode::Mpsc> Scatters;
	FThreadSafeCounter InFlight;
};

/** Result of hitting a resource node. */
struct FIUHarvestOutcome
{
	bool bValid = false;
	bool bWrongTool = false;
	bool bDepleted = false;
	FString NodeName;
	FString RequiredTool;
	TArray<IUSim::ItemAmount> Items;
};

UCLASS()
class ISLANDUNTAMED_API AIUIslandWorld : public AActor
{
	GENERATED_BODY()

public:
	AIUIslandWorld();
	virtual void Tick(float DeltaSeconds) override;

	/** Builds water, POIs and the terrain around Focus synchronously (loading screen). */
	void InitializeWorld(const FVector& Focus);
	/** Forces the streaming focus (teleports, loading a save). */
	void SetFocus(const FVector& Focus, bool bImmediate);

	/** Resource lookup from an interaction/melee trace. Returns nullptr if the hit is not a node. */
	const IUSim::ResourceNodeDef* GetNodeFromHit(const UPrimitiveComponent* Component, int32 Item) const;
	FIUHarvestOutcome HarvestHit(const UPrimitiveComponent* Component, int32 Item, IUSim::EToolType Tool, int32 ToolTier, float ToolMultiplier);
	/** Called when a depleted node regrows. */
	void RestoreNode(uint32 StableId);

	bool IsTerrainComponent(const UPrimitiveComponent* Component) const;
	/** True once collision exists under Location (used before giving control to the player). */
	bool IsGroundReady(const FVector& Location) const;

	static constexpr float ChunkSizeCm = 12800.0f;

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

private:
	struct FChunkState
	{
		int32 Lod = -1;            // currently displayed LOD
		int32 RequestedLod = -1;   // LOD being built
		uint32 Generation = 0;
		int32 MeshIndex = -1;      // index into TerrainMeshes
		int32 FoliageLevel = 0;    // 0 none, 1 large only, 2 everything
		TArray<TPair<int32, int32>> NodeSlots; // (node type, slot)
		bool bSkip = false;        // deep ocean
	};

	struct FNodeSlot
	{
		uint32 StableId = 0;
		FIntPoint Chunk;
		FTransform Transform;
		int32 HitsLeft = 0;
		bool bActive = false;
	};

	struct FNodePool
	{
		TArray<UHierarchicalInstancedStaticMeshComponent*> Parts;
		TArray<FTransform> PartLocal;  // part transform relative to the node
		TArray<FNodeSlot> Slots;
		TArray<int32> Free;
		bool bDirty = false;
	};

	void CreateWater();
	void CreateNodePools();
	void UpdateStreaming(bool bImmediate);
	int32 DesiredLod(const FIntPoint& Chunk) const;
	int32 DesiredFoliage(const FIntPoint& Chunk) const;
	void RequestChunkMesh(const FIntPoint& Chunk, FChunkState& State, int32 Lod, bool bSync);
	void RequestScatter(const FIntPoint& Chunk, bool bSync);
	void ConsumeResults(int32 MeshBudget);
	void ApplyMeshData(const FIUChunkMeshData& Data);
	void SetChunkFoliage(const FIntPoint& Chunk, FChunkState& State, int32 Level);
	void ClearChunkFoliage(FChunkState& State);
	int32 AllocateSlot(int32 NodeType, const FIntPoint& Chunk, uint32 StableId, const FTransform& T, int32 Hits);
	void FreeSlot(int32 NodeType, int32 Slot);
	void FlushDirtyPools();
	bool FindNodeByComponent(const UPrimitiveComponent* Component, int32& OutType) const;

	static void BuildChunkMesh(const IUSim::IslandModel& Island, FIUChunkMeshData& Out);

	UPROPERTY() TObjectPtr<USceneComponent> Root;
	UPROPERTY() TArray<TObjectPtr<UProceduralMeshComponent>> TerrainMeshes;
	UPROPERTY() TArray<TObjectPtr<UHierarchicalInstancedStaticMeshComponent>> AllPoolComponents;
	UPROPERTY() TObjectPtr<UStaticMeshComponent> Ocean;
	UPROPERTY() TObjectPtr<UProceduralMeshComponent> InlandWater;

	TMap<FIntPoint, FChunkState> Chunks;
	TArray<FNodePool> Pools;
	TMap<uint32, TPair<int32, int32>> StableToSlot; // stable id -> (type, slot)
	TSharedRef<FIUChunkJobQueue, ESPMode::ThreadSafe> Jobs;
	TMap<FIntPoint, std::vector<IUSim::ScatterInstance>> ScatterCache;
	TSet<FIntPoint> ScatterRequested;
	TMap<const UPrimitiveComponent*, int32> ComponentToType;
	TArray<int32> FreeMeshes;

	const IUSim::IslandModel* Island = nullptr;
	FIntPoint FocusChunk = FIntPoint(INT32_MAX, INT32_MAX);
	FVector FocusLocation = FVector::ZeroVector;
	int32 ChunksPerSide = 32;
	float StreamTimer = 0.0f;
	bool bInitialized = false;
};
