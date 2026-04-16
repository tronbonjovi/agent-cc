/**
 * Source metadata registry — single source of truth for UI rendering of
 * every `InteractionSource` variant (display name, lucide icon name, wiring
 * status, and broad category).
 *
 * Added in milestone chat-import-platforms (task001) to pave the way for
 * future external platform integrations (GitHub issues, Telegram, Discord,
 * iMessage). The planned sources are schema-only — no ingestion wiring yet —
 * but this module lets UI components render them consistently (e.g. "coming
 * soon" badges in source filters) without hard-coding strings at every site.
 *
 * Keep `SOURCE_METADATA` exhaustive over `InteractionSource`: the
 * `Record<InteractionSource, SourceMetadata>` type forces the compiler to
 * flag missing entries when a new source is added to the union.
 */

import type { InteractionSource } from './types';

export type SourceWiringStatus = 'wired' | 'planned';

export interface SourceMetadata {
  id: InteractionSource;
  /** Human-readable label for UI (tabs, filters, badges). */
  displayName: string;
  /** lucide-react icon name. Runtime validation lives at the icon import site. */
  icon: string;
  /** `wired` = ingestion path exists today. `planned` = schema placeholder. */
  wiringStatus: SourceWiringStatus;
  /** Broad grouping used by analytics and filter UIs. */
  category: 'ai' | 'deterministic' | 'external';
}

export const SOURCE_METADATA: Record<InteractionSource, SourceMetadata> = {
  'chat-ai':       { id: 'chat-ai',       displayName: 'AI chat',        icon: 'Bot',           wiringStatus: 'wired',   category: 'ai' },
  'chat-slash':    { id: 'chat-slash',    displayName: 'Slash command',  icon: 'Terminal',      wiringStatus: 'wired',   category: 'deterministic' },
  'chat-hook':     { id: 'chat-hook',     displayName: 'Hook',           icon: 'Zap',           wiringStatus: 'wired',   category: 'deterministic' },
  'chat-workflow': { id: 'chat-workflow', displayName: 'Workflow',       icon: 'GitBranch',     wiringStatus: 'wired',   category: 'deterministic' },
  'scanner-jsonl': { id: 'scanner-jsonl', displayName: 'Claude session', icon: 'FileText',      wiringStatus: 'wired',   category: 'ai' },
  'github-issue':  { id: 'github-issue',  displayName: 'GitHub issue',   icon: 'Github',        wiringStatus: 'planned', category: 'external' },
  'telegram':      { id: 'telegram',      displayName: 'Telegram',       icon: 'Send',          wiringStatus: 'planned', category: 'external' },
  'discord':       { id: 'discord',       displayName: 'Discord',        icon: 'MessageCircle', wiringStatus: 'planned', category: 'external' },
  'imessage':      { id: 'imessage',      displayName: 'iMessage',       icon: 'MessageSquare', wiringStatus: 'planned', category: 'external' },
};

export function getSourceMetadata(source: InteractionSource): SourceMetadata {
  return SOURCE_METADATA[source];
}

export function getWiredSources(): SourceMetadata[] {
  return Object.values(SOURCE_METADATA).filter((s) => s.wiringStatus === 'wired');
}

export function getPlannedSources(): SourceMetadata[] {
  return Object.values(SOURCE_METADATA).filter((s) => s.wiringStatus === 'planned');
}
