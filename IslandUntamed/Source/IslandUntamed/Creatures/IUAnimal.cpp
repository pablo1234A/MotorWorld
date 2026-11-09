#include "Creatures/IUAnimal.h"

#include "Core/IUGameInstance.h"
#include "Core/IUTypes.h"
#include "Player/IUCharacter.h"
#include "Player/IUInventoryComponent.h"
#include "Player/IUSurvivalComponent.h"
#include "World/IUWorldSubsystem.h"
#include "GameFramework/CharacterMovementComponent.h"

namespace IUAnimalLocal
{
	EIUBodyShape ShapeFromString(const std::string& S)
	{
		if (S == "feline") { return EIUBodyShape::Feline; }
		if (S == "reptile") { return EIUBodyShape::Reptile; }
		if (S == "crab") { return EIUBodyShape::Crab; }
		if (S == "bird") { return EIUBodyShape::Bird; }
		if (S == "snake") { return EIUBodyShape::Snake; }
		return EIUBodyShape::Quadruped;
	}
}

void AIUAnimal::InitAnimal(const std::string& InAnimalId)
{
	AnimalId = InAnimalId;
	const IUSim::AnimalDef* Def = GetDef();
	if (!Def) { return; }
	ConfigureStats(Def->Health, Def->WalkSpeed * IU::MetersToCm, Def->RunSpeed * IU::MetersToCm, Def->Damage,
		Def->AttackRange * IU::MetersToCm, Def->AttackInterval, Def->SightRadius * IU::MetersToCm, Def->HearingRadius * IU::MetersToCm);
	const FLinearColor Color = IU::HexColor(Def->Color, FLinearColor(0.4f, 0.3f, 0.2f));
	BuildBody(IUAnimalLocal::ShapeFromString(Def->Shape), Def->Scale * IU::MetersToCm, Color, Color * 0.6f);
	LeashRadiusCm = Def->Temperament == IUSim::ETemperamentAnimal::Predator ? 12000.0f : 6000.0f;
	GetCharacterMovement()->MaxFlySpeed = RunSpeed;
}

const IUSim::AnimalDef* AIUAnimal::GetDef() const
{
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	return Db ? Db->Animals.Find(AnimalId) : nullptr;
}

bool AIUAnimal::IsFlying() const
{
	const IUSim::AnimalDef* Def = GetDef();
	return Def && Def->bFlying;
}

bool AIUAnimal::IsHostileTo(const AActor* Other) const
{
	const IUSim::AnimalDef* Def = GetDef();
	if (!Def || !IsAlive() || !Other || !Other->IsA<AIUCharacter>()) { return false; }
	if (Def->Temperament == IUSim::ETemperamentAnimal::Aggressive) { return true; }
	if (Def->Temperament == IUSim::ETemperamentAnimal::Predator)
	{
		const UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
		return WS && IUSim::AnimalBrain::IsActiveTime(*Def, WS->GetClock().IsNight());
	}
	// Defensive animals become hostile while hurt by the player.
	return Def->Temperament == IUSim::ETemperamentAnimal::Defensive && LastAttacker() == Other && GetWorld()->GetTimeSeconds() - GetLastDamageTime() < 15.0;
}

void AIUAnimal::ApplyAttackHit(AActor* Target)
{
	Super::ApplyAttackHit(Target);
	const IUSim::AnimalDef* Def = GetDef();
	if (Def && Def->Venom > 0.0f)
	{
		if (AIUCharacter* Player = Cast<AIUCharacter>(Target))
		{
			if (Player->GetSurvival()) { Player->GetSurvival()->AddPoison(Def->Venom); }
		}
	}
}

void AIUAnimal::OnDeath(AActor* Killer)
{
	Super::OnDeath(Killer);
	if (Killer && Killer->IsA<AIUCharacter>())
	{
		if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this))
		{
			WS->BroadcastEvent(IUSim::EGameEvent::Kill, AnimalId, 1);
			const IUSim::AnimalDef* Def = GetDef();
			WS->Notify(FString::Printf(TEXT("Has abatido: %s"), Def ? *IU::ToFString(Def->Name) : TEXT("animal")), IU::Palette::TextMain);
		}
	}
	if (IsFlying()) { GetCharacterMovement()->SetMovementMode(MOVE_Falling); }
}

FText AIUAnimal::GetInteractText(const AIUCharacter* By) const
{
	if (IsAlive() || bButchered) { return FText::GetEmpty(); }
	const IUSim::AnimalDef* Def = GetDef();
	const bool bKnife = By && By->GetInventory() && IUSim::Crafting::HasTool(By->GetInventory()->Inv(), IUSim::EToolType::Knife);
	return FText::FromString(FString::Printf(TEXT("Despiezar %s%s"), Def ? *IU::ToFString(Def->Name) : TEXT(""), bKnife ? TEXT("") : TEXT(" (sin cuchillo: menos recursos)")));
}

void AIUAnimal::Interact(AIUCharacter* By)
{
	if (IsAlive() || bButchered || !By || !By->GetInventory()) { return; }
	const IUSim::AnimalDef* Def = GetDef();
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!Def || !WS) { return; }
	bButchered = true;
	const bool bKnife = IUSim::Crafting::HasTool(By->GetInventory()->Inv(), IUSim::EToolType::Knife);
	for (const IUSim::ItemAmount& A : IUSim::RollLoot(Def->Loot, WS->GetRandom(), bKnife ? 1.0f : 0.5f))
	{
		By->GetInventory()->GiveOrDrop(A.ItemId, A.Count);
	}
	By->PlayActionSound(TEXT("butcher"));
	Destroy();
}
