#include "Gameplay/IUContainer.h"

#include "Core/IUGameInstance.h"
#include "Core/IUTypes.h"
#include "Player/IUCharacter.h"
#include "Player/IUInventoryComponent.h"
#include "World/IUStorySubsystem.h"
#include "World/IUWorldSubsystem.h"
#include "Components/BoxComponent.h"

AIUContainer::AIUContainer()
{
	PrimaryActorTick.bCanEverTick = false;
	Bounds = CreateDefaultSubobject<UBoxComponent>(TEXT("Bounds"));
	Bounds->InitBoxExtent(FVector(50, 40, 35));
	Bounds->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Bounds->SetCollisionResponseToAllChannels(ECR_Ignore);
	Bounds->SetCollisionResponseToChannel(IU_TRACE_INTERACT, ECR_Block);
	RootComponent = Bounds;
	Storage = CreateDefaultSubobject<UIUInventoryComponent>(TEXT("Storage"));
}

void AIUContainer::Setup(const FString& InPersistentId, const FText& InName, const TArray<FIUShapePart>& Visual, int32 Slots, const FString& InOwnerTribe)
{
	Storage->Setup(Slots, 0.0f, false, false);
	Storage->PersistentId = InPersistentId;
	Storage->DisplayName = InName;
	Storage->OwnerTribe = InOwnerTribe;
	Storage->bDirtyForSave = false;
	if (UIUAssets* Assets = UIUAssets::Get(this)) { Assets->BuildParts(this, Bounds, Visual, true); }
}

void AIUContainer::FinishLoot()
{
	GeneratedLootJson = IU::ToFString(Storage->ToJson().Dump());
	Storage->bDirtyForSave = false;
	if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this)) { WS->RestoreContainerIfSaved(Storage); }
}

void AIUContainer::ReloadFromSave()
{
	IUSim::JsonValue J;
	std::string Error;
	if (!GeneratedLootJson.IsEmpty() && IUSim::JsonValue::Parse(IU::ToStd(GeneratedLootJson), J, Error))
	{
		Storage->FromJson(J);
	}
	Storage->bDirtyForSave = false;
	if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this)) { WS->RestoreContainerIfSaved(Storage); }
}

FText AIUContainer::GetInteractText(const AIUCharacter* By) const
{
	if (!Storage->OwnerTribe.IsEmpty())
	{
		return FText::FromString(FString::Printf(TEXT("Saquear %s (robo)"), *Storage->DisplayName.ToString()));
	}
	if (!RequiredKeyItem.empty() && By && By->GetInventory() && By->GetInventory()->CountItem(RequiredKeyItem) <= 0)
	{
		return NSLOCTEXT("IU", "Locked", "Cerrado (necesitas una tarjeta de acceso)");
	}
	return FText::FromString(FString::Printf(TEXT("Abrir %s"), *Storage->DisplayName.ToString()));
}

void AIUContainer::Interact(AIUCharacter* By)
{
	if (!By) { return; }
	if (!RequiredKeyItem.empty() && By->GetInventory() && By->GetInventory()->CountItem(RequiredKeyItem) <= 0)
	{
		if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this)) { WS->Notify(TEXT("Esta cerrado. Hace falta una tarjeta de acceso."), IU::Palette::Bad); }
		return;
	}
	By->OpenContainer(Storage, Storage->DisplayName);
}
