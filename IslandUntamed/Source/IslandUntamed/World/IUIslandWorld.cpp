#include "World/IUIslandWorld.h"

#include "IslandUntamed.h"
#include "Core/IUAssets.h"
#include "Core/IUGameInstance.h"
#include "Core/IUTypes.h"
#include "World/IUPOIBuilder.h"
#include "World/IUVisuals.h"
#include "World/IUWorldSubsystem.h"
#include "Async/Async.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/CollisionProfile.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "ProceduralMeshComponent.h"

namespace IUIslandWorldLocal
{
	constexpr int32 MaxMeshUploadsPerFrame = 3;
	constexpr int32 MaxFoliageChangesPerFrame = 2;
	constexpr int32 MaxJobsInFlight = 8;
	const FName TerrainTag(TEXT("IUTerrain"));

	/** Hidden instances are parked far below the world. */
	const FTransform HiddenTransform(FRotator::ZeroRotator, FVector(0, 0, -1.0e7), FVector(0.001));

	int32 QuadsForLod(int32 Lod)
	{
		switch (Lod)
		{
		case 0: return 64; // 2 m
		case 1: return 32; // 4 m
		case 2: return 16; // 8 m
		default: return 4; // 32 m
		}
	}

	FLinearColor BiomeColor(IUSim::EBiome B)
	{
		switch (B)
		{
		case IUSim::EBiome::Ocean: return FLinearColor(0.42f, 0.38f, 0.28f);
		case IUSim::EBiome::Reef: return FLinearColor(0.45f, 0.52f, 0.44f);
		case IUSim::EBiome::Beach: return FLinearColor(0.78f, 0.69f, 0.50f);
		case IUSim::EBiome::Jungle: return FLinearColor(0.12f, 0.21f, 0.06f);
		case IUSim::EBiome::Forest: return FLinearColor(0.17f, 0.26f, 0.09f);
		case IUSim::EBiome::Plains: return FLinearColor(0.38f, 0.41f, 0.16f);
		case IUSim::EBiome::Swamp: return FLinearColor(0.17f, 0.18f, 0.10f);
		case IUSim::EBiome::Mountain: return FLinearColor(0.36f, 0.35f, 0.32f);
		case IUSim::EBiome::Volcanic: return FLinearColor(0.11f, 0.09f, 0.08f);
		case IUSim::EBiome::Cliff: return FLinearColor(0.33f, 0.31f, 0.28f);
		case IUSim::EBiome::River: return FLinearColor(0.30f, 0.27f, 0.20f);
		case IUSim::EBiome::Lake: return FLinearColor(0.28f, 0.26f, 0.20f);
		}
		return FLinearColor::Gray;
	}

	/** Appends a triangle whose front face points up (+Z), whatever the vertex order. */
	void AddTriUp(TArray<int32>& Tris, const TArray<FVector>& V, int32 A, int32 B, int32 C)
	{
		const FVector N = FVector::CrossProduct(V[B] - V[A], V[C] - V[A]);
		if (N.Z >= 0.0) { Tris.Add(A); Tris.Add(B); Tris.Add(C); }
		else { Tris.Add(A); Tris.Add(C); Tris.Add(B); }
	}
}

AIUIslandWorld::AIUIslandWorld()
	: Jobs(MakeShared<FIUChunkJobQueue, ESPMode::ThreadSafe>())
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickGroup = TG_PrePhysics;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;
}

void AIUIslandWorld::BeginPlay()
{
	Super::BeginPlay();
	if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this))
	{
		WS->SetIslandActor(this);
		Island = WS->GetIsland();
	}
}

void AIUIslandWorld::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	// Worker threads read the island model owned by the world subsystem: wait for them.
	const double Deadline = FPlatformTime::Seconds() + 3.0;
	while (Jobs->InFlight.GetValue() > 0 && FPlatformTime::Seconds() < Deadline)
	{
		FPlatformProcess::Sleep(0.005f);
	}
	Super::EndPlay(EndPlayReason);
}

// ------------------------------------------------------------------------------------------------
// Initialization
// ------------------------------------------------------------------------------------------------

