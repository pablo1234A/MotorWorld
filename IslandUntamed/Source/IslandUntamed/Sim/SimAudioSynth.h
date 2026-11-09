// Island Untamed - Simulation Core
// Procedural audio synthesis (no audio assets required): ambience loops
// (wind, rain, surf, river, insects, fire, cave drips, music pads) and
// one-shot effects (footsteps, chopping, hits, UI, thunder...).
// Output: mono 16-bit PCM at SampleRate.
#pragma once

#include "SimCore.h"

#include <cstdint>
#include <string>
#include <vector>

namespace IUSim
{
	namespace AudioSynth
	{
		constexpr int32_t SampleRate = 32000;

		using Buffer = std::vector<int16_t>;

		/** Seamless ambience loops. */
		Buffer Wind(float Seconds, uint32_t Seed);
		Buffer RainLoop(float Seconds, uint32_t Seed);
		Buffer Surf(float Seconds, uint32_t Seed);
		Buffer River(float Seconds, uint32_t Seed);
		Buffer Insects(float Seconds, uint32_t Seed);
		Buffer FireCrackle(float Seconds, uint32_t Seed);
		Buffer CaveDrips(float Seconds, uint32_t Seed);
		/** Slow evolving pad in a minor key; Mood 0 calm .. 1 tense. */
		Buffer MusicPad(float Seconds, float Mood, uint32_t Seed);

		/** One-shot by cue name (see .cpp for the list). Unknown names return a short click. */
		Buffer OneShot(const std::string& Cue, uint32_t Seed);
		/** All cue names known by OneShot(). */
		const std::vector<std::string>& OneShotNames();

		/** Peak absolute sample value (tests / normalization). */
		int32_t Peak(const Buffer& B);
		float DurationSeconds(const Buffer& B);
	}
}
