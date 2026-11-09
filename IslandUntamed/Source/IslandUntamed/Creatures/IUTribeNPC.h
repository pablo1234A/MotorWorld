// Island Untamed - a member of a tribe. Role-based daily routine, social
// rules (warnings, theft, assault), dialogue/trade and combat.
#pragma once

#include "CoreMinimal.h"
#include "Creatures/IUCreature.h"
#include "IUTribeNPC.generated.h"

class AIUVillage;

UCLASS()
class ISLANDUNTAMED_API AIUTribeNPC : public AIUCreature
{
	GENERATED_BODY()

public:
	void InitNPC(const FString& InTribeId, IUSim::ENpcRole InRole, AIUVillage* InVillage, uint32 InSeed, const FString& InName);

	const FString& GetTribeId() const { return TribeId; }
	IUSim::ENpcRole GetRole() const { return Role; }
	uint32 GetSeed() const { return Seed; }
	AIUVillage* GetVillage() const { return Village.Get(); }
	const FString& GetNPCName() const { return NPCName; }
	bool IsTerritorial() const;

	virtual bool IsHostileTo(const AActor* Other) const override;
	virtual bool IsThreatenedBy(const AActor* Other) const override;
	virtual float TakeDamage(float DamageAmount, struct FDamageEvent const& DamageEvent, AController* EventInstigator, AActor* DamageCauser) override;
	virtual FText GetInteractText(const AIUCharacter* By) const override;
	virtual void Interact(AIUCharacter* By) override;

	/** Called by the controller every decision tick while in the Warn state. */
	void TickWarning(float DeltaSeconds, AActor* Intruder);
	float GetWarnTime() const { return WarnTime; }
	void Say(const FString& Line, float Duration = 4.0f);
	/** Speech bubble for the HUD (empty when silent). */
	FString GetSpeech() const;
	/** Personal grudge: this NPC attacks the player regardless of reputation. */
	void SetAngry(bool bInAngry) { bAngryAtPlayer = bInAngry; }

protected:
	virtual void OnDeath(AActor* Killer) override;

private:
	FString TribeId;
	FString NPCName;
	IUSim::ENpcRole Role = IUSim::ENpcRole::Gatherer;
	uint32 Seed = 0;
	TWeakObjectPtr<AIUVillage> Village;
	float WarnTime = 0.0f;
	bool bAngryAtPlayer = false;
	bool bLooted = false;
	double LastAssaultEventTime = -100.0;
	FString SpeechLine;
	double SpeechUntil = 0.0;
};
