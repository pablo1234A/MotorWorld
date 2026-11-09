#include "SimAudioSynth.h"

#include <cstdlib>

namespace IUSim
{
	namespace AudioSynthDetail
	{
		using AudioSynth::Buffer;
		using AudioSynth::SampleRate;

		/** One-pole low-pass filter. */
		struct LowPass
		{
			float A = 0.1f;
			float Y = 0.0f;
			explicit LowPass(float CutoffHz) { SetCutoff(CutoffHz); }
			void SetCutoff(float CutoffHz)
			{
				const float X = std::exp(-2.0f * kPi * CutoffHz / static_cast<float>(SampleRate));
				A = 1.0f - X;
			}
			float Process(float In) { Y += A * (In - Y); return Y; }
		};

		struct HighPass
		{
			LowPass Lp;
			explicit HighPass(float CutoffHz) : Lp(CutoffHz) {}
			float Process(float In) { return In - Lp.Process(In); }
		};

		/** Converts floats to PCM with soft clipping and a short crossfade so loops are seamless. */
		Buffer ToPcm(std::vector<float>& F, float Gain, bool bLoop)
		{
			const size_t N = F.size();
			if (bLoop && N > 2000)
			{
				const size_t Fade = std::min<size_t>(N / 8, static_cast<size_t>(SampleRate / 4));
				for (size_t I = 0; I < Fade; ++I)
				{
					const float T = static_cast<float>(I) / static_cast<float>(Fade);
					F[I] = F[I] * T + F[N - Fade + I] * (1.0f - T);
				}
				F.resize(N - Fade);
			}
			float Peak = 1e-6f;
			for (const float V : F) { Peak = std::max(Peak, std::fabs(V)); }
			const float Norm = Gain / Peak;
			Buffer Out(F.size());
			for (size_t I = 0; I < F.size(); ++I)
			{
				const float V = std::tanh(F[I] * Norm * 1.1f) * 0.92f;
				Out[I] = static_cast<int16_t>(Clampf(V, -1.0f, 1.0f) * 32000.0f);
			}
			return Out;
		}

		std::vector<float> Silence(float Seconds)
		{
			return std::vector<float>(static_cast<size_t>(Seconds * static_cast<float>(SampleRate)), 0.0f);
		}

		float Env(float T, float Attack, float Decay)
		{
			if (T < 0.0f) { return 0.0f; }
			if (T < Attack) { return T / std::max(Attack, 1e-4f); }
			return std::exp(-(T - Attack) / std::max(Decay, 1e-4f));
		}

		/** Adds a decaying noise burst (footsteps, hits, splashes). */
		void NoiseBurst(std::vector<float>& F, Rng& R, float Start, float Length, float Cutoff, float Amp, float Attack = 0.002f)
		{
			LowPass Lp(Cutoff);
			const size_t S0 = static_cast<size_t>(Start * SampleRate);
			const size_t Len = static_cast<size_t>(Length * SampleRate);
			for (size_t I = 0; I < Len && S0 + I < F.size(); ++I)
			{
				const float T = static_cast<float>(I) / SampleRate;
				F[S0 + I] += Lp.Process(R.Range(-1.0f, 1.0f)) * Amp * Env(T, Attack, Length * 0.3f);
			}
		}

		/** Adds a sine tone with pitch glide and exponential decay. */
		void Tone(std::vector<float>& F, float Start, float Length, float FreqStart, float FreqEnd, float Amp, float Attack = 0.005f)
		{
			const size_t S0 = static_cast<size_t>(Start * SampleRate);
			const size_t Len = static_cast<size_t>(Length * SampleRate);
			float Phase = 0.0f;
			for (size_t I = 0; I < Len && S0 + I < F.size(); ++I)
			{
				const float T = static_cast<float>(I) / SampleRate;
				const float Freq = Lerpf(FreqStart, FreqEnd, T / Length);
				Phase += 2.0f * kPi * Freq / SampleRate;
				F[S0 + I] += std::sin(Phase) * Amp * Env(T, Attack, Length * 0.35f);
			}
		}

