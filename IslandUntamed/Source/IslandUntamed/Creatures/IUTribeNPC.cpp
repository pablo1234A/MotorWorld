#include "Creatures/IUTribeNPC.h"

#include "Core/IUAssets.h"
#include "Core/IUTypes.h"
#include "Creatures/IUAnimal.h"
#include "Creatures/IUVillage.h"
#include "Player/IUCharacter.h"
#include "Player/IUInventoryComponent.h"
#include "World/IUStorySubsystem.h"
#include "World/IUWorldSubsystem.h"
#include "Components/CapsuleComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/DamageEvents.h"

namespace IUTribeNPCLocal
{
	const TCHAR* WarnLines[] = { TEXT("¡Alto, extranjero!"), TEXT("¡Fuera de nuestra aldea!"), TEXT("¡Ultimo aviso!") };
}

void AIUTribeNPC::InitNPC(const FString& InTribeId, IUSim::ENpcRole InRole, AIUVillage* InVillage, uint32 InSeed, const FString& InName)
{
	TribeId = InTribeId;
	Role = InRole;
	Village = InVillage;
	Seed = InSeed;
	NPCName = InName;
	HomeLocation = InVillage ? InVillage->GetCenter() : GetActorLocation();
	LeashRadiusCm = 9000.0f;

	const bool bFighter = IUSim::NpcBrain::IsCombatRole(Role);
	switch (Role)
	{
	case IUSim::ENpcRole::Chief: ConfigureStats(220.0f, 150.0f, 520.0f, 26.0f, 170.0f, 1.1f, 3200.0f, 3500.0f); break;
	case IUSim::ENpcRole::Guard: ConfigureStats(150.0f, 150.0f, 520.0f, 18.0f, 200.0f, 1.0f, 3500.0f, 3500.0f); break;
	case IUSim::ENpcRole::Hunter: ConfigureStats(120.0f, 160.0f, 560.0f, 16.0f, 200.0f, 1.0f, 4000.0f, 4000.0f); break;
	default: ConfigureStats(70.0f, 140.0f, 480.0f, 6.0f, 120.0f, 1.4f, 2500.0f, 3000.0f); break;
	}

	const UIUStorySubsystem* Story = UIUStorySubsystem::Get(this);
	const IUSim::TribeDef* Def = Story ? Story->Factions().FindDef(IU::ToStd(TribeId)) : nullptr;
	const FLinearColor Cloth = Def ? IU::HexColor(Def->Color) : FLinearColor(0.5f, 0.3f, 0.2f);
	const float Height = 165.0f + static_cast<float>(Seed % 20U);
	BuildBody(EIUBodyShape::Humanoid, Height, Cloth * 0.6f, Cloth);

	// Role props: spears for fighters, a headdress for the chief, a basket for gatherers.
	if (UIUAssets* Assets = UIUAssets::Get(this))
	{
		TArray<FIUShapePart> Props;
		if (bFighter)
		{
			Props.Add(FIUShapePart(EIUShape::Cylinder, FVector(25, 32, Height * 0.55f), FVector(4, 4, 190), FLinearColor(0.35f, 0.22f, 0.1f), false));
			Props.Add(FIUShapePart(EIUShape::Cone, FVector(25, 32, Height * 0.55f + 102), FVector(8, 8, 20), FLinearColor(0.3f, 0.3f, 0.3f), false));
		}
		if (Role == IUSim::ENpcRole::Chief)
		{
			Props.Add(FIUShapePart(EIUShape::Cone, FVector(0, 0, Height + 18), FVector(40, 40, 45), FLinearColor(0.9f, 0.75f, 0.2f), false));
		}
		if (Role == IUSim::ENpcRole::Gatherer)
		{
			Props.Add(FIUShapePart(EIUShape::Cylinder, FVector(-22, 0, Height * 0.65f), FVector(35, 35, 30), FLinearColor(0.55f, 0.45f, 0.25f), false));
		}
		Assets->BuildParts(this, BodyRoot, Props, true);
	}
}

bool AIUTribeNPC::IsTerritorial() const
{
	const UIUStorySubsystem* Story = UIUStorySubsystem::Get(this);
	const IUSim::TribeDef* Def = Story ? Story->Factions().FindDef(IU::ToStd(TribeId)) : nullptr;
	return Def && Def->Temperament != IUSim::ETemperament::Peaceful;
}

bool AIUTribeNPC::IsHostileTo(const AActor* Other) const
{
	if (!IsAlive() || !Other) { return false; }
	const UIUStorySubsystem* Story = UIUStorySubsystem::Get(this);
	if (!Story) { return false; }
	if (Other->IsA<AIUCharacter>()) { return bAngryAtPlayer || Story->IsTribeHostile(TribeId); }
	if (const AIUTribeNPC* OtherNPC = Cast<AIUTribeNPC>(Other))
	{
		return OtherNPC->IsAlive() && Story->Factions().AreTribesHostile(IU::ToStd(TribeId), IU::ToStd(OtherNPC->TribeId));
	}
	if (const AIUAnimal* Animal = Cast<AIUAnimal>(Other))
	{
		// Defend the village against predators and aggressive beasts.
		const IUSim::AnimalDef* Def = Animal->GetDef();
		return Animal->IsAlive() && Def && (Def->Temperament == IUSim::ETemperamentAnimal::Aggressive || Def->Temperament == IUSim::ETemperamentAnimal::Predator)
			&& FVector::Dist2D(Animal->GetActorLocation(), HomeLocation) < 6000.0f;
	}
	return false;
}

