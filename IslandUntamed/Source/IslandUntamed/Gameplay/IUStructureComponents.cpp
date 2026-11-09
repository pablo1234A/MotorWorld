#include "Gameplay/IUStructureComponents.h"

#include "Core/IUAssets.h"
#include "Core/IUGameInstance.h"
#include "Core/IUTypes.h"
#include "Creatures/IUCreature.h"
#include "Gameplay/IUStructure.h"
#include "Gameplay/IUWorldItem.h"
#include "Player/IUCharacter.h"
#include "Player/IUInventoryComponent.h"
#include "World/IUVisuals.h"
#include "World/IUWorldSubsystem.h"
#include "Components/PointLightComponent.h"
#include "Components/SphereComponent.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/DamageType.h"
#include "Kismet/GameplayStatics.h"

// =============================================================================================
// Fire
// =============================================================================================

UIUFireComponent::UIUFireComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.TickInterval = 0.1f;
}

void UIUFireComponent::InitFire(const IUSim::BuildingDef& Def, bool bStartLit)
{
	Capacity = Def.FuelCapacity;
	AActor* Owner = GetOwner();
	Light = NewObject<UPointLightComponent>(Owner, TEXT("FireLight"));
	Light->SetupAttachment(this);
	Light->SetRelativeLocation(FVector(0, 0, Def.Id == "torch_stand" ? 190.0f : 70.0f));
	BaseIntensity = Def.LightRadius >= 9.0f ? 9000.0f : 5000.0f;
	Light->SetAttenuationRadius(FMath::Max(400.0f, Def.LightRadius * IU::MetersToCm * 1.6f));
	Light->SetLightColor(FLinearColor(1.0f, 0.55f, 0.22f));
	Light->SetCastShadows(true);
	Light->RegisterComponent();

	// Only cooking fires get a cooking inventory (torches and furnaces use the crafting menu).
	if (Def.Station == "campfire" || Def.Station == "furnace")
	{
		Cooking = NewObject<UIUInventoryComponent>(Owner, TEXT("Cooking"));
		Cooking->RegisterComponent();
		Cooking->Setup(4, 0.0f, false, false);
		Cooking->DisplayName = IU::ToText(Def.Name);
		CookTimers.Init(0.0f, 4);
	}
	Fuel = bStartLit ? FMath::Min(Capacity, 240.0f) : 0.0f;
	SetLit(bStartLit);
}

void UIUFireComponent::SetLit(bool bInLit)
{
	bLit = bInLit && Fuel > 0.0f;
	UpdateVisuals();
}

void UIUFireComponent::UpdateVisuals()
{
	if (Light) { Light->SetVisibility(bLit); }
	if (const AIUStructure* S = Cast<AIUStructure>(GetOwner()))
	{
		for (UStaticMeshComponent* Flame : S->GetFlameParts()) { if (Flame) { Flame->SetVisibility(bLit); } }
	}
}

float UIUFireComponent::GetCookProgress(int32 Slot) const
{
	if (!Cooking || !CookTimers.IsValidIndex(Slot)) { return 0.0f; }
	const IUSim::ItemStack& S = Cooking->Inv().GetSlot(Slot);
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	const IUSim::ItemDef* Def = (Db && !S.IsEmpty()) ? Db->Items.Find(S.ItemId) : nullptr;
	if (!Def || Def->CookResult.empty() || Def->CookSeconds <= 0.0f) { return 0.0f; }
	return FMath::Clamp(CookTimers[Slot] / Def->CookSeconds, 0.0f, 1.0f);
}

void UIUFireComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	if (!bLit) { return; }
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);

	ShelterCheckTimer -= DeltaTime;
	if (ShelterCheckTimer <= 0.0f && WS)
	{
		ShelterCheckTimer = 5.0f;
		bSheltered = IU::IsUnderground(GetComponentLocation()) || WS->IsShelteredAt(GetComponentLocation(), GetOwner());
	}
	const float Rain = (WS && !bSheltered) ? WS->GetClock().GetParams().Rain : 0.0f;
	Fuel -= DeltaTime * (1.0f + Rain * 3.0f);
	if (Fuel <= 0.0f)
	{
		Fuel = 0.0f;
		SetLit(false);
		return;
	}

	FlickerTime += DeltaTime;
	if (Light)
	{
		const float Flicker = 0.82f + 0.12f * FMath::Sin(FlickerTime * 13.0f) + 0.06f * FMath::Sin(FlickerTime * 31.0f + 1.3f);
		Light->SetIntensity(BaseIntensity * Flicker);
	}

	// Cooking.
	if (Cooking)
	{
		const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
		for (int32 I = 0; I < Cooking->Inv().NumSlots() && Db; ++I)
		{
			const IUSim::ItemStack S = Cooking->Inv().GetSlot(I);
			const IUSim::ItemDef* Def = S.IsEmpty() ? nullptr : Db->Items.Find(S.ItemId);
			if (!Def || Def->CookResult.empty())
			{
				CookTimers[I] = 0.0f;
				continue;
			}
			CookTimers[I] += DeltaTime;
			if (CookTimers[I] >= Def->CookSeconds)
			{
				CookTimers[I] = 0.0f;
				Cooking->Inv().RemoveFromSlot(I, 1);
				const int32 Left = Cooking->Inv().AddItem(Def->CookResult, 1);
				if (Left > 0) { AIUWorldItem::SpawnItem(GetWorld(), GetComponentLocation() + FVector(70, 0, 20), Def->CookResult, Left); }
				Cooking->MarkChanged();
				if (WS) { WS->BroadcastEvent(IUSim::EGameEvent::Craft, Def->CookResult, 1); }
			}
		}
	}
}

FText UIUFireComponent::GetSecondaryText(const AIUCharacter* By) const
{
	if (!bLit && Fuel > 0.0f) { return NSLOCTEXT("IU", "LightFire", "Encender"); }
	return FText::FromString(FString::Printf(TEXT("Anadir combustible (%.0f%%)"), Capacity > 0.0f ? Fuel / Capacity * 100.0f : 0.0f));
}

bool UIUFireComponent::AddFuelFrom(AIUCharacter* By)
{
	UIUInventoryComponent* Inv = By ? By->GetInventory() : nullptr;
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	if (!Inv || !Db) { return false; }
	std::string Best;
	float BestFuel = 0.0f;
	for (int32 I = 0; I < Inv->Inv().NumSlots(); ++I)
	{
		const IUSim::ItemStack& S = Inv->Inv().GetSlot(I);
		const IUSim::ItemDef* Def = S.IsEmpty() ? nullptr : Db->Items.Find(S.ItemId);
		// Never burn tools/weapons even if made of wood.
		if (Def && Def->FuelSeconds > BestFuel && Def->Category == IUSim::EItemCategory::Material)
		{
			BestFuel = Def->FuelSeconds;
			Best = S.ItemId;
		}
	}
	if (Best.empty() || Fuel >= Capacity) { return false; }
	Inv->RemoveItem(Best, 1);
	Fuel = FMath::Min(Capacity, Fuel + BestFuel);
	return true;
}

void UIUFireComponent::InteractSecondary(AIUCharacter* By)
{
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!bLit && Fuel > 0.0f)
	{
		SetLit(true);
		if (By) { By->PlayActionSound(TEXT("fire")); }
		return;
	}
	if (AddFuelFrom(By))
	{
		SetLit(true);
		if (By) { By->PlayActionSound(TEXT("fire")); }
	}
	else if (WS)
	{
		WS->Notify(Fuel >= Capacity ? TEXT("El fuego ya esta lleno de combustible") : TEXT("No tienes combustible (madera, ramas, hojas, carbon)"), IU::Palette::Bad);
	}
}

IUSim::JsonValue UIUFireComponent::ToJson() const
{
	IUSim::JsonValue J = IUSim::JsonValue::MakeObject();
	J.Set("fuel", IUSim::JsonValue::MakeNumber(Fuel));
	J.Set("lit", IUSim::JsonValue::MakeBool(bLit));
	if (Cooking) { J.Set("cooking", Cooking->ToJson()); }
	return J;
}

void UIUFireComponent::FromJson(const IUSim::JsonValue& J)
{
	Fuel = J.GetFloat("fuel", 0.0f);
	if (Cooking && J.Has("cooking")) { Cooking->FromJson(J["cooking"]); }
	SetLit(J.GetBool("lit", false));
}

