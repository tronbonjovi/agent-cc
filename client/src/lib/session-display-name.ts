/**
 * Returns the best display name for a session.
 * Priority: custom name > slug > first message summary > truncated session ID
 */
export function getSessionDisplayName(
  sessionId: string,
  opts: {
    customNames?: Record<string, string>;
    slug?: string;
    firstMessage?: string;
    maxLength?: number;
  }
): string {
  const maxLen = opts.maxLength ?? 40;

  // 1. Custom name from user
  const custom = opts.customNames?.[sessionId];
  if (custom) return truncate(custom, maxLen);

  // 2. Slug (Claude's auto-generated name)
  if (opts.slug) return truncate(opts.slug, maxLen);

  // 3. First message summary
  if (opts.firstMessage) {
    const words = opts.firstMessage.trim().split(/\s+/).slice(0, 5);
    let result = words.join(" ");
    if (opts.firstMessage.trim().split(/\s+/).length > 5) result += "...";
    return truncate(result, maxLen);
  }

  // 4. Truncated session ID
  return sessionId.slice(0, 13) + "...";
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}
