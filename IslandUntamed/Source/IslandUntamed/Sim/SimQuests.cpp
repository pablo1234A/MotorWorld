#include "SimQuests.h"

namespace IUSim
{
	EGameEvent GameEventFromString(const std::string& S)
	{
		if (S == "acquire") { return EGameEvent::Acquire; }
		if (S == "craft") { return EGameEvent::Craft; }
		if (S == "build") { return EGameEvent::Build; }
		if (S == "discover") { return EGameEvent::Discover; }
		if (S == "kill") { return EGameEvent::Kill; }
		if (S == "talk") { return EGameEvent::Talk; }
		if (S == "consume") { return EGameEvent::Consume; }
		if (S == "catch") { return EGameEvent::Catch; }
		if (S == "harvest") { return EGameEvent::Harvest; }
		if (S == "sleep") { return EGameEvent::Sleep; }
		if (S == "flag") { return EGameEvent::Flag; }
		if (S == "read") { return EGameEvent::Read; }
		if (S == "deliver") { return EGameEvent::Deliver; }
		return EGameEvent::Custom;
	}

	const char* GameEventToString(EGameEvent E)
	{
		switch (E)
		{
		case EGameEvent::Acquire: return "acquire";
		case EGameEvent::Craft: return "craft";
		case EGameEvent::Build: return "build";
		case EGameEvent::Discover: return "discover";
		case EGameEvent::Kill: return "kill";
		case EGameEvent::Talk: return "talk";
		case EGameEvent::Consume: return "consume";
		case EGameEvent::Catch: return "catch";
		case EGameEvent::Harvest: return "harvest";
		case EGameEvent::Sleep: return "sleep";
		case EGameEvent::Flag: return "flag";
		case EGameEvent::Read: return "read";
		case EGameEvent::Deliver: return "deliver";
		case EGameEvent::Custom: return "custom";
		}
		return "custom";
	}

	bool QuestLog::LoadFromJson(const JsonValue& Root, std::string& OutError)
	{
		const JsonValue* Arr = Root.Find("quests");
		if (!Arr || !Arr->IsArray()) { OutError = "quests.json: missing 'quests' array"; return false; }
		for (const JsonValue& J : Arr->Items())
		{
			QuestDef Q;
			Q.Id = J.GetString("id");
			if (Q.Id.empty()) { OutError = "quests.json: quest without id"; return false; }
			if (FindDef(Q.Id)) { OutError = "quests.json: duplicate quest '" + Q.Id + "'"; return false; }
			Q.Title = J.GetString("title", Q.Id);
			Q.Description = J.GetString("desc");
			Q.bMain = J.GetString("type", "side") == "main";
			Q.Act = J.GetInt("act", 1);
			Q.bSequential = J.GetBool("sequential", true);
			Q.bAutoStart = J.GetBool("auto_start", true);
			Q.RequiresQuests = J.GetStringArray("requires");
			Q.RequiresFlags = J.GetStringArray("requires_flags");
			Q.Excludes = J.GetStringArray("excludes");
			Q.CompletionText = J.GetString("completion");
			if (const JsonValue* SE = J.Find("start_event"))
			{
				Q.bHasStartEvent = true;
				Q.bAutoStart = false;
				Q.StartEvent.Type = GameEventFromString(SE->GetString("type"));
				Q.StartEvent.Target = SE->GetString("target");
			}
			if (const JsonValue* Objs = J.Find("objectives"))
			{
				for (const JsonValue& O : Objs->Items())
				{
					QuestObjective Obj;
					const std::string Type = O.GetString("type");
					if (Type == "reputation") { Obj.Kind = EObjectiveType::Reputation; }
					else if (Type == "has_flag") { Obj.Kind = EObjectiveType::HasFlag; }
					else { Obj.Kind = EObjectiveType::Event; Obj.Event = GameEventFromString(Type); }
					Obj.Target = O.GetString("target", "*");
					Obj.Count = O.GetInt("count", 1);
					Obj.Text = O.GetString("text");
					Obj.bOptional = O.GetBool("optional", false);
					Q.Objectives.push_back(Obj);
				}
			}
			if (Q.Objectives.empty()) { OutError = "quests.json: quest '" + Q.Id + "' has no objectives"; return false; }
			if (const JsonValue* R = J.Find("reward"))
			{
				if (const JsonValue* Items = R->Find("items"))
				{
					for (const JsonValue& I : Items->Items()) { Q.Reward.Items.push_back(ItemAmount{ I.GetString("item"), I.GetInt("count", 1) }); }
				}
				Q.Reward.Flags = R->GetStringArray("flags");
				Q.Reward.Recipes = R->GetStringArray("recipes");
				if (const JsonValue* Rep = R->Find("reputation"))
				{
					for (const auto& M : Rep->Members()) { Q.Reward.Reputation[M.first] = M.second.AsFloat(); }
				}
			}
			Defs.push_back(Q);
		}
		// Validate references.
		for (const QuestDef& Q : Defs)
		{
			for (const std::string& Req : Q.RequiresQuests)
			{
				if (!FindDef(Req)) { OutError = "quests.json: quest '" + Q.Id + "' requires unknown quest '" + Req + "'"; return false; }
			}
		}
		ResetProgress();
		return true;
	}

