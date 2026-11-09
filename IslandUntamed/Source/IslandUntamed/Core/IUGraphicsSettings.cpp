#include "Core/IUGraphicsSettings.h"

#include "IslandUntamed.h"
#include "Engine/Engine.h"
#include "GameFramework/GameUserSettings.h"
#include "HAL/IConsoleManager.h"
#include "Misc/ConfigCacheIni.h"

namespace IUGraphicsLocal
{
	const TCHAR* Section = TEXT("IslandUntamed.Graphics");
}

void UIUGraphicsSettings::ApplyStartupSettings(const UObject* WorldContext)
{
	UGameUserSettings* S = GEngine ? GEngine->GetGameUserSettings() : nullptr;
	if (!S) { return; }
	bool bConfigured = false;
	if (GConfig) { GConfig->GetBool(IUGraphicsLocal::Section, TEXT("Configured"), bConfigured, GGameUserSettingsIni); }
	if (!bConfigured)
	{
		// First launch: let the engine measure CPU/GPU and pick scalability levels.
		S->RunHardwareBenchmark();
		S->ApplyHardwareBenchmarkResults();
		if (S->GetFrameRateLimit() <= 0.0f) { S->SetFrameRateLimit(60.0f); }
		S->ApplySettings(false);
		if (GConfig)
		{
			GConfig->SetBool(IUGraphicsLocal::Section, TEXT("Configured"), true, GGameUserSettingsIni);
			GConfig->Flush(false, GGameUserSettingsIni);
		}
		UE_LOG(LogIsland, Log, TEXT("Hardware benchmark applied: overall quality %d (%s)"), S->GetOverallScalabilityLevel(), *DescribeLighting());
	}
	else
	{
		S->ApplySettings(false);
	}
}

void UIUGraphicsSettings::SetQualityLevel(int32 Level)
{
	if (UGameUserSettings* S = GEngine ? GEngine->GetGameUserSettings() : nullptr)
	{
		S->SetOverallScalabilityLevel(FMath::Clamp(Level, 0, 4));
		S->ApplySettings(false);
	}
}

int32 UIUGraphicsSettings::GetQualityLevel()
{
	const UGameUserSettings* S = GEngine ? GEngine->GetGameUserSettings() : nullptr;
	return S ? S->GetOverallScalabilityLevel() : 2;
}

FString UIUGraphicsSettings::QualityName(int32 Level)
{
	switch (Level)
	{
	case 0: return TEXT("Baja");
	case 1: return TEXT("Media");
	case 2: return TEXT("Alta");
	case 3: return TEXT("Epica");
	case 4: return TEXT("Cinematica");
	default: return TEXT("Personalizada");
	}
}

void UIUGraphicsSettings::SetFullscreen(bool bFullscreen)
{
	if (UGameUserSettings* S = GEngine ? GEngine->GetGameUserSettings() : nullptr)
	{
		S->SetFullscreenMode(bFullscreen ? EWindowMode::WindowedFullscreen : EWindowMode::Windowed);
		S->ApplySettings(false);
	}
}

bool UIUGraphicsSettings::IsFullscreen()
{
	const UGameUserSettings* S = GEngine ? GEngine->GetGameUserSettings() : nullptr;
	return S && S->GetFullscreenMode() != EWindowMode::Windowed;
}

void UIUGraphicsSettings::SetFrameLimit(float Fps)
{
	if (UGameUserSettings* S = GEngine ? GEngine->GetGameUserSettings() : nullptr)
	{
		S->SetFrameRateLimit(Fps);
		S->ApplySettings(false);
	}
}

float UIUGraphicsSettings::GetFrameLimit()
{
	const UGameUserSettings* S = GEngine ? GEngine->GetGameUserSettings() : nullptr;
	return S ? S->GetFrameRateLimit() : 60.0f;
}

FString UIUGraphicsSettings::DescribeLighting()
{
	const IConsoleVariable* GI = IConsoleManager::Get().FindConsoleVariable(TEXT("r.DynamicGlobalIlluminationMethod"));
	const int32 Method = GI ? GI->GetInt() : 0;
	switch (Method)
	{
	case 1: return TEXT("Lumen");
	case 2: return TEXT("SSGI");
	default: return TEXT("Sin GI dinamica");
	}
}