void AIUIslandWorld::InitializeWorld(const FVector& Focus)
{
	if (bInitialized) { SetFocus(Focus, true); return; }
	if (!Island)
	{
		if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this)) { Island = WS->GetIsland(); }
	}
	if (!Island) { UE_LOG(LogIsland, Error, TEXT("AIUIslandWorld: no island model.")); return; }
	bInitialized = true;
	ChunksPerSide = FMath::CeilToInt(Island->GetParams().Size * IU::MetersToCm / ChunkSizeCm);

	// Mark deep-ocean chunks as skipped (never meshed): sample a coarse grid inside each chunk.
	const int32 Half = ChunksPerSide / 2;
	for (int32 CY = -Half; CY < Half; ++CY)
	{
		for (int32 CX = -Half; CX < Half; ++CX)
		{
			FChunkState S;
			float MaxH = -1000.0f;
			for (int32 SY = 0; SY <= 4; ++SY)
			{
				for (int32 SX = 0; SX <= 4; ++SX)
				{
					const float X = (CX * ChunkSizeCm + SX * ChunkSizeCm * 0.25f) * IU::CmToMeters;
					const float Y = (CY * ChunkSizeCm + SY * ChunkSizeCm * 0.25f) * IU::CmToMeters;
					MaxH = FMath::Max(MaxH, Island->GetHeight(X, Y));
				}
			}
			S.bSkip = MaxH < -25.0f;
			Chunks.Add(FIntPoint(CX, CY), S);
		}
	}

	CreateWater();
	CreateNodePools();
	IUPOIBuilder::BuildAll(GetWorld(), *Island);
	SetFocus(Focus, true);
	UE_LOG(LogIsland, Log, TEXT("Island world initialized: %d chunks (%d per side), %d resource pools"), Chunks.Num(), ChunksPerSide, Pools.Num());
}

void AIUIslandWorld::CreateWater()
{
	UIUAssets* Assets = UIUAssets::Get(this);
	if (!Assets) { return; }

	Ocean = NewObject<UStaticMeshComponent>(this, TEXT("Ocean"));
	Ocean->SetupAttachment(Root);
	Ocean->SetStaticMesh(Assets->GetMesh(EIUShape::Plane));
	Ocean->SetRelativeScale3D(FVector(20000.0, 20000.0, 1.0)); // 20 km
	Ocean->SetMaterial(0, Assets->GetWaterMaterial());
	Ocean->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Ocean->SetCastShadow(false);
	Ocean->RegisterComponent();

	// Rivers and lakes: one mesh, flat water surfaces.
	InlandWater = NewObject<UProceduralMeshComponent>(this, TEXT("InlandWater"));
	InlandWater->SetupAttachment(Root);
	InlandWater->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	InlandWater->SetCastShadow(false);
	InlandWater->RegisterComponent();

	TArray<FVector> V;
	TArray<int32> T;
	TArray<FVector> N;
	TArray<FVector2D> UV;
	TArray<FLinearColor> C;
	for (const IUSim::RiverPath& River : Island->GetRivers())
	{
		const int32 Count = static_cast<int32>(River.Points.size());
		const int32 Base = V.Num();
		for (int32 I = 0; I < Count; ++I)
		{
			const IUSim::Vec3& P = River.Points[static_cast<size_t>(I)];
			const IUSim::Vec3& Next = River.Points[static_cast<size_t>(FMath::Min(I + 1, Count - 1))];
			const IUSim::Vec3& Prev = River.Points[static_cast<size_t>(FMath::Max(I - 1, 0))];
			const FVector2D Dir = FVector2D(Next.X - Prev.X, Next.Y - Prev.Y).GetSafeNormal();
			const FVector2D Side(-Dir.Y, Dir.X);
			const float HalfW = River.Widths[static_cast<size_t>(I)] * 0.5f + 1.5f;
			const float Z = P.Z * IU::MetersToCm + 4.0f;
			V.Add(FVector((P.X + Side.X * HalfW) * IU::MetersToCm, (P.Y + Side.Y * HalfW) * IU::MetersToCm, Z));
			V.Add(FVector((P.X - Side.X * HalfW) * IU::MetersToCm, (P.Y - Side.Y * HalfW) * IU::MetersToCm, Z));
			N.Add(FVector::UpVector); N.Add(FVector::UpVector);
			UV.Add(FVector2D(0, I * 0.25)); UV.Add(FVector2D(1, I * 0.25));
			C.Add(FLinearColor::White); C.Add(FLinearColor::White);
		}
		for (int32 I = 0; I + 1 < Count; ++I)
		{
			const int32 L0 = Base + I * 2, R0 = L0 + 1, L1 = L0 + 2, R1 = L0 + 3;
			IUIslandWorldLocal::AddTriUp(T, V, L0, L1, R1);
			IUIslandWorldLocal::AddTriUp(T, V, L0, R1, R0);
		}
	}
	for (const IUSim::LakeBody& Lake : Island->GetLakes())
	{
		const int32 Center = V.Num();
		const float Z = Lake.WaterLevel * IU::MetersToCm + 3.0f;
		V.Add(FVector(Lake.Center.X * IU::MetersToCm, Lake.Center.Y * IU::MetersToCm, Z));
		N.Add(FVector::UpVector); UV.Add(FVector2D(0.5, 0.5)); C.Add(FLinearColor::White);
		const int32 Segments = 48;
		const float R = (Lake.Radius + 4.0f) * IU::MetersToCm;
		for (int32 I = 0; I < Segments; ++I)
		{
			const float A = static_cast<float>(I) / Segments * 2.0f * PI;
			V.Add(FVector(Lake.Center.X * IU::MetersToCm + FMath::Cos(A) * R, Lake.Center.Y * IU::MetersToCm + FMath::Sin(A) * R, Z));
			N.Add(FVector::UpVector); UV.Add(FVector2D(0.5f + FMath::Cos(A) * 0.5f, 0.5f + FMath::Sin(A) * 0.5f)); C.Add(FLinearColor::White);
		}
		for (int32 I = 0; I < Segments; ++I)
		{
			IUIslandWorldLocal::AddTriUp(T, V, Center, Center + 1 + I, Center + 1 + (I + 1) % Segments);
		}
	}
	if (V.Num() > 0)
	{
		InlandWater->CreateMeshSection_LinearColor(0, V, T, N, UV, C, TArray<FProcMeshTangent>(), false);
		InlandWater->SetMaterial(0, Assets->GetWaterMaterial());
	}
}

