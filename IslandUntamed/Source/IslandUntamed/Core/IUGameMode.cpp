#include "Core/IUGameMode.h"

#include "IslandUntamed.h"
#include "Audio/IUAudioDirector.h"
#include "Core/IUGameInstance.h"
#include "Core/IUGraphicsSettings.h"
#include "Core/IUPlayerController.h"
#include "Core/IUSaveSubsystem.h"
#include "Core/IUTypes.h"
#include "Gameplay/IUContainer.h"
#include "Gameplay/IUStructure.h"
#include "Gameplay/IUWorldItem.h"
#include "Player/IUCharacter.h"
#include "Player/IUSurvivalComponent.h"
#include "UI/IUHUD.h"
#include "World/IUEnvironment.h"
#include "World/IUIntroDirector.h"
#include "World/IUIslandWorld.h"
#include "World/IUPopulationManager.h"
#include "World/IUStorySubsystem.h"
#include "World/IUWorldSubsystem.h"
#include "Camera/CameraActor.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "Kismet/GameplayStatics.h"
#include "Kismet/KismetSystemLibrary.h"

AIUGameMode::AIUGameMode()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bTickEvenWhenPaused = true;
	DefaultPawnClass = AIUCharacter::StaticClass();
	PlayerControllerClass = AIUPlayerController::StaticClass();
	HUDClass = AIUHUD::StaticClass();
}

void AIUGameMode::StartPlay()
{
	Super::StartPlay();
	UIUGraphicsSettings::ApplyStartupSettings(this);
	BootWorld();
}

void AIUGameMode::BootWorld()
{
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	const UIUGameInstance* GI = UIUGameInstance::Get(this);
	if (!WS || !GI || !GI->IsDataValid())
	{
		FrontEndError = GI ? FString::Printf(TEXT("Error en los datos del juego: %s"), *GI->GetDataError()) : TEXT("GameInstance incorrecta (revisa DefaultEngine.ini)");
		UE_LOG(LogIsland, Error, TEXT("%s"), *FrontEndError);
		if (AIUPlayerController* PC = Cast<AIUPlayerController>(UGameplayStatics::GetPlayerController(this, 0))) { PC->OpenScreen(EIUScreen::MainMenu); }
		return;
	}
	WS->GenerateIsland();
	UWorld* World = GetWorld();
	FActorSpawnParameters SP;
	SP.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	Audio = World->SpawnActor<AIUAudioDirector>(AIUAudioDirector::StaticClass(), FTransform::Identity, SP);
	Environment = World->SpawnActor<AIUEnvironment>(AIUEnvironment::StaticClass(), FTransform::Identity, SP);
	IslandWorld = World->SpawnActor<AIUIslandWorld>(AIUIslandWorld::StaticClass(), FTransform::Identity, SP);
	Population = World->SpawnActor<AIUPopulationManager>(AIUPopulationManager::StaticClass(), FTransform::Identity, SP);
	Intro = World->SpawnActor<AIUIntroDirector>(AIUIntroDirector::StaticClass(), FTransform::Identity, SP);
	Intro->OnFinished.AddUObject(this, &AIUGameMode::OnIntroFinished);

	const FVector Spawn = WS->GetPlayerSpawnLocation();
	IslandWorld->InitializeWorld(Spawn);
	if (AIUCharacter* Player = Cast<AIUCharacter>(UGameplayStatics::GetPlayerPawn(this, 0)))
	{
		Player->TeleportPlayer(Spawn, FRotator::ZeroRotator);
		Player->bControlLocked = true;
		Player->GetSurvival()->bFrozen = true;
	}

	// Main menu: slow aerial orbit over the island.
	MenuCamera = World->SpawnActor<ACameraActor>(ACameraActor::StaticClass(), FVector(0, 0, 60000), FRotator(-25, 0, 0), SP);
	if (APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0)) { PC->SetViewTarget(MenuCamera); }
	WS->Flow = EIUGameFlow::MainMenu;
	WS->GetClock().Reset(17.5f, 0x15A1D5EEDULL);
	if (AIUPlayerController* PC = Cast<AIUPlayerController>(UGameplayStatics::GetPlayerController(this, 0))) { PC->OpenScreen(EIUScreen::MainMenu); }
	bBooted = true;
}

void AIUGameMode::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	const UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (MenuCamera && WS && WS->Flow == EIUGameFlow::MainMenu)
	{
		MenuOrbit += DeltaSeconds * 0.025f;
		const FVector Pos(FMath::Cos(MenuOrbit) * 230000.0, FMath::Sin(MenuOrbit) * 230000.0, 52000.0);
		MenuCamera->SetActorLocation(Pos);
		MenuCamera->SetActorRotation((FVector(0, 0, 8000) - Pos).Rotation());
	}
}

