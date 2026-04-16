// client/src/components/chat/source-filter.tsx
//
// Filter chip row for the ConversationSidebar — chat-import-platforms task005.
//
// Sits above the source sections and lets the user narrow the visible list
// to one of four modes: All / AI / Deterministic / External. The filter
// values, the mode tuple, and the active-chip variant logic all live in
// `@/lib/conversation-grouping` so they're unit-testable without rendering
// React (vitest excludes the client/ directory — see
// reference_vitest_client_excluded in memory). This file stays thin on
// purpose: it's a presentational shell that maps the canonical tuple to
// shadcn Button instances.

import { Button } from '@/components/ui/button';
import {
  FILTER_MODES,
  pickFilterVariant,
  type FilterMode,
} from '@/lib/conversation-grouping';

/**
 * Human-readable label for each filter mode. Kept in module scope so the
 * source-text guardrail test can pin the labels without rendering. Order
 * doesn't matter here — the chip ordering is driven by FILTER_MODES.
 */
const FILTER_LABELS: Record<FilterMode, string> = {
  all: 'All',
  ai: 'AI',
  deterministic: 'Deterministic',
  external: 'External',
};

interface SourceFilterProps {
  mode: FilterMode;
  onChange: (mode: FilterMode) => void;
}

export function SourceFilter({ mode, onChange }: SourceFilterProps) {
  return (
    <div
      className="flex gap-1 border-b bg-background/95 px-2 py-2"
      data-testid="source-filter"
      role="group"
      aria-label="Conversation source filter"
    >
      {FILTER_MODES.map((option) => (
        <Button
          key={option}
          type="button"
          size="sm"
          variant={pickFilterVariant(mode, option)}
          onClick={() => onChange(option)}
          data-testid={`filter-${option}`}
          aria-pressed={mode === option}
        >
          {FILTER_LABELS[option]}
        </Button>
      ))}
    </div>
  );
}
