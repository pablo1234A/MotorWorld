"use client";
import { useApi } from "./useApi";
import type { PlanFeatures } from "@/config/plans";

export type Ent = { planCode: string | null; canSend: boolean; features: Partial<PlanFeatures>; maxTemplates: number | null; maxAutomationRules: number };
export const useEntitlements = () => useApi<Ent>("/api/v1/entitlements");
