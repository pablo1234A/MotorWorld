#include "Core/IUPlayerController.h"

#include "IslandUntamed.h"
#include "Audio/IUAudioDirector.h"
#include "Core/IUGameMode.h"
#include "Core/IUSaveSubsystem.h"
#include "Core/IUTypes.h"
#include "Creatures/IUTribeNPC.h"
#include "Player/IUBuildComponent.h"
#include "Player/IUCharacter.h"
#include "Player/IUInventoryComponent.h"
#include "UI/IUHUD.h"
#include "World/IUIntroDirector.h"
#include "World/IUWorldSubsystem.h"
#include "Camera/PlayerCameraManager.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "Engine/LocalPlayer.h"
#include "EngineUtils.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"
#include "Kismet/GameplayStatics.h"

namespace IUControllerLocal
{
	constexpr float AutosaveInterval = 300.0f;
}

AIUPlayerController::AIUPlayerController()
{
	bShowMouseCursor = false;
	bEnableClickEvents = false;
}

AIUCharacter* AIUPlayerController::GetIUCharacter() const
{
	return Cast<AIUCharacter>(GetPawn());
}

UInputAction* AIUPlayerController::MakeAction(const TCHAR* Name, bool bAxis2D, bool bAxis1D, bool bWhenPaused)
{
	UInputAction* A = NewObject<UInputAction>(this, FName(Name));
	A->ValueType = bAxis2D ? EInputActionValueType::Axis2D : (bAxis1D ? EInputActionValueType::Axis1D : EInputActionValueType::Boolean);
	A->bTriggerWhenPaused = bWhenPaused;
	Actions.Add(FName(Name), A);
	return A;
}

