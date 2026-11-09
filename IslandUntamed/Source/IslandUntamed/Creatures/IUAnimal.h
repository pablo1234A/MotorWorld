// Island Untamed - wild animals (data-driven by animals.json).
#pragma once

#include "CoreMinimal.h"
#include "Creatures/IUCreature.h"
#include "IUAnimal.generated.h"

UCLASS()
class ISLANDUNTAMED_API AIUAnimal : public AIUCreature
{
	GENERATED_BODY()

public:
	void InitAnimal(const std::string& InAnimalId);
	const IUSim::AnimalDef* GetDef() const;
	const std::string& GetAnimalId() const { return AnimalId; }
	bool IsFlying() const;

	virtual bool IsHostileTo(const AActor* Other) const override;
	virtual FText GetInteractText(const AIUCharacter* By) const override;
	virtual void Interact(AIUCharacter* By) override;

protected:
	virtual void OnDeath(AActor* Killer) override;
	virtual void ApplyAttackHit(AActor* Target) override;

private:
	std::string AnimalId;
	bool bButchered = false;
};
