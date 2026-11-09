// Island Untamed - HUD screens: menus, settings, saves, map, journal, documents, dialogue, death.
#include "UI/IUHUD.h"

#include "Core/IUGameInstance.h"
#include "Core/IUGameMode.h"
#include "Core/IUGraphicsSettings.h"
#include "Core/IUSaveSubsystem.h"
#include "Core/IUTypes.h"
#include "Creatures/IUTribeNPC.h"
#include "Creatures/IUVillage.h"
#include "Camera/CameraComponent.h"
#include "Gameplay/IUStructure.h"
#include "Player/IUCharacter.h"
#include "Player/IUInventoryComponent.h"
#include "Player/IUSurvivalComponent.h"
#include "World/IUStorySubsystem.h"
#include "World/IUWorldSubsystem.h"
#include "Engine/Canvas.h"
#include "Engine/Texture2D.h"
#include "Kismet/GameplayStatics.h"

namespace IUC = IU::Palette;

namespace IUHudMenusLocal
{
	constexpr int32 MapResolution = 512;

	AIUGameMode* GM(const UObject* Ctx) { return Cast<AIUGameMode>(UGameplayStatics::GetGameMode(Ctx)); }

	FString FormatPlaytime(float Seconds)
	{
		const int32 Total = static_cast<int32>(Seconds);
		return FString::Printf(TEXT("%dh %02dm"), Total / 3600, (Total / 60) % 60);
	}
}

// ================================================================================================
// Main menu / pause / death
// ================================================================================================

void AIUHUD::DrawMainMenu()
{
	using namespace IUHudMenusLocal;
	DrawRect(FLinearColor(0, 0, 0, 0.35f), 0, 0, Canvas->ClipX, Canvas->ClipY);
	DrawRect(FLinearColor(0, 0, 0, 0.55f), 0, 0, 560.0f * S(), Canvas->ClipY);
	Text(TEXT("ISLAND"), 70.0f * S(), 120.0f * S(), IUC::TextMain, 4.4f);
	Text(TEXT("UNTAMED"), 70.0f * S(), 200.0f * S(), IUC::Accent, 4.4f);
	Text(TEXT("Sobrevive. Construye. Descubre lo que esconde la isla."), 72.0f * S(), 290.0f * S(), IUC::TextDim, 1.0f);

	const UIUSaveSubsystem* Save = UIUSaveSubsystem::Get(this);
	const FString Recent = Save ? Save->GetMostRecentSlot() : FString();
	const float X = 70.0f * S();
	float Y = 380.0f * S();
	const float W = 380.0f * S();
	const float H = 52.0f * S();
	const float Gap = 14.0f * S();
	if (!Recent.IsEmpty())
	{
		const FIUSaveSlotInfo Info = Save->GetSlotInfo(Recent);
		Button(TEXT("CONTINUAR"), X, Y, W, H, [this, Recent]() { if (AIUGameMode* G = GM(this)) { G->LoadSlot(Recent); } });
		Text(FString::Printf(TEXT("%s · Dia %d · %s"), *Info.Label, Info.Day + 1, *Info.LocationName), X + 4.0f * S(), Y + H + 2.0f * S(), IUC::TextDim, 0.8f);
		Y += H + Gap + 18.0f * S();
	}
	Button(TEXT("NUEVA PARTIDA"), X, Y, W, H, [this]() { if (AIUGameMode* G = GM(this)) { G->StartNewGame(); } });
	Y += H + Gap;
	Button(TEXT("CARGAR PARTIDA"), X, Y, W, H, [this]() { if (AIUPlayerController* P = PC()) { P->bSaveMode = false; P->OpenScreen(EIUScreen::SaveLoad); } });
	Y += H + Gap;
	Button(TEXT("AJUSTES"), X, Y, W, H, [this]() { if (AIUPlayerController* P = PC()) { P->OpenScreen(EIUScreen::Settings); } });
	Y += H + Gap;
	Button(TEXT("SALIR"), X, Y, W, H, [this]() { if (AIUGameMode* G = GM(this)) { G->QuitGame(); } });

	if (const AIUGameMode* G = GM(this))
	{
		if (!G->GetFrontEndError().IsEmpty()) { WrappedText(G->GetFrontEndError(), X, Canvas->ClipY - 140.0f * S(), W, IUC::Bad, 0.9f); }
	}
	Text(TEXT("v0.1  ·  Prototipo jugable  ·  Unreal Engine 5"), X, Canvas->ClipY - 40.0f * S(), IUC::TextDim, 0.8f);
}

void AIUHUD::DrawPause()
{
	using namespace IUHudMenusLocal;
	DrawRect(FLinearColor(0, 0, 0, 0.6f), 0, 0, Canvas->ClipX, Canvas->ClipY);
	const float W = 380.0f * S();
	const float X = Canvas->ClipX * 0.5f - W * 0.5f;
	float Y = Canvas->ClipY * 0.28f;
	Text(TEXT("PAUSA"), Canvas->ClipX * 0.5f, Y - 90.0f * S(), IUC::TextMain, 3.2f, true);
	const float H = 50.0f * S();
	const float Gap = 12.0f * S();
	Button(TEXT("Reanudar"), X, Y, W, H, [this]() { if (AIUPlayerController* P = PC()) { P->CloseScreen(); } }); Y += H + Gap;
	Button(TEXT("Guardar partida"), X, Y, W, H, [this]() { if (AIUPlayerController* P = PC()) { P->bSaveMode = true; P->OpenScreen(EIUScreen::SaveLoad); } }); Y += H + Gap;
	Button(TEXT("Cargar partida"), X, Y, W, H, [this]() { if (AIUPlayerController* P = PC()) { P->bSaveMode = false; P->OpenScreen(EIUScreen::SaveLoad); } }); Y += H + Gap;
	Button(TEXT("Ajustes"), X, Y, W, H, [this]() { if (AIUPlayerController* P = PC()) { P->OpenScreen(EIUScreen::Settings); } }); Y += H + Gap;
	Button(TEXT("Menu principal"), X, Y, W, H, [this]() { if (AIUGameMode* G = GM(this)) { G->ReturnToMainMenu(); } }); Y += H + Gap;
	Button(TEXT("Salir del juego"), X, Y, W, H, [this]() { if (AIUGameMode* G = GM(this)) { G->QuitGame(); } });
}

