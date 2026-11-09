#include "Core/IUSaveSubsystem.h"

#include "IslandUntamed.h"
#include "Core/IUSaveGame.h"
#include "Core/IUTypes.h"
#include "Gameplay/IUContainer.h"
#include "Gameplay/IUStructure.h"
#include "Gameplay/IUWorldItem.h"
#include "Player/IUCharacter.h"
#include "Player/IUInventoryComponent.h"
#include "Player/IUSurvivalComponent.h"
#include "World/IUPopulationManager.h"
#include "World/IUStorySubsystem.h"
#include "World/IUWorldSubsystem.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"

UIUSaveSubsystem* UIUSaveSubsystem::Get(const UObject* WorldContext)
{
	const UWorld* World = (WorldContext && GEngine) ? GEngine->GetWorldFromContextObject(WorldContext, EGetWorldErrorMode::ReturnNull) : nullptr;
	const UGameInstance* GI = World ? World->GetGameInstance() : nullptr;
	return GI ? GI->GetSubsystem<UIUSaveSubsystem>() : nullptr;
}

const TArray<FString>& UIUSaveSubsystem::SlotNames()
{
	static const TArray<FString> Names = { TEXT("IU_Auto"), TEXT("IU_Slot1"), TEXT("IU_Slot2"), TEXT("IU_Slot3") };
	return Names;
}

bool UIUSaveSubsystem::DoesSaveExist(const FString& SlotName) const
{
	return UGameplayStatics::DoesSaveGameExist(SlotName, 0);
}

FIUSaveSlotInfo UIUSaveSubsystem::GetSlotInfo(const FString& SlotName) const
{
	FIUSaveSlotInfo Info;
	Info.SlotName = SlotName;
	if (!DoesSaveExist(SlotName)) { return Info; }
	if (const UIUSaveGame* Save = Cast<UIUSaveGame>(UGameplayStatics::LoadGameFromSlot(SlotName, 0)))
	{
		Info.bExists = true;
		Info.Label = Save->SlotLabel;
		Info.Timestamp = Save->Timestamp;
		Info.Day = Save->Day;
		Info.Hour = Save->Hour;
		Info.PlaySeconds = Save->PlaySeconds;
		Info.LocationName = Save->LocationName;
	}
	return Info;
}

bool UIUSaveSubsystem::DeleteSlot(const FString& SlotName)
{
	return UGameplayStatics::DeleteGameInSlot(SlotName, 0);
}

FString UIUSaveSubsystem::GetMostRecentSlot() const
{
	FString Best;
	FDateTime BestTime(0);
	for (const FString& Name : SlotNames())
	{
		const FIUSaveSlotInfo Info = GetSlotInfo(Name);
		if (Info.bExists && Info.Timestamp > BestTime) { BestTime = Info.Timestamp; Best = Name; }
	}
	return Best;
}

FString UIUSaveSubsystem::CaptureState(UWorld* World) const
{
	UIUWorldSubsystem* WS = World ? World->GetSubsystem<UIUWorldSubsystem>() : nullptr;
	UIUStorySubsystem* Story = World ? World->GetSubsystem<UIUStorySubsystem>() : nullptr;
	AIUCharacter* Player = Cast<AIUCharacter>(UGameplayStatics::GetPlayerPawn(World, 0));
	if (!WS || !Story || !Player) { return FString(); }

	IUSim::JsonValue Root = IUSim::JsonValue::MakeObject();
	Root.Set("version", IUSim::JsonValue::MakeNumber(UIUSaveGame::CurrentVersion));

	// Player.
	IUSim::JsonValue P = IUSim::JsonValue::MakeObject();
	const FVector L = Player->GetActorLocation();
	const FRotator R = Player->GetControlRotation();
	P.Set("x", IUSim::JsonValue::MakeNumber(L.X));
	P.Set("y", IUSim::JsonValue::MakeNumber(L.Y));
	P.Set("z", IUSim::JsonValue::MakeNumber(L.Z));
	P.Set("yaw", IUSim::JsonValue::MakeNumber(R.Yaw));
	P.Set("pitch", IUSim::JsonValue::MakeNumber(R.Pitch));
	P.Set("hotbar", IUSim::JsonValue::MakeNumber(Player->GetSelectedSlot()));
	P.Set("survival", Player->GetSurvival()->Model().ToJson());
	P.Set("inventory", Player->GetInventory()->ToJson());
	Root.Set("player", P);

	// World & story.
	for (TActorIterator<AIUContainer> It(World); It; ++It) { WS->CaptureContainer(It->GetStorage()); }
	Root.Set("world", WS->ToJson());
	Root.Set("story", Story->ToJson());

	IUSim::JsonValue Structures = IUSim::JsonValue::MakeArray();
	for (TActorIterator<AIUStructure> It(World); It; ++It) { Structures.Push(It->ToJson()); }
	Root.Set("structures", Structures);

	IUSim::JsonValue Items = IUSim::JsonValue::MakeArray();
	for (TActorIterator<AIUWorldItem> It(World); It; ++It) { if (!It->bTransient) { Items.Push(It->ToJson()); } }
	Root.Set("items", Items);

	return IU::ToFString(Root.Dump(false));
}

