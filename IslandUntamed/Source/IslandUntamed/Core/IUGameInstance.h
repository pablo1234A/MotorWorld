// Island Untamed - game instance: owns the immutable game database (loaded
// from Content/Data/*.json) and the player's non-graphics settings.
#pragma once

#include "CoreMinimal.h"
#include "Engine/GameInstance.h"
#include "Sim/SimGameData.h"
#include "IUGameInstance.generated.h"

UCLASS()
class ISLANDUNTAMED_API UIUGameInstance : public UGameInstance
{
	GENERATED_BODY()

public:
	UIUGameInstance();
	virtual void Init() override;

	static UIUGameInstance* Get(const UObject* WorldContext);
	/** Shortcut used everywhere in gameplay code. Valid after Init(). */
	static const IUSim::GameDatabase* Db(const UObject* WorldContext);

	const IUSim::GameDatabase& GetDatabase() const { return *Database; }
	bool IsDataValid() const { return Database && Database->IsLoaded(); }
	const FString& GetDataError() const { return DataError; }

	/** Reloads every data file (used by the "iu.ReloadData" console command during development). */
	bool ReloadData();

	// ---- Player settings (graphics settings live in UGameUserSettings).
	UPROPERTY() float MouseSensitivity = 1.0f;
	UPROPERTY() bool bInvertY = false;
	UPROPERTY() float FieldOfView = 90.0f;
	UPROPERTY() float MasterVolume = 1.0f;
	UPROPERTY() float MusicVolume = 0.6f;
	UPROPERTY() bool bShowTutorialHints = true;

	void LoadSettings();
	void SaveSettings() const;

	/** Front-end request carried into gameplay: start a new game or load a slot. */
	UPROPERTY() FString PendingLoadSlot;

private:
	TUniquePtr<IUSim::GameDatabase> Database;
	FString DataError;
};
