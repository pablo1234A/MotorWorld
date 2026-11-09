// Island Untamed - Simulation Core
// Day/night cycle and dynamic weather state machine.
#pragma once

#include "SimCore.h"
#include "SimJson.h"

namespace IUSim
{
	enum class EDayPhase : uint8_t { Night, Dawn, Day, Dusk };
	enum class EWeather : uint8_t { Clear, Cloudy, Rain, Storm, Fog };

	const char* WeatherToString(EWeather W);
	const char* DayPhaseToString(EDayPhase P);

	/** Continuous weather parameters consumed by rendering/audio/survival. */
	struct WeatherParams
	{
		float CloudCover = 0.2f;   // 0..1
		float Rain = 0.0f;         // 0..1
		float Wind = 2.0f;         // m/s
		float Fog = 0.05f;         // 0..1
		float LightningChancePerSecond = 0.0f;
	};

	class WorldClock
	{
	public:
		/** Real minutes for a full 24h in-game day. */
		float DayLengthMinutes = 48.0f;
		float SunriseHour = 6.0f;
		float SunsetHour = 19.0f;

		void Reset(float StartHour, uint64_t Seed);

		/** Advances time by real seconds; returns elapsed game hours. */
		float Advance(float RealSeconds);
		/** Skips forward a number of game hours (sleeping). */
		void SkipHours(float Hours);

		float GetHour() const { return Hour; }
		int32_t GetDay() const { return Day; }
		/** Total elapsed game hours since the start of the game. */
		double GetTotalHours() const { return static_cast<double>(Day) * 24.0 + Hour; }
		EDayPhase GetPhase() const;
		bool IsNight() const { return GetPhase() == EDayPhase::Night; }
		/** 0 at night, 1 at noon. Smooth around sunrise/sunset. */
		float GetDaylight() const;
		/** Sun pitch in degrees (negative below horizon). */
		float GetSunElevationDeg() const;
		/** Sun azimuth in degrees (east=90 at sunrise, west=270 at sunset). */
		float GetSunAzimuthDeg() const;

		EWeather GetWeather() const { return Weather; }
		const WeatherParams& GetParams() const { return Current; }
		/** Diurnal + weather adjustment added to a biome's base temperature. */
		float GetTemperatureOffset() const;
		/** Forces a weather state (debug / scripted storm in the intro). */
		void ForceWeather(EWeather W, float DurationHours, bool bInstant);

		float GameHoursPerRealSecond() const { return 24.0f / (DayLengthMinutes * 60.0f); }

		JsonValue ToJson() const;
		void FromJson(const JsonValue& J);

	private:
		void TickWeather(float GameHours);
		void PickNextWeather();
		static WeatherParams TargetFor(EWeather W);

		float Hour = 7.0f;
		int32_t Day = 0;
		EWeather Weather = EWeather::Clear;
		float WeatherHoursLeft = 6.0f;
		WeatherParams Current;
		Rng Random;
	};
}