void AIUHUD::DrawDeath()
{
	using namespace IUHudMenusLocal;
	const AIUCharacter* C = Player();
	const UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	DrawRect(FLinearColor(0.08f, 0.0f, 0.0f, 0.55f), 0, 0, Canvas->ClipX, Canvas->ClipY);
	Text(TEXT("HAS MUERTO"), Canvas->ClipX * 0.5f, Canvas->ClipY * 0.25f, IUC::Bad, 4.0f, true);
	FString Cause = TEXT("La isla no perdona.");
	if (C && C->GetSurvival())
	{
		const IUSim::SurvivalState& St = C->GetSurvival()->Model().State;
		if (St.Hydration <= 0.0f) { Cause = TEXT("Deshidratacion. El agua es lo primero."); }
		else if (St.Satiety <= 0.0f) { Cause = TEXT("Inanicion."); }
		else if (St.BodyTempC < 35.0f) { Cause = TEXT("Hipotermia. La lluvia y el viento matan de noche."); }
		else if (St.BodyTempC > 39.0f) { Cause = TEXT("Golpe de calor."); }
		else if (St.Poison > 20.0f) { Cause = TEXT("Envenenamiento."); }
		else if (St.Infection > 40.0f) { Cause = TEXT("Infeccion."); }
		else if (St.Bleeding > 0.0f) { Cause = TEXT("Te desangraste."); }
		else { Cause = TEXT("Muerte violenta."); }
	}
	Text(Cause, Canvas->ClipX * 0.5f, Canvas->ClipY * 0.25f + 90.0f * S(), IUC::TextMain, 1.3f, true);
	if (WS) { Text(FString::Printf(TEXT("Sobreviviste %d dias"), WS->GetClock().GetDay() + 1), Canvas->ClipX * 0.5f, Canvas->ClipY * 0.25f + 130.0f * S(), IUC::TextDim, 1.0f, true); }
	const float W = 380.0f * S();
	const float X = Canvas->ClipX * 0.5f - W * 0.5f;
	float Y = Canvas->ClipY * 0.5f;
	const UIUSaveSubsystem* Save = UIUSaveSubsystem::Get(this);
	const FString Recent = Save ? Save->GetMostRecentSlot() : FString();
	Button(TEXT("Cargar ultima partida"), X, Y, W, 50.0f * S(), [this, Recent]() { if (AIUGameMode* G = GM(this)) { G->LoadSlot(Recent); } }, !Recent.IsEmpty());
	Y += 62.0f * S();
	Button(TEXT("Nueva partida"), X, Y, W, 50.0f * S(), [this]() { if (AIUGameMode* G = GM(this)) { G->StartNewGame(); } });
	Y += 62.0f * S();
	Button(TEXT("Menu principal"), X, Y, W, 50.0f * S(), [this]() { if (AIUGameMode* G = GM(this)) { G->ReturnToMainMenu(); } });
}

// ================================================================================================
// Settings & saves
// ================================================================================================

