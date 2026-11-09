#include "Core/IUGameInstance.h"

#include "IslandUntamed.h"
#include "Core/IUTypes.h"
#include "Engine/Engine.h"
#include "HAL/IConsoleManager.h"
#include "Misc/ConfigCacheIni.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

namespace IUGameInstanceLocal
{
	const TCHAR* SettingsSection = TEXT("IslandUntamed.Player");
}

UIUGameInstance::UIUGameInstance()
	: Database(MakeUnique<IUSim::GameDatabase>())
{
}

UIUGameInstance* UIUGameInstance::Get(const UObject* WorldContext)
{
	const UWorld* World = (WorldContext && GEngine) ? GEngine->GetWorldFromContextObject(WorldContext, EGetWorldErrorMode::ReturnNull) : nullptr;
	return World ? Cast<UIUGameInstance>(World->GetGameInstance()) : nullptr;
}

const IUSim::GameDatabase* UIUGameInstance::Db(const UObject* WorldContext)
{
	const UIUGameInstance* GI = Get(WorldContext);
	return (GI && GI->IsDataValid()) ? &GI->GetDatabase() : nullptr;
}

void UIUGameInstance::Init()
{
	Super::Init();
	LoadSettings();
	ReloadData();

	static FAutoConsoleCommandWithWorld ReloadCmd(
		TEXT("iu.ReloadData"),
		TEXT("Reloads Content/Data/*.json"),
		FConsoleCommandWithWorldDelegate::CreateLambda([](UWorld* World)
		{
			if (UIUGameInstance* GI = UIUGameInstance::Get(World)) { GI->ReloadData(); }
		}));
}

bool UIUGameInstance::ReloadData()
{
	const FString DataDir = FPaths::ProjectContentDir() / TEXT("Data");
	const IUSim::FileReader Reader = [DataDir](const std::string& FileName, std::string& OutText)
	{
		FString Text;
		if (!FFileHelper::LoadFileToString(Text, *(DataDir / IU::ToFString(FileName))))
		{
			return false;
		}
		OutText = IU::ToStd(Text);
		return true;
	};
	std::string Error;
	TUniquePtr<IUSim::GameDatabase> Fresh = MakeUnique<IUSim::GameDatabase>();
	if (!Fresh->LoadAll(Reader, Error))
	{
		DataError = IU::ToFString(Error);
		UE_LOG(LogIsland, Error, TEXT("Game data failed to load: %s"), *DataError);
		return false;
	}
	Database = MoveTemp(Fresh);
	DataError.Reset();
	UE_LOG(LogIsland, Log, TEXT("Game data loaded: %d items, %d recipes, %d buildings, %d animals, %d resource nodes"),
		static_cast<int32>(Database->Items.All().size()), static_cast<int32>(Database->Recipes.All().size()),
		static_cast<int32>(Database->Buildings.All().size()), static_cast<int32>(Database->Animals.All().size()),
		static_cast<int32>(Database->Nodes.All().size()));
	return true;
}

void UIUGameInstance::LoadSettings()
{
	using namespace IUGameInstanceLocal;
	if (!GConfig) { return; }
	GConfig->GetFloat(SettingsSection, TEXT("MouseSensitivity"), MouseSensitivity, GGameUserSettingsIni);
	GConfig->GetBool(SettingsSection, TEXT("InvertY"), bInvertY, GGameUserSettingsIni);
	GConfig->GetFloat(SettingsSection, TEXT("FieldOfView"), FieldOfView, GGameUserSettingsIni);
	GConfig->GetFloat(SettingsSection, TEXT("MasterVolume"), MasterVolume, GGameUserSettingsIni);
	GConfig->GetFloat(SettingsSection, TEXT("MusicVolume"), MusicVolume, GGameUserSettingsIni);
	GConfig->GetBool(SettingsSection, TEXT("TutorialHints"), bShowTutorialHints, GGameUserSettingsIni);
	MouseSensitivity = FMath::Clamp(MouseSensitivity, 0.1f, 4.0f);
	FieldOfView = FMath::Clamp(FieldOfView, 70.0f, 110.0f);
	MasterVolume = FMath::Clamp(MasterVolume, 0.0f, 1.0f);
	MusicVolume = FMath::Clamp(MusicVolume, 0.0f, 1.0f);
}

void UIUGameInstance::SaveSettings() const
{
	using namespace IUGameInstanceLocal;
	if (!GConfig) { return; }
	GConfig->SetFloat(SettingsSection, TEXT("MouseSensitivity"), MouseSensitivity, GGameUserSettingsIni);
	GConfig->SetBool(SettingsSection, TEXT("InvertY"), bInvertY, GGameUserSettingsIni);
	GConfig->SetFloat(SettingsSection, TEXT("FieldOfView"), FieldOfView, GGameUserSettingsIni);
	GConfig->SetFloat(SettingsSection, TEXT("MasterVolume"), MasterVolume, GGameUserSettingsIni);
	GConfig->SetFloat(SettingsSection, TEXT("MusicVolume"), MusicVolume, GGameUserSettingsIni);
	GConfig->SetBool(SettingsSection, TEXT("TutorialHints"), bShowTutorialHints, GGameUserSettingsIni);
	GConfig->Flush(false, GGameUserSettingsIni);
}
