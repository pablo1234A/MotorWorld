#include "Gameplay/IUStructure.h"

#include "Core/IUAssets.h"
#include "Core/IUGameInstance.h"
#include "Core/IUTypes.h"
#include "Gameplay/IUStructureComponents.h"
#include "Player/IUCharacter.h"
#include "Player/IUInventoryComponent.h"
#include "World/IUVisuals.h"
#include "World/IUWorldSubsystem.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/DamageEvents.h"

AIUStructure::AIUStructure()
{
	PrimaryActorTick.bCanEverTick = false;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;
	Bounds = CreateDefaultSubobject<UBoxComponent>(TEXT("Bounds"));
	Bounds->SetupAttachment(Root);
	Bounds->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Bounds->SetCollisionResponseToAllChannels(ECR_Ignore);
	Bounds->SetCollisionResponseToChannel(IU_TRACE_INTERACT, ECR_Block);
	Tags.Add(FName(TEXT("IUStructure")));
}

const IUSim::BuildingDef* AIUStructure::GetDef() const
{
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	return Db ? Db->Buildings.Find(BuildingId) : nullptr;
}

void AIUStructure::InitStructure(const std::string& InBuildingId, bool bFromSave)
{
	BuildingId = InBuildingId;
	const IUSim::BuildingDef* Def = GetDef();
	if (!Def) { return; }
	Health = Def->MaxHealth;

	const FVector Size = FVector(Def->Size.X, Def->Size.Y, Def->Size.Z) * IU::MetersToCm;
	Bounds->SetBoxExtent(Size * 0.5f);
	Bounds->SetRelativeLocation(FVector(0, 0, Size.Z * 0.5f));

	if (UIUAssets* Assets = UIUAssets::Get(this))
	{
		TArray<FIUShapePart> Parts = IUVisuals::StructureParts(*Def);
		if (!Def->bBlocksMovement)
		{
			for (FIUShapePart& P : Parts) { P.bCollision = false; }
		}
		for (UStaticMeshComponent* C : Assets->BuildParts(this, Root, Parts, true))
		{
			PartComponents.Add(C);
			if (C->ComponentHasTag(FName(TEXT("Flame")))) { FlameParts.Add(C); }
		}
	}

	if (Def->StorageSlots > 0)
	{
		Storage = NewObject<UIUInventoryComponent>(this, TEXT("Storage"));
		Storage->RegisterComponent();
		Storage->Setup(Def->StorageSlots, 0.0f, false, false);
		Storage->DisplayName = IU::ToText(Def->Name);
	}
	if (Def->FuelCapacity > 0.0f)
	{
		Fire = NewObject<UIUFireComponent>(this, TEXT("Fire"));
		Fire->SetupAttachment(Root);
		Fire->RegisterComponent();
		Fire->InitFire(*Def, !bFromSave);
	}
	if (Def->bIsFarmPlot)
	{
		Farm = NewObject<UIUFarmPlotComponent>(this, TEXT("Farm"));
		Farm->SetupAttachment(Root);
		Farm->RegisterComponent();
	}
	if (Def->Category == IUSim::EBuildCategory::Door)
	{
		Door = NewObject<UIUDoorComponent>(this, TEXT("Door"));
		Door->SetupAttachment(Root);
		Door->RegisterComponent();
		Door->BuildLeaf();
	}
	if (Def->TrapDamage > 0.0f)
	{
		Trap = NewObject<UIUTrapComponent>(this, TEXT("Trap"));
		Trap->SetupAttachment(Root);
		Trap->RegisterComponent();
		Trap->InitTrap(Def->TrapDamage, Size);
	}
}

void AIUStructure::BeginPlay()
{
	Super::BeginPlay();
	if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this)) { WS->RegisterStructure(this); }
}

void AIUStructure::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this)) { WS->UnregisterStructure(this); }
	Super::EndPlay(EndPlayReason);
}

bool AIUStructure::IsLitFire() const
{
	return Fire && Fire->IsLit();
}

float AIUStructure::GetHeatRadiusCm() const
{
	const IUSim::BuildingDef* Def = GetDef();
	return Def ? Def->HeatRadius * IU::MetersToCm : 0.0f;
}

IUSim::EStation AIUStructure::GetStation() const
{
	const IUSim::BuildingDef* Def = GetDef();
	return Def ? IUSim::StationFromString(Def->Station) : IUSim::EStation::Hand;
}

bool AIUStructure::IsStationUsable() const
{
	const IUSim::BuildingDef* Def = GetDef();
	if (!Def || Def->Station.empty()) { return false; }
	// Fire-based stations (campfire, furnace) only work while burning.
	return Fire ? Fire->IsLit() : true;
}

bool AIUStructure::IsBed() const
{
	const IUSim::BuildingDef* Def = GetDef();
	return Def && Def->bIsBed;
}