void AIUHUD::DrawSettings()
{
	UIUGameInstance* GI = UIUGameInstance::Get(this);
	if (!GI) { return; }
	DrawRect(FLinearColor(0, 0, 0, 0.7f), 0, 0, Canvas->ClipX, Canvas->ClipY);
	ScreenTitle(TEXT("AJUSTES"), FString::Printf(TEXT("Iluminacion activa: %s  ·  [Esc] volver"), *UIUGraphicsSettings::DescribeLighting()));
	const float X = 60.0f * S();
	float Y = 160.0f * S();
	const float RowH = 52.0f * S();
	const float LabelW = 300.0f * S();
	const float BW = 140.0f * S();
	const float BH = 38.0f * S();

	Text(TEXT("Calidad grafica"), X, Y + 8.0f * S(), IUC::TextMain, 1.1f);
	const int32 Quality = UIUGraphicsSettings::GetQualityLevel();
	for (int32 Q = 0; Q < 4; ++Q)
	{
		Button(UIUGraphicsSettings::QualityName(Q), X + LabelW + Q * (BW + 8.0f * S()), Y, BW, BH, [Q]() { UIUGraphicsSettings::SetQualityLevel(Q); }, true, Quality == Q);
	}
	Y += RowH;
	Text(TEXT("Pantalla completa"), X, Y + 8.0f * S(), IUC::TextMain, 1.1f);
	const bool bFull = UIUGraphicsSettings::IsFullscreen();
	Button(bFull ? TEXT("Si") : TEXT("No"), X + LabelW, Y, BW, BH, [bFull]() { UIUGraphicsSettings::SetFullscreen(!bFull); });
	Y += RowH;
	Text(TEXT("Limite de FPS"), X, Y + 8.0f * S(), IUC::TextMain, 1.1f);
	const float Limits[4] = { 30.0f, 60.0f, 120.0f, 0.0f };
	for (int32 I = 0; I < 4; ++I)
	{
		const float L = Limits[I];
		Button(L > 0.0f ? FString::Printf(TEXT("%.0f"), L) : FString(TEXT("Sin limite")), X + LabelW + I * (BW + 8.0f * S()), Y, BW, BH, [L]() { UIUGraphicsSettings::SetFrameLimit(L); }, true, FMath::IsNearlyEqual(UIUGraphicsSettings::GetFrameLimit(), L));
	}
	Y += RowH;
	const auto Stepper = [this, X, LabelW, BW, BH, &Y, RowH, GI](const TCHAR* Label, float* Value, float Step, float Min, float Max, const TCHAR* Format)
	{
		Text(Label, X, Y + 8.0f * S(), IUC::TextMain, 1.1f);
		Button(TEXT("-"), X + LabelW, Y, 50.0f * S(), BH, [Value, Step, Min, GI]() { *Value = FMath::Max(Min, *Value - Step); GI->SaveSettings(); });
		Text(FString::Printf(Format, *Value), X + LabelW + 50.0f * S() + BW * 0.5f, Y + 8.0f * S(), IUC::Accent, 1.1f, true);
		Button(TEXT("+"), X + LabelW + 50.0f * S() + BW, Y, 50.0f * S(), BH, [Value, Step, Max, GI]() { *Value = FMath::Min(Max, *Value + Step); GI->SaveSettings(); });
		Y += RowH;
	};
	Stepper(TEXT("Sensibilidad del raton"), &GI->MouseSensitivity, 0.1f, 0.1f, 4.0f, TEXT("%.1f"));
	Stepper(TEXT("Campo de vision"), &GI->FieldOfView, 5.0f, 70.0f, 110.0f, TEXT("%.0f"));
	Stepper(TEXT("Volumen general"), &GI->MasterVolume, 0.1f, 0.0f, 1.0f, TEXT("%.1f"));
	Stepper(TEXT("Volumen de musica"), &GI->MusicVolume, 0.1f, 0.0f, 1.0f, TEXT("%.1f"));
	Text(TEXT("Invertir eje Y"), X, Y + 8.0f * S(), IUC::TextMain, 1.1f);
	Button(GI->bInvertY ? TEXT("Si") : TEXT("No"), X + LabelW, Y, BW, BH, [GI]() { GI->bInvertY = !GI->bInvertY; GI->SaveSettings(); });
	Y += RowH;
	Text(TEXT("Pistas de tutorial"), X, Y + 8.0f * S(), IUC::TextMain, 1.1f);
	Button(GI->bShowTutorialHints ? TEXT("Si") : TEXT("No"), X + LabelW, Y, BW, BH, [GI]() { GI->bShowTutorialHints = !GI->bShowTutorialHints; GI->SaveSettings(); });
	Y += RowH * 1.4f;
	Button(TEXT("Volver"), X, Y, 220.0f * S(), 44.0f * S(), [this]() { if (AIUPlayerController* P = PC()) { P->CloseScreen(); } });
	// Apply field of view immediately.
	if (AIUCharacter* C = Player()) { if (C->GetCamera()) { C->GetCamera()->SetFieldOfView(GI->FieldOfView); } }

	// Controls reference.
	const float CX = X + LabelW + 4.0f * (BW + 8.0f * S()) + 40.0f * S();
	if (CX < Canvas->ClipX - 300.0f * S())
	{
		Text(TEXT("CONTROLES"), CX, 160.0f * S(), IUC::TextDim, 1.0f);
		const TCHAR* Controls[] = {
			TEXT("WASD  mover   ·   Shift  correr   ·   Espacio  saltar/nadar"), TEXT("Ctrl  agacharse   ·   Alt  esquivar"),
			TEXT("Clic  atacar / recolectar / usar   ·   Clic dcho  bloquear"), TEXT("E  interactuar   ·   F  accion secundaria"),
			TEXT("1-8 / rueda  barra rapida   ·   G  soltar"), TEXT("Tab  inventario   ·   C  fabricar   ·   B  construir"),
			TEXT("M  mapa   ·   J  diario   ·   Esc  pausa"), TEXT("R  rotar pieza   ·   X  desmontar"), TEXT("F5  guardado rapido   ·   F9  cargar ultima"),
		};
		float CY = 190.0f * S();
		for (const TCHAR* L : Controls) { Text(L, CX, CY, IUC::TextMain, 0.85f); CY += 22.0f * S(); }
	}
}

