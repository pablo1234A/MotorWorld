// Island Untamed - Simulation Core
// Event-driven quest system: main story + side quests, prerequisites,
// mutually exclusive choices (decisions), story flags and rewards.
// Data: Content/Data/quests.json
#pragma once

#include "SimInventory.h"

#include <functional>
#include <map>
#include <set>
#include <string>
#include <vector>

namespace IUSim
{
	/** Gameplay events broadcast by the engine layer. Quests, achievements and tribes listen to them. */
	enum class EGameEvent : uint8_t
	{
		Acquire,    // Target = item id
		Craft,      // Target = item id crafted
		Build,      // Target = building id
		Discover,   // Target = POI id or POI type ("village", "cave")
		Kill,       // Target = creature id or tribe id ("tribe:vesh")
		Talk,       // Target = npc/tribe id
		Consume,    // Target = item id
		Catch,      // Target = fish species id / "fish"
		Harvest,    // Target = crop id
		Sleep,      // Target = ""
		Flag,       // Target = flag name (set externally)
		Read,       // Target = document id
		Deliver,    // Target = item id (given to a tribe)
		Custom,     // Target = arbitrary script hook
	};

	EGameEvent GameEventFromString(const std::string& S);
	const char* GameEventToString(EGameEvent E);

	struct GameEvent
	{
		EGameEvent Type = EGameEvent::Custom;
		std::string Target;
		int32_t Count = 1;
	};

	enum class EObjectiveType : uint8_t { Event, Reputation, HasFlag };

	struct QuestObjective
	{
		EObjectiveType Kind = EObjectiveType::Event;
		EGameEvent Event = EGameEvent::Custom;
		std::string Target;     // "*" matches anything of that event type
		int32_t Count = 1;      // for Reputation: threshold
		std::string Text;
		bool bOptional = false;
	};

	struct QuestReward
	{
		std::vector<ItemAmount> Items;
		std::vector<std::string> Flags;
		std::vector<std::string> Recipes;
		std::map<std::string, float> Reputation;
	};

	struct QuestDef
	{
		std::string Id;
		std::string Title;
		std::string Description;
		bool bMain = false;
		int32_t Act = 1;
		bool bSequential = true;
		bool bAutoStart = true;
		bool bHasStartEvent = false;
		GameEvent StartEvent;
		std::vector<std::string> RequiresQuests;
		std::vector<std::string> RequiresFlags;
		std::vector<std::string> Excludes;     // quests failed when this one completes (choices)
		std::vector<QuestObjective> Objectives;
		QuestReward Reward;
		std::string CompletionText;
	};

	enum class EQuestState : uint8_t { Locked, Available, Active, Completed, Failed };

	struct QuestProgress
	{
		EQuestState State = EQuestState::Locked;
		std::vector<int32_t> Counts;
	};

	enum class EQuestUpdateType : uint8_t { Started, Progress, ObjectiveDone, Completed, Failed };

	struct QuestUpdate
	{
		EQuestUpdateType Type = EQuestUpdateType::Progress;
		std::string QuestId;
		int32_t ObjectiveIndex = -1;
		const QuestReward* Reward = nullptr; // set on Completed
	};

	using ReputationQuery = std::function<float(const std::string&)>;

	class QuestLog
	{
	public:
		bool LoadFromJson(const JsonValue& Root, std::string& OutError);
		void ResetProgress();

		/** Unlocks quests whose prerequisites are met and polls non-event objectives. */
		std::vector<QuestUpdate> Refresh(const ReputationQuery& RepQuery);
		/** Feeds an event; returns every change it caused (including cascades). */
		std::vector<QuestUpdate> OnEvent(const GameEvent& Event, const ReputationQuery& RepQuery);

		void SetFlag(const std::string& Flag) { Flags.insert(Flag); }
		bool HasFlag(const std::string& Flag) const { return Flags.count(Flag) > 0; }
		const std::set<std::string>& GetFlags() const { return Flags; }

		const std::vector<QuestDef>& GetDefs() const { return Defs; }
		const QuestDef* FindDef(const std::string& Id) const;
		const QuestProgress* FindProgress(const std::string& Id) const;
		EQuestState GetState(const std::string& Id) const;
		bool IsObjectiveComplete(const QuestDef& Def, const QuestProgress& P, size_t Index) const;
		/** Index of the first unfinished required objective (-1 if none). */
		int32_t CurrentObjectiveIndex(const std::string& QuestId) const;

		std::string TrackedQuest;

		JsonValue ToJson() const;
		void FromJson(const JsonValue& J);

	private:
		bool PrerequisitesMet(const QuestDef& Def) const;
		void Start(const QuestDef& Def, std::vector<QuestUpdate>& Out);
		void TryComplete(const QuestDef& Def, std::vector<QuestUpdate>& Out);
		void PollObjectives(const QuestDef& Def, const ReputationQuery& RepQuery, std::vector<QuestUpdate>& Out);
		static bool EventMatches(const QuestObjective& O, const GameEvent& E);

		std::vector<QuestDef> Defs;
		std::map<std::string, QuestProgress> Progress;
		std::set<std::string> Flags;
	};
}