void AIUIslandWorld::CreateNodePools()
{
	UIUAssets* Assets = UIUAssets::Get(this);
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	if (!Assets || !Db) { return; }
	const std::vector<IUSim::ResourceNodeDef>& Defs = Db->Nodes.All();
	Pools.SetNum(static_cast<int32>(Defs.size()));
	for (int32 TypeIndex = 0; TypeIndex < Pools.Num(); ++TypeIndex)
	{
		const IUSim::ResourceNodeDef& Def = Defs[static_cast<size_t>(TypeIndex)];
		const TArray<FIUShapePart> Parts = IUVisuals::ResourceParts(Def.Visual);
		FNodePool& Pool = Pools[TypeIndex];
		for (int32 PartIndex = 0; PartIndex < Parts.Num(); ++PartIndex)
		{
			const FIUShapePart& Part = Parts[PartIndex];
			UHierarchicalInstancedStaticMeshComponent* H = NewObject<UHierarchicalInstancedStaticMeshComponent>(this);
			H->SetupAttachment(Root);
			H->SetStaticMesh(Assets->GetMesh(Part.Shape));
			H->SetMaterial(0, Assets->GetMaterial(Part.Color, Part.Material));
			const int32 Cull = static_cast<int32>(Def.CullDistance * IU::MetersToCm);
			H->SetCullDistances(static_cast<int32>(Cull * 0.85f), Cull);
			H->SetCastShadow(!Def.bDecorOnly && Def.CullDistance > 200.0f);
			H->bAffectDistanceFieldLighting = !Def.bDecorOnly;
			H->SetMobility(EComponentMobility::Movable); // instances are recycled at runtime
			if (PartIndex == 0 && !Def.bDecorOnly)
			{
				if (Def.bBlocking)
				{
					H->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
					H->SetCollisionProfileName(UCollisionProfile::BlockAll_ProfileName);
				}
				else
				{
					H->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
					H->SetCollisionResponseToAllChannels(ECR_Ignore);
				}
				H->SetCollisionResponseToChannel(IU_TRACE_INTERACT, ECR_Block);
				ComponentToType.Add(H, TypeIndex);
			}
			else
			{
				H->SetCollisionEnabled(ECollisionEnabled::NoCollision);
			}
			H->RegisterComponent();
			Pool.Parts.Add(H);
			AllPoolComponents.Add(H);
			Pool.PartLocal.Add(FTransform(Part.Rotation, Part.Offset, Part.Size / UIUAssets::NativeSize(Part.Shape)));
		}
	}
}

// ------------------------------------------------------------------------------------------------
// Streaming
// ------------------------------------------------------------------------------------------------