void AIUPlayerController::CreateInput()
{
	if (Context) { return; }
	Context = NewObject<UInputMappingContext>(this, TEXT("IU_Gameplay"));

	UInputAction* Move = MakeAction(TEXT("Move"), true);
	UInputAction* Look = MakeAction(TEXT("Look"), true);
	{
		FEnhancedActionKeyMapping& W = Context->MapKey(Move, EKeys::W);
		UInputModifierSwizzleAxis* SwzW = NewObject<UInputModifierSwizzleAxis>(this);
		SwzW->Order = EInputAxisSwizzle::YXZ;
		W.Modifiers.Add(SwzW);
		FEnhancedActionKeyMapping& S = Context->MapKey(Move, EKeys::S);
		UInputModifierSwizzleAxis* SwzS = NewObject<UInputModifierSwizzleAxis>(this);
		SwzS->Order = EInputAxisSwizzle::YXZ;
		S.Modifiers.Add(SwzS);
		S.Modifiers.Add(NewObject<UInputModifierNegate>(this));
		FEnhancedActionKeyMapping& A = Context->MapKey(Move, EKeys::A);
		A.Modifiers.Add(NewObject<UInputModifierNegate>(this));
		Context->MapKey(Move, EKeys::D);
		Context->MapKey(Move, EKeys::Gamepad_Left2D);
		Context->MapKey(Look, EKeys::Mouse2D);
		FEnhancedActionKeyMapping& Pad = Context->MapKey(Look, EKeys::Gamepad_Right2D);
		UInputModifierScalar* PadScale = NewObject<UInputModifierScalar>(this);
		PadScale->Scalar = FVector(2.5, 2.5, 1.0);
		Pad.Modifiers.Add(PadScale);
	}
	const auto Map = [this](const TCHAR* Name, std::initializer_list<FKey> Keys, bool bWhenPaused = false, bool bAxis1D = false)
	{
		UInputAction* A = MakeAction(Name, false, bAxis1D, bWhenPaused);
		for (const FKey& K : Keys) { Context->MapKey(A, K); }
		return A;
	};
	Map(TEXT("Jump"), { EKeys::SpaceBar, EKeys::Gamepad_FaceButton_Bottom });
	Map(TEXT("Sprint"), { EKeys::LeftShift, EKeys::Gamepad_LeftThumbstick });
	Map(TEXT("Crouch"), { EKeys::LeftControl, EKeys::Gamepad_RightThumbstick });
	Map(TEXT("Primary"), { EKeys::LeftMouseButton, EKeys::Gamepad_RightTrigger });
	Map(TEXT("Secondary"), { EKeys::RightMouseButton, EKeys::Gamepad_LeftTrigger });
	Map(TEXT("Interact"), { EKeys::E, EKeys::Gamepad_FaceButton_Left });
	Map(TEXT("InteractAlt"), { EKeys::F, EKeys::Gamepad_FaceButton_Top });
	Map(TEXT("Dodge"), { EKeys::LeftAlt, EKeys::Gamepad_FaceButton_Right });
	Map(TEXT("Inventory"), { EKeys::Tab, EKeys::I, EKeys::Gamepad_Special_Left }, true);
	Map(TEXT("Crafting"), { EKeys::C }, true);
	Map(TEXT("Build"), { EKeys::B, EKeys::Gamepad_DPad_Up }, true);
	Map(TEXT("Map"), { EKeys::M, EKeys::Gamepad_DPad_Right }, true);
	Map(TEXT("Journal"), { EKeys::J, EKeys::Gamepad_DPad_Left }, true);
	Map(TEXT("Back"), { EKeys::Escape, EKeys::Gamepad_Special_Right }, true);
	Map(TEXT("Drop"), { EKeys::G });
	Map(TEXT("Rotate"), { EKeys::R, EKeys::Gamepad_RightShoulder });
	Map(TEXT("Deconstruct"), { EKeys::X, EKeys::Gamepad_DPad_Down });
	Map(TEXT("QuickSave"), { EKeys::F5 });
	Map(TEXT("QuickLoad"), { EKeys::F9 });
	Map(TEXT("UIClick"), { EKeys::LeftMouseButton, EKeys::Gamepad_FaceButton_Bottom }, true);
	Map(TEXT("UIRightClick"), { EKeys::RightMouseButton }, true);
	Map(TEXT("Skip"), { EKeys::SpaceBar, EKeys::Enter }, true);
	UInputAction* Wheel = MakeAction(TEXT("HotbarWheel"), false, true);
	Context->MapKey(Wheel, EKeys::MouseWheelAxis);

	const FKey Digits[8] = { EKeys::One, EKeys::Two, EKeys::Three, EKeys::Four, EKeys::Five, EKeys::Six, EKeys::Seven, EKeys::Eight };
	for (int32 I = 0; I < 8; ++I)
	{
		UInputAction* A = MakeAction(*FString::Printf(TEXT("Hotbar%d"), I + 1), false);
		Context->MapKey(A, Digits[I]);
		HotbarActions.Add(A);
	}
}

