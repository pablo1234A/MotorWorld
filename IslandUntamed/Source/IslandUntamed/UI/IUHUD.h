// Island Untamed - HUD and every game screen, drawn with the Canvas.
//
// Immediate-mode UI: each frame the active screen draws itself and registers
// clickable regions; the controller forwards clicks to HandleClick(). This
// keeps the UI asset-free and fully data-driven (items, recipes, buildings,
// quests and tribes are read from the game database). Split across:
//   IUHUD.cpp         core helpers + in-game HUD
//   IUHUDScreens.cpp  inventory, containers, crafting, building
//   IUHUDMenus.cpp    main/pause/settings/save menus, map, journal, dialogue
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "Core/IUPlayerController.h"
#include "Sim/SimInventory.h"
#include "IUHUD.generated.h"

class AIUCharacter;
class UIUInventoryComponent;
class UTexture2D;
class UFont;

UCLASS()
class ISLANDUNTAMED_API AIUHUD : public AHUD
{
	GENERATED_BODY()

public:
	AIUHUD();
	virtual void DrawHUD() override;

	/** Returns true if a clickable element consumed the click. */
	bool HandleClick(const FVector2D& Position, bool bRight);
	void OnScreenOpened(EIUScreen Screen);

private:
	// ---------------------------------------------------------------- helpers
	struct FHit
	{
		FBox2D Box;
		TFunction<void()> Left;
		TFunction<void()> Right;
	};

	float S() const { return Scale; }
	UFont* FontFor(float Size) const;
	void Panel(float X, float Y, float W, float H, const FLinearColor& Color, bool bBorder = true);
	void Rect(float X, float Y, float W, float H, const FLinearColor& Color);
	void Text(const FString& T, float X, float Y, const FLinearColor& Color, float Size = 1.0f, bool bCenter = false);
	FVector2D Measure(const FString& T, float Size) const;
	/** Draws word-wrapped text and returns the height used. */
	float WrappedText(const FString& T, float X, float Y, float Width, const FLinearColor& Color, float Size = 1.0f);
	void Bar(float X, float Y, float W, float H, float Fraction, const FLinearColor& Fill, const FString& Label = FString());
	bool Button(const FString& Label, float X, float Y, float W, float H, TFunction<void()> OnClick, bool bEnabled = true, bool bSelected = false);
	void AddHit(const FBox2D& Box, TFunction<void()> Left, TFunction<void()> Right = nullptr);
	bool IsHovered(float X, float Y, float W, float H) const;
	void ItemSlot(const IUSim::ItemStack& Stack, float X, float Y, float Size, bool bSelected, int32 HotkeyNumber = 0);
	void ItemTooltip(const std::string& ItemId, float Durability, float X, float Y);
	FString ItemName(const std::string& ItemId) const;
	FLinearColor ItemColor(const std::string& ItemId) const;
	void ScreenTitle(const FString& Title, const FString& Subtitle = FString());
	AIUCharacter* Player() const;
	AIUPlayerController* PC() const;

	// ---------------------------------------------------------------- gameplay HUD
	void DrawGameplay();
	void DrawVitals();
	void DrawHotbar();
	void DrawCompass();
	void DrawCrosshair();
	void DrawNotifications();
	void DrawClockAndQuest();
	void DrawBanner();
	void DrawFishing();
	void DrawBuildHints();
	void DrawSpeech();
	void DrawIntroSubtitles();

	// ---------------------------------------------------------------- screens
	void DrawInventoryScreen(bool bContainer);
	void DrawInventoryGrid(UIUInventoryComponent* Inventory, UIUInventoryComponent* Other, float X, float Y, int32 Columns, float SlotSize, bool bShowHotbar);
	void DrawEquipment(float X, float Y);
	void DrawItemActions(float X, float Y, float W);
	void DrawCraftingScreen();
	void DrawBuildMenu();
	void DrawMapScreen();
	void DrawJournal();
	void DrawDocument();
	void DrawDialogue();
	void DrawMainMenu();
	void DrawPause();
	void DrawSettings();
	void DrawSaveLoad();
	void DrawDeath();
	void RebuildMapTexture();

	TArray<FHit> Hits;
	FVector2D Mouse = FVector2D::ZeroVector;
	float Scale = 1.0f;

	// Selection state for inventory interactions.
	TWeakObjectPtr<UIUInventoryComponent> SelectedInventory;
	int32 SelectedSlot = INDEX_NONE;
	std::string HoverItem;
	float HoverDurability = -1.0f;

	int32 CraftCategory = 0;
	int32 CraftPage = 0;
	std::string SelectedRecipe;
	int32 BuildCategory = -1;
	int32 JournalTab = 0;
	std::string SelectedQuest;
	FString SelectedDocument;
	int32 DialogueMode = 0;
	FString DialogueMessage;
	FString DialogueLine;
	FString SaveMessage;

	UPROPERTY() TObjectPtr<UTexture2D> MapTexture;
	uint32 MapFogRevision = MAX_uint32;
	FVector Waypoint = FVector::ZeroVector;
	bool bHasWaypoint = false;
};