// =============================================================================================
// Farm plot
// =============================================================================================

namespace IUFarmLocal
{
	bool IsWater(const std::string& Id) { return Id == "dirty_water" || Id == "clean_water" || Id == "bottled_water"; }
}

UIUFarmPlotComponent::UIUFarmPlotComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
}

void UIUFarmPlotComponent::OnRegister()
{
	Super::OnRegister();
	if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this))
	{
		HoursHandle = WS->OnGameHoursPassed.AddUObject(this, &UIUFarmPlotComponent::OnHours);
		bSheltered = WS->IsShelteredAt(GetComponentLocation(), GetOwner());
	}
	RefreshVisual();
}

void UIUFarmPlotComponent::OnUnregister()
{
	if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this)) { WS->OnGameHoursPassed.Remove(HoursHandle); }
	Super::OnUnregister();
}

const IUSim::CropDef* UIUFarmPlotComponent::CurrentCrop() const
{
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	return (Db && !Plot.CropId.empty()) ? Db->Crops.Find(Plot.CropId) : nullptr;
}

void UIUFarmPlotComponent::OnHours(float Hours)
{
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!WS || Hours <= 0.0f) { return; }
	IUSim::PlotEnvironment Env;
	Env.RainIntensity = WS->GetClock().GetParams().Rain;
	Env.AmbientTempC = WS->GetAmbientTemperature(GetComponentLocation());
	Env.bSheltered = bSheltered;
	const IUSim::EPlotState Before = Plot.State;
	Plot.Tick(Hours, Env, CurrentCrop());
	if (Before != Plot.State && Plot.State == IUSim::EPlotState::Dead)
	{
		WS->Notify(TEXT("Un cultivo se ha secado"), IU::Palette::Bad);
	}
	RefreshVisual();
}

void UIUFarmPlotComponent::RefreshVisual()
{
	const int32 Stage = Plot.State == IUSim::EPlotState::Dead ? 9 : (Plot.State == IUSim::EPlotState::Growing || Plot.State == IUSim::EPlotState::Harvestable ? Plot.GetVisualStage() : -1);
	if (Stage == VisualStage && VisualCrop == Plot.CropId) { return; }
	VisualStage = Stage;
	VisualCrop = Plot.CropId;
	for (UStaticMeshComponent* C : CropParts) { if (C) { C->DestroyComponent(); } }
	CropParts.Reset();
	if (Stage < 0) { return; }

	const IUSim::CropDef* Crop = CurrentCrop();
	const FLinearColor Produce = Crop ? IU::HexColor(Crop->Color, FLinearColor::Yellow) : FLinearColor::Yellow;
	const FLinearColor Green(0.18f, 0.45f, 0.1f);
	TArray<FIUShapePart> Parts;
	const bool bTree = Crop && Crop->bRegrows;
	const float Scale = Stage == 9 ? 0.5f : (0.3f + 0.25f * static_cast<float>(FMath::Min(Stage, 3)));
	if (bTree)
	{
		Parts.Add(FIUShapePart(EIUShape::Cylinder, FVector(0, 0, 150 * Scale), FVector(20, 20, 300 * Scale), FLinearColor(0.2f, 0.12f, 0.06f), false));
		Parts.Add(FIUShapePart(EIUShape::Sphere, FVector(0, 0, 330 * Scale), FVector(260 * Scale), Stage == 9 ? FLinearColor(0.3f, 0.2f, 0.1f) : Green, false));
		if (Stage == 3) { Parts.Add(FIUShapePart(EIUShape::Sphere, FVector(60, 40, 300 * Scale), FVector(25), Produce, false)); }
	}
	else
	{
		for (int32 I = 0; I < 4; ++I)
		{
			const FVector Pos((I & 1) ? 50 : -50, (I & 2) ? 50 : -50, 25);
			const FLinearColor Leaf = Stage == 9 ? FLinearColor(0.35f, 0.25f, 0.1f) : Green;
			Parts.Add(FIUShapePart(EIUShape::Cone, Pos + FVector(0, 0, 50 * Scale), FVector(50 * Scale, 50 * Scale, 100 * Scale), Leaf, false));
			if (Stage == 3) { Parts.Add(FIUShapePart(EIUShape::Sphere, Pos + FVector(12, 0, 40), FVector(22), Produce, false)); }
		}
	}
	if (UIUAssets* Assets = UIUAssets::Get(this))
	{
		for (UStaticMeshComponent* C : Assets->BuildParts(GetOwner(), this, Parts, true)) { CropParts.Add(C); }
	}
}