void AIUHUD::DrawSaveLoad()
{
	using namespace IUHudMenusLocal;
	AIUPlayerController* Controller = PC();
	UIUSaveSubsystem* Save = UIUSaveSubsystem::Get(this);
	if (!Controller || !Save) { return; }
	const bool bSaving = Controller->bSaveMode;
	DrawRect(FLinearColor(0, 0, 0, 0.7f), 0, 0, Canvas->ClipX, Canvas->ClipY);
	ScreenTitle(bSaving ? TEXT("GUARDAR PARTIDA") : TEXT("CARGAR PARTIDA"), TEXT("[Esc] volver"));
	const float X = 60.0f * S();
	float Y = 160.0f * S();
	const float W = 760.0f * S();
	const float H = 84.0f * S();
	for (const FString& Slot : UIUSaveSubsystem::SlotNames())
	{
		const bool bAuto = Slot == UIUSaveSubsystem::AutoSlot();
		const FIUSaveSlotInfo Info = Save->GetSlotInfo(Slot);
		const bool bEnabled = bSaving ? !bAuto : Info.bExists;
		const bool bHover = bEnabled && IsHovered(X, Y, W, H);
		DrawRect(FLinearColor(0, 0, 0, bHover ? 0.75f : 0.5f), X, Y, W, H);
		DrawRect(bHover ? IUC::Accent : FLinearColor(1, 1, 1, 0.1f), X, Y + H - 2.0f, W, 2.0f);
		Text(bAuto ? TEXT("Autoguardado") : Slot.Replace(TEXT("IU_Slot"), TEXT("Ranura ")), X + 16.0f * S(), Y + 10.0f * S(), bEnabled ? IUC::TextMain : IUC::TextDim, 1.3f);
		if (Info.bExists)
		{
			Text(FString::Printf(TEXT("Dia %d · %02d:00 · %s · Jugado %s · %s"), Info.Day + 1, static_cast<int32>(Info.Hour), *Info.LocationName, *FormatPlaytime(Info.PlaySeconds), *Info.Timestamp.ToString(TEXT("%d/%m/%Y %H:%M"))),
				X + 16.0f * S(), Y + 48.0f * S(), IUC::TextDim, 0.9f);
		}
		else
		{
			Text(TEXT("Vacia"), X + 16.0f * S(), Y + 48.0f * S(), IUC::TextDim, 0.9f);
		}
		if (bEnabled)
		{
			AddHit(FBox2D(FVector2D(X, Y), FVector2D(X + W, Y + H)), [this, Slot, bSaving]()
			{
				UIUSaveSubsystem* SaveSys = UIUSaveSubsystem::Get(this);
				if (!SaveSys) { return; }
				if (bSaving)
				{
					FString Error;
					SaveMessage = SaveSys->SaveGame(Slot, Error) ? TEXT("Partida guardada") : Error;
				}
				else if (AIUGameMode* G = GM(this))
				{
					G->LoadSlot(Slot);
				}
			});
		}
		if (Info.bExists && !bAuto)
		{
			Button(TEXT("Borrar"), X + W + 12.0f * S(), Y + 22.0f * S(), 110.0f * S(), 40.0f * S(), [this, Slot]() { if (UIUSaveSubsystem* SaveSys = UIUSaveSubsystem::Get(this)) { SaveSys->DeleteSlot(Slot); } });
		}
		Y += H + 12.0f * S();
	}
	if (!SaveMessage.IsEmpty()) { Text(SaveMessage, X, Y + 10.0f * S(), IUC::Good, 1.1f); }
}

// ================================================================================================
// Map
// ================================================================================================

void AIUHUD::RebuildMapTexture()
{
	using namespace IUHudMenusLocal;
	const UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!WS || !WS->GetIsland()) { return; }
	const int32 Res = MapResolution;
	std::vector<uint8_t> Pixels = WS->GetIsland()->BuildMapImage(Res);
	// Fog of war: unexplored areas are drawn as aged paper.
	const IUSim::WorldPersistence& P = WS->GetPersistence();
	const int32 FogRes = P.GetFogRes();
	for (int32 Y = 0; Y < Res; ++Y)
	{
		for (int32 X = 0; X < Res; ++X)
		{
			const int32 FX = X * FogRes / Res;
			const int32 FY = Y * FogRes / Res;
			if (P.IsFogRevealed(FX, FY)) { continue; }
			const size_t I = (static_cast<size_t>(Y) * Res + X) * 4;
			const uint8 Gray = static_cast<uint8>((Pixels[I] + Pixels[I + 1] + Pixels[I + 2]) / 3);
			Pixels[I] = static_cast<uint8>(Gray * 0.25f + 70.0f * 0.75f);
			Pixels[I + 1] = static_cast<uint8>(Gray * 0.25f + 62.0f * 0.75f);
			Pixels[I + 2] = static_cast<uint8>(Gray * 0.25f + 50.0f * 0.75f);
		}
	}
	if (!MapTexture)
	{
		MapTexture = UTexture2D::CreateTransient(Res, Res, PF_B8G8R8A8);
		MapTexture->SRGB = true;
		MapTexture->Filter = TF_Bilinear;
	}
	FTexture2DMipMap& Mip = MapTexture->GetPlatformData()->Mips[0];
	uint8* Dest = static_cast<uint8*>(Mip.BulkData.Lock(LOCK_READ_WRITE));
	for (int32 I = 0; I < Res * Res; ++I)
	{
		// RGBA -> BGRA
		Dest[I * 4 + 0] = Pixels[static_cast<size_t>(I) * 4 + 2];
		Dest[I * 4 + 1] = Pixels[static_cast<size_t>(I) * 4 + 1];
		Dest[I * 4 + 2] = Pixels[static_cast<size_t>(I) * 4 + 0];
		Dest[I * 4 + 3] = 255;
	}
	Mip.BulkData.Unlock();
	MapTexture->UpdateResource();
	MapFogRevision = WS->GetFogRevision();
}

