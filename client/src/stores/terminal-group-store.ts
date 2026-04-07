import { create } from "zustand";
import type { TerminalPanelState, TerminalGroupData, TerminalInstanceData } from "@shared/types";

interface TerminalInstanceInfo extends TerminalInstanceData {
  shellType: string;
}

interface TerminalGroup {
  id: string;
  instances: TerminalInstanceInfo[];
}

interface TerminalGroupState {
  groups: TerminalGroup[];
  activeGroupId: string | null;
  focusedInstanceId: string | null;
  height: number;
  collapsed: boolean;
  unreadInstanceIds: Set<string>;

  // Actions
  createGroup: (groupId: string, instanceId: string, shellName: string) => void;
  splitGroup: (groupId: string, instanceId: string, shellName: string) => void;
  removeInstance: (groupId: string, instanceId: string) => void;
  setActiveGroup: (groupId: string) => void;
  setFocusedInstance: (instanceId: string) => void;
  renameInstance: (instanceId: string, name: string) => void;
  setHeight: (height: number) => void;
  setCollapsed: (collapsed: boolean) => void;
  markUnread: (instanceId: string) => void;
  clearUnread: (instanceId: string) => void;
  loadFromServer: (data: TerminalPanelState) => void;
  toSerializable: () => TerminalPanelState;
}

export const useTerminalGroupStore = create<TerminalGroupState>((set, get) => ({
  groups: [],
  activeGroupId: null,
  focusedInstanceId: null,
  height: 300,
  collapsed: false,
  unreadInstanceIds: new Set(),

  createGroup: (groupId, instanceId, shellName) => {
    const instance: TerminalInstanceInfo = {
      id: instanceId,
      name: shellName,
      shellType: shellName,
    };
    set((s) => ({
      groups: [...s.groups, { id: groupId, instances: [instance] }],
      activeGroupId: groupId,
      focusedInstanceId: instanceId,
    }));
  },

  splitGroup: (groupId, instanceId, shellName) => {
    const instance: TerminalInstanceInfo = {
      id: instanceId,
      name: shellName,
      shellType: shellName,
    };
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === groupId
          ? { ...g, instances: [...g.instances, instance] }
          : g
      ),
      focusedInstanceId: instanceId,
    }));
  },

  removeInstance: (groupId, instanceId) => {
    set((s) => {
      const group = s.groups.find((g) => g.id === groupId);
      if (!group) return s;

      const remaining = group.instances.filter((i) => i.id !== instanceId);

      // Remove unread tracking
      const newUnread = new Set(s.unreadInstanceIds);
      newUnread.delete(instanceId);

      if (remaining.length === 0) {
        // Group is empty — remove it
        const newGroups = s.groups.filter((g) => g.id !== groupId);
        let newActiveId = s.activeGroupId;

        if (s.activeGroupId === groupId) {
          // Activate nearest group
          const oldIdx = s.groups.findIndex((g) => g.id === groupId);
          if (newGroups.length > 0) {
            const nearestIdx = Math.min(oldIdx, newGroups.length - 1);
            newActiveId = newGroups[nearestIdx].id;
          } else {
            newActiveId = null;
          }
        }

        return {
          groups: newGroups,
          activeGroupId: newActiveId,
          focusedInstanceId: newActiveId
            ? newGroups.find((g) => g.id === newActiveId)?.instances[0]?.id ?? null
            : null,
          unreadInstanceIds: newUnread,
        };
      }

      // Group still has instances
      return {
        groups: s.groups.map((g) =>
          g.id === groupId ? { ...g, instances: remaining } : g
        ),
        focusedInstanceId:
          s.focusedInstanceId === instanceId
            ? remaining[remaining.length - 1].id
            : s.focusedInstanceId,
        unreadInstanceIds: newUnread,
      };
    });
  },

  setActiveGroup: (groupId) => {
    set((s) => {
      const group = s.groups.find((g) => g.id === groupId);
      // Clear unread for all instances in the newly active group
      const newUnread = new Set(s.unreadInstanceIds);
      group?.instances.forEach((i) => newUnread.delete(i.id));
      return {
        activeGroupId: groupId,
        focusedInstanceId: group?.instances[0]?.id ?? null,
        unreadInstanceIds: newUnread,
      };
    });
  },

  setFocusedInstance: (instanceId) => {
    set({ focusedInstanceId: instanceId });
  },

  renameInstance: (instanceId, name) => {
    set((s) => ({
      groups: s.groups.map((g) => ({
        ...g,
        instances: g.instances.map((i) =>
          i.id === instanceId ? { ...i, name } : i
        ),
      })),
    }));
  },

  setHeight: (height) => set({ height }),
  setCollapsed: (collapsed) => set({ collapsed }),

  markUnread: (instanceId) => {
    set((s) => {
      const newUnread = new Set(s.unreadInstanceIds);
      newUnread.add(instanceId);
      return { unreadInstanceIds: newUnread };
    });
  },

  clearUnread: (instanceId) => {
    set((s) => {
      if (!s.unreadInstanceIds.has(instanceId)) return s;
      const newUnread = new Set(s.unreadInstanceIds);
      newUnread.delete(instanceId);
      return { unreadInstanceIds: newUnread };
    });
  },

  loadFromServer: (data) => {
    set({
      groups: data.groups.map((g) => ({
        id: g.id,
        instances: g.instances.map((i) => ({
          ...i,
          shellType: i.name, // Best guess — server doesn't persist shellType separately
        })),
      })),
      activeGroupId: data.activeGroupId,
      height: data.height,
      collapsed: data.collapsed,
    });
  },

  toSerializable: (): TerminalPanelState => {
    const s = get();
    return {
      height: s.height,
      collapsed: s.collapsed,
      groups: s.groups.map((g) => ({
        id: g.id,
        instances: g.instances.map((i) => ({ id: i.id, name: i.name })),
      })),
      activeGroupId: s.activeGroupId,
    };
  },
}));