void AIUPlayerController::SetupInputComponent()
{
	Super::SetupInputComponent();
	CreateInput();
	UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(InputComponent);
	if (!EIC)
	{
		UE_LOG(LogIsland, Error, TEXT("Enhanced Input component missing: check DefaultInput.ini"));
		return;
	}
	const auto A = [this](const TCHAR* Name) { return Actions.FindRef(FName(Name)).Get(); };
	EIC->BindAction(A(TEXT("Move")), ETriggerEvent::Triggered, this, &AIUPlayerController::OnMove);
	EIC->BindAction(A(TEXT("Move")), ETriggerEvent::Completed, this, &AIUPlayerController::OnMove);
	EIC->BindAction(A(TEXT("Look")), ETriggerEvent::Triggered, this, &AIUPlayerController::OnLook);
	EIC->BindAction(A(TEXT("Jump")), ETriggerEvent::Started, this, &AIUPlayerController::OnJumpStart);
	EIC->BindAction(A(TEXT("Jump")), ETriggerEvent::Completed, this, &AIUPlayerController::OnJumpEnd);
	EIC->BindAction(A(TEXT("Sprint")), ETriggerEvent::Started, this, &AIUPlayerController::OnSprintStart);
	EIC->BindAction(A(TEXT("Sprint")), ETriggerEvent::Completed, this, &AIUPlayerController::OnSprintEnd);
	EIC->BindAction(A(TEXT("Crouch")), ETriggerEvent::Started, this, &AIUPlayerController::OnCrouch);
	EIC->BindAction(A(TEXT("Primary")), ETriggerEvent::Started, this, &AIUPlayerController::OnPrimaryStart);
	EIC->BindAction(A(TEXT("Primary")), ETriggerEvent::Completed, this, &AIUPlayerController::OnPrimaryEnd);
	EIC->BindAction(A(TEXT("Secondary")), ETriggerEvent::Started, this, &AIUPlayerController::OnSecondaryStart);
	EIC->BindAction(A(TEXT("Secondary")), ETriggerEvent::Completed, this, &AIUPlayerController::OnSecondaryEnd);
	EIC->BindAction(A(TEXT("Interact")), ETriggerEvent::Started, this, &AIUPlayerController::OnInteract);
	EIC->BindAction(A(TEXT("InteractAlt")), ETriggerEvent::Started, this, &AIUPlayerController::OnInteractAlt);
	EIC->BindAction(A(TEXT("Dodge")), ETriggerEvent::Started, this, &AIUPlayerController::OnDodge);
	EIC->BindAction(A(TEXT("Inventory")), ETriggerEvent::Started, this, &AIUPlayerController::OnInventory);
	EIC->BindAction(A(TEXT("Crafting")), ETriggerEvent::Started, this, &AIUPlayerController::OnCraftingKey);
	EIC->BindAction(A(TEXT("Build")), ETriggerEvent::Started, this, &AIUPlayerController::OnBuildKey);
	EIC->BindAction(A(TEXT("Map")), ETriggerEvent::Started, this, &AIUPlayerController::OnMapKey);
	EIC->BindAction(A(TEXT("Journal")), ETriggerEvent::Started, this, &AIUPlayerController::OnJournalKey);
	EIC->BindAction(A(TEXT("Back")), ETriggerEvent::Started, this, &AIUPlayerController::OnBack);
	EIC->BindAction(A(TEXT("Drop")), ETriggerEvent::Started, this, &AIUPlayerController::OnDrop);
	EIC->BindAction(A(TEXT("Rotate")), ETriggerEvent::Started, this, &AIUPlayerController::OnRotate);
	EIC->BindAction(A(TEXT("Deconstruct")), ETriggerEvent::Started, this, &AIUPlayerController::OnDeconstruct);
	EIC->BindAction(A(TEXT("QuickSave")), ETriggerEvent::Started, this, &AIUPlayerController::OnQuickSave);
	EIC->BindAction(A(TEXT("QuickLoad")), ETriggerEvent::Started, this, &AIUPlayerController::OnQuickLoad);
	EIC->BindAction(A(TEXT("UIClick")), ETriggerEvent::Started, this, &AIUPlayerController::OnUIClick);
	EIC->BindAction(A(TEXT("UIRightClick")), ETriggerEvent::Started, this, &AIUPlayerController::OnUIRightClick);
	EIC->BindAction(A(TEXT("Skip")), ETriggerEvent::Started, this, &AIUPlayerController::OnSkip);
	EIC->BindAction(A(TEXT("HotbarWheel")), ETriggerEvent::Triggered, this, &AIUPlayerController::OnHotbarWheel);
	for (UInputAction* H : HotbarActions) { EIC->BindAction(H, ETriggerEvent::Started, this, &AIUPlayerController::OnHotbar); }
}

void AIUPlayerController::BeginPlay()
{
	Super::BeginPlay();
	if (UEnhancedInputLocalPlayerSubsystem* Sub = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(GetLocalPlayer()))
	{
		Sub->AddMappingContext(Context, 0);
	}
	ApplyInputMode();
}

void AIUPlayerController::PlayerTick(float DeltaTime)
{
	Super::PlayerTick(DeltaTime);
	const UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (WS && WS->Flow == EIUGameFlow::Playing && !IsPaused())
	{
		AutosaveTimer += DeltaTime;
		if (AutosaveTimer >= IUControllerLocal::AutosaveInterval && !IsUIOpen())
		{
			AutosaveTimer = 0.0f;
			FString Error;
			if (UIUSaveSubsystem* Save = UIUSaveSubsystem::Get(this)) { Save->SaveGame(UIUSaveSubsystem::AutoSlot(), Error); }
		}
	}
}

