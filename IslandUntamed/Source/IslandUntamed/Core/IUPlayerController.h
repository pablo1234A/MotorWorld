// Island Untamed - player controller: Enhanced Input (actions and mapping
// contexts are created at runtime, no input assets), UI screen state machine,
// pause, quick save/load and front-end flow requests.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "InputAction.h"
#include "InputActionValue.h"
#include "IUPlayerController.generated.h"

class UInputAction;
class UInputMappingContext;
class AIUCharacter;
class AIUTribeNPC;
class UIUInventoryComponent;

UENUM()
enum class EIUScreen : uint8
{
	None,
	MainMenu,
	Pause,
	Settings,
	SaveLoad,
	Inventory,
	Crafting,
	Build,
	Map,
	Journal,
	Container,
	Document,
	Dialogue,
	Death
};

UCLASS()
class ISLANDUNTAMED_API AIUPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	AIUPlayerController();

	EIUScreen GetScreen() const { return Screen; }
	void OpenScreen(EIUScreen NewScreen);
	void CloseScreen();
	bool IsUIOpen() const { return Screen != EIUScreen::None; }
	AIUCharacter* GetIUCharacter() const;

	// Requests from gameplay.
	void OpenContainer(UIUInventoryComponent* Container, const FText& Title);
	void OpenDocument(const FString& DocId);
	void OpenTribeDialogue(AIUTribeNPC* NPC);
	void OpenCraftingScreen() { OpenScreen(EIUScreen::Crafting); }
	void PlaySleepFade();
	void OnPlayerDied();

	// UI context.
	UIUInventoryComponent* GetOpenContainer() const { return OpenedContainer.Get(); }
	const FText& GetContainerTitle() const { return ContainerTitle; }
	const FString& GetOpenDocument() const { return OpenedDocument; }
	AIUTribeNPC* GetDialogueNPC() const { return DialogueNPC.Get(); }
	/** Slot picked in the save/load screen: true = saving, false = loading. */
	bool bSaveMode = false;
	EIUScreen ScreenBeforeSettings = EIUScreen::None;

	void QuickSave();
	void QuickLoad();

protected:
	virtual void BeginPlay() override;
	virtual void SetupInputComponent() override;
	virtual void PlayerTick(float DeltaTime) override;

private:
	void CreateInput();
	UInputAction* MakeAction(const TCHAR* Name, bool bAxis2D, bool bAxis1D = false, bool bWhenPaused = false);

	void OnMove(const FInputActionValue& V);
	void OnLook(const FInputActionValue& V);
	void OnJumpStart(const FInputActionValue& V);
	void OnJumpEnd(const FInputActionValue& V);
	void OnSprintStart(const FInputActionValue& V);
	void OnSprintEnd(const FInputActionValue& V);
	void OnCrouch(const FInputActionValue& V);
	void OnPrimaryStart(const FInputActionValue& V);
	void OnPrimaryEnd(const FInputActionValue& V);
	void OnSecondaryStart(const FInputActionValue& V);
	void OnSecondaryEnd(const FInputActionValue& V);
	void OnInteract(const FInputActionValue& V);
	void OnInteractAlt(const FInputActionValue& V);
	void OnDodge(const FInputActionValue& V);
	void OnInventory(const FInputActionValue& V);
	void OnCraftingKey(const FInputActionValue& V);
	void OnBuildKey(const FInputActionValue& V);
	void OnMapKey(const FInputActionValue& V);
	void OnJournalKey(const FInputActionValue& V);
	void OnBack(const FInputActionValue& V);
	void OnHotbar(const FInputActionInstance& Instance);
	void OnHotbarWheel(const FInputActionValue& V);
	void OnDrop(const FInputActionValue& V);
	void OnRotate(const FInputActionValue& V);
	void OnDeconstruct(const FInputActionValue& V);
	void OnQuickSave(const FInputActionValue& V);
	void OnQuickLoad(const FInputActionValue& V);
	void OnUIClick(const FInputActionValue& V);
	void OnUIRightClick(const FInputActionValue& V);
	void OnSkip(const FInputActionValue& V);
	void ToggleScreen(EIUScreen Target);
	bool CanUseGameplayInput() const;
	void ApplyInputMode();

	UPROPERTY() TObjectPtr<UInputMappingContext> Context;
	UPROPERTY() TMap<FName, TObjectPtr<UInputAction>> Actions;
	UPROPERTY() TArray<TObjectPtr<UInputAction>> HotbarActions;

	EIUScreen Screen = EIUScreen::None;
	TWeakObjectPtr<UIUInventoryComponent> OpenedContainer;
	FText ContainerTitle;
	FString OpenedDocument;
	TWeakObjectPtr<AIUTribeNPC> DialogueNPC;
	float AutosaveTimer = 0.0f;
};
