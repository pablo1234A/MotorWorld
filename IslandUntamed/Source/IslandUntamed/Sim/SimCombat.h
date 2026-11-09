// Island Untamed - Simulation Core
// Combat resolution shared by player, NPCs and animals.
#pragma once

#include "SimCore.h"

namespace IUSim
{
	struct AttackInfo
	{
		float BaseDamage = 5.0f;
		float Charge = 0.0f;           // 0..1 (heavy attack / bow draw)
		float AttackerMultiplier = 1.0f; // survival effects (low energy...)
		bool bFromBehind = false;      // stealth / back attacks
		bool bHeadshot = false;        // ranged
	};

	struct DefenseInfo
	{
		bool bBlocking = false;
		float BlockReduction = 0.3f;   // from the defender's weapon
		float Stamina = 100.0f;
		float Armor = 0.0f;            // 0..0.8
		bool bDodging = false;         // invulnerability frames
	};

	struct HitResult
	{
		float Damage = 0.0f;
		float StaminaDrain = 0.0f;
		bool bBlocked = false;
		bool bGuardBroken = false;
		bool bEvaded = false;
		bool bStagger = false;
	};

	inline HitResult ResolveHit(const AttackInfo& A, const DefenseInfo& D)
	{
		HitResult R;
		if (D.bDodging) { R.bEvaded = true; return R; }
		float Dmg = A.BaseDamage * (1.0f + A.Charge * 0.8f) * A.AttackerMultiplier;
		if (A.bFromBehind) { Dmg *= 1.6f; }
		if (A.bHeadshot) { Dmg *= 2.0f; }
		if (D.bBlocking)
		{
			const float Drain = Dmg * 0.9f;
			if (D.Stamina >= Drain)
			{
				R.bBlocked = true;
				R.StaminaDrain = Drain;
				Dmg *= (1.0f - Clampf(D.BlockReduction, 0.0f, 0.95f));
			}
			else
			{
				R.bGuardBroken = true;
				R.StaminaDrain = D.Stamina;
				R.bStagger = true;
			}
		}
		Dmg *= (1.0f - Clampf(D.Armor, 0.0f, 0.8f));
		R.Damage = Dmg;
		if (!R.bBlocked && Dmg >= 20.0f) { R.bStagger = true; }
		return R;
	}
}
