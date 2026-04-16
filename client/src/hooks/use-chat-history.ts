// client/src/hooks/use-chat-history.ts
//
// React Query hook for chat history — chat-scanner-unification task003.
//
// Fetches the message timeline from the scanner session endpoint
// (GET /api/sessions/:sessionId/messages) and maps TimelineMessages to
// InteractionEvents so the existing chat rendering pipeline (EventRow,
// mergeChatEvents) continues to work unchanged.
//
// The conversationId IS the sessionId — chat-scanner-unification collapsed
// the two concepts. When the session doesn't exist yet (new tab, no prompt
// sent), the fetch returns 404 and we return an empty array so the live SSE
// buffer renders alone.

import { useQuery } from '@tanstack/react-query';
import type { InteractionEvent } from '../../../shared/types';
import type {
  TimelineMessage,
  MessageTimelineResponse,
} from '../../../shared/session-types';

/**
 * Map a scanner TimelineMessage to an InteractionEvent so the chat UI
 * renderer doesn't need to know about the scanner's wire shape.
 */
function timelineToInteractionEvent(
  msg: TimelineMessage,
  sessionId: string,
): InteractionEvent {
  const base = {
    id: ('uuid' in msg ? msg.uuid : '') || `${msg.type}-${msg.timestamp}`,
    conversationId: sessionId,
    parentEventId: null,
    timestamp: msg.timestamp,
    source: 'chat-ai' as const,
    cost: null,
  };

  switch (msg.type) {
    case 'user_text':
      return {
        ...base,
        id: msg.uuid,
        role: 'user',
        content: { type: 'text', text: msg.text },
      };
    case 'assistant_text':
      return {
        ...base,
        id: msg.uuid,
        role: 'assistant',
        content: { type: 'text', text: msg.text },
        cost: msg.usage
          ? {
              usd: 0,
              tokensIn: msg.usage.inputTokens,
              tokensOut: msg.usage.outputTokens,
              cacheReadTokens: msg.usage.cacheReadTokens,
              cacheCreationTokens: msg.usage.cacheCreationTokens,
              durationMs: 0,
              model: msg.model,
            }
          : null,
      };
    case 'thinking':
      return {
        ...base,
        id: msg.uuid,
        role: 'assistant',
        content: { type: 'thinking', text: msg.text },
      };
    case 'tool_call':
      return {
        ...base,
        id: msg.uuid || `tool-call-${msg.callId}`,
        role: 'assistant',
        content: {
          type: 'tool_call',
          toolName: msg.name,
          input: msg.input,
          toolUseId: msg.callId,
        },
      };
    case 'tool_result':
      return {
        ...base,
        id: msg.uuid || `tool-result-${msg.toolUseId}`,
        role: 'tool',
        content: {
          type: 'tool_result',
          toolUseId: msg.toolUseId,
          output: msg.content,
          isError: msg.isError || undefined,
        },
      };
    case 'system_event': {
      // Map scanner subtypes to the narrower SystemContent.subtype union.
      const subtype =
        msg.subtype === 'workflow_step' || msg.subtype === 'hook_fire'
          ? msg.subtype
          : 'info' as const;
      return {
        ...base,
        id: `system-${msg.timestamp}-${msg.subtype}`,
        role: 'system',
        content: {
          type: 'system',
          subtype,
          text: msg.summary,
          data: null,
        },
      };
    }
    case 'skill_invocation':
      return {
        ...base,
        id: `skill-${msg.timestamp}-${msg.commandName}`,
        role: 'system',
        content: {
          type: 'system',
          subtype: 'info' as const,
          text: `/${msg.commandName} ${msg.commandArgs}`.trim(),
          data: { commandName: msg.commandName, commandArgs: msg.commandArgs },
        },
      };
  }
}

interface ChatHistoryResult {
  events: InteractionEvent[];
}

export function useChatHistory(conversationId: string) {
  return useQuery<ChatHistoryResult>({
    queryKey: ['chat-history', conversationId],
    queryFn: async () => {
      // Resolve the tab's conversationId to a CLI session ID via the
      // chatSessions mapping. The tab UUID and CLI session UUID are
      // independent — the mapping bridges them.
      let sessionId = conversationId;
      try {
        const tabRes = await fetch('/api/chat/sessions');
        if (tabRes.ok) {
          const tabBody = await tabRes.json();
          const sessions: Array<{ conversationId: string; sessionId: string }> =
            tabBody.sessions ?? [];
          const match = sessions.find((s) => s.conversationId === conversationId);
          if (match?.sessionId) {
            sessionId = match.sessionId;
          }
        }
      } catch {
        // Mapping lookup failed — fall through with the tab ID as-is.
      }

      // Fetch the message timeline from the scanner session endpoint.
      const res = await fetch(
        `/api/sessions/${sessionId}/messages?limit=500`,
      );
      if (!res.ok) {
        // 404 means the session doesn't exist yet (new chat tab, no prompt
        // sent). Return empty so the live SSE buffer renders alone.
        if (res.status === 404 || res.status === 400) {
          return { events: [] };
        }
        throw new Error(`Failed to load chat history: ${res.status}`);
      }
      const body: MessageTimelineResponse = await res.json();
      const events = body.messages.map((msg) =>
        timelineToInteractionEvent(msg, conversationId),
      );
      return { events };
    },
  });
}