// ------------------------------------------------------------------------------------------------
// Screens
// ------------------------------------------------------------------------------------------------

void AIUPlayerController::ApplyInputMode()
{
	const bool bUI = Screen != EIUScreen::None;
	bShowMouseCursor = bUI;
	if (bUI)
	{
		FInputModeGameAndUI Mode;
		Mode.SetHideCursorDuringCapture(false);
		Mode.SetLockMouseToViewportBehavior(EMouseLockMode::LockAlways);
		SetInputMode(Mode);
	}
	else
	{
		SetInputMode(FInputModeGameOnly());
	}
	const bool bPause = Screen == EIUScreen::MainMenu || Screen == EIUScreen::Pause || Screen == EIUScreen::Settings || Screen == EIUScreen::SaveLoad;
	SetPause(bPause);
}

void AIUPlayerController::OpenScreen(EIUScreen NewScreen)
{
	if (AIUCharacter* C = GetIUCharacter())
	{
		// Stop any held action when a menu opens.
		C->InputPrimary(false);
		C->InputSecondary(false);
		C->InputSprint(false);
		C->InputMove(FVector2D::ZeroVector);
	}
	if (NewScreen == EIUScreen::Settings && Screen != EIUScreen::Settings) { ScreenBeforeSettings = Screen; }
	Screen = NewScreen;
	ApplyInputMode();
	if (AIUAudioDirector* Audio = AIUAudioDirector::Get(this)) { Audio->PlayUI(TEXT("ui_open")); }
	if (AIUHUD* H = Cast<AIUHUD>(GetHUD())) { H->OnScreenOpened(NewScreen); }
}

void AIUPlayerController::CloseScreen()
{
	if (Screen == EIUScreen::Settings && ScreenBeforeSettings != EIUScreen::None)
	{
		const EIUScreen Back = ScreenBeforeSettings;
		ScreenBeforeSettings = EIUScreen::None;
		OpenScreen(Back);
		return;
	}
	if (Screen == EIUScreen::MainMenu || Screen == EIUScreen::Death) { return; } // these need an explicit choice
	Screen = EIUScreen::None;
	OpenedContainer.Reset();
	DialogueNPC.Reset();
	ApplyInputMode();
}

void AIUPlayerController::ToggleScreen(EIUScreen Target)
{
	const UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!WS || WS->Flow != EIUGameFlow::Playing) { return; }
	if (Screen == Target) { CloseScreen(); }
	else if (Screen == EIUScreen::None || Screen == EIUScreen::Inventory || Screen == EIUScreen::Crafting || Screen == EIUScreen::Map || Screen == EIUScreen::Journal || Screen == EIUScreen::Build || Screen == EIUScreen::Container)
	{
		OpenScreen(Target);
	}
}

void AIUPlayerController::OpenContainer(UIUInventoryComponent* Container, const FText& Title)
{
	OpenedContainer = Container;
	ContainerTitle = Title;
	OpenScreen(EIUScreen::Container);
}

void AIUPlayerController::OpenDocument(const FString& DocId)
{
	OpenedDocument = DocId;
	OpenScreen(EIUScreen::Document);
}

void AIUPlayerController::OpenTribeDialogue(AIUTribeNPC* NPC)
{
	DialogueNPC = NPC;
	OpenScreen(EIUScreen::Dialogue);
}

void AIUPlayerController::PlaySleepFade()
{
	if (PlayerCameraManager)
	{
		PlayerCameraManager->StartCameraFade(1.0f, 0.0f, 3.0f, FLinearColor::Black, true, false);
	}
}

void AIUPlayerController::OnPlayerDied()
{
	if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this)) { WS->Flow = EIUGameFlow::Dead; }
	if (PlayerCameraManager) { PlayerCameraManager->StartCameraFade(0.0f, 0.85f, 3.0f, FLinearColor(0.15f, 0.0f, 0.0f), true, true); }
	OpenScreen(EIUScreen::Death);
}

