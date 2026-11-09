#include "SimWorldClock.h"

#include <cstdlib>

namespace IUSim
{
	const char* WeatherToString(EWeather W)
	{
		switch (W)
		{
		case EWeather::Clear: return "Despejado";
		case EWeather::Cloudy: return "Nublado";
		case EWeather::Rain: return "Lluvia";
		case EWeather::Storm: return "Tormenta";
		case EWeather::Fog: return "Niebla";
		}
		return "";
	}

	const char* DayPhaseToString(EDayPhase P)
	{
		switch (P)
		{
		case EDayPhase::Night: return "Noche";
		case EDayPhase::Dawn: return "Amanecer";
		case EDayPhase::Day: return "Dia";
		case EDayPhase::Dusk: return "Atardecer";
		}
		return "";
	}

	void WorldClock::Reset(float StartHour, uint64_t Seed)
	{
		Hour = StartHour;
		Day = 0;
		Random.Seed(Seed);
		Weather = EWeather::Clear;
		WeatherHoursLeft = 6.0f;
		Current = TargetFor(Weather);
	}

	float WorldClock::Advance(float RealSeconds)
	{
		const float Hours = RealSeconds * GameHoursPerRealSecond();
		SkipHours(Hours);
		return Hours;
	}

	void WorldClock::SkipHours(float Hours)
	{
		if (Hours <= 0.0f) { return; }
		// Weather is integrated in steps so long sleeps still produce varied weather.
		float Remaining = Hours;
		while (Remaining > 0.0f)
		{
			const float Step = std::min(Remaining, 0.25f);
			Hour += Step;
			while (Hour >= 24.0f) { Hour -= 24.0f; ++Day; }
			TickWeather(Step);
			Remaining -= Step;
		}
	}

	EDayPhase WorldClock::GetPhase() const
	{
		if (Hour >= SunriseHour - 1.0f && Hour < SunriseHour + 1.0f) { return EDayPhase::Dawn; }
		if (Hour >= SunriseHour + 1.0f && Hour < SunsetHour - 1.0f) { return EDayPhase::Day; }
		if (Hour >= SunsetHour - 1.0f && Hour < SunsetHour + 1.0f) { return EDayPhase::Dusk; }
		return EDayPhase::Night;
	}

	float WorldClock::GetSunElevationDeg() const
	{
		// Map sunrise..sunset to 0..180 degrees of arc, the rest of the day below the horizon.
		const float DayLen = SunsetHour - SunriseHour;
		if (Hour >= SunriseHour && Hour <= SunsetHour)
		{
			const float T = (Hour - SunriseHour) / DayLen;
			return std::sin(T * kPi) * 75.0f; // tropical: high noon sun
		}
		const float NightLen = 24.0f - DayLen;
		float SinceSunset = Hour - SunsetHour;
		if (SinceSunset < 0.0f) { SinceSunset += 24.0f; }
		const float T = SinceSunset / NightLen;
		return -std::sin(T * kPi) * 60.0f;
	}

	float WorldClock::GetSunAzimuthDeg() const
	{
		float T = (Hour - SunriseHour) / 24.0f;
		if (T < 0.0f) { T += 1.0f; }
		return 90.0f + T * 360.0f;
	}

	float WorldClock::GetDaylight() const
	{
		return SmoothStep(-6.0f, 12.0f, GetSunElevationDeg());
	}

	float WorldClock::GetTemperatureOffset() const
	{
		// Coldest ~5am, warmest ~15h, amplitude +-5C.
		const float Diurnal = std::cos((Hour - 15.0f) / 24.0f * 2.0f * kPi) * 5.0f;
		return Diurnal - Current.Rain * 4.0f - Current.CloudCover * 1.5f;
	}

	void WorldClock::ForceWeather(EWeather W, float DurationHours, bool bInstant)
	{
		Weather = W;
		WeatherHoursLeft = DurationHours;
		if (bInstant) { Current = TargetFor(W); }
	}

	WeatherParams WorldClock::TargetFor(EWeather W)
	{
		WeatherParams P;
		switch (W)
		{
		case EWeather::Clear: P.CloudCover = 0.15f; P.Rain = 0.0f; P.Wind = 2.0f; P.Fog = 0.03f; break;
		case EWeather::Cloudy: P.CloudCover = 0.65f; P.Rain = 0.0f; P.Wind = 4.0f; P.Fog = 0.06f; break;
		case EWeather::Rain: P.CloudCover = 0.9f; P.Rain = 0.55f; P.Wind = 6.0f; P.Fog = 0.12f; break;
		case EWeather::Storm: P.CloudCover = 1.0f; P.Rain = 1.0f; P.Wind = 14.0f; P.Fog = 0.18f; P.LightningChancePerSecond = 0.08f; break;
		case EWeather::Fog: P.CloudCover = 0.5f; P.Rain = 0.0f; P.Wind = 1.0f; P.Fog = 0.6f; break;
		}
		return P;
	}

