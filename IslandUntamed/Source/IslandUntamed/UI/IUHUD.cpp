#include "UI/IUHUD.h"

#include "Core/IUGameInstance.h"
#include "Core/IUTypes.h"
#include "Creatures/IUTribeNPC.h"
#include "Player/IUBuildComponent.h"
#include "Player/IUCharacter.h"
#include "Player/IUCombatComponent.h"
#include "Player/IUCraftingComponent.h"
#include "Player/IUFishingComponent.h"
#include "Player/IUInteractionComponent.h"
#include "Player/IUInventoryComponent.h"
#include "Player/IUSurvivalComponent.h"
#include "World/IUIntroDirector.h"
#include "World/IUStorySubsystem.h"
#include "World/IUWorldSubsystem.h"
#include "Camera/PlayerCameraManager.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "EngineUtils.h"

namespace IUC = IU::Palette;

AIUHUD::AIUHUD()
{
}

// ================================================================================================
// Helpers
// ================================================================================================

AIUCharacter* AIUHUD::Player() const
{
	return PlayerOwner ? Cast<AIUCharacter>(PlayerOwner->GetPawn()) : nullptr;
}

AIUPlayerController* AIUHUD::PC() const
{
	return Cast<AIUPlayerController>(PlayerOwner);
}

UFont* AIUHUD::FontFor(float Size) const
{
	if (!GEngine) { return nullptr; }
	if (Size >= 2.2f) { return GEngine->GetLargeFont(); }
	if (Size >= 1.3f) { return GEngine->GetMediumFont(); }
	return GEngine->GetSmallFont();
}

void AIUHUD::Rect(float X, float Y, float W, float H, const FLinearColor& Color)
{
	DrawRect(Color, X, Y, W, H);
}

void AIUHUD::Panel(float X, float Y, float W, float H, const FLinearColor& Color, bool bBorder)
{
	DrawRect(Color, X, Y, W, H);
	if (bBorder)
	{
		const FLinearColor Edge(1.0f, 1.0f, 1.0f, 0.08f);
		DrawRect(Edge, X, Y, W, 1.0f);
		DrawRect(Edge, X, Y + H - 1.0f, W, 1.0f);
		DrawRect(Edge, X, Y, 1.0f, H);
		DrawRect(Edge, X + W - 1.0f, Y, 1.0f, H);
		DrawRect(FLinearColor(IUC::Accent.R, IUC::Accent.G, IUC::Accent.B, 0.7f), X, Y, FMath::Min(W, 40.0f * S()), 2.0f);
	}
}

FVector2D AIUHUD::Measure(const FString& T, float Size) const
{
	float W = 0.0f, H = 0.0f;
	const_cast<AIUHUD*>(this)->GetTextSize(T, W, H, FontFor(Size), S() * (Size >= 2.2f ? Size / 2.2f : (Size >= 1.3f ? Size / 1.3f : Size)));
	return FVector2D(W, H);
}

void AIUHUD::Text(const FString& T, float X, float Y, const FLinearColor& Color, float Size, bool bCenter)
{
	if (T.IsEmpty()) { return; }
	const float FontScale = S() * (Size >= 2.2f ? Size / 2.2f : (Size >= 1.3f ? Size / 1.3f : Size));
	float DrawX = X;
	if (bCenter) { DrawX -= Measure(T, Size).X * 0.5f; }
	DrawText(T, FLinearColor(0, 0, 0, Color.A * 0.6f), DrawX + 1.0f, Y + 1.0f, FontFor(Size), FontScale);
	DrawText(T, Color, DrawX, Y, FontFor(Size), FontScale);
}

float AIUHUD::WrappedText(const FString& T, float X, float Y, float Width, const FLinearColor& Color, float Size)
{
	TArray<FString> Paragraphs;
	T.ParseIntoArray(Paragraphs, TEXT("\n"), false);
	float CurY = Y;
	const float LineH = Measure(TEXT("Ay"), Size).Y * 1.15f;
	for (const FString& Para : Paragraphs)
	{
		TArray<FString> Words;
		Para.ParseIntoArray(Words, TEXT(" "), true);
		FString Line;
		for (const FString& Word : Words)
		{
			const FString Candidate = Line.IsEmpty() ? Word : Line + TEXT(" ") + Word;
			if (Measure(Candidate, Size).X > Width && !Line.IsEmpty())
			{
				Text(Line, X, CurY, Color, Size);
				CurY += LineH;
				Line = Word;
			}
			else
			{
				Line = Candidate;
			}
		}
		Text(Line, X, CurY, Color, Size);
		CurY += LineH;
	}
	return CurY - Y;
}

void AIUHUD::Bar(float X, float Y, float W, float H, float Fraction, const FLinearColor& Fill, const FString& Label)
{
	DrawRect(FLinearColor(0, 0, 0, 0.55f), X, Y, W, H);
	DrawRect(Fill, X + 1.0f, Y + 1.0f, FMath::Max(0.0f, (W - 2.0f) * FMath::Clamp(Fraction, 0.0f, 1.0f)), H - 2.0f);
	if (!Label.IsEmpty()) { Text(Label, X + 4.0f * S(), Y + H * 0.5f - Measure(Label, 0.85f).Y * 0.5f, IUC::TextMain, 0.85f); }
}

void AIUHUD::AddHit(const FBox2D& Box, TFunction<void()> Left, TFunction<void()> Right)
{
	FHit H;
	H.Box = Box;
	H.Left = MoveTemp(Left);
	H.Right = MoveTemp(Right);
	Hits.Add(MoveTemp(H));
}