void AIUPlayerController::QuickSave()
{
	FString Error;
	UIUSaveSubsystem* Save = UIUSaveSubsystem::Get(this);
	if (Save && !Save->SaveGame(TEXT("IU_Slot1"), Error))
	{
		if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this)) { WS->Notify(Error, IU::Palette::Bad); }
	}
}

void AIUPlayerController::QuickLoad()
{
	UIUSaveSubsystem* Save = UIUSaveSubsystem::Get(this);
	const FString Slot = Save ? Save->GetMostRecentSlot() : FString();
	if (AIUGameMode* GM = Cast<AIUGameMode>(UGameplayStatics::GetGameMode(this)))
	{
		if (!Slot.IsEmpty()) { GM->LoadSlot(Slot); }
	}
}

// ------------------------------------------------------------------------------------------------
// Input handlers
// ------------------------------------------------------------------------------------------------

bool AIUPlayerController::CanUseGameplayInput() const
{
	const UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	const AIUCharacter* C = GetIUCharacter();
	return C && WS && WS->Flow == EIUGameFlow::Playing && Screen == EIUScreen::None && !C->bControlLocked;
}

void AIUPlayerController::OnMove(const FInputActionValue& V)
{
	if (AIUCharacter* C = GetIUCharacter()) { if (CanUseGameplayInput()) { C->InputMove(V.Get<FVector2D>()); } }
}

void AIUPlayerController::OnLook(const FInputActionValue& V)
{
	if (AIUCharacter* C = GetIUCharacter()) { if (CanUseGameplayInput()) { C->InputLook(V.Get<FVector2D>()); } }
}

void AIUPlayerController::OnJumpStart(const FInputActionValue& V) { if (CanUseGameplayInput()) { GetIUCharacter()->InputJump(true); } }
void AIUPlayerController::OnJumpEnd(const FInputActionValue& V) { if (AIUCharacter* C = GetIUCharacter()) { C->InputJump(false); } }
void AIUPlayerController::OnSprintStart(const FInputActionValue& V) { if (CanUseGameplayInput()) { GetIUCharacter()->InputSprint(true); } }
void AIUPlayerController::OnSprintEnd(const FInputActionValue& V) { if (AIUCharacter* C = GetIUCharacter()) { C->InputSprint(false); } }
void AIUPlayerController::OnCrouch(const FInputActionValue& V) { if (CanUseGameplayInput()) { GetIUCharacter()->InputCrouch(); } }
void AIUPlayerController::OnPrimaryStart(const FInputActionValue& V) { if (CanUseGameplayInput()) { GetIUCharacter()->InputPrimary(true); } }
void AIUPlayerController::OnPrimaryEnd(const FInputActionValue& V) { if (AIUCharacter* C = GetIUCharacter()) { if (Screen == EIUScreen::None) { C->InputPrimary(false); } } }
void AIUPlayerController::OnSecondaryStart(const FInputActionValue& V) { if (CanUseGameplayInput()) { GetIUCharacter()->InputSecondary(true); } }
void AIUPlayerController::OnSecondaryEnd(const FInputActionValue& V) { if (AIUCharacter* C = GetIUCharacter()) { C->InputSecondary(false); } }
void AIUPlayerController::OnInteract(const FInputActionValue& V) { if (CanUseGameplayInput()) { GetIUCharacter()->InputInteract(); } }
void AIUPlayerController::OnInteractAlt(const FInputActionValue& V) { if (CanUseGameplayInput()) { GetIUCharacter()->InputInteractSecondary(); } }
void AIUPlayerController::OnDodge(const FInputActionValue& V) { if (CanUseGameplayInput()) { GetIUCharacter()->InputDodge(); } }
void AIUPlayerController::OnDrop(const FInputActionValue& V) { if (CanUseGameplayInput()) { GetIUCharacter()->DropSelected(); } }
void AIUPlayerController::OnRotate(const FInputActionValue& V) { if (CanUseGameplayInput()) { GetIUCharacter()->InputRotateBuild(1.0f); } }
void AIUPlayerController::OnDeconstruct(const FInputActionValue& V) { if (CanUseGameplayInput()) { GetIUCharacter()->InputDeconstruct(); } }
void AIUPlayerController::OnInventory(const FInputActionValue& V) { ToggleScreen(EIUScreen::Inventory); }
void AIUPlayerController::OnCraftingKey(const FInputActionValue& V) { ToggleScreen(EIUScreen::Crafting); }
void AIUPlayerController::OnMapKey(const FInputActionValue& V) { ToggleScreen(EIUScreen::Map); }
void AIUPlayerController::OnJournalKey(const FInputActionValue& V) { ToggleScreen(EIUScreen::Journal); }
void AIUPlayerController::OnQuickSave(const FInputActionValue& V) { if (CanUseGameplayInput()) { QuickSave(); } }
void AIUPlayerController::OnQuickLoad(const FInputActionValue& V) { if (CanUseGameplayInput()) { QuickLoad(); } }

