#include "SimJson.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>

namespace IUSim
{
	namespace JsonParserDetail
	{
		const JsonValue& NullSentinel()
		{
			static const JsonValue Null;
			return Null;
		}

		class Parser
		{
		public:
			explicit Parser(const std::string& InText) : Text(InText) {}

			bool Run(JsonValue& Out, std::string& OutError)
			{
				SkipWs();
				if (!ParseValue(Out, 0)) { OutError = Error; return false; }
				SkipWs();
				if (Pos != Text.size()) { Fail("Unexpected trailing characters"); OutError = Error; return false; }
				return true;
			}

		private:
			const std::string& Text;
			size_t Pos = 0;
			std::string Error;

			bool Fail(const char* Msg)
			{
				if (Error.empty())
				{
					int Line = 1;
					for (size_t I = 0; I < Pos && I < Text.size(); ++I) { if (Text[I] == '\n') { ++Line; } }
					Error = std::string(Msg) + " (line " + std::to_string(Line) + ")";
				}
				return false;
			}

			void SkipWs()
			{
				while (Pos < Text.size())
				{
					const char C = Text[Pos];
					if (C == ' ' || C == '\t' || C == '\n' || C == '\r') { ++Pos; continue; }
					// Allow // line comments in data files (non-standard but designer friendly).
					if (C == '/' && Pos + 1 < Text.size() && Text[Pos + 1] == '/')
					{
						while (Pos < Text.size() && Text[Pos] != '\n') { ++Pos; }
						continue;
					}
					break;
				}
			}

			bool ParseValue(JsonValue& Out, int Depth)
			{
				if (Depth > 128) { return Fail("JSON nested too deeply"); }
				if (Pos >= Text.size()) { return Fail("Unexpected end of input"); }
				const char C = Text[Pos];
				if (C == '{') { return ParseObject(Out, Depth); }
				if (C == '[') { return ParseArray(Out, Depth); }
				if (C == '"')
				{
					std::string S;
					if (!ParseString(S)) { return false; }
					Out = JsonValue::MakeString(std::move(S));
					return true;
				}
				if (C == 't' && Text.compare(Pos, 4, "true") == 0) { Pos += 4; Out = JsonValue::MakeBool(true); return true; }
				if (C == 'f' && Text.compare(Pos, 5, "false") == 0) { Pos += 5; Out = JsonValue::MakeBool(false); return true; }
				if (C == 'n' && Text.compare(Pos, 4, "null") == 0) { Pos += 4; Out = JsonValue::MakeNull(); return true; }
				if (C == '-' || (C >= '0' && C <= '9')) { return ParseNumber(Out); }
				return Fail("Unexpected character");
			}

			bool ParseNumber(JsonValue& Out)
			{
				const size_t Start = Pos;
				if (Text[Pos] == '-') { ++Pos; }
				while (Pos < Text.size())
				{
					const char C = Text[Pos];
					if ((C >= '0' && C <= '9') || C == '.' || C == 'e' || C == 'E' || C == '+' || C == '-') { ++Pos; }
					else { break; }
				}
				const std::string Slice = Text.substr(Start, Pos - Start);
				char* End = nullptr;
				const double D = std::strtod(Slice.c_str(), &End);
				if (End == Slice.c_str() || *End != '\0') { return Fail("Invalid number"); }
				Out = JsonValue::MakeNumber(D);
				return true;
			}

			static void AppendUtf8(std::string& S, uint32_t Cp)
			{
				if (Cp < 0x80) { S.push_back(static_cast<char>(Cp)); }
				else if (Cp < 0x800)
				{
					S.push_back(static_cast<char>(0xC0 | (Cp >> 6)));
					S.push_back(static_cast<char>(0x80 | (Cp & 0x3F)));
				}
				else if (Cp < 0x10000)
				{
					S.push_back(static_cast<char>(0xE0 | (Cp >> 12)));
					S.push_back(static_cast<char>(0x80 | ((Cp >> 6) & 0x3F)));
					S.push_back(static_cast<char>(0x80 | (Cp & 0x3F)));
				}
				else
				{
					S.push_back(static_cast<char>(0xF0 | (Cp >> 18)));
					S.push_back(static_cast<char>(0x80 | ((Cp >> 12) & 0x3F)));
					S.push_back(static_cast<char>(0x80 | ((Cp >> 6) & 0x3F)));
					S.push_back(static_cast<char>(0x80 | (Cp & 0x3F)));
				}
			}

