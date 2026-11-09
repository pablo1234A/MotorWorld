// Island Untamed - shared engine-side helpers: unit conversion between the
// Sim layer (meters, std::string) and Unreal (centimeters, FString/FName).
#pragma once

#include "CoreMinimal.h"
#include "Sim/SimCore.h"

#include <string>

/** Custom trace channel declared in DefaultEngine.ini ("IUInteract"). */
#define IU_TRACE_INTERACT ECC_GameTraceChannel1

namespace IU
{
	/** Sim meters -> Unreal centimeters. */
	constexpr float MetersToCm = 100.0f;
	constexpr float CmToMeters = 0.01f;

	/** Caves are pocket spaces built far below the island (no streaming conflicts). */
	constexpr double CavePocketZ = -250000.0;
	inline bool IsUnderground(const FVector& L) { return L.Z < -100000.0; }

	inline FVector ToVector(const IUSim::Vec3& V) { return FVector(V.X * MetersToCm, V.Y * MetersToCm, V.Z * MetersToCm); }
	inline IUSim::Vec3 ToSim(const FVector& V)
	{
		return IUSim::Vec3(static_cast<float>(V.X) * CmToMeters, static_cast<float>(V.Y) * CmToMeters, static_cast<float>(V.Z) * CmToMeters);
	}

	inline FString ToFString(const std::string& S) { return FString(UTF8_TO_TCHAR(S.c_str())); }
	inline FText ToText(const std::string& S) { return FText::FromString(ToFString(S)); }
	inline std::string ToStd(const FString& S) { return std::string(TCHAR_TO_UTF8(*S)); }
	inline std::string ToStd(const FName& N) { return ToStd(N.ToString()); }

	/** Parses "#rrggbb" into a linear color (sRGB aware). */
	inline FLinearColor HexColor(const std::string& Hex, const FLinearColor& Fallback = FLinearColor::Gray)
	{
		if (Hex.size() != 7 || Hex[0] != '#') { return Fallback; }
		return FLinearColor(FColor::FromHex(ToFString(Hex.substr(1))));
	}

	/** Accent palette shared by the HUD and world markers. */
	namespace Palette
	{
		const FLinearColor PanelBg(0.012f, 0.016f, 0.014f, 0.82f);
		const FLinearColor PanelLight(0.05f, 0.06f, 0.055f, 0.85f);
		const FLinearColor Accent(0.96f, 0.62f, 0.18f, 1.0f);   // ember orange
		const FLinearColor AccentDim(0.55f, 0.33f, 0.08f, 1.0f);
		const FLinearColor TextMain(0.93f, 0.91f, 0.86f, 1.0f);
		const FLinearColor TextDim(0.62f, 0.62f, 0.58f, 1.0f);
		const FLinearColor Good(0.45f, 0.82f, 0.38f, 1.0f);
		const FLinearColor Bad(0.92f, 0.28f, 0.22f, 1.0f);
		const FLinearColor Water(0.32f, 0.62f, 0.95f, 1.0f);
	}
}