void AIUHUD::DrawMapScreen()
{
	const UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	const AIUCharacter* C = Player();
	if (!WS || !C || !WS->GetIsland()) { return; }
	if (!MapTexture || MapFogRevision != WS->GetFogRevision()) { RebuildMapTexture(); }
	DrawRect(FLinearColor(0.02f, 0.02f, 0.02f, 0.92f), 0, 0, Canvas->ClipX, Canvas->ClipY);
	const float Size = FMath::Min(Canvas->ClipY - 120.0f * S(), Canvas->ClipX - 520.0f * S());
	const float MX = 60.0f * S();
	const float MY = 70.0f * S();
	if (MapTexture) { DrawTexture(MapTexture, MX, MY, Size, Size, 0, 0, 1, 1); }
	Panel(MX - 2.0f, MY - 2.0f, Size + 4.0f, 4.0f, IUC::Accent, false);
	Text(TEXT("N"), MX + Size * 0.5f, MY - 34.0f * S(), IUC::Accent, 1.4f, true);

	const auto ToScreen = [WS, MX, MY, Size](const FVector& World)
	{
		const FVector2D UV = WS->WorldToMap(World);
		return FVector2D(MX + UV.X * Size, MY + UV.Y * Size);
	};
	// Discovered places.
	FString HoverName;
	for (const IUSim::PointOfInterest& P : WS->GetIsland()->GetPOIs())
	{
		if (!WS->GetPersistence().IsDiscovered(P.Id)) { continue; }
		const FVector2D Pos = ToScreen(IU::ToVector(P.Position));
		FLinearColor Col = IUC::TextMain;
		switch (P.Type)
		{
		case IUSim::EPOIType::Village: Col = IUC::Bad; break;
		case IUSim::EPOIType::Cave: Col = FLinearColor(0.1f, 0.1f, 0.1f); break;
		case IUSim::EPOIType::Ruins: Col = IUC::Accent; break;
		case IUSim::EPOIType::Waterfall: case IUSim::EPOIType::Lake: Col = IUC::Water; break;
		case IUSim::EPOIType::Secret: Col = FLinearColor(0.6f, 0.3f, 1.0f); break;
		default: break;
		}
		const float R = 6.0f * S();
		DrawRect(FLinearColor::Black, Pos.X - R - 1.0f, Pos.Y - R - 1.0f, R * 2.0f + 2.0f, R * 2.0f + 2.0f);
		DrawRect(Col, Pos.X - R, Pos.Y - R, R * 2.0f, R * 2.0f);
		if (FVector2D::Distance(Pos, Mouse) < 14.0f * S()) { HoverName = IU::ToFString(P.Name); }
		else { Text(IU::ToFString(P.Name), Pos.X + 10.0f * S(), Pos.Y - 9.0f * S(), FLinearColor(1, 1, 1, 0.85f), 0.75f); }
	}
	// Player structures (camp).
	for (const TWeakObjectPtr<AIUStructure>& St : WS->GetStructures())
	{
		if (!St.IsValid() || IU::IsUnderground(St->GetActorLocation())) { continue; }
		const FVector2D Pos = ToScreen(St->GetActorLocation());
		DrawRect(IUC::Good, Pos.X - 2.0f, Pos.Y - 2.0f, 4.0f, 4.0f);
	}
	// Player arrow.
	if (!IU::IsUnderground(C->GetActorLocation()))
	{
		const FVector2D P = ToScreen(C->GetActorLocation());
		const float Yaw = FMath::DegreesToRadians(C->GetControlRotation().Yaw);
		// Map Y grows southwards, world +Y is north.
		const FVector2D Dir(FMath::Cos(Yaw), -FMath::Sin(Yaw));
		const FVector2D Side(-Dir.Y, Dir.X);
		const float L = 14.0f * S();
		DrawLine(P.X + Dir.X * L, P.Y + Dir.Y * L, P.X - Dir.X * L * 0.6f + Side.X * L * 0.6f, P.Y - Dir.Y * L * 0.6f + Side.Y * L * 0.6f, FLinearColor::Yellow, 3.0f);
		DrawLine(P.X + Dir.X * L, P.Y + Dir.Y * L, P.X - Dir.X * L * 0.6f - Side.X * L * 0.6f, P.Y - Dir.Y * L * 0.6f - Side.Y * L * 0.6f, FLinearColor::Yellow, 3.0f);
	}
	if (bHasWaypoint)
	{
		const FVector2D W = ToScreen(Waypoint);
		DrawRect(IUC::Good, W.X - 5.0f, W.Y - 5.0f, 10.0f, 10.0f);
	}
	// Click to place a waypoint (shown on the compass).
	AddHit(FBox2D(FVector2D(MX, MY), FVector2D(MX + Size, MY + Size)),
		[this, WS, MX, MY, Size]()
		{
			Waypoint = WS->MapToWorld(FVector2D((Mouse.X - MX) / Size, (Mouse.Y - MY) / Size));
			bHasWaypoint = true;
		},
		[this]() { bHasWaypoint = false; });
	if (!HoverName.IsEmpty()) { Text(HoverName, Mouse.X + 14.0f, Mouse.Y - 8.0f, IUC::Accent, 1.1f); }

	// Legend & stats.
	const float LX = MX + Size + 40.0f * S();
	Text(TEXT("MAPA"), LX, MY, IUC::TextMain, 3.0f);
	Text(FString::Printf(TEXT("Explorado: %.1f%%"), WS->GetPersistence().ExploredFraction() * 100.0f), LX, MY + 70.0f * S(), IUC::TextDim, 1.0f);
	int32 Discovered = 0;
	for (const IUSim::PointOfInterest& P : WS->GetIsland()->GetPOIs()) { if (WS->GetPersistence().IsDiscovered(P.Id)) { ++Discovered; } }
	Text(FString::Printf(TEXT("Lugares descubiertos: %d"), Discovered), LX, MY + 96.0f * S(), IUC::TextDim, 1.0f);
	float LY = MY + 150.0f * S();
	struct FLegend { FLinearColor Color; const TCHAR* Label; };
	const FLegend Legend[] = { { IUC::Bad, TEXT("Aldea") }, { IUC::Accent, TEXT("Ruinas") }, { FLinearColor(0.1f, 0.1f, 0.1f), TEXT("Cueva") }, { IUC::Water, TEXT("Agua / cascada") }, { FLinearColor(0.6f, 0.3f, 1.0f), TEXT("Secreto") }, { IUC::Good, TEXT("Tus construcciones") }, { FLinearColor::Yellow, TEXT("Tu posicion") } };
	for (const FLegend& L : Legend)
	{
		DrawRect(L.Color, LX, LY + 4.0f * S(), 12.0f * S(), 12.0f * S());
		Text(L.Label, LX + 22.0f * S(), LY, IUC::TextMain, 0.95f);
		LY += 26.0f * S();
	}
	Text(TEXT("Clic: marcar destino   ·   Clic dcho: borrar marca   ·   [M] cerrar"), LX, LY + 20.0f * S(), IUC::TextDim, 0.85f);
	if (IU::IsUnderground(C->GetActorLocation())) { Text(TEXT("Estas bajo tierra: tu posicion no aparece en el mapa."), LX, LY + 50.0f * S(), IUC::Accent, 0.9f); }
}

