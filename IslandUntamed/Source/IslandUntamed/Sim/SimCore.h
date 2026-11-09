// Island Untamed - Simulation Core
// -----------------------------------------------------------------------------
// Engine-agnostic primitives shared by every rules system (math, RNG, hashing).
//
// The whole Sim/ folder is deliberately free of Unreal headers so that the
// gameplay rules can be compiled and unit-tested headless (see /Tests) and so
// that a dedicated server or tools can reuse them. Unreal-side wrappers live in
// the gameplay folders and convert FName/FVector <-> std::string/Vec3.
//
// Rules for code in this folder (Unreal compatibility):
//   * No exceptions, no RTTI.
//   * Do not use identifiers that collide with Unreal macros (PI, check,
//     verify, ensure, TEXT ...).
//   * Every .cpp must be unity-build safe: helpers live in uniquely named
//     namespaces, never in anonymous namespaces with common names.
// -----------------------------------------------------------------------------
#pragma once

#include <cmath>
#include <cstdint>
#include <string>
#include <vector>
#include <algorithm>

namespace IUSim
{
	constexpr float kPi = 3.14159265358979323846f;
	constexpr float kDegToRad = kPi / 180.0f;
	constexpr float kRadToDeg = 180.0f / kPi;

	inline float Clampf(float V, float Lo, float Hi) { return V < Lo ? Lo : (V > Hi ? Hi : V); }
	inline float Clamp01(float V) { return Clampf(V, 0.0f, 1.0f); }
	inline float Lerpf(float A, float B, float T) { return A + (B - A) * T; }
	inline float SmoothStep(float Edge0, float Edge1, float V)
	{
		const float T = Clamp01((V - Edge0) / (Edge1 - Edge0));
		return T * T * (3.0f - 2.0f * T);
	}
	/** Moves Current toward Target by at most MaxDelta. */
	inline float MoveToward(float Current, float Target, float MaxDelta)
	{
		if (std::fabs(Target - Current) <= MaxDelta) { return Target; }
		return Current + (Target > Current ? MaxDelta : -MaxDelta);
	}

	struct Vec2
	{
		float X = 0.0f;
		float Y = 0.0f;

		Vec2() = default;
		Vec2(float InX, float InY) : X(InX), Y(InY) {}

		Vec2 operator+(const Vec2& O) const { return Vec2(X + O.X, Y + O.Y); }
		Vec2 operator-(const Vec2& O) const { return Vec2(X - O.X, Y - O.Y); }
		Vec2 operator*(float S) const { return Vec2(X * S, Y * S); }
		float Length() const { return std::sqrt(X * X + Y * Y); }
		float Dot(const Vec2& O) const { return X * O.X + Y * O.Y; }
		Vec2 Normalized() const
		{
			const float L = Length();
			return L > 1e-6f ? Vec2(X / L, Y / L) : Vec2();
		}
	};

	struct Vec3
	{
		float X = 0.0f;
		float Y = 0.0f;
		float Z = 0.0f;

		Vec3() = default;
		Vec3(float InX, float InY, float InZ) : X(InX), Y(InY), Z(InZ) {}

		Vec3 operator+(const Vec3& O) const { return Vec3(X + O.X, Y + O.Y, Z + O.Z); }
		Vec3 operator-(const Vec3& O) const { return Vec3(X - O.X, Y - O.Y, Z - O.Z); }
		Vec3 operator*(float S) const { return Vec3(X * S, Y * S, Z * S); }
		float Length() const { return std::sqrt(X * X + Y * Y + Z * Z); }
		float Dot(const Vec3& O) const { return X * O.X + Y * O.Y + Z * O.Z; }
		Vec3 Cross(const Vec3& O) const { return Vec3(Y * O.Z - Z * O.Y, Z * O.X - X * O.Z, X * O.Y - Y * O.X); }
		Vec3 Normalized() const
		{
			const float L = Length();
			return L > 1e-6f ? Vec3(X / L, Y / L, Z / L) : Vec3();
		}
		Vec2 XY() const { return Vec2(X, Y); }
	};

	/** 32-bit integer hash (lowbias32). Deterministic across platforms. */
	inline uint32_t HashU32(uint32_t V)
	{
		V ^= V >> 16; V *= 0x7feb352dU;
		V ^= V >> 15; V *= 0x846ca68bU;
		V ^= V >> 16;
		return V;
	}
	inline uint32_t HashCombine(uint32_t A, uint32_t B) { return HashU32(A ^ (B + 0x9e3779b9U + (A << 6) + (A >> 2))); }
	inline uint32_t Hash2D(int32_t X, int32_t Y, uint32_t Seed)
	{
		return HashCombine(HashCombine(Seed, static_cast<uint32_t>(X)), static_cast<uint32_t>(Y));
	}
	inline uint32_t HashString(const std::string& S)
	{
		uint32_t H = 2166136261U; // FNV-1a
		for (const char C : S) { H ^= static_cast<uint8_t>(C); H *= 16777619U; }
		return H;
	}

	/** Small, fast, deterministic PCG32 random generator. */
	class Rng
	{
	public:
		explicit Rng(uint64_t InSeed = 0x853c49e6748fea9bULL) { Seed(InSeed); }

		void Seed(uint64_t InSeed)
		{
			State = 0U;
			Inc = (InSeed << 1U) | 1U;
			NextU32();
			State += InSeed;
			NextU32();
		}

		uint32_t NextU32()
		{
			const uint64_t Old = State;
			State = Old * 6364136223846793005ULL + Inc;
			const uint32_t XorShifted = static_cast<uint32_t>(((Old >> 18U) ^ Old) >> 27U);
			const uint32_t Rot = static_cast<uint32_t>(Old >> 59U);
			return (XorShifted >> Rot) | (XorShifted << ((~Rot + 1U) & 31U));
		}

		/** Uniform float in [0,1). */
		float NextFloat() { return static_cast<float>(NextU32() >> 8) * (1.0f / 16777216.0f); }
		float Range(float Lo, float Hi) { return Lo + (Hi - Lo) * NextFloat(); }
		/** Uniform int in [Lo, Hi] inclusive. */
		int32_t RangeInt(int32_t Lo, int32_t Hi)
		{
			if (Hi <= Lo) { return Lo; }
			const uint32_t Span = static_cast<uint32_t>(Hi - Lo) + 1U;
			return Lo + static_cast<int32_t>(NextU32() % Span);
		}
		bool Chance(float P) { return NextFloat() < P; }

		uint64_t GetState() const { return State; }
		uint64_t GetInc() const { return Inc; }
		void SetRawState(uint64_t InState, uint64_t InInc) { State = InState; Inc = InInc | 1U; }

	private:
		uint64_t State = 0;
		uint64_t Inc = 0;
	};

	/** Splits "a,b,c" style strings. */
	inline std::vector<std::string> SplitString(const std::string& S, char Delim)
	{
		std::vector<std::string> Out;
		std::string Cur;
		for (const char C : S)
		{
			if (C == Delim) { Out.push_back(Cur); Cur.clear(); }
			else { Cur.push_back(C); }
		}
		Out.push_back(Cur);
		return Out;
	}
}
