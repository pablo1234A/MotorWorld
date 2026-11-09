// Island Untamed - the survivor (first person).
//
// The character owns gameplay components and routes input to them:
//   Survival (needs, temperature, conditions)   Inventory (+ equipment)
//   Interaction (focus + [E]/[F])                Combat (melee, harvest, bow, block, dodge)
//   Build (placement)                            Fishing (rod minigame)
//   Crafting (queue)
// UI requests (open containers, dialogue, documents) are forwarded to the
// player controller, which owns the screens.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "Sim/SimItems.h"

#include <string>

#include "IUCharacter.generated.h"

class UCameraComponent;
class UPointLightComponent;
class UStaticMeshComponent;
class UIUSurvivalComponent;
class UIUInventoryComponent;
class UIUInteractionComponent;
class UIUCombatComponent;
class UIUBuildComponent;
class UIUFishingComponent;
class UIUCraftingComponent;
class AIUTribeNPC;
class AIUResourceActor;
class AIUPlayerController;

UCLASS()
class ISLANDUNTAMED_API AIUCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	AIUCharacter();
	virtual void Tick(float DeltaSeconds) override;
	virtual void Landed(const FHitResult& Hit) override;
	virtual float TakeDamage(float DamageAmount, struct FDamageEvent const& DamageEvent, AController* EventInstigator, AActor* DamageCauser) override;

	// ---- Components
	UIUSurvivalComponent* GetSurvival() const { return Survival; }
	UIUInventoryComponent* GetInventory() const { return Inventory; }
	UIUInteractionComponent* GetInteraction() const { return Interaction; }
	UIUCombatComponent* GetCombat() const { return Combat; }
	UIUBuildComponent* GetBuild() const { return Build; }
	UIUFishingComponent* GetFishing() const { return Fishing; }
	UIUCraftingComponent* GetCrafting() const { return Crafting; }
	UCameraComponent* GetCamera() const { return Camera; }
	AIUPlayerController* GetIUController() const;

	// ---- Input (called by AIUPlayerController)
	void InputMove(const FVector2D& Axis);
	void InputLook(const FVector2D& Axis);
	void InputJump(bool bPressed);
	void InputSprint(bool bPressed);
	void InputCrouch();
	void InputPrimary(bool bPressed);
	void InputSecondary(bool bPressed);
	void InputInteract();
	void InputInteractSecondary();
	void InputDodge();
	void InputRotateBuild(float Direction);
	void InputDeconstruct();
	void SelectHotbar(int32 Index);
	void CycleHotbar(int32 Direction);
	void DropSelected();

	// ---- Held item
	int32 GetSelectedSlot() const { return SelectedSlot; }
	std::string GetHeldItemId() const;
	const IUSim::ItemDef* GetHeldItemDef() const;
	bool IsHoldingLitTorch() const;
	/** Consumes the held item (food/medicine/water). */
	bool UseHeldConsumable();
	/** Damages the held item's durability; returns true if it broke. */
	bool WearHeldItem(float Amount);

	// ---- World state
	bool IsInWater() const { return WaterDepthCm > 30.0f; }
	bool IsSwimming() const { return bSwimming; }
	float GetWaterDepthCm() const { return WaterDepthCm; }
	bool IsDead() const;
	bool bControlLocked = true;
	/** Holds the player still until terrain collision exists below. */
	void WaitForGround() { bWaitingForGround = true; }

	// ---- Actions used by world objects
	void PlayActionSound(const TCHAR* Cue);
	void OpenContainer(UIUInventoryComponent* Container, const FText& Title);
	void OpenDocument(const FString& DocId);
	void OpenTribeDialogue(AIUTribeNPC* NPC);
	void OpenCrafting();
	void Sleep(bool bInBed);
	void HarvestActor(AIUResourceActor* Resource);
	void TeleportPlayer(const FVector& Location, const FRotator& Rotation);
	/** Reports a noise to AI hearing (sprinting, combat, chopping). */
	void MakeNoiseEvent(float Loudness, float RangeCm);

	/** Visual-only: camera shake/hit flash amount (0..1). */
	float GetDamageFlash() const { return DamageFlash; }
	/** Hand animation (0..1 swing progress) set by the combat component. */
	float HandSwing = 0.0f;

	void ResetForNewGame(const FVector& Location, const FRotator& Rotation);

protected:
	virtual void BeginPlay() override;

private:
	void UpdateWater(float DeltaSeconds);
	void UpdateMovementSpeed();
	void UpdateHeldVisual();
	void UpdateHand(float DeltaSeconds);
	void HandleDeath();

	UPROPERTY(VisibleAnywhere) TObjectPtr<UCameraComponent> Camera;
	UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> HandRoot;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UPointLightComponent> TorchLight;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UIUSurvivalComponent> Survival;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UIUInventoryComponent> Inventory;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UIUInteractionComponent> Interaction;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UIUCombatComponent> Combat;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UIUBuildComponent> Build;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UIUFishingComponent> Fishing;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UIUCraftingComponent> Crafting;
	UPROPERTY() TArray<TObjectPtr<UStaticMeshComponent>> HeldParts;

	int32 SelectedSlot = 0;
	std::string HeldVisualId;
	bool bSprintHeld = false;
	bool bSwimming = false;
	bool bWaitingForGround = false;
	float WaterDepthCm = 0.0f;
	float WaterSurfaceZ = 0.0f;
	float DamageFlash = 0.0f;
	float NoiseTimer = 0.0f;
	float TorchBurnAccumulator = 0.0f;
	float BobPhase = 0.0f;
	float FootstepTimer = 0.0f;
	bool bDeathHandled = false;
};
