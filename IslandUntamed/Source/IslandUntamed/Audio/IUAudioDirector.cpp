#include "Audio/IUAudioDirector.h"

#include "IslandUntamed.h"
#include "Core/IUGameInstance.h"
#include "Core/IUTypes.h"
#include "Player/IUCharacter.h"
#include "Player/IUSurvivalComponent.h"
#include "World/IUWorldSubsystem.h"
#include "Camera/PlayerCameraManager.h"
#include "Components/AudioComponent.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "Kismet/GameplayStatics.h"
#include "Sound/SoundAttenuation.h"
#include "Sound/SoundWaveProcedural.h"

namespace IUAudioLocal
{
	constexpr int32 VoiceCount = 14;
}

AIUAudioDirector::AIUAudioDirector()
{
	PrimaryActorTick.bCanEverTick = true;
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
}

AIUAudioDirector* AIUAudioDirector::Get(const UObject* WorldContext)
{
	UWorld* World = (WorldContext && GEngine) ? GEngine->GetWorldFromContextObject(WorldContext, EGetWorldErrorMode::ReturnNull) : nullptr;
	if (!World) { return nullptr; }
	static TWeakObjectPtr<AIUAudioDirector> Cached;
	if (Cached.IsValid() && Cached->GetWorld() == World) { return Cached.Get(); }
	for (TActorIterator<AIUAudioDirector> It(World); It; ++It) { Cached = *It; return *It; }
	return nullptr;
}

USoundWaveProcedural* AIUAudioDirector::MakeWave(const IUSim::AudioSynth::Buffer& Data, bool bLoop, const TSharedPtr<IUSim::AudioSynth::Buffer, ESPMode::ThreadSafe>& LoopData)
{
	USoundWaveProcedural* Wave = NewObject<USoundWaveProcedural>(this);
	Wave->SetSampleRate(IUSim::AudioSynth::SampleRate);
	Wave->NumChannels = 1;
	Wave->SoundGroup = SOUNDGROUP_Default;
	Wave->bLooping = false;
	Wave->Duration = bLoop ? INDEFINITELY_LOOPING_DURATION : IUSim::AudioSynth::DurationSeconds(Data);
	Wave->QueueAudio(reinterpret_cast<const uint8*>(Data.data()), static_cast<int32>(Data.size() * sizeof(int16)));
	if (bLoop && LoopData.IsValid())
	{
		// Called from the audio render thread: only reads the immutable shared buffer.
		TSharedPtr<IUSim::AudioSynth::Buffer, ESPMode::ThreadSafe> Shared = LoopData;
		Wave->OnSoundWaveProceduralUnderflow = FOnSoundWaveProceduralUnderflow::CreateLambda([Shared](USoundWaveProcedural* InWave, int32 SamplesRequired)
		{
			InWave->QueueAudio(reinterpret_cast<const uint8*>(Shared->data()), static_cast<int32>(Shared->size() * sizeof(int16)));
		});
	}
	return Wave;
}

void AIUAudioDirector::CreateLayer(FName Name, IUSim::AudioSynth::Buffer&& Data)
{
	FLayer L;
	L.Name = Name;
	L.Data = MakeShared<IUSim::AudioSynth::Buffer, ESPMode::ThreadSafe>(MoveTemp(Data));
	USoundWaveProcedural* Wave = MakeWave(*L.Data, true, L.Data);
	LiveWaves.Add(Wave);
	UAudioComponent* C = NewObject<UAudioComponent>(this);
	C->SetupAttachment(RootComponent);
	C->bAutoActivate = false;
	C->bAllowSpatialization = false;
	C->bIsUISound = false;
	C->SetSound(Wave);
	C->RegisterComponent();
	C->SetVolumeMultiplier(0.0f);
	C->Play();
	OwnedComponents.Add(C);
	L.Component = C;
	Layers.Add(L);
}