			bool ParseHex4(uint32_t& Out)
			{
				if (Pos + 4 > Text.size()) { return Fail("Bad unicode escape"); }
				Out = 0;
				for (int I = 0; I < 4; ++I)
				{
					const char C = Text[Pos++];
					Out <<= 4;
					if (C >= '0' && C <= '9') { Out |= static_cast<uint32_t>(C - '0'); }
					else if (C >= 'a' && C <= 'f') { Out |= static_cast<uint32_t>(C - 'a' + 10); }
					else if (C >= 'A' && C <= 'F') { Out |= static_cast<uint32_t>(C - 'A' + 10); }
					else { return Fail("Bad unicode escape"); }
				}
				return true;
			}

			bool ParseString(std::string& Out)
			{
				++Pos; // opening quote
				while (Pos < Text.size())
				{
					const char C = Text[Pos++];
					if (C == '"') { return true; }
					if (C == '\\')
					{
						if (Pos >= Text.size()) { break; }
						const char E = Text[Pos++];
						switch (E)
						{
						case '"': Out.push_back('"'); break;
						case '\\': Out.push_back('\\'); break;
						case '/': Out.push_back('/'); break;
						case 'b': Out.push_back('\b'); break;
						case 'f': Out.push_back('\f'); break;
						case 'n': Out.push_back('\n'); break;
						case 'r': Out.push_back('\r'); break;
						case 't': Out.push_back('\t'); break;
						case 'u':
						{
							uint32_t Cp = 0;
							if (!ParseHex4(Cp)) { return false; }
							if (Cp >= 0xD800 && Cp <= 0xDBFF && Pos + 6 <= Text.size() && Text[Pos] == '\\' && Text[Pos + 1] == 'u')
							{
								Pos += 2;
								uint32_t Lo = 0;
								if (!ParseHex4(Lo)) { return false; }
								Cp = 0x10000 + ((Cp - 0xD800) << 10) + (Lo - 0xDC00);
							}
							AppendUtf8(Out, Cp);
							break;
						}
						default: return Fail("Bad escape sequence");
						}
					}
					else
					{
						Out.push_back(C);
					}
				}
				return Fail("Unterminated string");
			}

			bool ParseArray(JsonValue& Out, int Depth)
			{
				++Pos;
				Out = JsonValue::MakeArray();
				SkipWs();
				if (Pos < Text.size() && Text[Pos] == ']') { ++Pos; return true; }
				while (true)
				{
					SkipWs();
					JsonValue Elem;
					if (!ParseValue(Elem, Depth + 1)) { return false; }
					Out.Push(std::move(Elem));
					SkipWs();
					if (Pos >= Text.size()) { return Fail("Unterminated array"); }
					if (Text[Pos] == ',')
					{
						++Pos;
						SkipWs();
						if (Pos < Text.size() && Text[Pos] == ']') { ++Pos; return true; } // trailing comma tolerated
						continue;
					}
					if (Text[Pos] == ']') { ++Pos; return true; }
					return Fail("Expected ',' or ']'");
				}
			}

			bool ParseObject(JsonValue& Out, int Depth)
			{
				++Pos;
				Out = JsonValue::MakeObject();
				SkipWs();
				if (Pos < Text.size() && Text[Pos] == '}') { ++Pos; return true; }
				while (true)
				{
					SkipWs();
					if (Pos >= Text.size() || Text[Pos] != '"') { return Fail("Expected object key"); }
					std::string Key;
					if (!ParseString(Key)) { return false; }
					SkipWs();
					if (Pos >= Text.size() || Text[Pos] != ':') { return Fail("Expected ':'"); }
					++Pos;
					SkipWs();
					JsonValue Member;
					if (!ParseValue(Member, Depth + 1)) { return false; }
					Out.Set(Key, std::move(Member));
					SkipWs();
					if (Pos >= Text.size()) { return Fail("Unterminated object"); }
					if (Text[Pos] == ',')
					{
						++Pos;
						SkipWs();
						if (Pos < Text.size() && Text[Pos] == '}') { ++Pos; return true; }
						continue;
					}
					if (Text[Pos] == '}') { ++Pos; return true; }
					return Fail("Expected ',' or '}'");
				}
			}
		};

		void EscapeInto(std::string& Out, const std::string& S)
		{
			Out.push_back('"');
			for (const char C : S)
			{
				switch (C)
				{
				case '"': Out += "\\\""; break;
				case '\\': Out += "\\\\"; break;
				case '\n': Out += "\\n"; break;
				case '\r': Out += "\\r"; break;
				case '\t': Out += "\\t"; break;
				case '\b': Out += "\\b"; break;
				case '\f': Out += "\\f"; break;
				default:
					if (static_cast<unsigned char>(C) < 0x20)
					{
						char Buf[8];
						std::snprintf(Buf, sizeof(Buf), "\\u%04x", static_cast<unsigned>(static_cast<unsigned char>(C)));
						Out += Buf;
					}
					else
					{
						Out.push_back(C);
					}
				}
			}
			Out.push_back('"');
		}

