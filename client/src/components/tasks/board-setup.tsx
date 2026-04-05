import { Button } from "@/components/ui/button";
import { CheckSquare } from "lucide-react";

interface BoardSetupProps {
  projectName: string;
  onAcceptDefaults: () => void;
}

export function BoardSetup({ projectName, onAcceptDefaults }: BoardSetupProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
        <CheckSquare className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Set up tasks for {projectName}</h2>
      <p className="text-sm text-muted-foreground max-w-md mb-6">
        Create a task board to track work on this project. You'll get default columns
        (backlog, todo, in-progress, review, done) that you can customize anytime.
      </p>
      <div className="flex gap-3">
        <Button onClick={onAcceptDefaults}>
          <CheckSquare className="h-4 w-4 mr-2" />
          Create Board
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground/40 mt-4">
        This creates a .claude/tasks/ directory in your project
      </p>
    </div>
  );
}