void AIUAudioDirector::BeginPlay()
{
	Super::BeginPlay();
	using namespace IUSim::AudioSynth;
	const double Start = FPlatformTime::Seconds();
	CreateLayer(TEXT("wind"), Wind(8.0f, 11));
	CreateLayer(TEXT("rain"), RainLoop(5.0f, 12));
	CreateLayer(TEXT("surf"), Surf(13.0f, 13));
	CreateLayer(TEXT("river"), River(6.0f, 14));
	CreateLayer(TEXT("insects"), Insects(7.0f, 15));
	CreateLayer(TEXT("fire"), FireCrackle(5.0f, 16));
	CreateLayer(TEXT("cave"), CaveDrips(9.0f, 17));
	CreateLayer(TEXT("music"), MusicPad(40.0f, 0.2f, 18));
	for (const std::string& Cue : OneShotNames())
	{
		const Buffer B = OneShot(Cue, 99);
		TArray<int16> Data(B.data(), static_cast<int32>(B.size()));
		OneShots.Add(FName(UTF8_TO_TCHAR(Cue.c_str())), MoveTemp(Data));
	}

	Attenuation = NewObject<USoundAttenuation>(this);
	Attenuation->Attenuation.bAttenuate = true;
	Attenuation->Attenuation.bSpatialize = true;
	Attenuation->Attenuation.FalloffDistance = 4000.0f;
	Attenuation->Attenuation.AttenuationShapeExtents = FVector(300.0f, 0.0f, 0.0f);
	for (int32 I = 0; I < IUAudioLocal::VoiceCount; ++I)
	{
		UAudioComponent* C = NewObject<UAudioComponent>(this);
		C->SetupAttachment(RootComponent);
		C->bAutoActivate = false;
		C->AttenuationSettings = Attenuation;
		C->RegisterComponent();
		OwnedComponents.Add(C);
		Voices.Add(FVoice{ C, 0.0 });
	}
	UE_LOG(LogIsland, Log, TEXT("Procedural audio synthesized in %.0f ms (%d layers, %d cues)"), (FPlatformTime::Seconds() - Start) * 1000.0, Layers.Num(), OneShots.Num());
}

void AIUAudioDirector::PlayCue(FName Cue, const FVector& Location, bool bSpatial)
{
	const TArray<int16>* Data = OneShots.Find(Cue);
	if (!Data || Voices.Num() == 0) { return; }
	const double Now = GetWorld()->GetTimeSeconds();
	// Reuse a free voice, otherwise steal the oldest.
	int32 Index = INDEX_NONE;
	for (int32 I = 0; I < Voices.Num(); ++I)
	{
		if (Voices[I].EndTime <= Now) { Index = I; break; }
	}
	if (Index == INDEX_NONE) { Index = NextVoice; NextVoice = (NextVoice + 1) % Voices.Num(); }
	FVoice& V = Voices[Index];
	IUSim::AudioSynth::Buffer Copy(Data->GetData(), Data->GetData() + Data->Num());
	USoundWaveProcedural* Wave = MakeWave(Copy, false, nullptr);
	V.Component->Stop();
	V.Component->bAllowSpatialization = bSpatial;
	V.Component->SetWorldLocation(bSpatial ? Location : FVector::ZeroVector);
	V.Component->SetSound(Wave);
	const UIUGameInstance* GI = UIUGameInstance::Get(this);
	V.Component->SetVolumeMultiplier(GI ? GI->MasterVolume : 1.0f);
	V.Component->SetPitchMultiplier(FMath::FRandRange(0.94f, 1.06f));
	V.Component->Play();
	V.EndTime = Now + IUSim::AudioSynth::DurationSeconds(Copy) + 0.1;
	// Keep the latest waves referenced while playing.
	LiveWaves.Add(Wave);
	if (LiveWaves.Num() > Layers.Num() + IUAudioLocal::VoiceCount * 2) { LiveWaves.RemoveAt(Layers.Num()); }
}

void AIUAudioDirector::SetLayerTarget(FName Name, float Target, float DeltaSeconds)
{
	for (FLayer& L : Layers)
	{
		if (L.Name != Name) { continue; }
		L.Volume = FMath::FInterpTo(L.Volume, Target, DeltaSeconds, 1.5f);
		const UIUGameInstance* GI = UIUGameInstance::Get(this);
		const float Master = GI ? GI->MasterVolume : 1.0f;
		const float Music = (GI && Name == TEXT("music")) ? GI->MusicVolume : 1.0f;
		L.Component->SetVolumeMultiplier(FMath::Max(0.001f, L.Volume * Master * Music));
		return;
	}
}

