import { Construction } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { listPublishedProjects } from "@/features/transparency/queries";

/** Project monitoring card — DB-backed progress list. */
export async function ProjectsCard() {
  const projects = await listPublishedProjects();

  return (
    <Card className="rounded-3xl p-8 md:col-span-6 lg:col-span-4">
      <span className="mb-6 inline-block rounded-2xl bg-brand-100 p-4 text-brand-700">
        <Construction className="h-9 w-9" aria-hidden="true" />
      </span>
      <h3 className="mb-4 text-2xl font-semibold">Project Monitoring</h3>
      <p className="mb-6 text-ink-600">
        Real-time status of local infrastructure and community welfare projects.
      </p>
      {projects.length === 0 ? (
        <p className="text-sm text-ink-500">No monitored projects are published yet.</p>
      ) : (
        <ul className="space-y-4">
          {projects.map((project) => (
            <li key={project.id} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  project.progress === 100 ? "bg-green-500" : "bg-brand-500",
                )}
                aria-hidden="true"
              />
              <span>
                {project.name} ({project.progress}%)
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
