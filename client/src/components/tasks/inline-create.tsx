import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";

interface InlineCreateProps {
  status: string;
  onSubmit: (title: string, status: string) => void;
  onCancel: () => void;
}

export function InlineCreate({ status, onSubmit, onCancel }: InlineCreateProps) {
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const trimmed = title.trim();
    if (trimmed) {
      onSubmit(trimmed, status);
      setTitle("");
      inputRef.current?.focus();
    }
  };

  return (
    <div className="rounded-lg border bg-card p-2 mx-2 mb-2">
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Task title..."
        className="w-full text-sm bg-transparent border-none outline-none p-1"
      />
      <div className="flex justify-between items-center mt-1.5">
        <span className="text-[10px] text-muted-foreground/40">Enter to create, Esc to cancel</span>
        <button onClick={onCancel} className="text-muted-foreground/40 hover:text-muted-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
