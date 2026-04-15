// tests/use-chat-history.test.ts
//
// Source-text guardrails for the `useChatHistory` React Query hook
// (unified-capture milestone, task006).
//
// Per the project convention (see CLAUDE.md and the
// reference_vitest_client_excluded memory), the entire client/ directory is
// excluded from the vitest root, so we cannot run the hook through React
// Testing Library. Instead this file asserts the *source text* of the hook
// file matches the contract — the hook file exists, exports the right
// function, imports React Query's `useQuery`, types the response shape with
// `InteractionEvent` from shared/types, uses a stable query key, and fetches
// the correct endpoint.
//
// Follows the same guardrail pattern established in
// tests/interaction-event-renderer.test.ts.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const HOOK_PATH = path.resolve(ROOT, 'client/src/hooks/use-chat-history.ts');

describe('use-chat-history.ts — source guardrails', () => {
  it('1. file exists at the expected path', () => {
    expect(fs.existsSync(HOOK_PATH)).toBe(true);
  });

  // Read once, share across the rest of the suite.
  const src = fs.readFileSync(HOOK_PATH, 'utf-8');

  it('2. exports the useChatHistory named function', () => {
    expect(src).toMatch(/export\s+function\s+useChatHistory\s*\(/);
  });

  it('3. imports useQuery from @tanstack/react-query', () => {
    expect(src).toMatch(
      /import\s*\{[^}]*\buseQuery\b[^}]*\}\s*from\s*['"]@tanstack\/react-query['"]/,
    );
  });

  it('4. imports InteractionEvent type from shared/types', () => {
    // Tolerates either a relative path or the @shared alias.
    expect(src).toMatch(
      /import\s+type\s*\{[^}]*\bInteractionEvent\b[^}]*\}\s*from\s*['"][^'"]*shared\/types['"]/,
    );
  });

  it('5. uses a stable [chat-history, conversationId] query key', () => {
    // Whitespace-tolerant match for `queryKey: ['chat-history', conversationId]`.
    // Accepts either single or double quotes around the literal.
    expect(src).toMatch(
      /queryKey\s*:\s*\[\s*['"]chat-history['"]\s*,\s*conversationId\s*\]/,
    );
  });

  it('6. fetches from /api/chat/conversations/${conversationId}/events', () => {
    // Template literal — escape the $ so the regex is literal.
    expect(src).toMatch(
      /fetch\s*\(\s*`\/api\/chat\/conversations\/\$\{conversationId\}\/events`/,
    );
  });

  it('7. has no bounce/scale cartoonish animations', () => {
    // Project safety rule (feedback_no_bounce_animations +
    // new-user-safety.test.ts). The hook file is unlikely to contain these,
    // but we enforce uniformly across new client files.
    expect(src).not.toMatch(/\banimate-bounce\b/);
    expect(src).not.toMatch(/\bscale-\d/);
    expect(src).not.toMatch(/\bbounce\b/);
  });

  it('8. has no gradient classes', () => {
    // User preference (feedback_no_gradients).
    expect(src).not.toMatch(/bg-gradient/);
    expect(src).not.toMatch(/from-\[/);
    expect(src).not.toMatch(/via-\[/);
    expect(src).not.toMatch(/to-\[/);
    expect(src).not.toMatch(/text-gradient/);
  });
});