		void NumberInto(std::string& Out, double D)
		{
			if (!std::isfinite(D)) { Out += "0"; return; }
			const double Rounded = std::floor(D);
			if (Rounded == D && std::fabs(D) < 9.0e15)
			{
				Out += std::to_string(static_cast<long long>(D));
				return;
			}
			char Buf[40];
			std::snprintf(Buf, sizeof(Buf), "%.9g", D);
			Out += Buf;
		}
	}

	const JsonValue* JsonValue::Find(const std::string& Key) const
	{
		if (Type != EType::Object) { return nullptr; }
		for (const auto& Pair : ObjectValue) { if (Pair.first == Key) { return &Pair.second; } }
		return nullptr;
	}

	JsonValue* JsonValue::Find(const std::string& Key)
	{
		if (Type != EType::Object) { return nullptr; }
		for (auto& Pair : ObjectValue) { if (Pair.first == Key) { return &Pair.second; } }
		return nullptr;
	}

	JsonValue& JsonValue::Set(const std::string& Key, JsonValue V)
	{
		if (Type == EType::Null) { Type = EType::Object; }
		if (JsonValue* Existing = Find(Key))
		{
			*Existing = std::move(V);
			return *Existing;
		}
		ObjectValue.emplace_back(Key, std::move(V));
		return ObjectValue.back().second;
	}

	const JsonValue& JsonValue::operator[](const std::string& Key) const
	{
		const JsonValue* V = Find(Key);
		return V ? *V : JsonParserDetail::NullSentinel();
	}

	double JsonValue::GetNumber(const std::string& Key, double Default) const
	{
		const JsonValue* V = Find(Key);
		return (V && V->IsNumber()) ? V->NumberValue : Default;
	}

	bool JsonValue::GetBool(const std::string& Key, bool Default) const
	{
		const JsonValue* V = Find(Key);
		return (V && V->IsBool()) ? V->BoolValue : Default;
	}

	std::string JsonValue::GetString(const std::string& Key, const std::string& Default) const
	{
		const JsonValue* V = Find(Key);
		return (V && V->IsString()) ? V->StringValue : Default;
	}

	std::vector<std::string> JsonValue::GetStringArray(const std::string& Key) const
	{
		std::vector<std::string> Out;
		const JsonValue* V = Find(Key);
		if (V && V->IsArray())
		{
			for (const JsonValue& E : V->ArrayValue) { if (E.IsString()) { Out.push_back(E.StringValue); } }
		}
		return Out;
	}

	std::string JsonValue::Dump(bool bPretty) const
	{
		std::string Out;
		DumpInto(Out, bPretty, 0);
		return Out;
	}

	void JsonValue::DumpInto(std::string& Out, bool bPretty, int Indent) const
	{
		const auto NewLine = [&Out, bPretty](int Level)
		{
			if (!bPretty) { return; }
			Out.push_back('\n');
			Out.append(static_cast<size_t>(Level) * 2, ' ');
		};

		switch (Type)
		{
		case EType::Null: Out += "null"; break;
		case EType::Bool: Out += BoolValue ? "true" : "false"; break;
		case EType::Number: JsonParserDetail::NumberInto(Out, NumberValue); break;
		case EType::String: JsonParserDetail::EscapeInto(Out, StringValue); break;
		case EType::Array:
			Out.push_back('[');
			for (size_t I = 0; I < ArrayValue.size(); ++I)
			{
				if (I > 0) { Out.push_back(','); }
				NewLine(Indent + 1);
				ArrayValue[I].DumpInto(Out, bPretty, Indent + 1);
			}
			if (!ArrayValue.empty()) { NewLine(Indent); }
			Out.push_back(']');
			break;
		case EType::Object:
			Out.push_back('{');
			for (size_t I = 0; I < ObjectValue.size(); ++I)
			{
				if (I > 0) { Out.push_back(','); }
				NewLine(Indent + 1);
				JsonParserDetail::EscapeInto(Out, ObjectValue[I].first);
				Out += bPretty ? ": " : ":";
				ObjectValue[I].second.DumpInto(Out, bPretty, Indent + 1);
			}
			if (!ObjectValue.empty()) { NewLine(Indent); }
			Out.push_back('}');
			break;
		}
	}

	bool JsonValue::Parse(const std::string& Text, JsonValue& OutValue, std::string& OutError)
	{
		JsonParserDetail::Parser P(Text);
		return P.Run(OutValue, OutError);
	}
}