// ================================================================================================
// Journal (quests, tribes, documents)
// ================================================================================================

void AIUHUD::DrawJournal()
{
	UIUStorySubsystem* Story = UIUStorySubsystem::Get(this);
	const UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!Story || !WS) { return; }
	DrawRect(FLinearColor(0, 0, 0, 0.75f), 0, 0, Canvas->ClipX, Canvas->ClipY);
	ScreenTitle(TEXT("DIARIO"), TEXT("[J] cerrar"));
	const TCHAR* Tabs[] = { TEXT("Misiones"), TEXT("Tribus"), TEXT("Documentos") };
	float TX = 60.0f * S();
	for (int32 I = 0; I < 3; ++I)
	{
		Button(Tabs[I], TX, 140.0f * S(), 180.0f * S(), 38.0f * S(), [this, I]() { JournalTab = I; }, true, JournalTab == I);
		TX += 188.0f * S();
	}
	const float X = 60.0f * S();
	float Y = 200.0f * S();
	const float ListW = 460.0f * S();
	const float DX = X + ListW + 40.0f * S();
	const float DW = Canvas->ClipX - DX - 60.0f * S();

	if (JournalTab == 0)
	{
		const IUSim::QuestLog& Log = Story->Quests();
		for (int32 Pass = 0; Pass < 3; ++Pass)
		{
			const IUSim::EQuestState Wanted = Pass == 0 ? IUSim::EQuestState::Active : (Pass == 1 ? IUSim::EQuestState::Completed : IUSim::EQuestState::Failed);
			Text(Pass == 0 ? TEXT("ACTIVAS") : (Pass == 1 ? TEXT("COMPLETADAS") : TEXT("CERRADAS")), X, Y, IUC::TextDim, 0.9f);
			Y += 24.0f * S();
			for (const IUSim::QuestDef& Q : Log.GetDefs())
			{
				if (Log.GetState(Q.Id) != Wanted) { continue; }
				const bool bSel = SelectedQuest == Q.Id;
				const std::string Id = Q.Id;
				Button(FString::Printf(TEXT("%s%s"), Q.bMain ? TEXT("* ") : TEXT(""), *IU::ToFString(Q.Title)), X, Y, ListW, 34.0f * S(), [this, Id]() { SelectedQuest = Id; }, true, bSel);
				Y += 38.0f * S();
			}
			Y += 10.0f * S();
		}
		if (const IUSim::QuestDef* Q = Log.FindDef(SelectedQuest))
		{
			const IUSim::QuestProgress* P = Log.FindProgress(Q->Id);
			float QY = 200.0f * S();
			Text(IU::ToFString(Q->Title), DX, QY, Q->bMain ? IUC::Accent : IUC::TextMain, 2.2f);
			QY += 50.0f * S();
			Text(Q->bMain ? FString::Printf(TEXT("Historia principal · Acto %d"), Q->Act) : FString(TEXT("Mision secundaria")), DX, QY, IUC::TextDim, 0.9f);
			QY += 30.0f * S();
			QY += WrappedText(IU::ToFString(Q->Description), DX, QY, DW, IUC::TextMain, 1.0f) + 16.0f * S();
			for (size_t I = 0; P && I < Q->Objectives.size(); ++I)
			{
				const bool bDone = Log.IsObjectiveComplete(*Q, *P, I);
				const IUSim::QuestObjective& O = Q->Objectives[I];
				FString Line = FString::Printf(TEXT("%s %s"), bDone ? TEXT("[x]") : TEXT("[ ]"), *IU::ToFString(O.Text));
				if (O.Kind == IUSim::EObjectiveType::Event && O.Count > 1) { Line += FString::Printf(TEXT("  %d/%d"), P->Counts[I], O.Count); }
				if (O.bOptional) { Line += TEXT("  (opcional)"); }
				Text(Line, DX, QY, bDone ? IUC::Good : IUC::TextMain, 1.0f);
				QY += 26.0f * S();
			}
			if (Log.GetState(Q->Id) == IUSim::EQuestState::Active)
			{
				const std::string Id = Q->Id;
				Button(Story->Quests().TrackedQuest == Q->Id ? TEXT("Siguiendo") : TEXT("Seguir mision"), DX, QY + 16.0f * S(), 220.0f * S(), 38.0f * S(),
					[Story, Id]() { Story->Quests().TrackedQuest = Id; }, true, Story->Quests().TrackedQuest == Q->Id);
			}
		}
	}
	else if (JournalTab == 1)
	{
		for (const IUSim::TribeDef& T : Story->Factions().GetDefs())
		{
			const IUSim::TribeRuntime* R = Story->Factions().FindRuntime(T.Id);
			if (!R || !R->bDiscovered)
			{
				Text(TEXT("??? (tribu desconocida)"), X, Y, IUC::TextDim, 1.2f);
				Y += 60.0f * S();
				continue;
			}
			const IUSim::EAttitude A = Story->Factions().GetAttitude(T.Id);
			Panel(X, Y, Canvas->ClipX - 120.0f * S(), 150.0f * S(), FLinearColor(0, 0, 0, 0.4f));
			Text(IU::ToFString(T.Name), X + 16.0f * S(), Y + 10.0f * S(), IU::HexColor(T.Color, IUC::Accent), 2.0f);
			Text(FString::Printf(TEXT("Actitud: %s  ·  Reputacion %.0f  ·  Poblacion %d  ·  %s"), UTF8_TO_TCHAR(IUSim::AttitudeToString(A)), R->Reputation, R->Village.Population,
				R->Village.bLeaderAlive ? TEXT("Lider vivo") : TEXT("Sin lider")), X + 16.0f * S(), Y + 52.0f * S(), IUC::TextMain, 0.95f);
			Bar(X + 16.0f * S(), Y + 78.0f * S(), 400.0f * S(), 12.0f * S(), (R->Reputation + 100.0f) / 200.0f, R->Reputation >= 0.0f ? IUC::Good : IUC::Bad);
			WrappedText(IU::ToFString(T.Description), X + 440.0f * S(), Y + 52.0f * S(), Canvas->ClipX - 640.0f * S(), IUC::TextDim, 0.85f);
			if (R->bPlayerKnowsRules)
			{
				FString Rules;
				for (const std::string& Rule : T.Rules) { Rules += FString::Printf(TEXT("· %s  "), *IU::ToFString(Rule)); }
				Text(Rules, X + 16.0f * S(), Y + 104.0f * S(), IUC::Accent, 0.85f);
			}
			else
			{
				Text(TEXT("Habla con ellos para conocer sus normas."), X + 16.0f * S(), Y + 104.0f * S(), IUC::TextDim, 0.85f);
			}
			Y += 164.0f * S();
		}
	}
	else
	{
		for (const FIULoreDoc& Doc : Story->GetLore())
		{
			if (WS->GetPersistence().ReadDocuments.count(IU::ToStd(Doc.Id)) == 0) { continue; }
			const FString Id = Doc.Id;
			Button(Doc.Title, X, Y, ListW, 34.0f * S(), [this, Id]() { SelectedDocument = Id; }, true, SelectedDocument == Doc.Id);
			Y += 38.0f * S();
		}
		if (const FIULoreDoc* Doc = Story->FindLore(SelectedDocument))
		{
			Text(Doc->Title, DX, 200.0f * S(), IUC::Accent, 2.0f);
			WrappedText(Doc->Text, DX, 250.0f * S(), DW, IUC::TextMain, 1.05f);
		}
		else if (WS->GetPersistence().ReadDocuments.empty())
		{
			Text(TEXT("Aun no has encontrado documentos. Busca en restos, campamentos y ruinas."), X, Y, IUC::TextDim, 1.0f);
		}
	}
}