void AIUPlayerController::OnBuildKey(const FInputActionValue& V)
{
	AIUCharacter* C = GetIUCharacter();
	if (C && C->GetBuild()->IsActive()) { C->GetBuild()->Cancel(); return; }
	ToggleScreen(EIUScreen::Build);
}

void AIUPlayerController::OnBack(const FInputActionValue& V)
{
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (WS && WS->Flow == EIUGameFlow::Intro) { OnSkip(V); return; }
	AIUCharacter* C = GetIUCharacter();
	if (Screen == EIUScreen::None)
	{
		if (C && C->GetBuild()->IsActive()) { C->GetBuild()->Cancel(); return; }
		if (WS && WS->Flow == EIUGameFlow::Playing) { OpenScreen(EIUScreen::Pause); }
		return;
	}
	if (Screen == EIUScreen::SaveLoad) { OpenScreen(WS && WS->Flow == EIUGameFlow::MainMenu ? EIUScreen::MainMenu : EIUScreen::Pause); return; }
	CloseScreen();
}

void AIUPlayerController::OnHotbar(const FInputActionInstance& Instance)
{
	if (!CanUseGameplayInput()) { return; }
	const int32 Index = HotbarActions.IndexOfByKey(Instance.GetSourceAction());
	if (Index != INDEX_NONE) { GetIUCharacter()->SelectHotbar(Index); }
}

void AIUPlayerController::OnHotbarWheel(const FInputActionValue& V)
{
	if (!CanUseGameplayInput()) { return; }
	const float Axis = V.Get<float>();
	AIUCharacter* C = GetIUCharacter();
	if (FMath::IsNearlyZero(Axis)) { return; }
	if (C->GetBuild()->IsActive()) { C->InputRotateBuild(Axis); return; }
	C->CycleHotbar(Axis > 0.0f ? -1 : 1);
}

void AIUPlayerController::OnUIClick(const FInputActionValue& V)
{
	if (Screen == EIUScreen::None) { return; }
	float X = 0.0f, Y = 0.0f;
	if (!GetMousePosition(X, Y)) { return; }
	if (AIUHUD* H = Cast<AIUHUD>(GetHUD()))
	{
		if (H->HandleClick(FVector2D(X, Y), false))
		{
			if (AIUAudioDirector* Audio = AIUAudioDirector::Get(this)) { Audio->PlayUI(TEXT("ui_click")); }
		}
	}
}

void AIUPlayerController::OnUIRightClick(const FInputActionValue& V)
{
	if (Screen == EIUScreen::None) { return; }
	float X = 0.0f, Y = 0.0f;
	if (!GetMousePosition(X, Y)) { return; }
	if (AIUHUD* H = Cast<AIUHUD>(GetHUD())) { H->HandleClick(FVector2D(X, Y), true); }
}

void AIUPlayerController::OnSkip(const FInputActionValue& V)
{
	for (TActorIterator<AIUIntroDirector> It(GetWorld()); It; ++It)
	{
		if (It->IsRunning()) { It->Skip(); }
	}
}
