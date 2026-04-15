import { create } from 'zustand';
import type { ChatMessage } from '../../../shared/types';

interface ChatState {
  messages: ChatMessage[];
  conversationId: string;
  isStreaming: boolean;
  appendMessage: (msg: ChatMessage) => void;
  appendAssistantChunk: (conversationId: string, text: string) => void;
  clear: () => void;
  setStreaming: (v: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  conversationId: 'default',
  isStreaming: false,
  appendMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  appendAssistantChunk: (conversationId, text) =>
    set((s) => {
      const last = s.messages[s.messages.length - 1];
      if (last && last.role === 'assistant' && last.conversationId === conversationId) {
        const updated = { ...last, text: last.text + text };
        return { messages: [...s.messages.slice(0, -1), updated] };
      }
      return {
        messages: [
          ...s.messages,
          {
            id: crypto.randomUUID(),
            conversationId,
            role: 'assistant',
            text,
            timestamp: new Date().toISOString(),
          },
        ],
      };
    }),
  clear: () => set({ messages: [] }),
  setStreaming: (v) => set({ isStreaming: v }),
}));
