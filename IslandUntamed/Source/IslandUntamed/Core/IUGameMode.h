// Island Untamed - game mode: boots the world (island generation, streaming,
// environment, audio, wildlife) and owns the front-end flow:
// main menu -> new game (intro) / continue / load -> playing -> death.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "IUGameMode.generated.h"

class AIUIslandWorld;
class AIUEnvironment;
class AIUAudioDirector;
class AIUPopulationManager;
class AIUIntroDirector;
class ACameraActor;

UCLASS()
class ISLANDUNTAMED_API AIUGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AIUGameMode();
	virtual void StartPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	void StartNewGame();
	void LoadSlot(const FString& SlotName);
	void ReturnToMainMenu();
	void QuitGame();
	/** Message shown by the main menu when something failed (data errors, bad saves). */
	FString GetFrontEndError() const { return FrontEndError; }

private:
	void BootWorld();
	void ResetWorldForNewGame();
	void OnIntroFinished();
	void EnterPlaying();

	UPROPERTY() TObjectPtr<AIUIslandWorld> IslandWorld;
	UPROPERTY() TObjectPtr<AIUEnvironment> Environment;
	UPROPERTY() TObjectPtr<AIUAudioDirector> Audio;
	UPROPERTY() TObjectPtr<AIUPopulationManager> Population;
	UPROPERTY() TObjectPtr<AIUIntroDirector> Intro;
	UPROPERTY() TObjectPtr<ACameraActor> MenuCamera;
	float MenuOrbit = 0.0f;
	FString FrontEndError;
	bool bBooted = false;
};