bool AIUHUD::IsHovered(float X, float Y, float W, float H) const
{
	return Mouse.X >= X && Mouse.X <= X + W && Mouse.Y >= Y && Mouse.Y <= Y + H;
}

bool AIUHUD::Button(const FString& Label, float X, float Y, float W, float H, TFunction<void()> OnClick, bool bEnabled, bool bSelected)
{
	const bool bHover = bEnabled && IsHovered(X, Y, W, H);
	FLinearColor Bg = bSelected ? FLinearColor(IUC::Accent.R * 0.45f, IUC::Accent.G * 0.45f, IUC::Accent.B * 0.45f, 0.95f) : IUC::PanelLight;
	if (bHover) { Bg = FLinearColor(IUC::Accent.R * 0.65f, IUC::Accent.G * 0.65f, IUC::Accent.B * 0.65f, 0.95f); }
	DrawRect(Bg, X, Y, W, H);
	DrawRect(bHover || bSelected ? IUC::Accent : FLinearColor(1, 1, 1, 0.1f), X, Y + H - 2.0f, W, 2.0f);
	Text(Label, X + W * 0.5f, Y + H * 0.5f - Measure(Label, 1.0f).Y * 0.5f, bEnabled ? IUC::TextMain : IUC::TextDim, 1.0f, true);
	if (bEnabled && OnClick) { AddHit(FBox2D(FVector2D(X, Y), FVector2D(X + W, Y + H)), MoveTemp(OnClick)); }
	return bHover;
}

FString AIUHUD::ItemName(const std::string& ItemId) const
{
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	const IUSim::ItemDef* Def = Db ? Db->Items.Find(ItemId) : nullptr;
	return Def ? IU::ToFString(Def->Name) : IU::ToFString(ItemId);
}

FLinearColor AIUHUD::ItemColor(const std::string& ItemId) const
{
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	const IUSim::ItemDef* Def = Db ? Db->Items.Find(ItemId) : nullptr;
	if (!Def) { return FLinearColor::Gray; }
	switch (Def->Category)
	{
	case IUSim::EItemCategory::Food: return FLinearColor(0.75f, 0.45f, 0.15f);
	case IUSim::EItemCategory::Tool: return FLinearColor(0.45f, 0.55f, 0.65f);
	case IUSim::EItemCategory::Weapon: return FLinearColor(0.7f, 0.25f, 0.2f);
	case IUSim::EItemCategory::Ammo: return FLinearColor(0.55f, 0.35f, 0.25f);
	case IUSim::EItemCategory::Medicine: return FLinearColor(0.85f, 0.85f, 0.9f);
	case IUSim::EItemCategory::Seed: return FLinearColor(0.4f, 0.65f, 0.25f);
	case IUSim::EItemCategory::Armor: return FLinearColor(0.5f, 0.4f, 0.3f);
	case IUSim::EItemCategory::Special: return FLinearColor(0.35f, 0.55f, 0.95f);
	case IUSim::EItemCategory::Quest: return FLinearColor(0.95f, 0.75f, 0.2f);
	case IUSim::EItemCategory::Placeable: return FLinearColor(0.6f, 0.5f, 0.35f);
	case IUSim::EItemCategory::Material: break;
	}
	return FLinearColor(0.42f, 0.38f, 0.32f);
}

void AIUHUD::ItemSlot(const IUSim::ItemStack& Stack, float X, float Y, float Size, bool bSelected, int32 HotkeyNumber)
{
	const bool bHover = IsHovered(X, Y, Size, Size);
	DrawRect(bSelected ? FLinearColor(IUC::Accent.R * 0.4f, IUC::Accent.G * 0.4f, IUC::Accent.B * 0.4f, 0.9f) : FLinearColor(0.0f, 0.0f, 0.0f, bHover ? 0.65f : 0.45f), X, Y, Size, Size);
	DrawRect(bSelected ? IUC::Accent : FLinearColor(1, 1, 1, bHover ? 0.35f : 0.12f), X, Y + Size - 2.0f, Size, 2.0f);
	if (HotkeyNumber > 0) { Text(FString::FromInt(HotkeyNumber), X + 3.0f * S(), Y + 2.0f * S(), IUC::TextDim, 0.75f); }
	if (Stack.IsEmpty()) { return; }
	if (bHover) { HoverItem = Stack.ItemId; HoverDurability = Stack.Durability; }
	const FLinearColor C = ItemColor(Stack.ItemId);
	const float Pad = Size * 0.18f;
	DrawRect(FLinearColor(C.R, C.G, C.B, 0.85f), X + Pad, Y + Pad, Size - Pad * 2.0f, Size - Pad * 2.0f - 6.0f * S());
	FString Name = ItemName(Stack.ItemId);
	const FString Abbrev = Name.Left(2).ToUpper();
	Text(Abbrev, X + Size * 0.5f, Y + Size * 0.28f, FLinearColor::White, 1.4f, true);
	if (Name.Len() > 10) { Name = Name.Left(9) + TEXT("."); }
	Text(Name, X + Size * 0.5f, Y + Size - 18.0f * S(), IUC::TextMain, 0.7f, true);
	if (Stack.Count > 1) { Text(FString::Printf(TEXT("%d"), Stack.Count), X + Size - Measure(FString::FromInt(Stack.Count), 0.9f).X - 4.0f * S(), Y + 3.0f * S(), FLinearColor::White, 0.9f); }
	if (Stack.Durability >= 0.0f)
	{
		const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
		const IUSim::ItemDef* Def = Db ? Db->Items.Find(Stack.ItemId) : nullptr;
		const float Frac = (Def && Def->MaxDurability > 0.0f) ? Stack.Durability / Def->MaxDurability : 1.0f;
		DrawRect(Frac > 0.3f ? IUC::Good : IUC::Bad, X + 3.0f, Y + Size - 6.0f * S(), (Size - 6.0f) * Frac, 3.0f * S());
	}
}

