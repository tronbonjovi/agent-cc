// tests/use-chat-history.test.ts
//
// Source-text guardrails for the `useChatHistory` React Query hook.
// Rewritten for chat-scanner-unification task003 — the hook now fetches
// from scanner session messages instead of the removed SQLite-backed
// conversation events endpoint.
//
// Per the project convention (reference_vitest_client_excluded), the entire
// client/ directory is excluded from vitest root, so we assert source text.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const HOOK_PATH = path.resolve(ROOT, 'client/src/hooks/use-chat-history.ts');

describe('use-chat-history.ts — source guardrails', () => {
  it('1. file exists at the expected path', () => {
    expect(fs.existsSync(HOOK_PATH)).toBe(true);
  });

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
    expect(src).toMatch(
      /import\s+type\s*\{[^}]*\bInteractionEvent\b[^}]*\}\s*from\s*['"][^'"]*shared\/types['"]/,
    );
  });

  it('5. uses a stable [chat-history, conversationId] query key', () => {
    expect(src).toMatch(
      /queryKey\s*:\s*\[\s*['"]chat-history['"]\s*,\s*conversationId\s*\]/,
    );
  });

  it('6. fetches from /api/sessions/${conversationId}/messages', () => {
    // Now fetches from the scanner session messages endpoint.
    expect(src).toMatch(
      /\/api\/sessions\/\$\{conversationId\}\/messages/,
    );
  });

  it('7. imports TimelineMessage types from shared/session-types', () => {
    expect(src).toMatch(
      /import\s+type\s*\{[^}]*\bTimelineMessage\b[^}]*\}\s*from\s*['"][^'"]*shared\/session-types['"]/,
    );
  });

  it('8. maps TimelineMessage to InteractionEvent via timelineToInteractionEvent', () => {
    expect(src).toContain('timelineToInteractionEvent');
  });

  it('9. handles 404 gracefully (returns empty events)', () => {
    expect(src).toContain('res.status === 404');
    expect(src).toMatch(/events:\s*\[\]/);
  });

  it('10. has no bounce/scale cartoonish animations', () => {
    expect(src).not.toMatch(/\banimate-bounce\b/);
    expect(src).not.toMatch(/\bscale-\d/);
    expect(src).not.toMatch(/\bbounce\b/);
  });

  it('11. has no gradient classes', () => {
    expect(src).not.toMatch(/bg-gradient/);
    expect(src).not.toMatch(/text-gradient/);
  });
});
