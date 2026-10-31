import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requirePageUser } from "@/server/auth/page-auth";
import { getBusinessForUser } from "@/server/auth/context";
import { Onboarding } from "./Onboarding";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { user } = await requirePageUser("/onboarding");
  const b = await getBusinessForUser(user.id);
  if (b?.onboardingCompletedAt) redirect("/app");
  return (
    <Suspense>
      <Onboarding userName={user.name.split(" ")[0]} hasBusiness={Boolean(b)} />
    </Suspense>
  );
}