void AIUHUD::ItemTooltip(const std::string& ItemId, float Durability, float X, float Y)
{
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	const IUSim::ItemDef* Def = Db ? Db->Items.Find(ItemId) : nullptr;
	if (!Def) { return; }
	TArray<FString> Lines;
	Lines.Add(FString::Printf(TEXT("%s  ·  %.2f kg"), UTF8_TO_TCHAR(IUSim::ItemCategoryToString(Def->Category)), Def->Weight));
	if (Def->bHasFood)
	{
		FString F = FString::Printf(TEXT("Hambre +%.0f  Sed %+.0f"), Def->Food.Calories, Def->Food.Hydration);
		if (Def->Food.Health > 0.0f) { F += FString::Printf(TEXT("  Salud +%.0f"), Def->Food.Health); }
		Lines.Add(F);
		if (Def->Food.PoisonChance > 0.0f || Def->Food.InfectionChance > 0.0f) { Lines.Add(TEXT("Riesgo de enfermedad")); }
		if (!Def->CookResult.empty()) { Lines.Add(FString::Printf(TEXT("Cocinar -> %s"), *ItemName(Def->CookResult))); }
	}
	if (Def->bHasMedicine)
	{
		FString M;
		if (Def->Medicine.bStopsBleeding) { M += TEXT("Detiene hemorragias. "); }
		if (Def->Medicine.bFixesFracture) { M += TEXT("Cura fracturas. "); }
		if (Def->Medicine.CuresPoison > 0.0f) { M += TEXT("Contra veneno. "); }
		if (Def->Medicine.CuresInfection > 0.0f) { M += TEXT("Contra infeccion. "); }
		Lines.Add(M);
	}
	if (Def->Weapon.Kind != IUSim::EWeaponKind::None) { Lines.Add(FString::Printf(TEXT("Dano %.0f  ·  Resistencia %.0f"), Def->Weapon.Damage, Def->Weapon.StaminaCost)); }
	if (Def->Tool.Type != IUSim::EToolType::None) { Lines.Add(FString::Printf(TEXT("Herramienta: %s (nivel %d)"), UTF8_TO_TCHAR(IUSim::ToolTypeToString(Def->Tool.Type)), Def->Tool.Tier)); }
	if (Def->Armor.Slot != IUSim::EArmorSlot::None) { Lines.Add(FString::Printf(TEXT("Proteccion %.0f%%  ·  Abrigo +%.0f C"), Def->Armor.Protection * 100.0f, Def->Armor.Insulation)); }
	if (Def->FuelSeconds > 0.0f) { Lines.Add(FString::Printf(TEXT("Combustible: %.0f s"), Def->FuelSeconds)); }
	if (Durability >= 0.0f && Def->MaxDurability > 0.0f) { Lines.Add(FString::Printf(TEXT("Durabilidad %.0f / %.0f"), Durability, Def->MaxDurability)); }
	const float W = 340.0f * S();
	const FString Desc = IU::ToFString(Def->Description);
	const float H = (40.0f + Lines.Num() * 20.0f) * S() + (Desc.IsEmpty() ? 0.0f : 44.0f * S());
	const float TX = FMath::Min(X, Canvas->ClipX - W - 10.0f);
	const float TY = FMath::Min(Y, Canvas->ClipY - H - 10.0f);
	Panel(TX, TY, W, H, FLinearColor(0.02f, 0.02f, 0.02f, 0.95f));
	Text(IU::ToFString(Def->Name), TX + 10.0f * S(), TY + 8.0f * S(), IUC::Accent, 1.3f);
	float LY = TY + 36.0f * S();
	for (const FString& L : Lines) { Text(L, TX + 10.0f * S(), LY, IUC::TextMain, 0.9f); LY += 20.0f * S(); }
	if (!Desc.IsEmpty()) { WrappedText(Desc, TX + 10.0f * S(), LY + 4.0f * S(), W - 20.0f * S(), IUC::TextDim, 0.85f); }
}

void AIUHUD::ScreenTitle(const FString& Title, const FString& Subtitle)
{
	Text(Title, 60.0f * S(), 40.0f * S(), IUC::TextMain, 3.0f);
	if (!Subtitle.IsEmpty()) { Text(Subtitle, 62.0f * S(), 92.0f * S(), IUC::TextDim, 1.0f); }
	DrawRect(IUC::Accent, 60.0f * S(), 118.0f * S(), 120.0f * S(), 3.0f * S());
}

bool AIUHUD::HandleClick(const FVector2D& Position, bool bRight)
{
	for (int32 I = Hits.Num() - 1; I >= 0; --I)
	{
		if (!Hits[I].Box.IsInside(Position)) { continue; }
		TFunction<void()> Fn = bRight ? Hits[I].Right : Hits[I].Left;
		if (Fn) { Fn(); return true; }
		return false;
	}
	// Clicking empty space clears inventory selection.
	SelectedSlot = INDEX_NONE;
	SelectedInventory.Reset();
	return false;
}

