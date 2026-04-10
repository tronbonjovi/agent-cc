import { BookOpen } from "lucide-react";

/** /library placeholder — will be replaced by full Library page in a future update. */
export default function Library() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
      <BookOpen className="h-12 w-12 text-muted-foreground/40" />
      <h1 className="text-2xl font-semibold">Library</h1>
      <p className="text-muted-foreground text-sm">
        Coming in the next update. MCPs, skills, plugins, and agents will live here.
      </p>
    </div>
  );
}