void AIUIslandWorld::SetFocus(const FVector& Focus, bool bImmediate)
{
	FocusLocation = Focus;
	if (Ocean) { Ocean->SetWorldLocation(FVector(FMath::GridSnap(Focus.X, 10000.0), FMath::GridSnap(Focus.Y, 10000.0), 0.0)); }
	const FIntPoint NewChunk(FMath::FloorToInt(Focus.X / ChunkSizeCm), FMath::FloorToInt(Focus.Y / ChunkSizeCm));
	if (NewChunk != FocusChunk || bImmediate)
	{
		FocusChunk = NewChunk;
		UpdateStreaming(bImmediate);
	}
}

int32 AIUIslandWorld::DesiredLod(const FIntPoint& Chunk) const
{
	if (IU::IsUnderground(FocusLocation)) { return 3; }
	const int32 D = FMath::Max(FMath::Abs(Chunk.X - FocusChunk.X), FMath::Abs(Chunk.Y - FocusChunk.Y));
	if (D <= 1) { return 0; }
	if (D <= 3) { return 1; }
	if (D <= 6) { return 2; }
	return 3;
}

int32 AIUIslandWorld::DesiredFoliage(const FIntPoint& Chunk) const
{
	if (IU::IsUnderground(FocusLocation)) { return 0; }
	const int32 D = FMath::Max(FMath::Abs(Chunk.X - FocusChunk.X), FMath::Abs(Chunk.Y - FocusChunk.Y));
	if (D <= 1) { return 2; }
	if (D <= 5) { return 1; }
	return 0;
}

void AIUIslandWorld::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!bInitialized) { return; }
	if (const APawn* Pawn = UGameplayStatics::GetPlayerPawn(this, 0))
	{
		SetFocus(Pawn->GetActorLocation(), false);
	}
	ConsumeResults(IUIslandWorldLocal::MaxMeshUploadsPerFrame);
	StreamTimer += DeltaSeconds;
	if (StreamTimer > 0.25f)
	{
		StreamTimer = 0.0f;
		UpdateStreaming(false);
	}
	FlushDirtyPools();
}

void AIUIslandWorld::UpdateStreaming(bool bImmediate)
{
	using namespace IUIslandWorldLocal;
	// Sort chunk work by distance so nearby terrain always comes first.
	TArray<TPair<int32, FIntPoint>> Work;
	for (TPair<FIntPoint, FChunkState>& Pair : Chunks)
	{
		if (Pair.Value.bSkip) { continue; }
		const int32 Lod = DesiredLod(Pair.Key);
		const int32 Fol = DesiredFoliage(Pair.Key);
		if (Pair.Value.Lod != Lod && Pair.Value.RequestedLod != Lod) { Work.Add(TPair<int32, FIntPoint>(FMath::Max(FMath::Abs(Pair.Key.X - FocusChunk.X), FMath::Abs(Pair.Key.Y - FocusChunk.Y)), Pair.Key)); }
		else if (Pair.Value.FoliageLevel != Fol) { Work.Add(TPair<int32, FIntPoint>(FMath::Max(FMath::Abs(Pair.Key.X - FocusChunk.X), FMath::Abs(Pair.Key.Y - FocusChunk.Y)) + 1000, Pair.Key)); }
	}
	Work.Sort([](const TPair<int32, FIntPoint>& A, const TPair<int32, FIntPoint>& B) { return A.Key < B.Key; });

	int32 FoliageChanges = 0;
	for (const TPair<int32, FIntPoint>& W : Work)
	{
		FChunkState& State = Chunks[W.Value];
		const int32 Lod = DesiredLod(W.Value);
		const bool bSync = bImmediate && Lod <= 1;
		if (State.Lod != Lod && State.RequestedLod != Lod)
		{
			if (!bSync && Jobs->InFlight.GetValue() >= MaxJobsInFlight) { continue; }
			RequestChunkMesh(W.Value, State, Lod, bSync);
		}
		const int32 Fol = DesiredFoliage(W.Value);
		if (State.FoliageLevel != Fol)
		{
			if (Fol > 0 && !ScatterCache.Contains(W.Value))
			{
				RequestScatter(W.Value, bImmediate && Fol == 2);
				if (!ScatterCache.Contains(W.Value)) { continue; }
			}
			if (bImmediate || FoliageChanges < MaxFoliageChangesPerFrame)
			{
				SetChunkFoliage(W.Value, State, Fol);
				++FoliageChanges;
			}
		}
	}
	if (bImmediate)
	{
		// Drain everything so the area around the player is complete before play.
		const double Deadline = FPlatformTime::Seconds() + 10.0;
		while (Jobs->InFlight.GetValue() > 0 && FPlatformTime::Seconds() < Deadline) { FPlatformProcess::Sleep(0.002f); }
		ConsumeResults(100000);
	}
}

