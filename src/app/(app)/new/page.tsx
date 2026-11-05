import { aiEnabled } from "@/ai/claude";
import { NewProjectWizard } from "@/components/new-project-wizard";

export const metadata = { title: "Nuevo proyecto" };

export default function NewProjectPage() {
  return <NewProjectWizard engine={aiEnabled() ? "claude" : "local"} />;
}
