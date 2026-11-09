// Island Untamed - arrow fired by the bow.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "IUArrowProjectile.generated.h"

class USphereComponent;
class UProjectileMovementComponent;

UCLASS()
class ISLANDUNTAMED_API AIUArrowProjectile : public AActor
{
	GENERATED_BODY()

public:
	AIUArrowProjectile();
	void Launch(const FVector& Direction, float SpeedCm, float InDamage);

private:
	UFUNCTION()
	void OnHit(UPrimitiveComponent* HitComp, AActor* OtherActor, UPrimitiveComponent* OtherComp, FVector NormalImpulse, const FHitResult& Hit);

	UPROPERTY() TObjectPtr<USphereComponent> Collision;
	UPROPERTY() TObjectPtr<UProjectileMovementComponent> Movement;
	float Damage = 20.0f;
	bool bHasHit = false;
};