void AIUHUD::OnScreenOpened(EIUScreen Screen)
{
	SelectedSlot = INDEX_NONE;
	SelectedInventory.Reset();
	DialogueMode = 0;
	DialogueMessage.Reset();
	DialogueLine.Reset();
	SaveMessage.Reset();
	if (Screen == EIUScreen::Map) { MapFogRevision = MAX_uint32; }
	if (Screen == EIUScreen::Dialogue)
	{
		if (const AIUTribeNPC* NPC = PC() ? PC()->GetDialogueNPC() : nullptr)
		{
			const UIUStorySubsystem* Story = UIUStorySubsystem::Get(this);
			const IUSim::EAttitude A = Story ? Story->Factions().GetAttitude(IU::ToStd(NPC->GetTribeId())) : IUSim::EAttitude::Neutral;
			switch (A)
			{
			case IUSim::EAttitude::Allied: DialogueLine = TEXT("\"Hermano de la tormenta. Siempre hay sitio junto a nuestro fuego.\""); break;
			case IUSim::EAttitude::Friendly: DialogueLine = TEXT("\"Bienvenido, forastero. ¿Que necesitas?\""); break;
			case IUSim::EAttitude::Neutral: DialogueLine = TEXT("\"Habla rapido, extranjero.\""); break;
			default: DialogueLine = TEXT("\"No te queremos aqui. Di lo que tengas que decir y vete.\""); break;
			}
		}
	}
}

// ================================================================================================
// Frame
// ================================================================================================

void AIUHUD::DrawHUD()
{
	Super::DrawHUD();
	if (!Canvas) { return; }
	Hits.Reset();
	HoverItem.clear();
	Scale = FMath::Clamp(Canvas->ClipY / 1080.0f, 0.6f, 2.0f);
	float MX = 0.0f, MY = 0.0f;
	if (PlayerOwner && PlayerOwner->GetMousePosition(MX, MY)) { Mouse = FVector2D(MX, MY); }

	const UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	const EIUScreen Screen = PC() ? PC()->GetScreen() : EIUScreen::None;

	if (WS && WS->Flow == EIUGameFlow::Intro) { DrawIntroSubtitles(); return; }
	if (WS && (WS->Flow == EIUGameFlow::Playing || WS->Flow == EIUGameFlow::Dead) && Screen != EIUScreen::MainMenu)
	{
		DrawGameplay();
	}

	switch (Screen)
	{
	case EIUScreen::None: break;
	case EIUScreen::MainMenu: DrawMainMenu(); break;
	case EIUScreen::Pause: DrawPause(); break;
	case EIUScreen::Settings: DrawSettings(); break;
	case EIUScreen::SaveLoad: DrawSaveLoad(); break;
	case EIUScreen::Inventory: DrawInventoryScreen(false); break;
	case EIUScreen::Container: DrawInventoryScreen(true); break;
	case EIUScreen::Crafting: DrawCraftingScreen(); break;
	case EIUScreen::Build: DrawBuildMenu(); break;
	case EIUScreen::Map: DrawMapScreen(); break;
	case EIUScreen::Journal: DrawJournal(); break;
	case EIUScreen::Document: DrawDocument(); break;
	case EIUScreen::Dialogue: DrawDialogue(); break;
	case EIUScreen::Death: DrawDeath(); break;
	}
	if (!HoverItem.empty() && Screen != EIUScreen::None) { ItemTooltip(HoverItem, HoverDurability, Mouse.X + 18.0f, Mouse.Y + 18.0f); }
}

// ================================================================================================
// In-game HUD
// ================================================================================================

void AIUHUD::DrawGameplay()
{
	const AIUCharacter* C = Player();
	if (!C) { return; }
	const EIUScreen Screen = PC() ? PC()->GetScreen() : EIUScreen::None;
	DrawVitals();
	DrawHotbar();
	DrawClockAndQuest();
	DrawNotifications();
	DrawBanner();
	if (Screen == EIUScreen::None)
	{
		DrawCompass();
		DrawCrosshair();
		DrawFishing();
		DrawBuildHints();
		DrawSpeech();
	}
}

