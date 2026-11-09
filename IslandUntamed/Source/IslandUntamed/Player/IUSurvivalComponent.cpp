#include "Player/IUSurvivalComponent.h"

#include "Core/IUGameInstance.h"
#include "Core/IUTypes.h"
#include "Player/IUCharacter.h"
#include "Player/IUInventoryComponent.h"
#include "World/IUWorldSubsystem.h"
#include "GameFramework/Actor.h"

UIUSurvivalComponent::UIUSurvivalComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.TickGroup = TG_PostPhysics;
	Random.Seed(0xC0FFEEULL);
}

void UIUSurvivalComponent::GatherEnvironment(float DeltaTime)
{
	// Expensive queries (traces, structure scans) at 4 Hz.
	EnvTimer -= DeltaTime;
	if (EnvTimer > 0.0f) { return; }
	EnvTimer = 0.25f;

	const AIUCharacter* Character = Cast<AIUCharacter>(GetOwner());
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!Character || !WS) { return; }
	const FVector Loc = Character->GetActorLocation();
	const IUSim::WeatherParams& W = WS->GetClock().GetParams();

	Env.AmbientTempC = WS->GetAmbientTemperature(Loc);
	Env.bSheltered = IU::IsUnderground(Loc) || WS->IsShelteredAt(Loc, Character);
	Env.RainIntensity = IU::IsUnderground(Loc) ? 0.0f : W.Rain;
	Env.WindSpeed = IU::IsUnderground(Loc) ? 0.0f : W.Wind * (1.0f + FMath::Max(0.0f, static_cast<float>(Loc.Z) / 30000.0f));
	Env.bInWater = Character->IsInWater();
	Env.FireHeat = FMath::Max(WS->GetFireHeatAt(Loc), Character->IsHoldingLitTorch() ? 0.25f : 0.0f);
	Env.Insulation = Character->GetInventory() ? Character->GetInventory()->GetArmorInsulation() : 0.0f;
}

void UIUSurvivalComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	if (bFrozen || Survival.IsDead()) { return; }

	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!WS) { return; }
	GatherEnvironment(DeltaTime);
	Env.Activity = Activity;
	Env.bSleeping = false;
	Env.bSleepingInBed = false;

	const AIUCharacter* Character = Cast<AIUCharacter>(GetOwner());
	const float Load = (Character && Character->GetInventory()) ? Character->GetInventory()->Inv().GetLoadRatio() : 0.0f;
	const float GameHours = DeltaTime * WS->GetClock().GameHoursPerRealSecond() * WS->TimeScale;
	Survival.Tick(GameHours, DeltaTime, Env, Load);
	CachedEffects = Survival.ComputeEffects(Load);
	CachedWarnings = Survival.GetWarnings(Load);

	if (Survival.IsDead() && !bDeathBroadcast)
	{
		bDeathBroadcast = true;
		OnDeath.Broadcast();
	}
}

bool UIUSurvivalComponent::Consume(const std::string& ItemId)
{
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	const IUSim::ItemDef* Def = Db ? Db->Items.Find(ItemId) : nullptr;
	if (!Def) { return false; }
	const float PoisonBefore = Survival.State.Poison;
	const float InfectionBefore = Survival.State.Infection;
	if (!Survival.Consume(*Def, Random)) { return false; }
	if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this))
	{
		WS->BroadcastEvent(IUSim::EGameEvent::Consume, ItemId, 1);
		if (Survival.State.Poison > PoisonBefore + 1.0f) { WS->Notify(TEXT("Te sientes enfermo... (envenenamiento)"), IU::Palette::Bad); }
		if (Survival.State.Infection > InfectionBefore + 1.0f) { WS->Notify(TEXT("Algo no te ha sentado bien (infeccion)"), IU::Palette::Bad); }
	}
	return true;
}

float UIUSurvivalComponent::ApplyDamage(float Amount, bool bCanBleed)
{
	const bool bWasBleeding = Survival.State.Bleeding > 0.0f;
	const float Applied = Survival.ApplyDamage(Amount, bCanBleed, Random);
	if (!bWasBleeding && Survival.State.Bleeding > 0.0f)
	{
		if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this)) { WS->Notify(TEXT("Estas sangrando. Usa una venda."), IU::Palette::Bad); }
	}
	if (Survival.IsDead() && !bDeathBroadcast)
	{
		bDeathBroadcast = true;
		OnDeath.Broadcast();
	}
	return Applied;
}

void UIUSurvivalComponent::AddPoison(float Amount)
{
	Survival.State.Poison = FMath::Clamp(Survival.State.Poison + Amount, 0.0f, 100.0f);
}

void UIUSurvivalComponent::SimulateSleep(float Hours, bool bInBed)
{
	IUSim::SurvivalEnvironment SleepEnv = Env;
	SleepEnv.bSleeping = true;
	SleepEnv.bSleepingInBed = bInBed;
	SleepEnv.Activity = IUSim::EActivity::Idle;
	const AIUCharacter* Character = Cast<AIUCharacter>(GetOwner());
	const float Load = (Character && Character->GetInventory()) ? Character->GetInventory()->Inv().GetLoadRatio() : 0.0f;
	float Remaining = Hours;
	while (Remaining > 0.0f && !Survival.IsDead())
	{
		const float Step = FMath::Min(Remaining, 0.25f);
		Survival.Tick(Step, 0.0f, SleepEnv, Load);
		Remaining -= Step;
	}
	Survival.State.Stamina = Survival.State.MaxStamina;
}

void UIUSurvivalComponent::ResetForNewGame()
{
	Survival = IUSim::SurvivalModel();
	// The crash leaves the survivor shaken: a bit hungry, thirsty and wet.
	Survival.State.Satiety = 55.0f;
	Survival.State.Hydration = 45.0f;
	Survival.State.Health = 85.0f;
	Survival.State.Wetness = 1.0f;
	Survival.State.Rest = 70.0f;
	bDeathBroadcast = false;
}