bool AIUTribeNPC::IsThreatenedBy(const AActor* Other) const
{
	return IsHostileTo(Other);
}

float AIUTribeNPC::TakeDamage(float DamageAmount, FDamageEvent const& DamageEvent, AController* EventInstigator, AActor* DamageCauser)
{
	const bool bWasAlive = IsAlive();
	const float Applied = Super::TakeDamage(DamageAmount, DamageEvent, EventInstigator, DamageCauser);
	AActor* Attacker = LastAttacker();
	if (bWasAlive && IsAlive() && Attacker && Attacker->IsA<AIUCharacter>())
	{
		bAngryAtPlayer = true;
		const double Now = GetWorld()->GetTimeSeconds();
		if (Now - LastAssaultEventTime > 10.0)
		{
			LastAssaultEventTime = Now;
			if (UIUStorySubsystem* Story = UIUStorySubsystem::Get(this)) { Story->ApplySocialEvent(TribeId, IUSim::ESocialEvent::Assault); }
		}
		if (AIUVillage* V = Village.Get()) { V->RaiseAlarm(Attacker); }
		Say(TEXT("¡Nos atacan!"), 3.0f);
	}
	return Applied;
}

void AIUTribeNPC::OnDeath(AActor* Killer)
{
	Super::OnDeath(Killer);
	if (AIUVillage* V = Village.Get()) { V->OnResidentDied(this, Killer); }
	if (Killer && Killer->IsA<AIUCharacter>())
	{
		if (UIUStorySubsystem* Story = UIUStorySubsystem::Get(this))
		{
			Story->ApplySocialEvent(TribeId, Role == IUSim::ENpcRole::Chief ? IUSim::ESocialEvent::KillLeader : IUSim::ESocialEvent::Murder);
		}
		if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this))
		{
			WS->BroadcastEvent(IUSim::EGameEvent::Kill, IU::ToStd(FString::Printf(TEXT("tribe:%s"), *TribeId)), 1);
			if (Role == IUSim::ENpcRole::Chief) { WS->BroadcastEvent(IUSim::EGameEvent::Kill, IU::ToStd(FString::Printf(TEXT("chief:%s"), *TribeId)), 1); }
		}
	}
}

FText AIUTribeNPC::GetInteractText(const AIUCharacter* By) const
{
	if (!IsAlive())
	{
		return bLooted ? FText::GetEmpty() : FText::FromString(TEXT("Registrar el cuerpo"));
	}
	if (IsHostileTo(By)) { return FText::GetEmpty(); }
	const UIUStorySubsystem* Story = UIUStorySubsystem::Get(this);
	const FString Tribe = Story ? Story->GetTribeName(TribeId) : TribeId;
	return FText::FromString(FString::Printf(TEXT("Hablar con %s (%s, %s)"), *NPCName, UTF8_TO_TCHAR(IUSim::NpcRoleToString(Role)), *Tribe));
}

void AIUTribeNPC::Interact(AIUCharacter* By)
{
	if (!By) { return; }
	if (!IsAlive())
	{
		if (bLooted || !By->GetInventory()) { return; }
		bLooted = true;
		const bool bFighter = IUSim::NpcBrain::IsCombatRole(Role);
		By->GetInventory()->GiveOrDrop(bFighter ? "stone_spear" : "rope", 1);
		By->GetInventory()->GiveOrDrop(bFighter ? "arrow" : "berries", bFighter ? 4 : 3);
		if (Role == IUSim::ENpcRole::Chief) { By->GetInventory()->GiveOrDrop(TribeId == TEXT("ashborn") ? "ash_warclub" : "tribal_mask", 1); }
		return;
	}
	if (IsHostileTo(By)) { return; }
	By->OpenTribeDialogue(this);
}

void AIUTribeNPC::TickWarning(float DeltaSeconds, AActor* Intruder)
{
	WarnTime += DeltaSeconds;
	const int32 Stage = FMath::Clamp(static_cast<int32>(WarnTime / (IUSim::NpcBrain::WarnPatienceSeconds / 3.0f)), 0, 2);
	if (GetSpeech().IsEmpty()) { Say(IUTribeNPCLocal::WarnLines[Stage], 2.5f); }
	if (WarnTime >= IUSim::NpcBrain::WarnPatienceSeconds && Intruder && Intruder->IsA<AIUCharacter>())
	{
		WarnTime = 0.0f;
		if (UIUStorySubsystem* Story = UIUStorySubsystem::Get(this)) { Story->ApplySocialEvent(TribeId, IUSim::ESocialEvent::Trespass); }
		// Territorial tribes attack intruders who ignore the warning.
		if (IsTerritorial()) { bAngryAtPlayer = true; Say(TEXT("¡Lo has querido!"), 3.0f); }
	}
}

void AIUTribeNPC::Say(const FString& Line, float Duration)
{
	SpeechLine = Line;
	SpeechUntil = GetWorld() ? GetWorld()->GetTimeSeconds() + Duration : 0.0;
}

FString AIUTribeNPC::GetSpeech() const
{
	return (GetWorld() && GetWorld()->GetTimeSeconds() < SpeechUntil) ? SpeechLine : FString();
}