void AIUAudioDirector::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	APlayerCameraManager* Cam = UGameplayStatics::GetPlayerCameraManager(this, 0);
	if (!WS || !WS->GetIsland() || !Cam) { return; }
	const FVector L = Cam->GetCameraLocation();
	const IUSim::WeatherParams& W = WS->GetClock().GetParams();
	const bool bCave = IU::IsUnderground(L);
	const bool bNight = WS->GetClock().IsNight();
	const AIUCharacter* Player = Cast<AIUCharacter>(UGameplayStatics::GetPlayerPawn(this, 0));
	const bool bSheltered = Player && Player->GetSurvival() && Player->GetSurvival()->LastEnvironment().bSheltered;
	const IUSim::IslandModel& Island = *WS->GetIsland();
	const float XM = L.X * IU::CmToMeters;
	const float YM = L.Y * IU::CmToMeters;
	const float Altitude = FMath::Max(0.0f, static_cast<float>(L.Z) * IU::CmToMeters);
	const IUSim::EBiome Biome = Island.GetBiome(XM, YM);

	// Distance to open sea: probe a ring around the listener.
	float SeaProximity = 0.0f;
	if (!bCave)
	{
		for (int32 I = 0; I < 8; ++I)
		{
			const float A = I / 8.0f * 2.0f * PI;
			for (const float R : { 60.0f, 140.0f })
			{
				if (Island.GetHeight(XM + FMath::Cos(A) * R, YM + FMath::Sin(A) * R) < -1.0f) { SeaProximity = FMath::Max(SeaProximity, R < 100.0f ? 1.0f : 0.5f); }
			}
		}
	}
	float RiverLevel = 0.0f;
	const float RiverDist = bCave ? 1.0e6f : Island.DistanceToRiver(XM, YM, &RiverLevel);
	const bool bJungle = Biome == IUSim::EBiome::Jungle || Biome == IUSim::EBiome::Swamp;

	SetLayerTarget(TEXT("wind"), bCave ? 0.0f : FMath::Clamp(0.15f + W.Wind / 14.0f * 0.6f + Altitude / 300.0f * 0.4f, 0.0f, 1.0f) * (bSheltered ? 0.5f : 1.0f), DeltaSeconds);
	SetLayerTarget(TEXT("rain"), bCave ? 0.0f : W.Rain * (bSheltered ? 0.6f : 1.0f), DeltaSeconds);
	SetLayerTarget(TEXT("surf"), bCave ? 0.0f : SeaProximity * (0.6f + W.Wind / 14.0f * 0.4f) * FMath::Clamp(1.0f - Altitude / 60.0f, 0.0f, 1.0f), DeltaSeconds);
	SetLayerTarget(TEXT("river"), FMath::Clamp(1.0f - RiverDist / 70.0f, 0.0f, 1.0f) * 0.8f, DeltaSeconds);
	SetLayerTarget(TEXT("insects"), bCave ? 0.0f : (bNight ? (bJungle ? 0.7f : 0.4f) : (bJungle ? 0.25f : 0.05f)) * (1.0f - W.Rain), DeltaSeconds);
	SetLayerTarget(TEXT("fire"), FMath::Clamp(WS->GetFireHeatAt(L) * 1.5f, 0.0f, 1.0f), DeltaSeconds);
	SetLayerTarget(TEXT("cave"), bCave ? 0.7f : 0.0f, DeltaSeconds);
	const bool bTense = WS->AnyHostileNear(L, 3000.0f, Player);
	SetLayerTarget(TEXT("music"), (WS->Flow == EIUGameFlow::Intro) ? 0.0f : (bTense ? 0.15f : 0.45f), DeltaSeconds);

	// Birds by day in vegetated biomes; drips in caves; heartbeat when dying.
	BirdTimer -= DeltaSeconds;
	if (BirdTimer <= 0.0f)
	{
		BirdTimer = FMath::FRandRange(2.0f, 7.0f);
		const bool bBirdBiome = Biome == IUSim::EBiome::Jungle || Biome == IUSim::EBiome::Forest || Biome == IUSim::EBiome::Plains || Biome == IUSim::EBiome::Beach;
		if (!bCave && !bNight && bBirdBiome && W.Rain < 0.3f)
		{
			PlayCue(TEXT("bird"), L + FVector(FMath::FRandRange(-2500.0f, 2500.0f), FMath::FRandRange(-2500.0f, 2500.0f), FMath::FRandRange(300.0f, 1200.0f)));
		}
		if (Player && Player->GetSurvival() && Player->GetSurvival()->Model().State.Health < 25.0f && !Player->IsDead())
		{
			PlayCue(TEXT("heartbeat"), L, false);
			BirdTimer = 1.0f;
		}
	}
}
