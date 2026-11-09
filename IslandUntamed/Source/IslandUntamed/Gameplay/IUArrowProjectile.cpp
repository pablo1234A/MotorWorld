#include "Gameplay/IUArrowProjectile.h"

#include "Core/IUAssets.h"
#include "Creatures/IUCreature.h"
#include "Creatures/IUVillage.h"
#include "Engine/CollisionProfile.h"
#include "Gameplay/IUWorldItem.h"
#include "World/IUVisuals.h"
#include "Components/SphereComponent.h"
#include "GameFramework/DamageType.h"
#include "GameFramework/ProjectileMovementComponent.h"
#include "Kismet/GameplayStatics.h"

AIUArrowProjectile::AIUArrowProjectile()
{
	PrimaryActorTick.bCanEverTick = false;
	Collision = CreateDefaultSubobject<USphereComponent>(TEXT("Collision"));
	Collision->InitSphereRadius(4.0f);
	Collision->SetCollisionProfileName(UCollisionProfile::BlockAllDynamic_ProfileName);
	Collision->SetNotifyRigidBodyCollision(true);
	RootComponent = Collision;
	Movement = CreateDefaultSubobject<UProjectileMovementComponent>(TEXT("Movement"));
	Movement->UpdatedComponent = Collision;
	Movement->bRotationFollowsVelocity = true;
	Movement->ProjectileGravityScale = 0.6f;
	InitialLifeSpan = 20.0f;
}

void AIUArrowProjectile::Launch(const FVector& Direction, float SpeedCm, float InDamage)
{
	Damage = InDamage;
	Collision->OnComponentHit.AddDynamic(this, &AIUArrowProjectile::OnHit);
	if (GetOwner()) { Collision->IgnoreActorWhenMoving(GetOwner(), true); }
	if (UIUAssets* Assets = UIUAssets::Get(this))
	{
		TArray<FIUShapePart> Parts = IUVisuals::ItemParts("arrow");
		Parts[0].Rotation = FRotator(0, 0, 0);
		Parts[0].Size = FVector(70, 1.6f, 1.6f);
		Parts[0].Shape = EIUShape::Cube;
		Assets->BuildParts(this, Collision, Parts, false);
	}
	Movement->Velocity = Direction.GetSafeNormal() * SpeedCm;
}

void AIUArrowProjectile::OnHit(UPrimitiveComponent* HitComp, AActor* OtherActor, UPrimitiveComponent* OtherComp, FVector NormalImpulse, const FHitResult& Hit)
{
	if (bHasHit || OtherActor == GetOwner()) { return; }
	bHasHit = true;
	if (OtherActor && (OtherActor->IsA<AIUCreature>() || OtherActor->IsA<AIUTribeTotem>()))
	{
		APawn* Shooter = Cast<APawn>(GetOwner());
		UGameplayStatics::ApplyDamage(OtherActor, Damage, Shooter ? Shooter->GetController() : nullptr, this, UDamageType::StaticClass());
	}
	else if (FMath::FRand() < 0.5f)
	{
		AIUWorldItem::SpawnItem(GetWorld(), Hit.ImpactPoint, "arrow", 1);
	}
	Destroy();
}