void AIUHUD::DrawVitals()
{
	const AIUCharacter* C = Player();
	const UIUSurvivalComponent* Sv = C ? C->GetSurvival() : nullptr;
	if (!Sv) { return; }
	const IUSim::SurvivalState& St = Sv->Model().State;
	const float X = 30.0f * S();
	float Y = Canvas->ClipY - 230.0f * S();
	const float W = 230.0f * S();
	const float H = 16.0f * S();
	Panel(X - 10.0f * S(), Y - 12.0f * S(), W + 20.0f * S(), 210.0f * S(), FLinearColor(0, 0, 0, 0.35f), false);
	struct FRow { const TCHAR* Label; float Value; float Max; FLinearColor Color; };
	const FRow Rows[] = {
		{ TEXT("Salud"), St.Health, St.MaxHealth, FLinearColor(0.78f, 0.16f, 0.14f) },
		{ TEXT("Resistencia"), St.Stamina, St.MaxStamina, FLinearColor(0.85f, 0.75f, 0.25f) },
		{ TEXT("Hambre"), St.Satiety, 100.0f, FLinearColor(0.85f, 0.48f, 0.15f) },
		{ TEXT("Sed"), St.Hydration, 100.0f, IUC::Water },
		{ TEXT("Energia"), St.Energy, 100.0f, IUC::Good },
		{ TEXT("Sueno"), St.Rest, 100.0f, FLinearColor(0.55f, 0.45f, 0.85f) },
	};
	for (const FRow& R : Rows)
	{
		const bool bLow = R.Value / R.Max < 0.25f;
		const float Pulse = bLow ? 0.6f + 0.4f * FMath::Abs(FMath::Sin(GetWorld()->GetRealTimeSeconds() * 4.0f)) : 1.0f;
		Bar(X, Y, W, H, R.Value / R.Max, R.Color * Pulse, FString::Printf(TEXT("%s  %.0f"), R.Label, R.Value));
		Y += H + 7.0f * S();
	}
	// Temperature and conditions.
	const float Temp = St.BodyTempC;
	const FLinearColor TempColor = Temp < 35.5f ? IUC::Water : (Temp > 38.5f ? IUC::Bad : IUC::TextMain);
	Text(FString::Printf(TEXT("%.1f C cuerpo  ·  %.0f C aire"), Temp, Sv->GetAmbientTemperature()), X, Y + 2.0f * S(), TempColor, 0.9f);
	const uint32 W32 = Sv->GetWarnings();
	struct FChip { uint32 Flag; const TCHAR* Label; FLinearColor Color; };
	const FChip Chips[] = {
		{ IUSim::Warn_Bleeding, TEXT("SANGRADO"), IUC::Bad }, { IUSim::Warn_Fracture, TEXT("FRACTURA"), IUC::Bad },
		{ IUSim::Warn_Poisoned, TEXT("ENVENENADO"), FLinearColor(0.5f, 0.85f, 0.2f) }, { IUSim::Warn_Infected, TEXT("INFECCION"), FLinearColor(0.7f, 0.75f, 0.2f) },
		{ IUSim::Warn_Hypothermia, TEXT("HIPOTERMIA"), IUC::Water }, { IUSim::Warn_Cold, TEXT("FRIO"), IUC::Water },
		{ IUSim::Warn_Hyperthermia, TEXT("GOLPE DE CALOR"), IUC::Bad }, { IUSim::Warn_Wet, TEXT("MOJADO"), IUC::Water },
		{ IUSim::Warn_Overloaded, TEXT("SOBRECARGA"), IUC::Accent }, { IUSim::Warn_Starving, TEXT("INANICION"), IUC::Bad },
		{ IUSim::Warn_Dehydrated, TEXT("DESHIDRATADO"), IUC::Bad }, { IUSim::Warn_Exhausted, TEXT("AGOTADO"), IUC::Bad },
	};
	float CX = X;
	float CY = Y - 236.0f * S();
	for (const FChip& Chip : Chips)
	{
		if ((W32 & Chip.Flag) == 0) { continue; }
		const float CW = Measure(Chip.Label, 0.75f).X + 12.0f * S();
		DrawRect(FLinearColor(Chip.Color.R * 0.35f, Chip.Color.G * 0.35f, Chip.Color.B * 0.35f, 0.9f), CX, CY, CW, 18.0f * S());
		Text(Chip.Label, CX + 6.0f * S(), CY + 2.0f * S(), Chip.Color, 0.75f);
		CX += CW + 4.0f * S();
		if (CX > X + W) { CX = X; CY -= 22.0f * S(); }
	}
}

void AIUHUD::DrawHotbar()
{
	const AIUCharacter* C = Player();
	if (!C || !C->GetInventory()) { return; }
	const float SlotSize = 64.0f * S();
	const float Gap = 6.0f * S();
	const float Total = SlotSize * 8.0f + Gap * 7.0f;
	const float X0 = Canvas->ClipX * 0.5f - Total * 0.5f;
	const float Y0 = Canvas->ClipY - SlotSize - 24.0f * S();
	for (int32 I = 0; I < 8; ++I)
	{
		ItemSlot(C->GetInventory()->Inv().GetSlot(I), X0 + I * (SlotSize + Gap), Y0, SlotSize, C->GetSelectedSlot() == I, I + 1);
	}
	// Held item name and crafting progress.
	const std::string Held = C->GetHeldItemId();
	if (!Held.empty()) { Text(ItemName(Held), Canvas->ClipX * 0.5f, Y0 - 26.0f * S(), IUC::TextMain, 1.0f, true); }
	if (C->GetCrafting() && C->GetCrafting()->IsCrafting())
	{
		const float BW = 260.0f * S();
		Bar(Canvas->ClipX * 0.5f - BW * 0.5f, Y0 - 52.0f * S(), BW, 14.0f * S(), C->GetCrafting()->GetProgress(), IUC::Accent,
			FString::Printf(TEXT("Fabricando (%d en cola)"), C->GetCrafting()->GetQueueLength()));
	}
	// Weight.
	const IUSim::Inventory& Inv = C->GetInventory()->Inv();
	Text(FString::Printf(TEXT("%.1f / %.0f kg"), Inv.GetTotalWeight(), Inv.GetMaxWeight()), X0 + Total + 12.0f * S(), Y0 + SlotSize - 20.0f * S(), Inv.GetLoadRatio() > 1.0f ? IUC::Bad : IUC::TextDim, 0.85f);
}

