import { useParams } from "wouter";
import { useEntities } from "@/hooks/use-entities";
import type { ProjectEntity } from "@shared/types";

export default function TasksPage() {
  const params = useParams<{ projectId?: string }>();
  const { data: projects } = useEntities<ProjectEntity>("project");

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Tasks</h1>
      <p className="text-muted-foreground">
        {params.projectId
          ? `Showing tasks for project ${params.projectId}`
          : `Select a project (${projects?.length || 0} available)`
        }
      </p>
    </div>
  );
}