void AIUIslandWorld::BuildChunkMesh(const IUSim::IslandModel& Model, FIUChunkMeshData& Out)
{
	using namespace IUIslandWorldLocal;
	const int32 Q = QuadsForLod(Out.Lod);
	const float Step = ChunkSizeCm / Q;
	const float X0 = Out.Coord.X * ChunkSizeCm;
	const float Y0 = Out.Coord.Y * ChunkSizeCm;
	const int32 Row = Q + 1;
	const float NormalEps = FMath::Max(1.0f, Step * IU::CmToMeters);

	Out.Vertices.Reserve(Row * Row + Q * 8);
	for (int32 J = 0; J <= Q; ++J)
	{
		for (int32 I = 0; I <= Q; ++I)
		{
			const float X = X0 + I * Step;
			const float Y = Y0 + J * Step;
			const float XM = X * IU::CmToMeters;
			const float YM = Y * IU::CmToMeters;
			const float H = Model.GetHeight(XM, YM);
			Out.Vertices.Add(FVector(X, Y, H * IU::MetersToCm));
			const float HL = Model.GetHeight(XM - NormalEps, YM);
			const float HR = Model.GetHeight(XM + NormalEps, YM);
			const float HD = Model.GetHeight(XM, YM - NormalEps);
			const float HU = Model.GetHeight(XM, YM + NormalEps);
			const FVector Normal = FVector(HL - HR, HD - HU, 2.0f * NormalEps).GetSafeNormal();
			Out.Normals.Add(Normal);
			Out.UVs.Add(FVector2D(X / 400.0f, Y / 400.0f));

			const IUSim::EBiome Biome = Model.GetBiome(XM, YM);
			FLinearColor Col = BiomeColor(Biome);
			// Steep terrain shows bare rock; beaches darken near the waterline.
			const float Rock = 1.0f - FMath::SmoothStep(0.68f, 0.80f, static_cast<float>(Normal.Z));
			Col = FMath::Lerp(Col, FLinearColor(0.34f, 0.32f, 0.29f), Rock);
			if (H < 0.6f) { Col *= 0.75f; }
			const uint32 Hash = IUSim::Hash2D(static_cast<int32>(X / 150.0f), static_cast<int32>(Y / 150.0f), 77U);
			const float Var = 0.9f + static_cast<float>(Hash & 255U) / 255.0f * 0.2f;
			Col = FLinearColor(Col.R * Var, Col.G * Var, Col.B * Var, 1.0f);
			Out.Colors.Add(Col);
		}
	}
	for (int32 J = 0; J < Q; ++J)
	{
		for (int32 I = 0; I < Q; ++I)
		{
			const int32 V0 = J * Row + I;
			const int32 V1 = V0 + 1;
			const int32 V2 = V0 + Row;
			const int32 V3 = V2 + 1;
			AddTriUp(Out.Triangles, Out.Vertices, V0, V1, V3);
			AddTriUp(Out.Triangles, Out.Vertices, V0, V3, V2);
		}
	}
	// Skirts: a vertical strip under every border edge, double sided.
	const float SkirtDepth = Out.Lod >= 3 ? 2500.0f : 600.0f;
	const auto AddSkirtEdge = [&Out, SkirtDepth](int32 A, int32 B)
	{
		const int32 SA = Out.Vertices.Num();
		Out.Vertices.Add(Out.Vertices[A] - FVector(0, 0, SkirtDepth));
		Out.Normals.Add(Out.Normals[A]); Out.UVs.Add(Out.UVs[A]); Out.Colors.Add(Out.Colors[A] * 0.7f);
		Out.Vertices.Add(Out.Vertices[B] - FVector(0, 0, SkirtDepth));
		Out.Normals.Add(Out.Normals[B]); Out.UVs.Add(Out.UVs[B]); Out.Colors.Add(Out.Colors[B] * 0.7f);
		const int32 SB = SA + 1;
		Out.Triangles.Append({ A, B, SB, A, SB, SA, A, SB, B, A, SA, SB });
	};
	for (int32 I = 0; I < Q; ++I)
	{
		AddSkirtEdge(I, I + 1);                                   // south edge
		AddSkirtEdge(Q * Row + I, Q * Row + I + 1);               // north edge
		AddSkirtEdge(I * Row, (I + 1) * Row);                     // west edge
		AddSkirtEdge(I * Row + Q, (I + 1) * Row + Q);             // east edge
	}
}