void AIUHUD::DrawDocument()
{
	const UIUStorySubsystem* Story = UIUStorySubsystem::Get(this);
	const FIULoreDoc* Doc = (Story && PC()) ? Story->FindLore(PC()->GetOpenDocument()) : nullptr;
	if (!Doc) { return; }
	DrawRect(FLinearColor(0, 0, 0, 0.6f), 0, 0, Canvas->ClipX, Canvas->ClipY);
	const float W = FMath::Min(900.0f * S(), Canvas->ClipX - 80.0f * S());
	const float H = 560.0f * S();
	const float X = Canvas->ClipX * 0.5f - W * 0.5f;
	const float Y = Canvas->ClipY * 0.5f - H * 0.5f;
	DrawRect(FLinearColor(0.82f, 0.76f, 0.62f, 0.97f), X, Y, W, H);
	DrawRect(FLinearColor(0.55f, 0.45f, 0.3f, 1.0f), X, Y, W, 4.0f * S());
	Text(Doc->Title, X + 40.0f * S(), Y + 30.0f * S(), FLinearColor(0.2f, 0.12f, 0.06f), 2.2f);
	WrappedText(Doc->Text, X + 40.0f * S(), Y + 100.0f * S(), W - 80.0f * S(), FLinearColor(0.12f, 0.08f, 0.04f), 1.15f);
	Button(TEXT("Cerrar"), X + W - 180.0f * S(), Y + H - 60.0f * S(), 150.0f * S(), 40.0f * S(), [this]() { if (AIUPlayerController* P = PC()) { P->CloseScreen(); } });
}

// ================================================================================================
// Tribe dialogue: talk, trade, gifts
// ================================================================================================

