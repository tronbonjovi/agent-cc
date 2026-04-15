// client/src/stores/layout-store.ts
//
// Persists the right-side chat panel width + collapsed state to
// localStorage under `agent-cc:layout`. Consumed by layout.tsx to size
// the third column of the 3-column resizable shell.
//
// See shared/types.ts ChatMessage + chat-store.ts for the ephemeral
// message store this layout hosts.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface LayoutState {
  chatPanelWidth: number;
  chatPanelCollapsed: boolean;
  setChatPanelWidth: (width: number) => void;
  toggleChatPanel: () => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      chatPanelWidth: 400,
      chatPanelCollapsed: false,
      setChatPanelWidth: (width) => set({ chatPanelWidth: width }),
      toggleChatPanel: () =>
        set((s) => ({ chatPanelCollapsed: !s.chatPanelCollapsed })),
    }),
    {
      name: "agent-cc:layout",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        chatPanelWidth: s.chatPanelWidth,
        chatPanelCollapsed: s.chatPanelCollapsed,
      }),
    },
  ),
);