FText UIUFarmPlotComponent::GetInteractText(const AIUCharacter* By) const
{
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	const std::string Held = By ? By->GetHeldItemId() : std::string();
	const IUSim::ItemDef* HeldDef = (Db && !Held.empty()) ? Db->Items.Find(Held) : nullptr;
	switch (Plot.State)
	{
	case IUSim::EPlotState::Untilled:
		return NSLOCTEXT("IU", "Till", "Preparar la tierra (necesita palo de cavar)");
	case IUSim::EPlotState::Tilled:
		if (HeldDef && !HeldDef->SeedCrop.empty()) { return FText::FromString(FString::Printf(TEXT("Plantar %s"), *IU::ToFString(HeldDef->Name))); }
		return NSLOCTEXT("IU", "NeedSeed", "Tierra lista: equipa semillas para plantar");
	case IUSim::EPlotState::Growing:
	{
		const IUSim::CropDef* Crop = CurrentCrop();
		if (IUFarmLocal::IsWater(Held)) { return NSLOCTEXT("IU", "WaterPlot", "Regar"); }
		if (HeldDef && HeldDef->HasTag("fertilizer")) { return NSLOCTEXT("IU", "Fertilize", "Abonar"); }
		return FText::FromString(FString::Printf(TEXT("%s %.0f%%  |  agua %.0f%%  |  abono %.0f%%"), Crop ? *IU::ToFString(Crop->Name) : TEXT("Cultivo"),
			Plot.Growth * 100.0f, Plot.Water * 100.0f, Plot.Fertility * 100.0f));
	}
	case IUSim::EPlotState::Harvestable:
		return NSLOCTEXT("IU", "Harvest", "Cosechar");
	case IUSim::EPlotState::Dead:
		return NSLOCTEXT("IU", "ClearDead", "Retirar planta muerta");
	}
	return FText::GetEmpty();
}

void UIUFarmPlotComponent::Interact(AIUCharacter* By)
{
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!By || !Db || !WS || !By->GetInventory()) { return; }
	UIUInventoryComponent* Inv = By->GetInventory();
	const std::string Held = By->GetHeldItemId();
	const IUSim::ItemDef* HeldDef = Held.empty() ? nullptr : Db->Items.Find(Held);

	switch (Plot.State)
	{
	case IUSim::EPlotState::Untilled:
		if (!IUSim::Crafting::HasTool(Inv->Inv(), IUSim::EToolType::Hoe)) { WS->Notify(TEXT("Necesitas un palo de cavar"), IU::Palette::Bad); return; }
		Plot.Till();
		By->PlayActionSound(TEXT("dig"));
		break;
	case IUSim::EPlotState::Tilled:
		if (HeldDef && !HeldDef->SeedCrop.empty())
		{
			if (const IUSim::CropDef* Crop = Db->Crops.Find(HeldDef->SeedCrop))
			{
				if (Inv->RemoveItem(Held, 1) == 1 && Plot.Plant(*Crop))
				{
					WS->Notify(FString::Printf(TEXT("Has plantado %s"), *IU::ToFString(Crop->Name)), IU::Palette::Good);
					By->PlayActionSound(TEXT("dig"));
				}
			}
		}
		else
		{
			WS->Notify(TEXT("Selecciona unas semillas en la barra rapida"), IU::Palette::TextDim);
		}
		break;
	case IUSim::EPlotState::Growing:
		if (IUFarmLocal::IsWater(Held) && Inv->RemoveItem(Held, 1) == 1)
		{
			Plot.AddWater(0.6f);
			By->PlayActionSound(TEXT("water"));
		}
		else if (HeldDef && HeldDef->HasTag("fertilizer") && Inv->RemoveItem(Held, 1) == 1)
		{
			Plot.Fertilize(0.35f);
		}
		break;
	case IUSim::EPlotState::Harvestable:
		if (const IUSim::CropDef* Crop = CurrentCrop())
		{
			const IUSim::HarvestResult R = Plot.Harvest(*Crop, WS->GetRandom());
			if (R.ProduceCount > 0) { Inv->GiveOrDrop(R.ProduceItem, R.ProduceCount); }
			if (R.SeedCount > 0) { Inv->GiveOrDrop(R.SeedItem, R.SeedCount); }
			WS->BroadcastEvent(IUSim::EGameEvent::Harvest, Crop->Id, 1);
			By->PlayActionSound(TEXT("pickup"));
		}
		break;
	case IUSim::EPlotState::Dead:
		Plot.ClearDead();
		break;
	}
	RefreshVisual();
}