void AIUIslandWorld::RequestChunkMesh(const FIntPoint& Chunk, FChunkState& State, int32 Lod, bool bSync)
{
	State.RequestedLod = Lod;
	const uint32 Gen = ++State.Generation;
	if (bSync)
	{
		FIUChunkMeshData Data;
		Data.Coord = Chunk;
		Data.Lod = Lod;
		Data.Generation = Gen;
		BuildChunkMesh(*Island, Data);
		ApplyMeshData(Data);
		return;
	}
	const IUSim::IslandModel* Model = Island;
	TSharedRef<FIUChunkJobQueue, ESPMode::ThreadSafe> Queue = Jobs;
	Queue->InFlight.Increment();
	AsyncTask(ENamedThreads::AnyBackgroundThreadNormalTask, [Model, Queue, Chunk, Lod, Gen]()
	{
		FIUChunkMeshData Data;
		Data.Coord = Chunk;
		Data.Lod = Lod;
		Data.Generation = Gen;
		BuildChunkMesh(*Model, Data);
		Queue->Meshes.Enqueue(MoveTemp(Data));
		Queue->InFlight.Decrement();
	});
}

void AIUIslandWorld::RequestScatter(const FIntPoint& Chunk, bool bSync)
{
	if (ScatterRequested.Contains(Chunk)) { return; }
	ScatterRequested.Add(Chunk);
	const float MinX = Chunk.X * ChunkSizeCm * IU::CmToMeters;
	const float MinY = Chunk.Y * ChunkSizeCm * IU::CmToMeters;
	const float Size = ChunkSizeCm * IU::CmToMeters;
	if (bSync)
	{
		ScatterCache.Add(Chunk, Island->ScatterRegion(MinX, MinY, Size));
		return;
	}
	const IUSim::IslandModel* Model = Island;
	TSharedRef<FIUChunkJobQueue, ESPMode::ThreadSafe> Queue = Jobs;
	Queue->InFlight.Increment();
	AsyncTask(ENamedThreads::AnyBackgroundThreadNormalTask, [Model, Queue, Chunk, MinX, MinY, Size]()
	{
		FIUChunkScatterData Data;
		Data.Coord = Chunk;
		Data.Instances = Model->ScatterRegion(MinX, MinY, Size);
		Queue->Scatters.Enqueue(MoveTemp(Data));
		Queue->InFlight.Decrement();
	});
}

void AIUIslandWorld::ConsumeResults(int32 MeshBudget)
{
	FIUChunkScatterData Scatter;
	while (Jobs->Scatters.Dequeue(Scatter))
	{
		ScatterCache.Add(Scatter.Coord, MoveTemp(Scatter.Instances));
	}
	FIUChunkMeshData Data;
	int32 Uploaded = 0;
	while (Uploaded < MeshBudget && Jobs->Meshes.Dequeue(Data))
	{
		ApplyMeshData(Data);
		++Uploaded;
	}
}

void AIUIslandWorld::ApplyMeshData(const FIUChunkMeshData& Data)
{
	FChunkState* State = Chunks.Find(Data.Coord);
	if (!State || State->Generation != Data.Generation) { return; } // superseded
	UIUAssets* Assets = UIUAssets::Get(this);

	if (State->MeshIndex < 0)
	{
		if (FreeMeshes.Num() > 0)
		{
			State->MeshIndex = FreeMeshes.Pop();
		}
		else
		{
			UProceduralMeshComponent* Mesh = NewObject<UProceduralMeshComponent>(this);
			Mesh->SetupAttachment(Root);
			Mesh->bUseAsyncCooking = true;
			Mesh->SetCollisionProfileName(UCollisionProfile::BlockAll_ProfileName);
			Mesh->SetCollisionResponseToChannel(IU_TRACE_INTERACT, ECR_Block);
			Mesh->ComponentTags.Add(IUIslandWorldLocal::TerrainTag);
			Mesh->RegisterComponent();
			State->MeshIndex = TerrainMeshes.Add(Mesh);
		}
	}
	UProceduralMeshComponent* Mesh = TerrainMeshes[State->MeshIndex];
	const bool bCollision = Data.Lod <= 1;
	Mesh->CreateMeshSection_LinearColor(0, Data.Vertices, Data.Triangles, Data.Normals, Data.UVs, Data.Colors, TArray<FProcMeshTangent>(), bCollision);
	Mesh->SetCollisionEnabled(bCollision ? ECollisionEnabled::QueryAndPhysics : ECollisionEnabled::NoCollision);
	Mesh->SetCastShadow(Data.Lod <= 2);
	if (Assets) { Mesh->SetMaterial(0, Assets->GetTerrainMaterial()); }
	State->Lod = Data.Lod;
}