bool UIUSaveSubsystem::ApplyState(UWorld* World, const FString& Json, FString& OutError)
{
	IUSim::JsonValue Root;
	std::string ParseError;
	if (!IUSim::JsonValue::Parse(IU::ToStd(Json), Root, ParseError))
	{
		OutError = FString::Printf(TEXT("Partida corrupta: %s"), *IU::ToFString(ParseError));
		return false;
	}
	const int32 Version = Root.GetInt("version", 0);
	if (Version <= 0 || Version > UIUSaveGame::CurrentVersion)
	{
		OutError = FString::Printf(TEXT("Version de partida no compatible (%d)"), Version);
		return false;
	}
	UIUWorldSubsystem* WS = World ? World->GetSubsystem<UIUWorldSubsystem>() : nullptr;
	UIUStorySubsystem* Story = World ? World->GetSubsystem<UIUStorySubsystem>() : nullptr;
	AIUCharacter* Player = Cast<AIUCharacter>(UGameplayStatics::GetPlayerPawn(World, 0));
	if (!WS || !Story || !Player) { OutError = TEXT("El mundo no esta listo"); return false; }

	// 1) Clear dynamic actors from the current session.
	for (TActorIterator<AIUStructure> It(World); It; ++It) { It->Destroy(); }
	for (TActorIterator<AIUWorldItem> It(World); It; ++It) { It->Destroy(); }
	for (TActorIterator<AIUPopulationManager> It(World); It; ++It) { It->ClearAll(); }

	// 2) World and story state.
	WS->FromJson(Root["world"]);
	Story->FromJson(Root["story"]);
	for (TActorIterator<AIUContainer> It(World); It; ++It) { It->ReloadFromSave(); }

	// 3) Structures.
	if (const IUSim::JsonValue* Structures = Root.Find("structures"))
	{
		for (const IUSim::JsonValue& S : Structures->Items())
		{
			const FTransform T(FRotator(0, S.GetFloat("yaw"), 0), FVector(S.GetNumber("x"), S.GetNumber("y"), S.GetNumber("z")));
			FActorSpawnParameters SP;
			SP.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
			if (AIUStructure* A = World->SpawnActor<AIUStructure>(AIUStructure::StaticClass(), T, SP))
			{
				A->InitStructure(S.GetString("id"), true);
				A->FromJson(S);
			}
		}
	}
	// 4) Dropped items.
	if (const IUSim::JsonValue* Items = Root.Find("items"))
	{
		for (const IUSim::JsonValue& I : Items->Items())
		{
			AIUWorldItem::SpawnItem(World, FVector(I.GetNumber("x"), I.GetNumber("y"), I.GetNumber("z") + 30.0), I.GetString("id"), I.GetInt("n", 1), I.GetFloat("d", -1.0f));
		}
	}
	// 5) Player last (teleport streams the terrain around the saved position).
	const IUSim::JsonValue& P = Root["player"];
	Player->GetSurvival()->Model().FromJson(P["survival"]);
	Player->GetInventory()->FromJson(P["inventory"]);
	Player->SelectHotbar(P.GetInt("hotbar", 0));
	Player->TeleportPlayer(FVector(P.GetNumber("x"), P.GetNumber("y"), P.GetNumber("z") + 20.0), FRotator(0, P.GetFloat("yaw"), 0));
	return true;
}

bool UIUSaveSubsystem::SaveGame(const FString& SlotName, FString& OutError)
{
	UWorld* World = GetGameInstance() ? GetGameInstance()->GetWorld() : nullptr;
	UIUWorldSubsystem* WS = World ? World->GetSubsystem<UIUWorldSubsystem>() : nullptr;
	if (!WS || WS->Flow != EIUGameFlow::Playing) { OutError = TEXT("Solo se puede guardar durante la partida"); return false; }
	const FString Payload = CaptureState(World);
	if (Payload.IsEmpty()) { OutError = TEXT("No se pudo capturar el estado"); return false; }

	UIUSaveGame* Save = Cast<UIUSaveGame>(UGameplayStatics::CreateSaveGameObject(UIUSaveGame::StaticClass()));
	Save->Payload = Payload;
	Save->Timestamp = FDateTime::Now();
	Save->Day = WS->GetClock().GetDay();
	Save->Hour = WS->GetClock().GetHour();
	Save->PlaySeconds = static_cast<float>(WS->PlaySeconds);
	if (const APawn* Pawn = UGameplayStatics::GetPlayerPawn(World, 0))
	{
		Save->LocationName = IU::IsUnderground(Pawn->GetActorLocation()) ? TEXT("Cueva") : UTF8_TO_TCHAR(IUSim::BiomeDisplayName(WS->GetBiomeAt(Pawn->GetActorLocation())));
	}
	Save->SlotLabel = SlotName == AutoSlot() ? TEXT("Autoguardado") : SlotName.Replace(TEXT("IU_Slot"), TEXT("Ranura "));
	if (!UGameplayStatics::SaveGameToSlot(Save, SlotName, 0))
	{
		OutError = TEXT("Error al escribir el archivo de guardado");
		return false;
	}
	UE_LOG(LogIsland, Log, TEXT("Saved %s (%d bytes)"), *SlotName, Payload.Len());
	WS->Notify(FString::Printf(TEXT("Partida guardada (%s)"), *Save->SlotLabel), IU::Palette::Good);
	return true;
}

bool UIUSaveSubsystem::LoadGame(const FString& SlotName, FString& OutError)
{
	UWorld* World = GetGameInstance() ? GetGameInstance()->GetWorld() : nullptr;
	if (!DoesSaveExist(SlotName)) { OutError = TEXT("No existe esa partida"); return false; }
	const UIUSaveGame* Save = Cast<UIUSaveGame>(UGameplayStatics::LoadGameFromSlot(SlotName, 0));
	if (!Save) { OutError = TEXT("No se pudo leer la partida"); return false; }
	if (!ApplyState(World, Save->Payload, OutError)) { return false; }
	if (UIUWorldSubsystem* WS = World ? World->GetSubsystem<UIUWorldSubsystem>() : nullptr)
	{
		WS->Notify(FString::Printf(TEXT("Partida cargada: dia %d"), Save->Day + 1), IU::Palette::Good);
	}
	UE_LOG(LogIsland, Log, TEXT("Loaded %s"), *SlotName);
	return true;
}