		std::vector<float> ColoredNoise(float Seconds, Rng& R, float Cutoff, int Poles)
		{
			std::vector<float> F = Silence(Seconds);
			std::vector<LowPass> Filters(static_cast<size_t>(Poles), LowPass(Cutoff));
			for (float& V : F)
			{
				float X = R.Range(-1.0f, 1.0f);
				for (LowPass& L : Filters) { X = L.Process(X); }
				V = X;
			}
			return F;
		}
	}

	namespace AudioSynth
	{
		using namespace AudioSynthDetail;

		Buffer Wind(float Seconds, uint32_t Seed)
		{
			Rng R(Seed);
			std::vector<float> F = Silence(Seconds);
			LowPass Body(380.0f);
			LowPass Gust(1.2f);
			HighPass Hp(60.0f);
			float GustTarget = 0.5f;
			for (size_t I = 0; I < F.size(); ++I)
			{
				if (I % (SampleRate / 2) == 0) { GustTarget = R.Range(0.2f, 1.0f); }
				const float G = Gust.Process(GustTarget);
				Body.SetCutoff(200.0f + 500.0f * G);
				F[I] = Hp.Process(Body.Process(R.Range(-1.0f, 1.0f))) * (0.3f + G);
			}
			return ToPcm(F, 0.55f, true);
		}

		Buffer RainLoop(float Seconds, uint32_t Seed)
		{
			Rng R(Seed);
			std::vector<float> F = ColoredNoise(Seconds, R, 5000.0f, 1);
			HighPass Hp(900.0f);
			for (float& V : F) { V = Hp.Process(V); }
			// Individual drops.
			for (int I = 0; I < static_cast<int>(Seconds * 60.0f); ++I)
			{
				NoiseBurst(F, R, R.Range(0.0f, Seconds - 0.05f), 0.02f, 7000.0f, R.Range(0.3f, 0.9f));
			}
			return ToPcm(F, 0.5f, true);
		}

		Buffer Surf(float Seconds, uint32_t Seed)
		{
			Rng R(Seed);
			std::vector<float> F = ColoredNoise(Seconds, R, 900.0f, 2);
			for (size_t I = 0; I < F.size(); ++I)
			{
				const float T = static_cast<float>(I) / SampleRate;
				const float Wave = std::pow(0.5f + 0.5f * std::sin(T * 2.0f * kPi / 6.5f), 3.0f);
				F[I] *= 0.15f + Wave;
			}
			return ToPcm(F, 0.6f, true);
		}

		Buffer River(float Seconds, uint32_t Seed)
		{
			Rng R(Seed);
			std::vector<float> F = ColoredNoise(Seconds, R, 2500.0f, 1);
			HighPass Hp(300.0f);
			for (float& V : F) { V = Hp.Process(V); }
			for (int I = 0; I < static_cast<int>(Seconds * 25.0f); ++I)
			{
				const float Start = R.Range(0.0f, Seconds - 0.1f);
				Tone(F, Start, 0.05f, R.Range(400.0f, 900.0f), R.Range(700.0f, 1500.0f), 0.15f, 0.01f);
			}
			return ToPcm(F, 0.5f, true);
		}

		Buffer Insects(float Seconds, uint32_t Seed)
		{
			Rng R(Seed);
			std::vector<float> F = Silence(Seconds);
			// A few cicada/cricket voices with different pulse rates.
			for (int Voice = 0; Voice < 4; ++Voice)
			{
				const float Carrier = R.Range(3800.0f, 5600.0f);
				const float Pulse = R.Range(18.0f, 40.0f);
				const float Amp = R.Range(0.15f, 0.35f);
				const float Phase0 = R.Range(0.0f, 6.0f);
				const float PhraseSeconds = R.Range(1.5f, 3.5f);
				for (size_t I = 0; I < F.size(); ++I)
				{
					const float T = static_cast<float>(I) / SampleRate;
					const float Chirp = std::max(0.0f, std::sin(2.0f * kPi * Pulse * T + Phase0));
					const float Phrase = 0.5f + 0.5f * std::sin(2.0f * kPi * T / PhraseSeconds + Phase0);
					F[I] += std::sin(2.0f * kPi * Carrier * T) * Chirp * Chirp * Phrase * Amp;
				}
			}
			return ToPcm(F, 0.35f, true);
		}