// ------------------------------------------------------------------------------------------------
// Resources / foliage
// ------------------------------------------------------------------------------------------------

int32 AIUIslandWorld::AllocateSlot(int32 NodeType, const FIntPoint& Chunk, uint32 StableId, const FTransform& T, int32 Hits)
{
	FNodePool& Pool = Pools[NodeType];
	int32 Slot = INDEX_NONE;
	if (Pool.Free.Num() > 0)
	{
		Slot = Pool.Free.Pop();
		for (int32 P = 0; P < Pool.Parts.Num(); ++P)
		{
			Pool.Parts[P]->UpdateInstanceTransform(Slot, Pool.PartLocal[P] * T, false, false, true);
		}
		Pool.bDirty = true;
	}
	else
	{
		Slot = Pool.Slots.AddDefaulted();
		for (int32 P = 0; P < Pool.Parts.Num(); ++P)
		{
			Pool.Parts[P]->AddInstance(Pool.PartLocal[P] * T);
		}
	}
	FNodeSlot& S = Pool.Slots[Slot];
	S.StableId = StableId;
	S.Chunk = Chunk;
	S.Transform = T;
	S.HitsLeft = Hits;
	S.bActive = true;
	StableToSlot.Add(StableId, TPair<int32, int32>(NodeType, Slot));
	return Slot;
}

void AIUIslandWorld::FreeSlot(int32 NodeType, int32 Slot)
{
	FNodePool& Pool = Pools[NodeType];
	if (!Pool.Slots.IsValidIndex(Slot) || !Pool.Slots[Slot].bActive) { return; }
	FNodeSlot& S = Pool.Slots[Slot];
	StableToSlot.Remove(S.StableId);
	S.bActive = false;
	for (UHierarchicalInstancedStaticMeshComponent* Part : Pool.Parts)
	{
		Part->UpdateInstanceTransform(Slot, IUIslandWorldLocal::HiddenTransform, false, false, true);
	}
	Pool.Free.Add(Slot);
	Pool.bDirty = true;
}

void AIUIslandWorld::FlushDirtyPools()
{
	for (FNodePool& Pool : Pools)
	{
		if (!Pool.bDirty) { continue; }
		Pool.bDirty = false;
		for (UHierarchicalInstancedStaticMeshComponent* Part : Pool.Parts) { Part->MarkRenderStateDirty(); }
	}
}

void AIUIslandWorld::ClearChunkFoliage(FChunkState& State)
{
	for (const TPair<int32, int32>& NS : State.NodeSlots) { FreeSlot(NS.Key, NS.Value); }
	State.NodeSlots.Reset();
	State.FoliageLevel = 0;
}

void AIUIslandWorld::SetChunkFoliage(const FIntPoint& Chunk, FChunkState& State, int32 Level)
{
	ClearChunkFoliage(State);
	if (Level <= 0) { return; }
	const std::vector<IUSim::ScatterInstance>* Instances = ScatterCache.Find(Chunk);
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!Instances || !Db || !WS) { return; }
	const double Now = WS->GetTotalHours();
	for (const IUSim::ScatterInstance& Inst : *Instances)
	{
		const IUSim::ResourceNodeDef* Def = Db->Nodes.At(static_cast<size_t>(Inst.NodeIndex));
		if (!Def || !Pools.IsValidIndex(Inst.NodeIndex)) { continue; }
		// Level 1 keeps only large, far-visible nodes (trees, boulders).
		if (Level == 1 && Def->CullDistance < 600.0f) { continue; }
		if (WS->GetPersistence().IsDepleted(Inst.StableId, Now)) { continue; }
		const FTransform T(FRotator(0, Inst.Yaw, 0), IU::ToVector(Inst.Position) - FVector(0, 0, 5), FVector(Inst.Scale));
		const int32 Slot = AllocateSlot(Inst.NodeIndex, Chunk, Inst.StableId, T, Def->Hits);
		State.NodeSlots.Add(TPair<int32, int32>(Inst.NodeIndex, Slot));
	}
	State.FoliageLevel = Level;
}

