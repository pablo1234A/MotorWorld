// Island Untamed - procedural soundscape.
//
// Ambience layers (wind, rain, surf, river, insects, fire, cave, music) are
// synthesized at startup (IUSim::AudioSynth) and streamed through
// USoundWaveProcedural; their volumes follow biome, altitude, time of day,
// weather, shelter and nearby water/fire. One-shot cues use a pool of
// spatialized audio components. No audio assets are required; any cue can be
// replaced later by a USoundBase asset with the same name.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Sim/SimAudioSynth.h"
#include "IUAudioDirector.generated.h"

class UAudioComponent;
class USoundAttenuation;
class USoundWaveProcedural;

UCLASS()
class ISLANDUNTAMED_API AIUAudioDirector : public AActor
{
	GENERATED_BODY()

public:
	AIUAudioDirector();
	static AIUAudioDirector* Get(const UObject* WorldContext);

	virtual void Tick(float DeltaSeconds) override;
	void PlayCue(FName Cue, const FVector& Location, bool bSpatial = true);
	void PlayUI(FName Cue) { PlayCue(Cue, FVector::ZeroVector, false); }

protected:
	virtual void BeginPlay() override;

private:
	struct FLayer
	{
		FName Name;
		TSharedPtr<IUSim::AudioSynth::Buffer, ESPMode::ThreadSafe> Data;
		UAudioComponent* Component = nullptr;
		float Volume = 0.0f;
	};

	struct FVoice
	{
		UAudioComponent* Component = nullptr;
		double EndTime = 0.0;
	};

	void CreateLayer(FName Name, IUSim::AudioSynth::Buffer&& Data);
	USoundWaveProcedural* MakeWave(const IUSim::AudioSynth::Buffer& Data, bool bLoop, const TSharedPtr<IUSim::AudioSynth::Buffer, ESPMode::ThreadSafe>& LoopData);
	void SetLayerTarget(FName Name, float Target, float DeltaSeconds);

	TArray<FLayer> Layers;
	TArray<FVoice> Voices;
	TMap<FName, TArray<int16>> OneShots;
	UPROPERTY() TArray<TObjectPtr<UAudioComponent>> AudioComps;
	UPROPERTY() TArray<TObjectPtr<USoundWaveProcedural>> LiveWaves;
	UPROPERTY() TObjectPtr<USoundAttenuation> Attenuation;
	float BirdTimer = 3.0f;
	float DripTimer = 2.0f;
	int32 NextVoice = 0;
};
