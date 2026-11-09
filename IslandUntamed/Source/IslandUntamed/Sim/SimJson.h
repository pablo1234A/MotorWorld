// Island Untamed - Simulation Core
// Minimal, dependency-free JSON DOM used for data definitions (Content/Data/*.json)
// and for the save-game payload. Objects keep insertion order so that saves are
// deterministic and diff-friendly.
#pragma once

#include <cstdint>
#include <string>
#include <utility>
#include <vector>

namespace IUSim
{
	class JsonValue
	{
	public:
		enum class EType : uint8_t { Null, Bool, Number, String, Array, Object };

		JsonValue() = default;
		static JsonValue MakeNull() { return JsonValue(); }
		static JsonValue MakeBool(bool B) { JsonValue V; V.Type = EType::Bool; V.BoolValue = B; return V; }
		static JsonValue MakeNumber(double D) { JsonValue V; V.Type = EType::Number; V.NumberValue = D; return V; }
		static JsonValue MakeString(std::string S) { JsonValue V; V.Type = EType::String; V.StringValue = std::move(S); return V; }
		static JsonValue MakeArray() { JsonValue V; V.Type = EType::Array; return V; }
		static JsonValue MakeObject() { JsonValue V; V.Type = EType::Object; return V; }

		EType GetType() const { return Type; }
		bool IsNull() const { return Type == EType::Null; }
		bool IsBool() const { return Type == EType::Bool; }
		bool IsNumber() const { return Type == EType::Number; }
		bool IsString() const { return Type == EType::String; }
		bool IsArray() const { return Type == EType::Array; }
		bool IsObject() const { return Type == EType::Object; }

		bool AsBool(bool Default = false) const { return Type == EType::Bool ? BoolValue : Default; }
		double AsNumber(double Default = 0.0) const { return Type == EType::Number ? NumberValue : Default; }
		float AsFloat(float Default = 0.0f) const { return Type == EType::Number ? static_cast<float>(NumberValue) : Default; }
		int32_t AsInt(int32_t Default = 0) const { return Type == EType::Number ? static_cast<int32_t>(NumberValue) : Default; }
		const std::string& AsString() const { return StringValue; }

		// ---- Array API
		const std::vector<JsonValue>& Items() const { return ArrayValue; }
		std::vector<JsonValue>& Items() { return ArrayValue; }
		void Push(JsonValue V) { if (Type == EType::Null) { Type = EType::Array; } ArrayValue.push_back(std::move(V)); }
		size_t Size() const { return Type == EType::Array ? ArrayValue.size() : (Type == EType::Object ? ObjectValue.size() : 0); }

		// ---- Object API (ordered)
		const std::vector<std::pair<std::string, JsonValue>>& Members() const { return ObjectValue; }
		const JsonValue* Find(const std::string& Key) const;
		JsonValue* Find(const std::string& Key);
		bool Has(const std::string& Key) const { return Find(Key) != nullptr; }
		/** Inserts or replaces a member. */
		JsonValue& Set(const std::string& Key, JsonValue V);
		const JsonValue& operator[](const std::string& Key) const;

		// ---- Convenience getters with defaults
		double GetNumber(const std::string& Key, double Default = 0.0) const;
		float GetFloat(const std::string& Key, float Default = 0.0f) const { return static_cast<float>(GetNumber(Key, Default)); }
		int32_t GetInt(const std::string& Key, int32_t Default = 0) const { return static_cast<int32_t>(GetNumber(Key, Default)); }
		bool GetBool(const std::string& Key, bool Default = false) const;
		std::string GetString(const std::string& Key, const std::string& Default = std::string()) const;
		std::vector<std::string> GetStringArray(const std::string& Key) const;

		// ---- Serialization
		std::string Dump(bool bPretty = false) const;

		/** Parses text. Returns false and fills OutError (with line number) on failure. */
		static bool Parse(const std::string& Text, JsonValue& OutValue, std::string& OutError);

	private:
		void DumpInto(std::string& Out, bool bPretty, int Indent) const;

		EType Type = EType::Null;
		bool BoolValue = false;
		double NumberValue = 0.0;
		std::string StringValue;
		std::vector<JsonValue> ArrayValue;
		std::vector<std::pair<std::string, JsonValue>> ObjectValue;
	};
}