void AIUGameMode::ResetWorldForNewGame()
{
	UWorld* World = GetWorld();
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	UIUStorySubsystem* Story = UIUStorySubsystem::Get(this);
	for (TActorIterator<AIUStructure> It(World); It; ++It) { It->Destroy(); }
	for (TActorIterator<AIUWorldItem> It(World); It; ++It) { It->Destroy(); }
	if (Population) { Population->ClearAll(); }
	if (WS)
	{
		IUSim::JsonValue Fresh = IUSim::JsonValue::MakeObject();
		WS->FromJson(Fresh); // empty persistence, no saved containers
		WS->GetPersistence().InitFog(128);
		WS->GetClock().Reset(5.3f, static_cast<uint64>(FDateTime::Now().GetTicks()));
		WS->PlaySeconds = 0.0;
	}
	for (TActorIterator<AIUContainer> It(World); It; ++It) { It->ReloadFromSave(); }
	if (Story) { Story->StartNewStory(); }
}

void AIUGameMode::StartNewGame()
{
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	AIUCharacter* Player = Cast<AIUCharacter>(UGameplayStatics::GetPlayerPawn(this, 0));
	AIUPlayerController* PC = Cast<AIUPlayerController>(UGameplayStatics::GetPlayerController(this, 0));
	if (!WS || !Player || !PC || !bBooted) { return; }
	ResetWorldForNewGame();
	const FVector Spawn = WS->GetPlayerSpawnLocation();
	// Face the wreck.
	const IUSim::PointOfInterest* Crash = WS->GetIsland()->FindPOI("crash_site");
	const float Yaw = Crash ? (IU::ToVector(Crash->Position) - Spawn).Rotation().Yaw : 0.0f;
	Player->ResetForNewGame(Spawn, FRotator(0, Yaw, 0));
	Player->bControlLocked = true;
	Player->GetSurvival()->bFrozen = true;
	PC->CloseScreen();
	PC->ScreenBeforeSettings = EIUScreen::None;
	// CloseScreen refuses to close the main menu: force gameplay screen state.
	PC->OpenScreen(EIUScreen::None);
	PC->SetPause(false);
	Intro->StartIntro(Spawn, Yaw);
}

void AIUGameMode::OnIntroFinished()
{
	EnterPlaying();
	if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this))
	{
		WS->Notify(TEXT("Estas vivo. Busca agua, comida y refugio antes de que caiga la noche."), IU::Palette::Accent);
		WS->Notify(TEXT("[E] interactuar   [TAB] inventario   [C] fabricar   [B] construir   [M] mapa   [J] diario"), IU::Palette::TextDim);
	}
	FString Error;
	if (UIUSaveSubsystem* Save = UIUSaveSubsystem::Get(this)) { Save->SaveGame(UIUSaveSubsystem::AutoSlot(), Error); }
}

void AIUGameMode::EnterPlaying()
{
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	AIUCharacter* Player = Cast<AIUCharacter>(UGameplayStatics::GetPlayerPawn(this, 0));
	APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0);
	if (WS) { WS->Flow = EIUGameFlow::Playing; }
	if (Player)
	{
		Player->bControlLocked = false;
		Player->GetSurvival()->bFrozen = false;
		if (PC) { PC->SetViewTarget(Player); }
	}
}

void AIUGameMode::LoadSlot(const FString& SlotName)
{
	UIUSaveSubsystem* Save = UIUSaveSubsystem::Get(this);
	AIUPlayerController* PC = Cast<AIUPlayerController>(UGameplayStatics::GetPlayerController(this, 0));
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!Save || !PC || !WS || !bBooted) { return; }
	// Saving requires the Playing flow; loading works from the menu or after death.
	const EIUGameFlow PreviousFlow = WS->Flow;
	WS->Flow = EIUGameFlow::Playing;
	if (AIUCharacter* Player = Cast<AIUCharacter>(UGameplayStatics::GetPlayerPawn(this, 0)))
	{
		Player->ResetForNewGame(Player->GetActorLocation(), Player->GetActorRotation());
	}
	FString Error;
	if (!Save->LoadGame(SlotName, Error))
	{
		WS->Flow = PreviousFlow;
		FrontEndError = Error;
		WS->Notify(Error, IU::Palette::Bad);
		return;
	}
	FrontEndError.Reset();
	PC->ScreenBeforeSettings = EIUScreen::None;
	PC->OpenScreen(EIUScreen::None);
	PC->SetPause(false);
	if (PC->PlayerCameraManager) { PC->PlayerCameraManager->StartCameraFade(1.0f, 0.0f, 1.5f, FLinearColor::Black, false, false); }
	EnterPlaying();
}

void AIUGameMode::ReturnToMainMenu()
{
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	AIUPlayerController* PC = Cast<AIUPlayerController>(UGameplayStatics::GetPlayerController(this, 0));
	if (!WS || !PC) { return; }
	WS->Flow = EIUGameFlow::MainMenu;
	if (AIUCharacter* Player = Cast<AIUCharacter>(UGameplayStatics::GetPlayerPawn(this, 0)))
	{
		Player->bControlLocked = true;
		Player->GetSurvival()->bFrozen = true;
	}
	if (MenuCamera) { PC->SetViewTarget(MenuCamera); }
	if (PC->PlayerCameraManager) { PC->PlayerCameraManager->StopCameraFade(); }
	PC->OpenScreen(EIUScreen::MainMenu);
}

void AIUGameMode::QuitGame()
{
	UKismetSystemLibrary::QuitGame(this, UGameplayStatics::GetPlayerController(this, 0), EQuitPreference::Quit, false);
}