	void WorldClock::PickNextWeather()
	{
		// Markov transition table (rows sum to 1): Clear, Cloudy, Rain, Storm, Fog
		static const float Table[5][5] = {
			{ 0.45f, 0.35f, 0.08f, 0.02f, 0.10f }, // from Clear
			{ 0.35f, 0.25f, 0.28f, 0.07f, 0.05f }, // from Cloudy
			{ 0.15f, 0.40f, 0.25f, 0.15f, 0.05f }, // from Rain
			{ 0.05f, 0.30f, 0.55f, 0.10f, 0.00f }, // from Storm
			{ 0.55f, 0.35f, 0.05f, 0.00f, 0.05f }, // from Fog
		};
		const int From = static_cast<int>(Weather);
		float Roll = Random.NextFloat();
		int Next = 0;
		for (int I = 0; I < 5; ++I)
		{
			Roll -= Table[From][I];
			if (Roll <= 0.0f) { Next = I; break; }
			Next = I;
		}
		EWeather NewWeather = static_cast<EWeather>(Next);
		// Fog only forms around dawn/night.
		if (NewWeather == EWeather::Fog && GetPhase() == EDayPhase::Day) { NewWeather = EWeather::Cloudy; }
		Weather = NewWeather;
		switch (Weather)
		{
		case EWeather::Storm: WeatherHoursLeft = Random.Range(1.5f, 4.0f); break;
		case EWeather::Rain: WeatherHoursLeft = Random.Range(2.0f, 6.0f); break;
		case EWeather::Fog: WeatherHoursLeft = Random.Range(1.5f, 3.5f); break;
		default: WeatherHoursLeft = Random.Range(4.0f, 10.0f); break;
		}
	}

	void WorldClock::TickWeather(float GameHours)
	{
		WeatherHoursLeft -= GameHours;
		if (WeatherHoursLeft <= 0.0f) { PickNextWeather(); }
		const WeatherParams Target = TargetFor(Weather);
		const float Rate = 0.8f * GameHours; // ~1.25h for a full transition
		Current.CloudCover = MoveToward(Current.CloudCover, Target.CloudCover, Rate);
		Current.Rain = MoveToward(Current.Rain, Target.Rain, Rate);
		Current.Fog = MoveToward(Current.Fog, Target.Fog, Rate);
		Current.Wind = MoveToward(Current.Wind, Target.Wind, Rate * 10.0f);
		Current.LightningChancePerSecond = Target.LightningChancePerSecond * Clamp01(Current.Rain);
	}

	JsonValue WorldClock::ToJson() const
	{
		JsonValue J = JsonValue::MakeObject();
		J.Set("hour", JsonValue::MakeNumber(Hour));
		J.Set("day", JsonValue::MakeNumber(Day));
		J.Set("weather", JsonValue::MakeNumber(static_cast<int>(Weather)));
		J.Set("weather_left", JsonValue::MakeNumber(WeatherHoursLeft));
		J.Set("cloud", JsonValue::MakeNumber(Current.CloudCover));
		J.Set("rain", JsonValue::MakeNumber(Current.Rain));
		J.Set("wind", JsonValue::MakeNumber(Current.Wind));
		J.Set("fog", JsonValue::MakeNumber(Current.Fog));
		// RNG state stored as strings to avoid double precision loss on 64-bit values.
		J.Set("rng_s", JsonValue::MakeString(std::to_string(Random.GetState())));
		J.Set("rng_i", JsonValue::MakeString(std::to_string(Random.GetInc())));
		return J;
	}

	void WorldClock::FromJson(const JsonValue& J)
	{
		Hour = J.GetFloat("hour", 7.0f);
		Day = J.GetInt("day", 0);
		const int W = J.GetInt("weather", 0);
		Weather = static_cast<EWeather>(W >= 0 && W <= 4 ? W : 0);
		WeatherHoursLeft = J.GetFloat("weather_left", 4.0f);
		Current.CloudCover = J.GetFloat("cloud", 0.2f);
		Current.Rain = J.GetFloat("rain", 0.0f);
		Current.Wind = J.GetFloat("wind", 2.0f);
		Current.Fog = J.GetFloat("fog", 0.05f);
		Current.LightningChancePerSecond = TargetFor(Weather).LightningChancePerSecond * Current.Rain;
		const std::string S = J.GetString("rng_s");
		const std::string I = J.GetString("rng_i");
		if (!S.empty() && !I.empty())
		{
			Random.SetRawState(std::strtoull(S.c_str(), nullptr, 10), std::strtoull(I.c_str(), nullptr, 10));
		}
	}
}
