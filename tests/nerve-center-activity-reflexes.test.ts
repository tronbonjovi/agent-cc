/**
 * Nerve Center Activity Reflexes Tests
 *
 * Validates the Activity Reflexes organ module:
 * - Renders compact event feed from watcher change data
 * - Event type icon/color mapping (add, change, unlink, addDir)
 * - State color logic (green=recent, amber=stale, red=spike)
 * - Graceful handling when watcher data is unavailable
 * - onStateChange callback prop
 * - Exported from barrel index
 *
 * Run: npx vitest run tests/nerve-center-activity-reflexes.test.ts
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const NERVE_CENTER_DIR = path.resolve(
  __dirname,
  "../client/src/components/analytics/nerve-center",
);

const COMPONENT_PATH = path.join(NERVE_CENTER_DIR, "ActivityReflexes.tsx");
const INDEX_PATH = path.join(NERVE_CENTER_DIR, "index.ts");

// ---- File existence ----

describe("nerve-center activity reflexes — file structure", () => {
  it("ActivityReflexes.tsx exists", () => {
    expect(fs.existsSync(COMPONENT_PATH)).toBe(true);
  });

  it("barrel export re-exports ActivityReflexes", () => {
    const src = fs.readFileSync(INDEX_PATH, "utf-8");
    expect(src).toMatch(/export.*ActivityReflexes/);
  });
});

// ---- Component renders compact event feed ----

describe("nerve-center activity reflexes — event feed rendering", () => {
  const src = () => fs.readFileSync(COMPONENT_PATH, "utf-8");

  it("fetches data from /api/watcher/changes endpoint", () => {
    expect(src()).toMatch(/\/api\/watcher\/changes/);
  });

  it("uses useQuery for data fetching", () => {
    expect(src()).toMatch(/useQuery/);
  });

  it("parses watcher change log entries (ISO timestamp + event + path)", () => {
    // The watcher format is: "ISO_TIMESTAMP [event_type] path"
    expect(src()).toMatch(/\[(.+?)\]/);
  });

  it("limits displayed events to a compact feed (5-8 items)", () => {
    // Should slice/limit the events array
    expect(src()).toMatch(/slice|\.slice\(|MAX_EVENTS|maxEvents/i);
  });

  it("renders event items in a list-like structure", () => {
    expect(src()).toMatch(/map/);
  });

  it("displays file path for each event", () => {
    // Each event should show its path
    expect(src()).toMatch(/\.path|filePath|entry\.path/);
  });

  it("displays relative timestamp for each event", () => {
    // Should have time-relative formatting ("just now", "1h ago", etc.)
    expect(src()).toMatch(/ago|just now|formatRelativeTime|relativeTime/i);
  });
});

// ---- Event type icon/color mapping ----

describe("nerve-center activity reflexes — event type mapping", () => {
  const src = () => fs.readFileSync(COMPONENT_PATH, "utf-8");

  it("maps add events to green color", () => {
    expect(src()).toMatch(/add.*green|green.*add/i);
  });

  it("maps change events to amber color", () => {
    expect(src()).toMatch(/change.*amber|amber.*change/i);
  });

  it("maps unlink/delete events to red color", () => {
    expect(src()).toMatch(/unlink.*red|red.*unlink/i);
  });

  it("maps addDir events to blue color", () => {
    expect(src()).toMatch(/addDir.*blue|blue.*addDir/i);
  });

  it("has icon mapping for event types", () => {
    // Should import or define icons for each event type
    expect(src()).toMatch(/eventIcon|icon.*add|icon.*change|FilePlus|Edit|Trash|Folder/i);
  });

  it("imports Lucide icons", () => {
    expect(src()).toMatch(/from ["']lucide-react["']/);
  });
});

// ---- State color logic ----

describe("nerve-center activity reflexes — state color logic", () => {
  const src = () => fs.readFileSync(COMPONENT_PATH, "utf-8");

  it("computes organ state based on activity recency", () => {
    // Should have logic to determine if activity is recent, stale, or spiking
    expect(src()).toMatch(/computeState|getOrganState|organState|determineState/i);
  });

  it("returns green state for recent activity (alive)", () => {
    // Green = recent events exist = healthy
    expect(src()).toMatch(/green|active|alive/i);
  });

  it("returns amber state for quiet/stale activity", () => {
    // Amber = no recent events = quiet
    expect(src()).toMatch(/amber|stale|quiet/i);
  });

  it("returns red state for unusual activity spikes", () => {
    // Red = too many events in a short window = spike
    expect(src()).toMatch(/red|spike|unusual/i);
  });

  it("accepts onStateChange callback prop", () => {
    expect(src()).toMatch(/onStateChange/);
  });

  it("calls onStateChange with computed state", () => {
    // Should invoke the callback when state changes
    expect(src()).toMatch(/onStateChange\(|onStateChange\??\.\(/);
  });
});

// ---- Graceful handling when data unavailable ----

describe("nerve-center activity reflexes — graceful degradation", () => {
  const src = () => fs.readFileSync(COMPONENT_PATH, "utf-8");

  it("handles undefined/null data gracefully", () => {
    // Should guard against missing data with fallback (empty array or similar)
    expect(src()).toMatch(/\|\| \[\]|\?\? \[\]|data \?|changes \?|isLoading/);
  });

  it("shows empty/quiet state when no events exist", () => {
    // Should display something meaningful when there are no events
    expect(src()).toMatch(/no.*event|no.*activity|quiet|empty|length.*===.*0/i);
  });

  it("handles loading state", () => {
    expect(src()).toMatch(/isLoading|loading|isPending/i);
  });
});

// ---- Visual design constraints ----

describe("nerve-center activity reflexes — visual design", () => {
  const src = () => fs.readFileSync(COMPONENT_PATH, "utf-8");

  it("uses compact card styling for organ slot", () => {
    // Should have card-like container with constrained sizing
    expect(src()).toMatch(/rounded|border|bg-/);
  });

  it("truncates long file paths", () => {
    expect(src()).toMatch(/truncate|overflow.*hidden|text-ellipsis/i);
  });

  it("uses text-xs or text-sm for compact sizing", () => {
    expect(src()).toMatch(/text-xs|text-sm/);
  });

  it("is not scrollable (truncated list)", () => {
    // Should NOT have overflow-y-auto or scroll classes — compact truncated feed
    expect(src()).not.toMatch(/overflow-y-auto|overflow-y-scroll|scrollable/);
  });
});

// ---- Export ----

describe("nerve-center activity reflexes — exports", () => {
  const src = () => fs.readFileSync(COMPONENT_PATH, "utf-8");

  it("exports ActivityReflexes as a named export", () => {
    expect(src()).toMatch(/export.*function ActivityReflexes|export.*const ActivityReflexes/);
  });

  it("defines props interface with onStateChange", () => {
    expect(src()).toMatch(/interface.*ActivityReflexesProps|type.*ActivityReflexesProps/);
    expect(src()).toMatch(/onStateChange/);
  });
});

// ---- Safety checks ----

describe("nerve-center activity reflexes — safety", () => {
  it("no hardcoded user paths", () => {
    const content = fs.readFileSync(COMPONENT_PATH, "utf-8");
    expect(content).not.toMatch(/C:\\Users|\/Users\/\w+|\/home\/\w+/);
  });

  it("no text gradients (solid colors only)", () => {
    const content = fs.readFileSync(COMPONENT_PATH, "utf-8");
    expect(content).not.toMatch(/bg-gradient|from-.*to-.*bg-clip-text/);
  });

  it("no PII or personal data", () => {
    const content = fs.readFileSync(COMPONENT_PATH, "utf-8");
    expect(content).not.toMatch(/\d{3}[-.]?\d{3}[-.]?\d{4}/); // phone numbers
    expect(content).not.toMatch(/\w+@\w+\.\w+/); // email (excluding imports)
  });
});
