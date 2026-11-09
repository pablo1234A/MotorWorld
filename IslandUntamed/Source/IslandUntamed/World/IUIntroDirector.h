// Island Untamed - opening sequence: night flight through a storm, cabin
// turbulence and failure, the crash, and waking up on the beach.
// Skippable ([Espacio]). Runs entirely with runtime actors (no Sequencer asset).
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "IUIntroDirector.generated.h"

class ACameraActor;
class AIUPropActor;
class UPointLightComponent;

DECLARE_MULTICAST_DELEGATE(FIUOnIntroFinished);

UCLASS()
class ISLANDUNTAMED_API AIUIntroDirector : public AActor
{
	GENERATED_BODY()

public:
	AIUIntroDirector();
	virtual void Tick(float DeltaSeconds) override;

	void StartIntro(const FVector& WakeLocation, float WakeYaw);
	void Skip();
	bool IsRunning() const { return bRunning; }
	/** Current subtitle for the HUD. */
	const FString& GetSubtitle() const { return Subtitle; }
	FIUOnIntroFinished OnFinished;

private:
	void BuildCabin();
	void Finish();

	UPROPERTY() TObjectPtr<ACameraActor> Camera;
	UPROPERTY() TObjectPtr<AIUPropActor> Cabin;
	UPROPERTY() TArray<TObjectPtr<UPointLightComponent>> CabinLights;
	FVector CabinOrigin = FVector::ZeroVector;
	FVector WakeLocation = FVector::ZeroVector;
	float WakeYaw = 0.0f;
	float Time = 0.0f;
	bool bRunning = false;
	bool bCrashed = false;
	bool bAlarmPlayed = false;
	FString Subtitle;
};