		Buffer FireCrackle(float Seconds, uint32_t Seed)
		{
			Rng R(Seed);
			std::vector<float> F = ColoredNoise(Seconds, R, 300.0f, 2);
			for (float& V : F) { V *= 0.3f; }
			for (int I = 0; I < static_cast<int>(Seconds * 14.0f); ++I)
			{
				NoiseBurst(F, R, R.Range(0.0f, Seconds - 0.02f), R.Range(0.004f, 0.015f), 6000.0f, R.Range(0.4f, 1.0f), 0.0005f);
			}
			return ToPcm(F, 0.5f, true);
		}

		Buffer CaveDrips(float Seconds, uint32_t Seed)
		{
			Rng R(Seed);
			std::vector<float> F = ColoredNoise(Seconds, R, 120.0f, 2);
			for (float& V : F) { V *= 0.4f; }
			for (int I = 0; I < static_cast<int>(Seconds * 0.8f); ++I)
			{
				const float Start = R.Range(0.0f, Seconds - 0.6f);
				const float Freq = R.Range(900.0f, 1700.0f);
				Tone(F, Start, 0.5f, Freq * 1.3f, Freq, 0.6f, 0.001f);
				Tone(F, Start + 0.12f, 0.5f, Freq * 1.25f, Freq, 0.2f, 0.001f); // echo
			}
			return ToPcm(F, 0.45f, true);
		}

		Buffer MusicPad(float Seconds, float Mood, uint32_t Seed)
		{
			Rng R(Seed);
			std::vector<float> F = Silence(Seconds);
			// A minor-ish progression: i - VI - III - VII (in Hz around A2/A3).
			const float Roots[4] = { 110.0f, 87.31f, 130.81f, 98.0f };
			const float Third = Mood > 0.5f ? 1.1892f : 1.2599f; // minor or major third colour
			const float ChordLen = Seconds / 4.0f;
			for (int C = 0; C < 4; ++C)
			{
				const float Start = static_cast<float>(C) * ChordLen;
				const float Notes[4] = { Roots[C], Roots[C] * Third, Roots[C] * 1.4983f, Roots[C] * 2.0f };
				for (const float Note : Notes)
				{
					const size_t S0 = static_cast<size_t>(Start * SampleRate);
					const size_t Len = static_cast<size_t>((ChordLen + 1.5f) * SampleRate);
					const float Detune = R.Range(-0.6f, 0.6f);
					for (size_t I = 0; I < Len && S0 + I < F.size(); ++I)
					{
						const float T = static_cast<float>(I) / SampleRate;
						const float Fade = SmoothStep(0.0f, 1.8f, T) * (1.0f - SmoothStep(ChordLen - 0.3f, ChordLen + 1.5f, T));
						const float W = std::sin(2.0f * kPi * (Note + Detune) * T) + 0.3f * std::sin(2.0f * kPi * (Note * 2.0f + Detune) * T);
						F[S0 + I] += W * Fade * 0.12f;
					}
				}
			}
			// Sparse bell-like melody.
			const float Scale[7] = { 440.0f, 493.88f, 523.25f, 587.33f, 659.25f, 698.46f, 783.99f };
			for (int I = 0; I < static_cast<int>(Seconds / 2.5f); ++I)
			{
				if (!R.Chance(0.6f)) { continue; }
				const float Note = Scale[R.RangeInt(0, 6)] * (R.Chance(0.3f) ? 0.5f : 1.0f);
				Tone(F, R.Range(0.0f, Seconds - 2.0f), 2.0f, Note, Note, 0.05f, 0.01f);
			}
			LowPass Lp(2200.0f);
			for (float& V : F) { V = Lp.Process(V); }
			return ToPcm(F, 0.4f, true);
		}

