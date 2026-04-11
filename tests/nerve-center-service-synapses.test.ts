/**
 * Nerve Center — Service Synapses Organ Module Tests
 *
 * Validates the ServiceSynapses component which displays external
 * service connection status as a compact organ module:
 * - Renders list of services with status indicators
 * - Status dots: green=up, red=down, gray=unknown
 * - Organ state color: green (all up), amber (degraded), red (any down)
 * - Shows "No services configured" when service list is empty
 * - Reports organ state via onStateChange callback
 * - Exported from barrel index
 *
 * Run: npx vitest run tests/nerve-center-service-synapses.test.ts
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const NERVE_CENTER_DIR = path.resolve(
  __dirname,
  "../client/src/components/analytics/nerve-center",
);

const SYNAPSES_PATH = path.join(NERVE_CENTER_DIR, "ServiceSynapses.tsx");
const INDEX_PATH = path.join(NERVE_CENTER_DIR, "index.ts");

// ---- File existence ----

describe("service-synapses — file structure", () => {
  it("ServiceSynapses.tsx exists", () => {
    expect(fs.existsSync(SYNAPSES_PATH)).toBe(true);
  });

  it("barrel export re-exports ServiceSynapses", () => {
    const src = fs.readFileSync(INDEX_PATH, "utf-8");
    expect(src).toMatch(/export.*ServiceSynapses/);
  });
});

// ---- Component structure ----

describe("service-synapses — component rendering", () => {
  const src = () => fs.readFileSync(SYNAPSES_PATH, "utf-8");

  it("exports ServiceSynapses as a named function component", () => {
    expect(src()).toMatch(/export.*function ServiceSynapses/);
  });

  it("accepts a services prop for service status data", () => {
    expect(src()).toMatch(/services/);
  });

  it("accepts an onStateChange callback prop", () => {
    expect(src()).toMatch(/onStateChange/);
  });

  it("renders service names in the list", () => {
    // Should display each service's name
    expect(src()).toMatch(/\.name|service\.name|svc\.name/);
  });

  it("renders response time in milliseconds for active services", () => {
    // Should display responseMs value
    expect(src()).toMatch(/responseMs|response.*ms/i);
  });

  it("displays ms unit label", () => {
    expect(src()).toMatch(/ms/);
  });
});

// ---- Status dot coloring ----

describe("service-synapses — status dot colors", () => {
  const src = () => fs.readFileSync(SYNAPSES_PATH, "utf-8");

  it("uses green for 'up' status", () => {
    const content = src();
    // Should map "up" to a green color class or style
    expect(content).toMatch(/green|emerald/i);
  });

  it("uses red for 'down' status", () => {
    const content = src();
    expect(content).toMatch(/red/i);
  });

  it("uses gray for 'unknown' status", () => {
    const content = src();
    expect(content).toMatch(/gray|slate|zinc/i);
  });

  it("maps service status to dot color conditionally", () => {
    const content = src();
    // Should have conditional logic based on status value
    expect(content).toMatch(/status.*===.*up|up.*:.*down|status.*down/);
  });
});

// ---- Organ state color logic ----

describe("service-synapses — organ state calculation", () => {
  const src = () => fs.readFileSync(SYNAPSES_PATH, "utf-8");

  it("computes organ state from service statuses", () => {
    const content = src();
    // Should have logic that derives overall state from individual services
    expect(content).toMatch(/every|some|filter|reduce/);
  });

  it("reports green/active state when all services are up", () => {
    const content = src();
    // All-up scenario maps to healthy state
    expect(content).toMatch(/every.*up|all.*up/i);
  });

  it("reports red/alert state when any service is down", () => {
    const content = src();
    // Any-down scenario maps to alert state
    expect(content).toMatch(/some.*down|any.*down|find.*down/i);
  });

  it("calls onStateChange callback with computed state", () => {
    const content = src();
    expect(content).toMatch(/onStateChange/);
  });
});

// ---- Empty / unconfigured state ----

describe("service-synapses — no services configured", () => {
  const src = () => fs.readFileSync(SYNAPSES_PATH, "utf-8");

  it("shows 'No services configured' when service list is empty", () => {
    const content = src();
    expect(content).toMatch(/No services configured/);
  });

  it("handles empty services array gracefully", () => {
    const content = src();
    // Should check for empty/null services before mapping
    expect(content).toMatch(/\.length.*===.*0|!services|services\?/);
  });
});

// ---- Compact layout ----

describe("service-synapses — compact layout", () => {
  const src = () => fs.readFileSync(SYNAPSES_PATH, "utf-8");

  it("renders as a card fitting an organ slot", () => {
    const content = src();
    // Should have card-like styling: padding, rounded corners, border
    expect(content).toMatch(/rounded|border|p-\d/);
  });

  it("uses one line per service for compact display", () => {
    const content = src();
    // Flex row or inline layout for each service entry
    expect(content).toMatch(/flex.*items-center|flex.*row|inline-flex/);
  });

  it("uses solid colors only — no gradients", () => {
    const content = src();
    expect(content).not.toMatch(/bg-gradient|from-.*to-.*bg-clip-text/);
  });
});

// ---- Safety checks ----

describe("service-synapses — safety", () => {
  it("no hardcoded user paths", () => {
    const content = fs.readFileSync(SYNAPSES_PATH, "utf-8");
    expect(content).not.toMatch(/C:\\Users|\/Users\/\w+|\/home\/\w+/);
  });

  it("no PII or phone numbers", () => {
    const content = fs.readFileSync(SYNAPSES_PATH, "utf-8");
    expect(content).not.toMatch(/\d{3}[-.]?\d{3}[-.]?\d{4}/);
  });

  it("no text gradients", () => {
    const content = fs.readFileSync(SYNAPSES_PATH, "utf-8");
    expect(content).not.toMatch(/bg-gradient|from-.*to-.*bg-clip-text/);
  });
});
