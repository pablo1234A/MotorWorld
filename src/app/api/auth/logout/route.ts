import { createClient } from "@/lib/supabase/server";
import { ok, route } from "@/server/http/handler";

export const POST = route(async () => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return ok({ redirectTo: "/login" });
});
