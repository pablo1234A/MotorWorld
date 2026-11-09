#include "Gameplay/IULoreNote.h"

#include "Core/IUAssets.h"
#include "Core/IUTypes.h"
#include "Player/IUCharacter.h"
#include "Player/IUInventoryComponent.h"
#include "World/IUStorySubsystem.h"
#include "World/IUVisuals.h"
#include "Components/PointLightComponent.h"
#include "Components/SphereComponent.h"

AIULoreNote::AIULoreNote()
{
	PrimaryActorTick.bCanEverTick = false;
	Collision = CreateDefaultSubobject<USphereComponent>(TEXT("Collision"));
	Collision->InitSphereRadius(30.0f);
	Collision->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Collision->SetCollisionResponseToAllChannels(ECR_Ignore);
	Collision->SetCollisionResponseToChannel(IU_TRACE_INTERACT, ECR_Block);
	RootComponent = Collision;
	// A faint glint helps players notice documents without HUD markers.
	Glint = CreateDefaultSubobject<UPointLightComponent>(TEXT("Glint"));
	Glint->SetupAttachment(Collision);
	Glint->SetIntensity(400.0f);
	Glint->SetAttenuationRadius(180.0f);
	Glint->SetLightColor(FLinearColor(1.0f, 0.9f, 0.7f));
	Glint->SetCastShadows(false);
}

void AIULoreNote::Setup(const FString& InDocId)
{
	DocId = InDocId;
	if (UIUAssets* Assets = UIUAssets::Get(this)) { Assets->BuildParts(this, Collision, IUVisuals::ItemParts("paper"), false); }
}

FText AIULoreNote::GetInteractText(const AIUCharacter* By) const
{
	if (!RequiredKeyItem.empty() && By && By->GetInventory() && By->GetInventory()->CountItem(RequiredKeyItem) <= 0)
	{
		return NSLOCTEXT("IU", "TerminalLocked", "Terminal bloqueado (tarjeta de acceso)");
	}
	const UIUStorySubsystem* Story = UIUStorySubsystem::Get(this);
	const FIULoreDoc* Doc = Story ? Story->FindLore(DocId) : nullptr;
	return FText::FromString(FString::Printf(TEXT("Leer: %s"), Doc ? *Doc->Title : TEXT("documento")));
}

void AIULoreNote::Interact(AIUCharacter* By)
{
	if (!RequiredKeyItem.empty() && By && By->GetInventory() && By->GetInventory()->CountItem(RequiredKeyItem) <= 0) { return; }
	if (UIUStorySubsystem* Story = UIUStorySubsystem::Get(this))
	{
		Story->ReadDocument(DocId);
		if (By) { By->OpenDocument(DocId); }
	}
}