bool AIUIslandWorld::FindNodeByComponent(const UPrimitiveComponent* Component, int32& OutType) const
{
	const int32* Found = ComponentToType.Find(Component);
	if (!Found) { return false; }
	OutType = *Found;
	return true;
}

const IUSim::ResourceNodeDef* AIUIslandWorld::GetNodeFromHit(const UPrimitiveComponent* Component, int32 Item) const
{
	int32 Type = INDEX_NONE;
	if (!FindNodeByComponent(Component, Type) || !Pools[Type].Slots.IsValidIndex(Item) || !Pools[Type].Slots[Item].bActive) { return nullptr; }
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	return Db ? Db->Nodes.At(static_cast<size_t>(Type)) : nullptr;
}

FIUHarvestOutcome AIUIslandWorld::HarvestHit(const UPrimitiveComponent* Component, int32 Item, IUSim::EToolType Tool, int32 ToolTier, float ToolMultiplier)
{
	FIUHarvestOutcome Out;
	int32 Type = INDEX_NONE;
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!Db || !WS || !FindNodeByComponent(Component, Type)) { return Out; }
	FNodePool& Pool = Pools[Type];
	if (!Pool.Slots.IsValidIndex(Item) || !Pool.Slots[Item].bActive) { return Out; }
	const IUSim::ResourceNodeDef* Def = Db->Nodes.At(static_cast<size_t>(Type));
	if (!Def || Def->bDecorOnly) { return Out; }

	FNodeSlot& Slot = Pool.Slots[Item];
	const IUSim::HarvestHit Hit = IUSim::ResolveHarvestHit(*Def, Tool, ToolTier, ToolMultiplier, Slot.HitsLeft, WS->GetRandom());
	Out.bValid = true;
	Out.NodeName = IU::ToFString(Def->Name);
	Out.RequiredTool = IU::ToFString(IUSim::ToolTypeToString(Def->Tool));
	Out.bWrongTool = Hit.bWrongTool;
	Out.bDepleted = Hit.bDepleted;
	Out.Items = TArray<IUSim::ItemAmount>(Hit.Items.data(), static_cast<int32>(Hit.Items.size()));
	if (Hit.bDepleted)
	{
		const double RegrowAt = Def->RegrowHours > 0.0f ? WS->GetTotalHours() + Def->RegrowHours : -1.0;
		WS->GetPersistence().MarkDepleted(Slot.StableId, RegrowAt);
		// Remove from the chunk list and hide.
		if (FChunkState* State = Chunks.Find(Slot.Chunk))
		{
			State->NodeSlots.Remove(TPair<int32, int32>(Type, Item));
		}
		FreeSlot(Type, Item);
	}
	return Out;
}

void AIUIslandWorld::RestoreNode(uint32 StableId)
{
	// Rebuild the foliage of every loaded chunk that could contain it (cheap: only chunks with foliage).
	for (TPair<FIntPoint, FChunkState>& Pair : Chunks)
	{
		if (Pair.Value.FoliageLevel <= 0) { continue; }
		const std::vector<IUSim::ScatterInstance>* Instances = ScatterCache.Find(Pair.Key);
		if (!Instances) { continue; }
		for (const IUSim::ScatterInstance& Inst : *Instances)
		{
			if (Inst.StableId == StableId)
			{
				const int32 Level = Pair.Value.FoliageLevel;
				SetChunkFoliage(Pair.Key, Pair.Value, Level);
				return;
			}
		}
	}
}

bool AIUIslandWorld::IsTerrainComponent(const UPrimitiveComponent* Component) const
{
	return Component && Component->ComponentHasTag(IUIslandWorldLocal::TerrainTag);
}

bool AIUIslandWorld::IsGroundReady(const FVector& Location) const
{
	FHitResult Hit;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(IUGroundReady), false);
	return GetWorld() && GetWorld()->LineTraceSingleByChannel(Hit, Location + FVector(0, 0, 500), Location - FVector(0, 0, 5000), ECC_WorldStatic, Params)
		&& Hit.GetComponent() && (IsTerrainComponent(Hit.GetComponent()) || !Hit.GetComponent()->IsA<UProceduralMeshComponent>());
}
