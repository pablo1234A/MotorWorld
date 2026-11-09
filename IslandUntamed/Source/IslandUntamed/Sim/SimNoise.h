// Island Untamed - Simulation Core
// Deterministic 2D gradient noise + fractal helpers for world generation.
#pragma once

#include "SimCore.h"

namespace IUSim
{
	class Noise2D
	{
	public:
		explicit Noise2D(uint32_t InSeed = 1337U) : Seed(InSeed) {}

		/** Gradient noise in [-1,1]. */
		float Perlin(float X, float Y) const;
		/** Fractal Brownian motion in roughly [-1,1]. */
		float Fbm(float X, float Y, int Octaves, float Lacunarity = 2.0f, float Gain = 0.5f) const;
		/** Ridged multifractal in [0,1] (mountain ridges). */
		float Ridged(float X, float Y, int Octaves) const;
		/** Domain-warped fbm for organic coastlines. */
		float Warped(float X, float Y, int Octaves, float WarpStrength) const;

	private:
		float Grad(int32_t IX, int32_t IY, float DX, float DY) const;
		uint32_t Seed;
	};
}