	void QuestLog::ResetProgress()
	{
		Progress.clear();
		Flags.clear();
		TrackedQuest.clear();
		for (const QuestDef& Q : Defs)
		{
			QuestProgress P;
			P.Counts.assign(Q.Objectives.size(), 0);
			Progress[Q.Id] = P;
		}
	}

	const QuestDef* QuestLog::FindDef(const std::string& Id) const
	{
		for (const QuestDef& Q : Defs) { if (Q.Id == Id) { return &Q; } }
		return nullptr;
	}

	const QuestProgress* QuestLog::FindProgress(const std::string& Id) const
	{
		const auto It = Progress.find(Id);
		return It == Progress.end() ? nullptr : &It->second;
	}

	EQuestState QuestLog::GetState(const std::string& Id) const
	{
		const QuestProgress* P = FindProgress(Id);
		return P ? P->State : EQuestState::Locked;
	}

	bool QuestLog::IsObjectiveComplete(const QuestDef& Def, const QuestProgress& P, size_t Index) const
	{
		if (Index >= Def.Objectives.size() || Index >= P.Counts.size()) { return false; }
		const QuestObjective& O = Def.Objectives[Index];
		const int32_t Needed = O.Kind == EObjectiveType::Event ? O.Count : 1;
		return P.Counts[Index] >= Needed;
	}

	int32_t QuestLog::CurrentObjectiveIndex(const std::string& QuestId) const
	{
		const QuestDef* Def = FindDef(QuestId);
		const QuestProgress* P = FindProgress(QuestId);
		if (!Def || !P) { return -1; }
		for (size_t I = 0; I < Def->Objectives.size(); ++I)
		{
			if (!Def->Objectives[I].bOptional && !IsObjectiveComplete(*Def, *P, I)) { return static_cast<int32_t>(I); }
		}
		return -1;
	}

	bool QuestLog::PrerequisitesMet(const QuestDef& Def) const
	{
		for (const std::string& Req : Def.RequiresQuests) { if (GetState(Req) != EQuestState::Completed) { return false; } }
		for (const std::string& F : Def.RequiresFlags) { if (!HasFlag(F)) { return false; } }
		return true;
	}

	bool QuestLog::EventMatches(const QuestObjective& O, const GameEvent& E)
	{
		if (O.Kind != EObjectiveType::Event || O.Event != E.Type) { return false; }
		return O.Target == "*" || O.Target == E.Target;
	}

