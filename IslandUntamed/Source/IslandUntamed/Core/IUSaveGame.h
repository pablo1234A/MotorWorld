// Island Untamed - save game container. The full game state is a versioned
// JSON payload produced by the gameplay systems (see UIUSaveSubsystem).
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "IUSaveGame.generated.h"

UCLASS()
class ISLANDUNTAMED_API UIUSaveGame : public USaveGame
{
	GENERATED_BODY()

public:
	static constexpr int32 CurrentVersion = 1;

	UPROPERTY() int32 Version = CurrentVersion;
	UPROPERTY() FString SlotLabel;
	UPROPERTY() FDateTime Timestamp;
	UPROPERTY() int32 Day = 0;
	UPROPERTY() float Hour = 0.0f;
	UPROPERTY() float PlaySeconds = 0.0f;
	UPROPERTY() FString LocationName;
	UPROPERTY() FString Payload;
};