FText AIUStructure::GetInteractText(const AIUCharacter* By) const
{
	const IUSim::BuildingDef* Def = GetDef();
	if (!Def) { return FText::GetEmpty(); }
	const FString Name = IU::ToFString(Def->Name);
	if (Farm) { return Farm->GetInteractText(By); }
	if (Fire) { return FText::FromString(FString::Printf(TEXT("%s: cocinar / combustible"), *Name)); }
	if (Storage) { return FText::FromString(FString::Printf(TEXT("Abrir %s"), *Name)); }
	if (Door) { return Door->IsOpen() ? NSLOCTEXT("IU", "CloseDoor", "Cerrar puerta") : NSLOCTEXT("IU", "OpenDoor", "Abrir puerta"); }
	if (Def->bIsBed) { return FText::FromString(FString::Printf(TEXT("Dormir (%s)"), *Name)); }
	if (!Def->Station.empty()) { return FText::FromString(FString::Printf(TEXT("Usar %s"), *Name)); }
	return FText::GetEmpty();
}

void AIUStructure::Interact(AIUCharacter* By)
{
	const IUSim::BuildingDef* Def = GetDef();
	if (!By || !Def) { return; }
	if (Farm) { Farm->Interact(By); return; }
	if (Fire) { By->OpenContainer(Fire->GetCookingSlots(), FText::FromString(FString::Printf(TEXT("%s (cocina)"), *IU::ToFString(Def->Name)))); return; }
	if (Storage) { By->OpenContainer(Storage, Storage->DisplayName); return; }
	if (Door) { Door->Toggle(); return; }
	if (Def->bIsBed) { By->Sleep(true); return; }
	if (!Def->Station.empty()) { By->OpenCrafting(); return; }
}

FText AIUStructure::GetSecondaryText(const AIUCharacter* By) const
{
	if (Fire) { return Fire->GetSecondaryText(By); }
	const IUSim::BuildingDef* Def = GetDef();
	if (Def && Def->bIsBed && (Storage || Fire)) { return NSLOCTEXT("IU", "SleepHere", "Dormir"); }
	return FText::GetEmpty();
}

void AIUStructure::InteractSecondary(AIUCharacter* By)
{
	if (Fire) { Fire->InteractSecondary(By); return; }
	if (IsBed() && By) { By->Sleep(true); }
}

float AIUStructure::TakeDamage(float DamageAmount, FDamageEvent const& DamageEvent, AController* EventInstigator, AActor* DamageCauser)
{
	const float Applied = Super::TakeDamage(DamageAmount, DamageEvent, EventInstigator, DamageCauser);
	Health -= DamageAmount;
	if (Health <= 0.0f)
	{
		if (Storage)
		{
			// Spill the contents instead of deleting them.
			for (int32 I = 0; I < Storage->Inv().NumSlots(); ++I) { Storage->DropSlot(I, 0); }
		}
		Destroy();
	}
	return Applied;
}

void AIUStructure::Deconstruct(AIUCharacter* By)
{
	const IUSim::BuildingDef* Def = GetDef();
	if (!Def || !By || !By->GetInventory()) { return; }
	for (const IUSim::ItemAmount& Cost : Def->Cost)
	{
		const int32 Refund = FMath::Max(1, Cost.Count / 2);
		By->GetInventory()->GiveOrDrop(Cost.ItemId, Refund);
	}
	if (Storage)
	{
		for (int32 I = 0; I < Storage->Inv().NumSlots(); ++I) { Storage->TransferTo(By->GetInventory(), I, 0); }
		for (int32 I = 0; I < Storage->Inv().NumSlots(); ++I) { Storage->DropSlot(I, 0); }
	}
	Destroy();
}

IUSim::JsonValue AIUStructure::ToJson() const
{
	IUSim::JsonValue J = IUSim::JsonValue::MakeObject();
	const FTransform T = GetActorTransform();
	J.Set("id", IUSim::JsonValue::MakeString(BuildingId));
	J.Set("x", IUSim::JsonValue::MakeNumber(T.GetLocation().X));
	J.Set("y", IUSim::JsonValue::MakeNumber(T.GetLocation().Y));
	J.Set("z", IUSim::JsonValue::MakeNumber(T.GetLocation().Z));
	J.Set("yaw", IUSim::JsonValue::MakeNumber(T.Rotator().Yaw));
	J.Set("hp", IUSim::JsonValue::MakeNumber(Health));
	if (Storage) { J.Set("storage", Storage->ToJson()); }
	if (Fire) { J.Set("fire", Fire->ToJson()); }
	if (Farm) { J.Set("farm", Farm->ToJson()); }
	if (Door) { J.Set("door_open", IUSim::JsonValue::MakeBool(Door->IsOpen())); }
	return J;
}

void AIUStructure::FromJson(const IUSim::JsonValue& J)
{
	Health = J.GetFloat("hp", Health);
	if (Storage && J.Has("storage")) { Storage->FromJson(J["storage"]); }
	if (Fire && J.Has("fire")) { Fire->FromJson(J["fire"]); }
	if (Farm && J.Has("farm")) { Farm->FromJson(J["farm"]); }
	if (Door && J.GetBool("door_open")) { Door->Toggle(); }
}