		const std::vector<std::string>& OneShotNames()
		{
			static const std::vector<std::string> Names = {
				"step", "step_water", "land", "swing", "hit", "thud", "chop", "mine", "gather", "tree_fall", "pickup", "craft", "build",
				"eat", "drink", "water", "splash", "hurt", "block", "dodge", "break", "fire", "dig", "butcher", "bow_draw", "bow_release",
				"cast", "bite", "hook", "catch", "thunder", "ui_click", "ui_open", "alarm", "crash", "bird", "heartbeat"
			};
			return Names;
		}

		Buffer OneShot(const std::string& Cue, uint32_t Seed)
		{
			Rng R(Seed ^ HashString(Cue));
			if (Cue == "step") { std::vector<float> F = Silence(0.12f); NoiseBurst(F, R, 0.0f, 0.1f, 900.0f, 1.0f); return ToPcm(F, 0.35f, false); }
			if (Cue == "step_water") { std::vector<float> F = Silence(0.25f); NoiseBurst(F, R, 0.0f, 0.22f, 3500.0f, 1.0f, 0.02f); return ToPcm(F, 0.35f, false); }
			if (Cue == "land") { std::vector<float> F = Silence(0.25f); NoiseBurst(F, R, 0.0f, 0.2f, 500.0f, 1.0f); Tone(F, 0.0f, 0.15f, 90.0f, 50.0f, 0.6f); return ToPcm(F, 0.5f, false); }
			if (Cue == "swing" || Cue == "dodge")
			{
				std::vector<float> F = Silence(0.3f);
				LowPass Lp(500.0f);
				for (size_t I = 0; I < F.size(); ++I)
				{
					const float T = static_cast<float>(I) / SampleRate;
					Lp.SetCutoff(500.0f + 3000.0f * std::sin(kPi * T / 0.3f));
					F[I] = Lp.Process(R.Range(-1.0f, 1.0f)) * std::sin(kPi * T / 0.3f);
				}
				return ToPcm(F, 0.3f, false);
			}
			if (Cue == "hit" || Cue == "hurt" || Cue == "block")
			{
				std::vector<float> F = Silence(0.3f);
				NoiseBurst(F, R, 0.0f, 0.12f, Cue == "block" ? 4000.0f : 1500.0f, 1.0f);
				Tone(F, 0.0f, 0.25f, Cue == "hurt" ? 180.0f : 120.0f, 60.0f, 0.7f);
				return ToPcm(F, Cue == "hurt" ? 0.6f : 0.55f, false);
			}
			if (Cue == "thud") { std::vector<float> F = Silence(0.2f); Tone(F, 0.0f, 0.18f, 110.0f, 70.0f, 1.0f); NoiseBurst(F, R, 0.0f, 0.05f, 800.0f, 0.4f); return ToPcm(F, 0.4f, false); }
			if (Cue == "chop") { std::vector<float> F = Silence(0.35f); NoiseBurst(F, R, 0.0f, 0.06f, 3000.0f, 1.0f, 0.0005f); Tone(F, 0.0f, 0.3f, 160.0f, 120.0f, 0.8f, 0.001f); return ToPcm(F, 0.6f, false); }
			if (Cue == "mine") { std::vector<float> F = Silence(0.4f); Tone(F, 0.0f, 0.35f, 2100.0f, 1900.0f, 0.5f, 0.0005f); NoiseBurst(F, R, 0.0f, 0.05f, 6000.0f, 1.0f, 0.0005f); return ToPcm(F, 0.55f, false); }
			if (Cue == "gather" || Cue == "dig" || Cue == "butcher") { std::vector<float> F = Silence(0.35f); for (int I = 0; I < 3; ++I) { NoiseBurst(F, R, I * 0.09f, 0.08f, Cue == "dig" ? 700.0f : 2500.0f, 0.8f); } return ToPcm(F, 0.4f, false); }
			if (Cue == "tree_fall") { std::vector<float> F = Silence(2.0f); for (int I = 0; I < 12; ++I) { NoiseBurst(F, R, I * 0.06f, 0.05f, 2000.0f, 0.5f, 0.0005f); } NoiseBurst(F, R, 1.2f, 0.8f, 300.0f, 1.0f, 0.01f); Tone(F, 1.2f, 0.6f, 70.0f, 40.0f, 0.9f); return ToPcm(F, 0.7f, false); }
			if (Cue == "pickup" || Cue == "ui_click") { std::vector<float> F = Silence(0.15f); Tone(F, 0.0f, 0.07f, 880.0f, 880.0f, 0.6f, 0.002f); Tone(F, 0.05f, 0.08f, 1320.0f, 1320.0f, 0.5f, 0.002f); return ToPcm(F, Cue == "ui_click" ? 0.2f : 0.3f, false); }
			if (Cue == "ui_open") { std::vector<float> F = Silence(0.2f); Tone(F, 0.0f, 0.15f, 520.0f, 780.0f, 0.5f, 0.005f); return ToPcm(F, 0.2f, false); }
			if (Cue == "craft" || Cue == "build") { std::vector<float> F = Silence(0.6f); for (int I = 0; I < 3; ++I) { NoiseBurst(F, R, I * 0.17f, 0.06f, 2500.0f, 1.0f, 0.0005f); Tone(F, I * 0.17f, 0.12f, 300.0f, 200.0f, 0.5f, 0.001f); } return ToPcm(F, 0.5f, false); }
			if (Cue == "eat") { std::vector<float> F = Silence(0.5f); for (int I = 0; I < 4; ++I) { NoiseBurst(F, R, I * 0.11f, 0.06f, 3000.0f, 0.7f); } return ToPcm(F, 0.35f, false); }
			if (Cue == "drink" || Cue == "water") { std::vector<float> F = Silence(0.6f); for (int I = 0; I < 3; ++I) { Tone(F, I * 0.18f, 0.12f, 300.0f, 520.0f, 0.6f, 0.01f); } NoiseBurst(F, R, 0.0f, 0.5f, 2000.0f, 0.2f, 0.05f); return ToPcm(F, 0.4f, false); }
			if (Cue == "splash") { std::vector<float> F = Silence(0.8f); NoiseBurst(F, R, 0.0f, 0.7f, 3000.0f, 1.0f, 0.005f); return ToPcm(F, 0.55f, false); }
			if (Cue == "break") { std::vector<float> F = Silence(0.5f); for (int I = 0; I < 5; ++I) { NoiseBurst(F, R, I * 0.04f, 0.08f, 4000.0f, 0.8f, 0.0005f); } return ToPcm(F, 0.55f, false); }
			if (Cue == "fire") { std::vector<float> F = Silence(1.0f); NoiseBurst(F, R, 0.0f, 0.9f, 900.0f, 1.0f, 0.15f); return ToPcm(F, 0.5f, false); }
			if (Cue == "bow_draw") { std::vector<float> F = Silence(0.6f); Tone(F, 0.0f, 0.55f, 180.0f, 260.0f, 0.3f, 0.2f); NoiseBurst(F, R, 0.0f, 0.5f, 1500.0f, 0.2f, 0.3f); return ToPcm(F, 0.25f, false); }
			if (Cue == "bow_release") { std::vector<float> F = Silence(0.4f); Tone(F, 0.0f, 0.3f, 220.0f, 200.0f, 1.0f, 0.001f); NoiseBurst(F, R, 0.0f, 0.2f, 2500.0f, 0.4f); return ToPcm(F, 0.45f, false); }
			if (Cue == "cast") { std::vector<float> F = Silence(0.9f); NoiseBurst(F, R, 0.0f, 0.4f, 2000.0f, 0.5f, 0.1f); NoiseBurst(F, R, 0.7f, 0.15f, 3000.0f, 0.8f); return ToPcm(F, 0.35f, false); }
			if (Cue == "bite") { std::vector<float> F = Silence(0.3f); Tone(F, 0.0f, 0.15f, 300.0f, 900.0f, 0.8f, 0.001f); NoiseBurst(F, R, 0.0f, 0.15f, 3000.0f, 0.4f); return ToPcm(F, 0.5f, false); }
			if (Cue == "hook" || Cue == "catch") { std::vector<float> F = Silence(0.8f); Tone(F, 0.0f, 0.5f, 660.0f, 660.0f, 0.6f, 0.002f); Tone(F, 0.12f, 0.6f, 990.0f, 990.0f, 0.5f, 0.002f); if (Cue == "catch") { Tone(F, 0.24f, 0.6f, 1320.0f, 1320.0f, 0.4f, 0.002f); } return ToPcm(F, 0.35f, false); }
			if (Cue == "thunder")
			{
				std::vector<float> F = ColoredNoise(5.0f, R, 180.0f, 2);
				for (size_t I = 0; I < F.size(); ++I)
				{
					const float T = static_cast<float>(I) / SampleRate;
					F[I] *= Env(T, 0.08f, 1.6f) * (0.7f + 0.3f * std::sin(T * 9.0f + R.Range(0.0f, 0.01f)));
				}
				NoiseBurst(F, R, 0.0f, 0.3f, 4000.0f, 0.6f, 0.001f);
				return ToPcm(F, 0.9f, false);
			}
			if (Cue == "alarm") { std::vector<float> F = Silence(1.2f); for (int I = 0; I < 3; ++I) { Tone(F, I * 0.4f, 0.25f, 1000.0f, 1000.0f, 0.6f, 0.005f); } return ToPcm(F, 0.4f, false); }
			if (Cue == "crash")
			{
				std::vector<float> F = ColoredNoise(4.0f, R, 1200.0f, 1);
				for (size_t I = 0; I < F.size(); ++I) { F[I] *= Env(static_cast<float>(I) / SampleRate, 0.01f, 1.2f); }
				Tone(F, 0.0f, 2.0f, 60.0f, 30.0f, 1.0f, 0.01f);
				return ToPcm(F, 1.0f, false);
			}
			if (Cue == "bird")
			{
				std::vector<float> F = Silence(0.9f);
				const float Base = R.Range(2200.0f, 4200.0f);
				const int Notes = R.RangeInt(2, 5);
				for (int I = 0; I < Notes; ++I) { Tone(F, I * 0.15f, 0.12f, Base * R.Range(0.9f, 1.2f), Base * R.Range(1.1f, 1.5f), 0.7f, 0.01f); }
				return ToPcm(F, 0.3f, false);
			}
			if (Cue == "heartbeat") { std::vector<float> F = Silence(0.9f); Tone(F, 0.0f, 0.15f, 70.0f, 45.0f, 1.0f, 0.005f); Tone(F, 0.25f, 0.15f, 65.0f, 40.0f, 0.7f, 0.005f); return ToPcm(F, 0.6f, false); }
			std::vector<float> F = Silence(0.05f);
			NoiseBurst(F, R, 0.0f, 0.03f, 3000.0f, 1.0f);
			return ToPcm(F, 0.2f, false);
		}

		int32_t Peak(const Buffer& B)
		{
			int32_t P = 0;
			for (const int16_t S : B) { P = std::max<int32_t>(P, std::abs(static_cast<int32_t>(S))); }
			return P;
		}

		float DurationSeconds(const Buffer& B)
		{
			return static_cast<float>(B.size()) / static_cast<float>(SampleRate);
		}
	}
}
