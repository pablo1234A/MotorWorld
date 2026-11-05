import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { listProjects } from "@/server/projects";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const projects = await listProjects(user.id);
  const recent = projects.slice(0, 6).map((p) => ({ id: p.id, name: p.name, color: p.doc.theme.colors.primary }));
  return (
    <div className="flex min-h-dvh">
      <Sidebar user={{ name: user.name, email: user.email }} recent={recent} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
