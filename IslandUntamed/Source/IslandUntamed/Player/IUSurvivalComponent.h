// Island Untamed - survival component: feeds the environment into
// IUSim::SurvivalModel every frame and exposes effects to the character, HUD
// and post-process.
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Sim/SimSurvival.h"
#include "IUSurvivalComponent.generated.h"

DECLARE_MULTICAST_DELEGATE(FIUOnDeath);

UCLASS(ClassGroup = (IslandUntamed), meta = (BlueprintSpawnableComponent))
class ISLANDUNTAMED_API UIUSurvivalComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UIUSurvivalComponent();
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	IUSim::SurvivalModel& Model() { return Survival; }
	const IUSim::SurvivalModel& Model() const { return Survival; }
	const IUSim::SurvivalEnvironment& LastEnvironment() const { return Env; }
	const IUSim::SurvivalEffects& Effects() const { return CachedEffects; }
	uint32 GetWarnings() const { return CachedWarnings; }
	float GetAmbientTemperature() const { return Env.AmbientTempC; }

	/** Current activity (set by the character every frame). */
	IUSim::EActivity Activity = IUSim::EActivity::Idle;
	/** Pauses needs (main menu, intro). */
	bool bFrozen = true;

	bool Consume(const std::string& ItemId);
	float ApplyDamage(float Amount, bool bCanBleed);
	void AddPoison(float Amount);
	void SimulateSleep(float Hours, bool bInBed);
	void ResetForNewGame();
	bool IsDead() const { return Survival.IsDead(); }

	FIUOnDeath OnDeath;

private:
	void GatherEnvironment(float DeltaTime);

	IUSim::SurvivalModel Survival;
	IUSim::SurvivalEnvironment Env;
	IUSim::SurvivalEffects CachedEffects;
	IUSim::Rng Random;
	uint32 CachedWarnings = 0;
	float EnvTimer = 0.0f;
	bool bDeathBroadcast = false;
};