IUSim::JsonValue UIUFarmPlotComponent::ToJson() const
{
	return Plot.ToJson();
}

void UIUFarmPlotComponent::FromJson(const IUSim::JsonValue& J)
{
	Plot.FromJson(J);
	RefreshVisual();
}

// =============================================================================================
// Door
// =============================================================================================

UIUDoorComponent::UIUDoorComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.bStartWithTickEnabled = false;
}

void UIUDoorComponent::BuildLeaf()
{
	Hinge = NewObject<USceneComponent>(GetOwner(), TEXT("DoorHinge"));
	Hinge->SetupAttachment(this);
	Hinge->SetRelativeLocation(FVector(-50, 0, 0));
	Hinge->RegisterComponent();
	TArray<FIUShapePart> Leaf;
	Leaf.Add(FIUShapePart(EIUShape::Cube, FVector(50, 0, 110), FVector(98, 8, 218), IUVisuals::Colors::WoodDark, true));
	Leaf.Add(FIUShapePart(EIUShape::Sphere, FVector(85, 8, 105), FVector(8), IUVisuals::Colors::Metal, false));
	if (UIUAssets* Assets = UIUAssets::Get(this)) { Assets->BuildParts(GetOwner(), Hinge, Leaf, true); }
}

void UIUDoorComponent::Toggle()
{
	bOpen = !bOpen;
	SetComponentTickEnabled(true);
}

void UIUDoorComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	const float Target = bOpen ? 95.0f : 0.0f;
	Angle = FMath::FInterpConstantTo(Angle, Target, DeltaTime, 220.0f);
	if (Hinge) { Hinge->SetRelativeRotation(FRotator(0, Angle, 0)); }
	if (FMath::IsNearlyEqual(Angle, Target)) { SetComponentTickEnabled(false); }
}

// =============================================================================================
// Trap
// =============================================================================================

UIUTrapComponent::UIUTrapComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
}

void UIUTrapComponent::InitTrap(float InDamage, const FVector& SizeCm)
{
	Damage = InDamage;
	Trigger = NewObject<USphereComponent>(GetOwner(), TEXT("TrapTrigger"));
	Trigger->SetupAttachment(this);
	Trigger->SetSphereRadius(FMath::Max(SizeCm.X, SizeCm.Y) * 0.5f);
	Trigger->SetRelativeLocation(FVector(0, 0, 40));
	Trigger->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Trigger->SetCollisionResponseToAllChannels(ECR_Ignore);
	Trigger->SetCollisionResponseToChannel(ECC_Pawn, ECR_Overlap);
	Trigger->SetGenerateOverlapEvents(true);
	Trigger->OnComponentBeginOverlap.AddDynamic(this, &UIUTrapComponent::OnOverlap);
	Trigger->RegisterComponent();
}

void UIUTrapComponent::OnOverlap(UPrimitiveComponent* OverlappedComp, AActor* OtherActor, UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult)
{
	AIUCreature* Creature = Cast<AIUCreature>(OtherActor);
	if (!Creature || !Creature->IsAlive()) { return; } // traps never hurt the builder
	const double Now = GetWorld()->GetTimeSeconds();
	if (Now - LastTriggerTime < 2.0) { return; }
	LastTriggerTime = Now;
	UGameplayStatics::ApplyDamage(Creature, Damage, nullptr, GetOwner(), UDamageType::StaticClass());
	if (--UsesLeft <= 0 && GetOwner())
	{
		if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this)) { WS->Notify(TEXT("Una trampa se ha roto"), IU::Palette::TextDim); }
		GetOwner()->Destroy();
	}
}