void AIUHUD::DrawDialogue()
{
	AIUCharacter* C = Player();
	UIUStorySubsystem* Story = UIUStorySubsystem::Get(this);
	AIUTribeNPC* NPC = PC() ? PC()->GetDialogueNPC() : nullptr;
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	if (!C || !Story || !NPC || !Db) { if (PC()) { PC()->CloseScreen(); } return; }
	if (!NPC->IsAlive() || NPC->IsHostileTo(C) || FVector::Dist(NPC->GetActorLocation(), C->GetActorLocation()) > 600.0f) { PC()->CloseScreen(); return; }
	const FString Tribe = NPC->GetTribeId();
	const IUSim::TribeDef* Def = Story->Factions().FindDef(IU::ToStd(Tribe));
	const IUSim::EAttitude A = Story->Factions().GetAttitude(IU::ToStd(Tribe));

	DrawRect(FLinearColor(0, 0, 0, 0.45f), 0, 0, Canvas->ClipX, Canvas->ClipY);
	const float W = FMath::Min(1100.0f * S(), Canvas->ClipX - 80.0f * S());
	const float H = 520.0f * S();
	const float X = Canvas->ClipX * 0.5f - W * 0.5f;
	const float Y = Canvas->ClipY - H - 40.0f * S();
	Panel(X, Y, W, H, FLinearColor(0.02f, 0.02f, 0.02f, 0.92f));
	Text(NPC->GetNPCName(), X + 24.0f * S(), Y + 16.0f * S(), Def ? IU::HexColor(Def->Color, IUC::Accent) : IUC::Accent, 2.2f);
	Text(FString::Printf(TEXT("%s · %s · actitud %s (%.0f)"), UTF8_TO_TCHAR(IUSim::NpcRoleToString(NPC->GetRole())), *Story->GetTribeName(Tribe), UTF8_TO_TCHAR(IUSim::AttitudeToString(A)), Story->Factions().GetReputation(IU::ToStd(Tribe))),
		X + 24.0f * S(), Y + 64.0f * S(), IUC::TextDim, 0.95f);
	WrappedText(DialogueLine, X + 24.0f * S(), Y + 100.0f * S(), W - 48.0f * S(), IUC::TextMain, 1.1f);

	// Options column.
	const float BX = X + 24.0f * S();
	float BY = Y + 170.0f * S();
	const float BW = 240.0f * S();
	const float BH = 40.0f * S();
	TWeakObjectPtr<AIUTribeNPC> NPCPtr = NPC;
	Button(TEXT("Hablar"), BX, BY, BW, BH, [this, Story, Tribe, Def, NPCPtr]()
	{
		Story->TalkTo(Tribe);
		DialogueMode = 0;
		FString Rules;
		if (Def) { for (const std::string& R : Def->Rules) { Rules += IU::ToFString(R) + TEXT(" "); } }
		DialogueLine = FString::Printf(TEXT("\"%s\" Nuestras normas: %s"), NPCPtr.IsValid() && NPCPtr->GetVillage() ? *NPCPtr->GetVillage()->RandomChatter(UIUWorldSubsystem::Get(this)->GetRandom()) : TEXT("..."), *Rules);
	}, true, DialogueMode == 0);
	BY += BH + 8.0f * S();
	FText TradeReason;
	const bool bCanTrade = Story->CanTrade(Tribe, TradeReason);
	Button(TEXT("Comerciar"), BX, BY, BW, BH, [this]() { DialogueMode = 1; DialogueMessage.Reset(); }, bCanTrade, DialogueMode == 1);
	if (!bCanTrade) { Text(TradeReason.ToString(), BX + BW + 10.0f * S(), BY + 10.0f * S(), IUC::TextDim, 0.8f); }
	BY += BH + 8.0f * S();
	Button(TEXT("Ofrecer un regalo"), BX, BY, BW, BH, [this]() { DialogueMode = 2; DialogueMessage.Reset(); }, true, DialogueMode == 2);
	BY += BH + 8.0f * S();
	Button(TEXT("Despedirse"), BX, BY, BW, BH, [this]() { if (AIUPlayerController* P = PC()) { P->CloseScreen(); } });

	const float PX = BX + BW + 30.0f * S();
	const float PW = X + W - PX - 24.0f * S();
	float PY = Y + 170.0f * S();
	if (DialogueMode == 1 && bCanTrade)
	{
		Text(TEXT("Ofrecen (pagas con objetos de valor equivalente):"), PX, PY, IUC::TextDim, 0.9f);
		PY += 28.0f * S();
		for (const FIUTradeOffer& Offer : Story->GetTradeOffers(Tribe))
		{
			const FIUTradeOffer Copy = Offer;
			Button(FString::Printf(TEXT("%s  ·  valor %.0f"), *ItemName(Offer.ItemId), Offer.Price), PX, PY, PW, 34.0f * S(), [this, Story, Tribe, Copy, C]()
			{
				FString Msg;
				Story->TryBuy(Tribe, Copy, C->GetInventory(), Msg);
				DialogueMessage = Msg;
			});
			PY += 38.0f * S();
		}
		if (Def && !Def->Wants.empty())
		{
			FString Wants;
			for (const std::string& Wid : Def->Wants) { Wants += ItemName(Wid) + TEXT(", "); }
			Text(FString::Printf(TEXT("Valoran especialmente: %s"), *Wants.LeftChop(2)), PX, PY + 6.0f * S(), IUC::Accent, 0.85f);
		}
	}
	else if (DialogueMode == 2)
	{
		Text(TEXT("Elige que regalar (se entrega el monton entero):"), PX, PY, IUC::TextDim, 0.9f);
		PY += 28.0f * S();
		const float SlotSize = 58.0f * S();
		const int32 Cols = FMath::Max(1, static_cast<int32>(PW / (SlotSize + 6.0f * S())));
		UIUInventoryComponent* Inv = C->GetInventory();
		for (int32 I = 0; I < Inv->Inv().NumSlots(); ++I)
		{
			const float SX = PX + (I % Cols) * (SlotSize + 6.0f * S());
			const float SY = PY + (I / Cols) * (SlotSize + 6.0f * S());
			ItemSlot(Inv->Inv().GetSlot(I), SX, SY, SlotSize, false);
			if (Inv->Inv().GetSlot(I).IsEmpty()) { continue; }
			AddHit(FBox2D(FVector2D(SX, SY), FVector2D(SX + SlotSize, SY + SlotSize)), [this, Story, Tribe, I, C]()
			{
				const float Gain = Story->GiftSlot(Tribe, I, C->GetInventory());
				DialogueMessage = Gain > 0.0f ? FString::Printf(TEXT("Aceptan tu regalo (+%.0f reputacion)"), Gain) : TEXT("Lo aceptan sin mucho interes.");
			});
		}
	}
	if (!DialogueMessage.IsEmpty()) { Text(DialogueMessage, PX, Y + H - 40.0f * S(), IUC::Accent, 0.95f); }
}