void AIUHUD::DrawCompass()
{
	const UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!PlayerOwner || !PlayerOwner->PlayerCameraManager || !WS) { return; }
	const FVector CamLoc = PlayerOwner->PlayerCameraManager->GetCameraLocation();
	if (IU::IsUnderground(CamLoc)) { return; }
	const float Yaw = PlayerOwner->PlayerCameraManager->GetCameraRotation().Yaw;
	// UE yaw 0 = +X (east), north = +Y.
	const float Heading = FMath::Fmod(90.0f - Yaw + 720.0f, 360.0f);
	const float W = 560.0f * S();
	const float X0 = Canvas->ClipX * 0.5f - W * 0.5f;
	const float Y0 = 18.0f * S();
	Panel(X0, Y0, W, 34.0f * S(), FLinearColor(0, 0, 0, 0.35f), false);
	const auto DrawMark = [this, Heading, X0, W, Y0](float Bearing, const FString& Label, const FLinearColor& Color, float Size)
	{
		const float Delta = FMath::FindDeltaAngleDegrees(Heading, Bearing);
		if (FMath::Abs(Delta) > 75.0f) { return; }
		const float X = X0 + W * 0.5f + Delta / 75.0f * W * 0.5f;
		Text(Label, X, Y0 + 8.0f * S(), Color, Size, true);
	};
	const TCHAR* Cardinals[8] = { TEXT("N"), TEXT("NE"), TEXT("E"), TEXT("SE"), TEXT("S"), TEXT("SO"), TEXT("O"), TEXT("NO") };
	for (int32 I = 0; I < 8; ++I) { DrawMark(I * 45.0f, Cardinals[I], I % 2 ? IUC::TextDim : IUC::TextMain, I % 2 ? 0.9f : 1.2f); }
	for (int32 I = 0; I < 24; ++I) { if (I % 3 != 0) { DrawMark(I * 15.0f, TEXT("."), IUC::TextDim, 0.9f); } }
	// Discovered places within 800 m.
	if (const IUSim::IslandModel* Island = WS->GetIsland())
	{
		for (const IUSim::PointOfInterest& P : Island->GetPOIs())
		{
			if (!WS->GetPersistence().IsDiscovered(P.Id)) { continue; }
			const FVector D = IU::ToVector(P.Position) - CamLoc;
			if (D.Size2D() > 80000.0f || D.Size2D() < 1500.0f) { continue; }
			const float Bearing = FMath::Fmod(90.0f - FMath::RadiansToDegrees(FMath::Atan2(D.Y, D.X)) + 720.0f, 360.0f);
			DrawMark(Bearing, TEXT("*"), IUC::Accent, 0.9f);
		}
	}
	if (bHasWaypoint)
	{
		const FVector D = Waypoint - CamLoc;
		const float Bearing = FMath::Fmod(90.0f - FMath::RadiansToDegrees(FMath::Atan2(D.Y, D.X)) + 720.0f, 360.0f);
		DrawMark(Bearing, FString::Printf(TEXT("v %.0fm"), D.Size2D() / 100.0f), IUC::Good, 0.9f);
	}
	DrawRect(IUC::Accent, Canvas->ClipX * 0.5f - 1.0f, Y0 + 30.0f * S(), 2.0f, 8.0f * S());
}

void AIUHUD::DrawCrosshair()
{
	const AIUCharacter* C = Player();
	if (!C || C->IsDead()) { return; }
	const float CX = Canvas->ClipX * 0.5f;
	const float CY = Canvas->ClipY * 0.5f;
	const UIUInteractionComponent* I = C->GetInteraction();
	const bool bFocus = I && I->GetFocusKind() != EIUFocusKind::None;
	const float Size = (bFocus ? 4.0f : 2.5f) * S();
	DrawRect(bFocus ? IUC::Accent : FLinearColor(1, 1, 1, 0.8f), CX - Size * 0.5f, CY - Size * 0.5f, Size, Size);
	if (C->GetCombat() && C->GetCombat()->IsDrawingBow())
	{
		const float Charge = C->GetCombat()->GetBowCharge();
		const float R = (30.0f - Charge * 22.0f) * S();
		DrawRect(IUC::TextMain, CX - R, CY - 1.0f, 8.0f * S(), 2.0f);
		DrawRect(IUC::TextMain, CX + R - 8.0f * S(), CY - 1.0f, 8.0f * S(), 2.0f);
	}
	if (!bFocus) { return; }
	float Y = CY + 28.0f * S();
	if (!I->GetPrimaryText().IsEmpty())
	{
		const FString Line = FString::Printf(TEXT("[E]  %s"), *I->GetPrimaryText().ToString());
		const FVector2D Sz = Measure(Line, 1.1f);
		Panel(CX - Sz.X * 0.5f - 10.0f * S(), Y - 4.0f * S(), Sz.X + 20.0f * S(), Sz.Y + 8.0f * S(), FLinearColor(0, 0, 0, 0.55f), false);
		Text(Line, CX, Y, IUC::TextMain, 1.1f, true);
		Y += Sz.Y + 12.0f * S();
	}
	if (!I->GetSecondaryText().IsEmpty())
	{
		Text(FString::Printf(TEXT("[F]  %s"), *I->GetSecondaryText().ToString()), CX, Y, IUC::TextDim, 0.95f, true);
	}
}

void AIUHUD::DrawNotifications()
{
	const UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!WS) { return; }
	const double Now = GetWorld()->GetRealTimeSeconds();
	float Y = Canvas->ClipY * 0.42f;
	const float X = Canvas->ClipX - 40.0f * S();
	for (int32 I = WS->GetNotifications().Num() - 1; I >= 0; --I)
	{
		const FIUNotification& N = WS->GetNotifications()[I];
		const float Age = static_cast<float>(Now - N.Time);
		const float Alpha = FMath::Clamp(6.0f - Age, 0.0f, 1.0f) * FMath::Clamp(Age * 6.0f, 0.0f, 1.0f);
		const FVector2D Sz = Measure(N.Text, 1.0f);
		const float W = FMath::Min(Sz.X, 620.0f * S());
		Panel(X - W - 16.0f * S(), Y - 4.0f * S(), W + 16.0f * S(), Sz.Y + 8.0f * S(), FLinearColor(0, 0, 0, 0.5f * Alpha), false);
		DrawRect(FLinearColor(N.Color.R, N.Color.G, N.Color.B, Alpha), X - W - 16.0f * S(), Y - 4.0f * S(), 3.0f * S(), Sz.Y + 8.0f * S());
		Text(N.Text, X - W - 6.0f * S(), Y, FLinearColor(N.Color.R, N.Color.G, N.Color.B, Alpha), 1.0f);
		Y += Sz.Y + 14.0f * S();
	}
}

