import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { FolderOpen, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectEntity } from "@shared/types";

interface ProjectPickerProps {
  projects: ProjectEntity[];
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
}

export function ProjectPicker({ projects, selectedProjectId, onSelectProject }: ProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = projects.find((p) => p.id === selectedProjectId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 rounded px-2 py-1 text-sm font-medium hover:bg-accent transition-colors">
          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{selected?.name || "Select project"}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search projects..." />
          <CommandList>
            <CommandEmpty>No projects found.</CommandEmpty>
            <CommandGroup>
              {projects.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.name}
                  onSelect={() => {
                    onSelectProject(p.id);
                    setOpen(false);
                  }}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  <span className="truncate">{p.name}</span>
                  {p.id === selectedProjectId && (
                    <Check className="ml-auto h-3.5 w-3.5" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
