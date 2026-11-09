// Island Untamed - save/load orchestration.
//
// Saved: player (transform, survival, inventory, equipment, hotbar), clock &
// weather, world persistence (harvested nodes, discoveries, fog, unlocks,
// read documents), generated containers, every placed structure (with
// storage, fire, farm and door state), dropped items, quests and tribes.
// Not saved by design: wildlife and village residents (re-simulated from the
// faction state), which keeps saves small and robust.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "IUSaveSubsystem.generated.h"

struct FIUSaveSlotInfo
{
	FString SlotName;
	bool bExists = false;
	FString Label;
	FDateTime Timestamp;
	int32 Day = 0;
	float Hour = 0.0f;
	float PlaySeconds = 0.0f;
	FString LocationName;
};

UCLASS()
class ISLANDUNTAMED_API UIUSaveSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	static UIUSaveSubsystem* Get(const UObject* WorldContext);

	static const TArray<FString>& SlotNames();
	static FString AutoSlot() { return TEXT("IU_Auto"); }

	bool SaveGame(const FString& SlotName, FString& OutError);
	bool LoadGame(const FString& SlotName, FString& OutError);
	bool DoesSaveExist(const FString& SlotName) const;
	FIUSaveSlotInfo GetSlotInfo(const FString& SlotName) const;
	bool DeleteSlot(const FString& SlotName);
	/** Most recent existing slot (for "Continue"). Empty if none. */
	FString GetMostRecentSlot() const;

	/** Serializes / applies the whole world state (also used by automated tests). */
	FString CaptureState(UWorld* World) const;
	bool ApplyState(UWorld* World, const FString& Json, FString& OutError);
};