void AIUHUD::DrawClockAndQuest()
{
	const UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	const UIUStorySubsystem* Story = UIUStorySubsystem::Get(this);
	const AIUCharacter* C = Player();
	if (!WS || !C) { return; }
	const IUSim::WorldClock& Clock = WS->GetClock();
	const int32 H = static_cast<int32>(Clock.GetHour());
	const int32 M = static_cast<int32>((Clock.GetHour() - H) * 60.0f);
	const FString Place = IU::IsUnderground(C->GetActorLocation()) ? FString(TEXT("Cueva")) : FString(UTF8_TO_TCHAR(IUSim::BiomeDisplayName(WS->GetBiomeAt(C->GetActorLocation()))));
	const FString Line = FString::Printf(TEXT("Dia %d  ·  %02d:%02d  ·  %s  ·  %s"), Clock.GetDay() + 1, H, M, UTF8_TO_TCHAR(IUSim::WeatherToString(Clock.GetWeather())), *Place);
	const float X = Canvas->ClipX - 40.0f * S();
	Text(Line, X - Measure(Line, 1.0f).X, 22.0f * S(), IUC::TextMain, 1.0f);

	if (!Story || Story->Quests().TrackedQuest.empty()) { return; }
	const IUSim::QuestDef* Q = Story->Quests().FindDef(Story->Quests().TrackedQuest);
	const IUSim::QuestProgress* P = Story->Quests().FindProgress(Story->Quests().TrackedQuest);
	if (!Q || !P) { return; }
	float Y = 60.0f * S();
	const float W = 380.0f * S();
	Panel(X - W, Y, W, 28.0f * S(), FLinearColor(0, 0, 0, 0.4f), false);
	Text(IU::ToFString(Q->Title), X - W + 10.0f * S(), Y + 5.0f * S(), Q->bMain ? IUC::Accent : IUC::TextMain, 1.0f);
	Y += 32.0f * S();
	for (size_t I = 0; I < Q->Objectives.size(); ++I)
	{
		const bool bDone = Story->Quests().IsObjectiveComplete(*Q, *P, I);
		const int32 Current = Story->Quests().CurrentObjectiveIndex(Q->Id);
		if (Q->bSequential && !bDone && static_cast<int32>(I) != Current && !Q->Objectives[I].bOptional) { continue; }
		const IUSim::QuestObjective& O = Q->Objectives[I];
		FString Line2 = IU::ToFString(O.Text);
		if (O.Kind == IUSim::EObjectiveType::Event && O.Count > 1) { Line2 += FString::Printf(TEXT("  (%d/%d)"), P->Counts[I], O.Count); }
		Text(FString::Printf(TEXT("%s %s"), bDone ? TEXT("[x]") : TEXT("[ ]"), *Line2), X - W + 12.0f * S(), Y, bDone ? IUC::Good : (O.bOptional ? IUC::TextDim : IUC::TextMain), 0.9f);
		Y += 20.0f * S();
	}
}

void AIUHUD::DrawBanner()
{
	const UIUStorySubsystem* Story = UIUStorySubsystem::Get(this);
	if (!Story) { return; }
	const FIUBanner& B = Story->GetBanner();
	const float Age = static_cast<float>(GetWorld()->GetRealTimeSeconds() - B.Time);
	if (Age > 4.5f || B.Title.IsEmpty()) { return; }
	const float Alpha = FMath::Clamp(Age * 4.0f, 0.0f, 1.0f) * FMath::Clamp((4.5f - Age) * 2.0f, 0.0f, 1.0f);
	const float CX = Canvas->ClipX * 0.5f;
	const float Y = Canvas->ClipY * 0.2f;
	DrawRect(FLinearColor(0, 0, 0, 0.45f * Alpha), CX - 360.0f * S(), Y - 10.0f * S(), 720.0f * S(), 96.0f * S());
	Text(B.Title, CX, Y, FLinearColor(B.Color.R, B.Color.G, B.Color.B, Alpha), 1.2f, true);
	Text(B.Subtitle, CX, Y + 30.0f * S(), FLinearColor(1, 1, 1, Alpha), 2.6f, true);
}