	void QuestLog::Start(const QuestDef& Def, std::vector<QuestUpdate>& Out)
	{
		QuestProgress& P = Progress[Def.Id];
		if (P.State == EQuestState::Active || P.State == EQuestState::Completed || P.State == EQuestState::Failed) { return; }
		P.State = EQuestState::Active;
		P.Counts.assign(Def.Objectives.size(), 0);
		QuestUpdate U;
		U.Type = EQuestUpdateType::Started;
		U.QuestId = Def.Id;
		Out.push_back(U);
		if (TrackedQuest.empty() || Def.bMain) { TrackedQuest = Def.Id; }
	}

	void QuestLog::TryComplete(const QuestDef& Def, std::vector<QuestUpdate>& Out)
	{
		QuestProgress& P = Progress[Def.Id];
		if (P.State != EQuestState::Active) { return; }
		for (size_t I = 0; I < Def.Objectives.size(); ++I)
		{
			if (!Def.Objectives[I].bOptional && !IsObjectiveComplete(Def, P, I)) { return; }
		}
		P.State = EQuestState::Completed;
		for (const std::string& F : Def.Reward.Flags) { Flags.insert(F); }
		Flags.insert("quest_done:" + Def.Id);
		QuestUpdate U;
		U.Type = EQuestUpdateType::Completed;
		U.QuestId = Def.Id;
		U.Reward = &Def.Reward;
		Out.push_back(U);

		for (const std::string& Ex : Def.Excludes)
		{
			auto It = Progress.find(Ex);
			if (It != Progress.end() && It->second.State != EQuestState::Completed && It->second.State != EQuestState::Failed)
			{
				It->second.State = EQuestState::Failed;
				QuestUpdate F;
				F.Type = EQuestUpdateType::Failed;
				F.QuestId = Ex;
				Out.push_back(F);
			}
		}
		if (TrackedQuest == Def.Id) { TrackedQuest.clear(); }
	}

	void QuestLog::PollObjectives(const QuestDef& Def, const ReputationQuery& RepQuery, std::vector<QuestUpdate>& Out)
	{
		QuestProgress& P = Progress[Def.Id];
		if (P.State != EQuestState::Active) { return; }
		const int32_t Current = CurrentObjectiveIndex(Def.Id);
		for (size_t I = 0; I < Def.Objectives.size(); ++I)
		{
			const QuestObjective& O = Def.Objectives[I];
			if (O.Kind == EObjectiveType::Event || IsObjectiveComplete(Def, P, I)) { continue; }
			if (Def.bSequential && !O.bOptional && static_cast<int32_t>(I) != Current) { continue; }
			bool bDone = false;
			if (O.Kind == EObjectiveType::HasFlag) { bDone = HasFlag(O.Target); }
			else if (O.Kind == EObjectiveType::Reputation && RepQuery) { bDone = RepQuery(O.Target) >= static_cast<float>(O.Count); }
			if (bDone)
			{
				P.Counts[I] = 1;
				QuestUpdate U;
				U.Type = EQuestUpdateType::ObjectiveDone;
				U.QuestId = Def.Id;
				U.ObjectiveIndex = static_cast<int32_t>(I);
				Out.push_back(U);
			}
		}
	}

	std::vector<QuestUpdate> QuestLog::Refresh(const ReputationQuery& RepQuery)
	{
		std::vector<QuestUpdate> Out;
		// Iterate until stable: completing a quest can unlock and auto-complete others.
		for (int Pass = 0; Pass < 8; ++Pass)
		{
			const size_t Before = Out.size();
			for (const QuestDef& Q : Defs)
			{
				QuestProgress& P = Progress[Q.Id];
				if (P.State == EQuestState::Locked && PrerequisitesMet(Q))
				{
					if (Q.bAutoStart) { Start(Q, Out); }
					else { P.State = EQuestState::Available; }
				}
				if (P.State == EQuestState::Active)
				{
					PollObjectives(Q, RepQuery, Out);
					TryComplete(Q, Out);
				}
			}
			if (Out.size() == Before) { break; }
		}
		return Out;
	}

