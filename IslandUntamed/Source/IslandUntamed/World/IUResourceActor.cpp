#include "World/IUResourceActor.h"

#include "Core/IUAssets.h"
#include "Core/IUGameInstance.h"
#include "Core/IUTypes.h"
#include "Player/IUCharacter.h"
#include "World/IUVisuals.h"
#include "World/IUWorldSubsystem.h"
#include "Engine/World.h"

AIUResourceActor::AIUResourceActor()
{
	PrimaryActorTick.bCanEverTick = false;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;
}

AIUResourceActor* AIUResourceActor::Spawn(UWorld* World, const FVector& Location, float Yaw, float Scale, const std::string& NodeId)
{
	if (!World) { return nullptr; }
	FActorSpawnParameters SP;
	SP.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	AIUResourceActor* A = World->SpawnActor<AIUResourceActor>(AIUResourceActor::StaticClass(), Location, FRotator(0, Yaw, 0), SP);
	if (!A) { return nullptr; }
	A->NodeId = NodeId;
	A->SetActorScale3D(FVector(Scale));
	const IUSim::ResourceNodeDef* Def = A->GetNodeDef();
	A->HitsLeft = Def ? Def->Hits : 3;
	if (UIUAssets* Assets = UIUAssets::Get(World))
	{
		TArray<FIUShapePart> Parts = IUVisuals::ResourceParts(Def ? Def->Visual : std::string("rock"));
		if (Parts.Num() > 0) { Parts[0].bCollision = true; }
		Assets->BuildParts(A, A->Root, Parts, true);
	}
	return A;
}

const IUSim::ResourceNodeDef* AIUResourceActor::GetNodeDef() const
{
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	return Db ? Db->Nodes.Find(NodeId) : nullptr;
}

FIUHarvestOutcome AIUResourceActor::Harvest(IUSim::EToolType Tool, int32 ToolTier, float ToolMultiplier)
{
	FIUHarvestOutcome Out;
	const IUSim::ResourceNodeDef* Def = GetNodeDef();
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!Def || !WS) { return Out; }
	const IUSim::HarvestHit Hit = IUSim::ResolveHarvestHit(*Def, Tool, ToolTier, ToolMultiplier, HitsLeft, WS->GetRandom());
	Out.bValid = true;
	Out.bWrongTool = Hit.bWrongTool;
	Out.bDepleted = Hit.bDepleted;
	Out.NodeName = IU::ToFString(Def->Name);
	Out.RequiredTool = IU::ToFString(IUSim::ToolTypeToString(Def->Tool));
	Out.Items = TArray<IUSim::ItemAmount>(Hit.Items.data(), static_cast<int32>(Hit.Items.size()));
	if (Hit.bDepleted) { Destroy(); }
	return Out;
}

FText AIUResourceActor::GetInteractText(const AIUCharacter* By) const
{
	const IUSim::ResourceNodeDef* Def = GetNodeDef();
	if (!Def) { return FText::GetEmpty(); }
	if (Def->Tool == IUSim::EToolType::None) { return FText::FromString(FString::Printf(TEXT("Recoger %s"), *IU::ToFString(Def->Name))); }
	return FText::FromString(FString::Printf(TEXT("%s (golpea con %s)"), *IU::ToFString(Def->Name), UTF8_TO_TCHAR(IUSim::ToolTypeToString(Def->Tool))));
}

void AIUResourceActor::Interact(AIUCharacter* By)
{
	if (By) { By->HarvestActor(this); }
}