void AIUHUD::DrawFishing()
{
	const AIUCharacter* C = Player();
	const UIUFishingComponent* F = C ? C->GetFishing() : nullptr;
	if (!F || !F->IsActive()) { return; }
	const IUSim::FishingSession& Sess = F->GetSession();
	const float W = 420.0f * S();
	const float X = Canvas->ClipX * 0.5f - W * 0.5f;
	const float Y = Canvas->ClipY * 0.62f;
	Panel(X, Y, W, 100.0f * S(), FLinearColor(0, 0, 0, 0.55f));
	FString State;
	FLinearColor Color = IUC::TextMain;
	switch (Sess.GetState())
	{
	case IUSim::EFishingState::Waiting: State = FString::Printf(TEXT("Esperando que piquen...  (%s)"), UTF8_TO_TCHAR(IUSim::WaterZoneToString(F->GetZone()))); break;
	case IUSim::EFishingState::Bite: State = TEXT("¡PICA!  Haz clic para clavar el anzuelo"); Color = IUC::Accent; break;
	case IUSim::EFishingState::Reeling: State = Sess.IsSurging() ? TEXT("¡El pez tira! Suelta para no romper el sedal") : TEXT("Manten pulsado para recoger"); Color = Sess.IsSurging() ? IUC::Bad : IUC::Good; break;
	default: State = TEXT("..."); break;
	}
	Text(State, X + W * 0.5f, Y + 10.0f * S(), Color, 1.1f, true);
	if (Sess.GetState() == IUSim::EFishingState::Reeling)
	{
		const float T = Sess.GetTension();
		Bar(X + 20.0f * S(), Y + 44.0f * S(), W - 40.0f * S(), 16.0f * S(), T, T > 0.75f ? IUC::Bad : (T > 0.45f ? IUC::Accent : IUC::Good), TEXT("Tension"));
		Bar(X + 20.0f * S(), Y + 70.0f * S(), W - 40.0f * S(), 12.0f * S(), 1.0f - FMath::Clamp(Sess.GetDistance(), 0.0f, 1.0f), IUC::Water, TEXT("Distancia"));
	}
	else
	{
		Text(TEXT("[Clic derecho] cancelar"), X + W * 0.5f, Y + 60.0f * S(), IUC::TextDim, 0.9f, true);
	}
}

void AIUHUD::DrawBuildHints()
{
	const AIUCharacter* C = Player();
	const UIUBuildComponent* B = C ? C->GetBuild() : nullptr;
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	if (!B || !B->IsActive() || !Db) { return; }
	const IUSim::BuildingDef* Def = Db->Buildings.Find(B->GetBuildingId());
	if (!Def) { return; }
	const float W = 520.0f * S();
	const float X = Canvas->ClipX * 0.5f - W * 0.5f;
	const float Y = Canvas->ClipY - 250.0f * S();
	Panel(X, Y, W, 120.0f * S(), FLinearColor(0, 0, 0, 0.55f));
	Text(FString::Printf(TEXT("Construir: %s"), *IU::ToFString(Def->Name)), X + 12.0f * S(), Y + 8.0f * S(), IUC::Accent, 1.2f);
	FString Cost;
	for (const IUSim::ItemAmount& A : Def->Cost)
	{
		const int32 Have = C->GetInventory()->CountItem(A.ItemId);
		Cost += FString::Printf(TEXT("%s %d/%d   "), *ItemName(A.ItemId), Have, A.Count);
	}
	Text(Cost, X + 12.0f * S(), Y + 40.0f * S(), IUC::TextDim, 0.9f);
	if (!B->IsPlacementValid()) { Text(UTF8_TO_TCHAR(IUSim::PlacementFailToText(B->GetLastFail())), X + 12.0f * S(), Y + 64.0f * S(), IUC::Bad, 1.0f); }
	else { Text(TEXT("Colocacion valida"), X + 12.0f * S(), Y + 64.0f * S(), IUC::Good, 1.0f); }
	Text(TEXT("[Clic] colocar   [R / rueda] rotar   [X] desmontar   [B / Esc] salir"), X + 12.0f * S(), Y + 92.0f * S(), IUC::TextDim, 0.85f);
}

void AIUHUD::DrawSpeech()
{
	const AIUCharacter* C = Player();
	if (!C || !PlayerOwner) { return; }
	for (TActorIterator<AIUTribeNPC> It(GetWorld()); It; ++It)
	{
		const FString Line = It->GetSpeech();
		if (Line.IsEmpty() || FVector::Dist(It->GetActorLocation(), C->GetActorLocation()) > 2500.0f) { continue; }
		const FVector Screen = Project(It->GetActorLocation() + FVector(0, 0, 120));
		if (Screen.Z <= 0.0f) { continue; }
		const FString Full = FString::Printf(TEXT("%s: %s"), *It->GetNPCName(), *Line);
		const FVector2D Sz = Measure(Full, 0.95f);
		Panel(Screen.X - Sz.X * 0.5f - 8.0f, Screen.Y - Sz.Y - 8.0f, Sz.X + 16.0f, Sz.Y + 8.0f, FLinearColor(0, 0, 0, 0.6f), false);
		Text(Full, Screen.X, Screen.Y - Sz.Y - 4.0f, IUC::TextMain, 0.95f, true);
	}
}

void AIUHUD::DrawIntroSubtitles()
{
	for (TActorIterator<AIUIntroDirector> It(GetWorld()); It; ++It)
	{
		const FString& Sub = It->GetSubtitle();
		if (!Sub.IsEmpty())
		{
			const float W = FMath::Min(Measure(Sub, 1.3f).X + 40.0f * S(), Canvas->ClipX - 80.0f * S());
			Panel(Canvas->ClipX * 0.5f - W * 0.5f, Canvas->ClipY * 0.82f - 8.0f * S(), W, 44.0f * S(), FLinearColor(0, 0, 0, 0.55f), false);
			Text(Sub, Canvas->ClipX * 0.5f, Canvas->ClipY * 0.82f, IUC::TextMain, 1.3f, true);
		}
	}
	Text(TEXT("[Espacio] saltar"), Canvas->ClipX - 40.0f * S() - Measure(TEXT("[Espacio] saltar"), 0.9f).X, Canvas->ClipY - 40.0f * S(), IUC::TextDim, 0.9f);
}
