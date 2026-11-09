#include "Gameplay/IUWorldItem.h"

#include "Core/IUAssets.h"
#include "Core/IUGameInstance.h"
#include "Core/IUTypes.h"
#include "Player/IUCharacter.h"
#include "Player/IUInventoryComponent.h"
#include "World/IUVisuals.h"
#include "Components/SphereComponent.h"
#include "Engine/World.h"

AIUWorldItem::AIUWorldItem()
{
	PrimaryActorTick.bCanEverTick = false;
	Collision = CreateDefaultSubobject<USphereComponent>(TEXT("Collision"));
	Collision->InitSphereRadius(28.0f);
	Collision->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Collision->SetCollisionResponseToAllChannels(ECR_Ignore);
	Collision->SetCollisionResponseToChannel(IU_TRACE_INTERACT, ECR_Block);
	Collision->SetCollisionResponseToChannel(ECC_Visibility, ECR_Block);
	RootComponent = Collision;
}

AIUWorldItem* AIUWorldItem::SpawnItem(UWorld* World, const FVector& Location, const std::string& ItemId, int32 Count, float Durability)
{
	if (!World || Count <= 0) { return nullptr; }
	FVector Loc = Location;
	FHitResult Hit;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(IUItemDrop), false);
	if (World->LineTraceSingleByChannel(Hit, Location + FVector(0, 0, 100), Location - FVector(0, 0, 2000), ECC_WorldStatic, Params))
	{
		Loc = Hit.ImpactPoint + FVector(0, 0, 12);
	}
	FActorSpawnParameters SP;
	SP.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	AIUWorldItem* Item = World->SpawnActor<AIUWorldItem>(AIUWorldItem::StaticClass(), Loc, FRotator(0, FMath::FRandRange(0.0f, 360.0f), 0), SP);
	if (Item) { Item->InitItem(ItemId, Count, Durability); }
	return Item;
}

void AIUWorldItem::InitItem(const std::string& InItemId, int32 InCount, float InDurability)
{
	ItemId = InItemId;
	Count = InCount;
	Durability = InDurability;
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	const IUSim::ItemDef* Def = Db ? Db->Items.Find(ItemId) : nullptr;
	if (UIUAssets* Assets = UIUAssets::Get(this))
	{
		Assets->BuildParts(this, Collision, IUVisuals::ItemParts(Def ? Def->MeshHint : std::string("pouch")), false);
	}
}

FText AIUWorldItem::GetInteractText(const AIUCharacter* By) const
{
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	const IUSim::ItemDef* Def = Db ? Db->Items.Find(ItemId) : nullptr;
	const FString Name = Def ? IU::ToFString(Def->Name) : IU::ToFString(ItemId);
	return FText::FromString(Count > 1 ? FString::Printf(TEXT("Recoger %s x%d"), *Name, Count) : FString::Printf(TEXT("Recoger %s"), *Name));
}

void AIUWorldItem::Interact(AIUCharacter* By)
{
	if (!By || !By->GetInventory()) { return; }
	const int32 Left = By->GetInventory()->AddItem(ItemId, Count, Durability);
	By->PlayActionSound(TEXT("pickup"));
	if (Left <= 0) { Destroy(); }
	else { Count = Left; }
}

IUSim::JsonValue AIUWorldItem::ToJson() const
{
	IUSim::JsonValue J = IUSim::JsonValue::MakeObject();
	const FVector L = GetActorLocation();
	J.Set("id", IUSim::JsonValue::MakeString(ItemId));
	J.Set("n", IUSim::JsonValue::MakeNumber(Count));
	J.Set("d", IUSim::JsonValue::MakeNumber(Durability));
	J.Set("x", IUSim::JsonValue::MakeNumber(L.X));
	J.Set("y", IUSim::JsonValue::MakeNumber(L.Y));
	J.Set("z", IUSim::JsonValue::MakeNumber(L.Z));
	return J;
}
