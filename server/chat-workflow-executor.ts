/**
 * Chat workflow executor — chat-workflows-tabs / task004.
 *
 * The Archon security pattern for chat input: chat can ONLY trigger AI
 * prompts or named entries from this hardcoded registry. This module owns
 * the registry lookup and the single built-in workflow (`echo`) that ships
 * with M6. It is called from `server/routes/chat-workflows.ts`, which is
 * the only place that exposes a request → runWorkflow path.
 *
 * Security invariants (locked in by a source-text test in
 * tests/chat-workflow-executor.test.ts):
 *
 *   - No subprocess APIs in this module — the guardrail test bans the
 *     relevant identifiers even in comments. Future workflows that need
 *     to shell out will live in a separate module with their own
 *     isolation story.
 *   - No dynamic code paths driven by request input.
 *   - Workflow lookup uses Object.prototype.hasOwnProperty.call so an
 *     attacker-controlled "toString" or "__proto__" string can never
 *     resolve to a builtin method.
 *
 * Scope note: the echo workflow is deliberately minimal — three static
 * steps, no args parsing, no error paths. It exists to prove the
 * dispatch/persist/broadcast wiring end-to-end in task004. Real workflows
 * land after M6 ships.
 */
import { randomUUID } from 'node:crypto';
import type { InteractionEvent, SystemContent } from '../shared/types';

/**
 * One step emitted by a workflow handler. The executor wraps each step in
 * an `InteractionEvent` before yielding it to the route. Handlers never
 * construct events directly — keeping the event shape in one place means
 * future workflow authors can't accidentally drift the schema.
 */
export interface WorkflowStep {
  name: string;
  text: string;
  data?: unknown;
  error?: boolean;
}

/**
 * Built-in "echo" workflow. Yields three static steps with a tiny
 * `await Promise.resolve()` between them so the laziness guarantee is
 * observable in tests (the generator must yield control between steps,
 * not pre-compute the whole list).
 */
async function* runEchoWorkflow(args: string): AsyncGenerator<WorkflowStep> {
  yield { name: 'echo.start', text: 'echo workflow starting' };
  await Promise.resolve();
  yield { name: 'echo.args', text: `args: ${args || '(none)'}` };
  await Promise.resolve();
  yield { name: 'echo.done', text: 'echo workflow complete' };
}

/**
 * The registry. Hardcoded at module-load time — never mutated, never
 * populated from request input. New workflows require a code change + a
 * PR review, which is the whole point of the Archon pattern.
 */
const WORKFLOWS: Record<string, (args: string) => AsyncGenerator<WorkflowStep>> = {
  echo: runEchoWorkflow,
};

/**
 * Used by the route handler BEFORE running so it can return 404
 * synchronously for unknown workflows. The 404 (not a 200 + async error
 * event) is the contract task003's client relies on to decide whether to
 * fall through to the AI prompt path.
 *
 * `Object.prototype.hasOwnProperty.call` — rather than `name in WORKFLOWS`
 * or `WORKFLOWS[name]` — is the prototype-pollution guard. A request with
 * `workflow: "toString"` must return false here, not resolve to the
 * inherited `Object.prototype.toString` method.
 */
export function isKnownWorkflow(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(WORKFLOWS, name);
}

/**
 * Run a workflow and yield one `InteractionEvent` per step. Throws on an
 * unknown workflow name; the route already validated via `isKnownWorkflow`
 * so the throw is a defensive inner check, not the primary contract.
 *
 * `conversationId` is threaded through the generator so each yielded event
 * carries the right conversation binding — the route never needs to
 * post-process the event to attach an id.
 */
export async function* runWorkflow(
  name: string,
  args: string,
  conversationId: string,
): AsyncGenerator<InteractionEvent> {
  const handler = Object.prototype.hasOwnProperty.call(WORKFLOWS, name)
    ? WORKFLOWS[name]
    : undefined;
  if (!handler) {
    throw new Error(`Unknown workflow: ${name}`);
  }
  for await (const step of handler(args)) {
    yield buildEvent(step, conversationId);
  }
}

/**
 * Wrap a `WorkflowStep` into a fully-formed `InteractionEvent`. The shape
 * must match what task006 (rich live rendering) will consume downstream.
 * `content.data` currently carries `{ step, error }` — task006 can extend
 * the shape but must not require anything beyond these fields.
 */
function buildEvent(
  step: WorkflowStep,
  conversationId: string,
): InteractionEvent {
  const content: SystemContent = {
    type: 'system',
    subtype: 'workflow_step',
    text: step.text,
    data: {
      step: step.name,
      error: step.error === true,
      // Pass through any structured data the handler wanted to expose.
      // task006 can read this for rich rendering.
      ...(step.data !== undefined ? { payload: step.data } : {}),
    },
  };
  return {
    id: randomUUID(),
    conversationId,
    parentEventId: null,
    timestamp: new Date().toISOString(),
    source: 'chat-workflow',
    role: 'system',
    content,
    cost: null,
  };
}
