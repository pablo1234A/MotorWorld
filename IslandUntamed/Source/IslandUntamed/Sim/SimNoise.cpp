#include "SimNoise.h"

namespace IUSim
{
	namespace NoiseDetail
	{
		inline float Fade(float T) { return T * T * T * (T * (T * 6.0f - 15.0f) + 10.0f); }
		inline int32_t FastFloor(float V) { const int32_t I = static_cast<int32_t>(V); return V < static_cast<float>(I) ? I - 1 : I; }
	}

	float Noise2D::Grad(int32_t IX, int32_t IY, float DX, float DY) const
	{
		const uint32_t H = Hash2D(IX, IY, Seed);
		// 8 gradient directions.
		switch (H & 7U)
		{
		case 0: return DX + DY;
		case 1: return -DX + DY;
		case 2: return DX - DY;
		case 3: return -DX - DY;
		case 4: return DX;
		case 5: return -DX;
		case 6: return DY;
		default: return -DY;
		}
	}

	float Noise2D::Perlin(float X, float Y) const
	{
		const int32_t X0 = NoiseDetail::FastFloor(X);
		const int32_t Y0 = NoiseDetail::FastFloor(Y);
		const float FX = X - static_cast<float>(X0);
		const float FY = Y - static_cast<float>(Y0);
		const float U = NoiseDetail::Fade(FX);
		const float V = NoiseDetail::Fade(FY);
		const float N00 = Grad(X0, Y0, FX, FY);
		const float N10 = Grad(X0 + 1, Y0, FX - 1.0f, FY);
		const float N01 = Grad(X0, Y0 + 1, FX, FY - 1.0f);
		const float N11 = Grad(X0 + 1, Y0 + 1, FX - 1.0f, FY - 1.0f);
		const float NX0 = Lerpf(N00, N10, U);
		const float NX1 = Lerpf(N01, N11, U);
		return Clampf(Lerpf(NX0, NX1, V) * 0.9f, -1.0f, 1.0f);
	}

	float Noise2D::Fbm(float X, float Y, int Octaves, float Lacunarity, float Gain) const
	{
		float Sum = 0.0f;
		float Amp = 1.0f;
		float Freq = 1.0f;
		float Norm = 0.0f;
		for (int I = 0; I < Octaves; ++I)
		{
			// Offset each octave to avoid the lattice-origin artifact.
			Sum += Perlin(X * Freq + static_cast<float>(I) * 17.31f, Y * Freq - static_cast<float>(I) * 9.73f) * Amp;
			Norm += Amp;
			Amp *= Gain;
			Freq *= Lacunarity;
		}
		return Norm > 0.0f ? Sum / Norm : 0.0f;
	}

	float Noise2D::Ridged(float X, float Y, int Octaves) const
	{
		float Sum = 0.0f;
		float Amp = 0.5f;
		float Freq = 1.0f;
		float Prev = 1.0f;
		float Norm = 0.0f;
		for (int I = 0; I < Octaves; ++I)
		{
			float N = 1.0f - std::fabs(Perlin(X * Freq + 31.7f * static_cast<float>(I), Y * Freq));
			N *= N;
			Sum += N * Amp * Prev;
			Norm += Amp;
			Prev = N;
			Amp *= 0.5f;
			Freq *= 2.0f;
		}
		return Norm > 0.0f ? Clamp01(Sum / Norm) : 0.0f;
	}

	float Noise2D::Warped(float X, float Y, int Octaves, float WarpStrength) const
	{
		const float WX = Fbm(X + 5.2f, Y + 1.3f, 3);
		const float WY = Fbm(X - 7.7f, Y + 9.1f, 3);
		return Fbm(X + WX * WarpStrength, Y + WY * WarpStrength, Octaves);
	}
}