	std::vector<QuestUpdate> QuestLog::OnEvent(const GameEvent& Event, const ReputationQuery& RepQuery)
	{
		std::vector<QuestUpdate> Out;
		if (Event.Type == EGameEvent::Flag) { Flags.insert(Event.Target); }

		for (const QuestDef& Q : Defs)
		{
			QuestProgress& P = Progress[Q.Id];
			// Event-started quests.
			if (P.State == EQuestState::Available && Q.bHasStartEvent && Q.StartEvent.Type == Event.Type
				&& (Q.StartEvent.Target == "*" || Q.StartEvent.Target == Event.Target))
			{
				Start(Q, Out);
			}
			if (P.State != EQuestState::Active) { continue; }

			const int32_t Current = CurrentObjectiveIndex(Q.Id);
			for (size_t I = 0; I < Q.Objectives.size(); ++I)
			{
				const QuestObjective& O = Q.Objectives[I];
				if (!EventMatches(O, Event) || IsObjectiveComplete(Q, P, I)) { continue; }
				if (Q.bSequential && !O.bOptional && static_cast<int32_t>(I) != Current) { continue; }
				P.Counts[I] = std::min(O.Count, P.Counts[I] + std::max(1, Event.Count));
				QuestUpdate U;
				U.QuestId = Q.Id;
				U.ObjectiveIndex = static_cast<int32_t>(I);
				U.Type = IsObjectiveComplete(Q, P, I) ? EQuestUpdateType::ObjectiveDone : EQuestUpdateType::Progress;
				Out.push_back(U);
			}
			TryComplete(Q, Out);
		}
		const std::vector<QuestUpdate> Cascade = Refresh(RepQuery);
		Out.insert(Out.end(), Cascade.begin(), Cascade.end());
		return Out;
	}

	JsonValue QuestLog::ToJson() const
	{
		JsonValue J = JsonValue::MakeObject();
		JsonValue Arr = JsonValue::MakeArray();
		for (const auto& Pair : Progress)
		{
			if (Pair.second.State == EQuestState::Locked) { continue; }
			JsonValue Q = JsonValue::MakeObject();
			Q.Set("id", JsonValue::MakeString(Pair.first));
			Q.Set("state", JsonValue::MakeNumber(static_cast<int>(Pair.second.State)));
			JsonValue Counts = JsonValue::MakeArray();
			for (const int32_t C : Pair.second.Counts) { Counts.Push(JsonValue::MakeNumber(C)); }
			Q.Set("counts", Counts);
			Arr.Push(Q);
		}
		J.Set("quests", Arr);
		JsonValue FlagArr = JsonValue::MakeArray();
		for (const std::string& F : Flags) { FlagArr.Push(JsonValue::MakeString(F)); }
		J.Set("flags", FlagArr);
		J.Set("tracked", JsonValue::MakeString(TrackedQuest));
		return J;
	}

	void QuestLog::FromJson(const JsonValue& J)
	{
		ResetProgress();
		for (const std::string& F : J.GetStringArray("flags")) { Flags.insert(F); }
		TrackedQuest = J.GetString("tracked");
		const JsonValue* Arr = J.Find("quests");
		if (!Arr) { return; }
		for (const JsonValue& Q : Arr->Items())
		{
			const std::string Id = Q.GetString("id");
			const QuestDef* Def = FindDef(Id);
			if (!Def) { continue; }
			QuestProgress& P = Progress[Id];
			const int S = Q.GetInt("state", 0);
			P.State = static_cast<EQuestState>(S >= 0 && S <= 4 ? S : 0);
			if (const JsonValue* Counts = Q.Find("counts"))
			{
				for (size_t I = 0; I < Counts->Items().size() && I < P.Counts.size(); ++I) { P.Counts[I] = Counts->Items()[I].AsInt(); }
			}
		}
	}
}
