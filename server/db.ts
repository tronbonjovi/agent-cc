import fs from "fs";
import path from "path";
import os from "os";
import type { Entity, Relationship, MarkdownBackup, AppSettings, CustomNode, CustomEdge, EntityOverride, SessionSummary, PromptTemplate, WorkflowConfig, SessionNote, TerminalPanelState, CostRecord, CostIndexState, ChatTabState, ChatGlobalDefaults, ProviderConfig } from "@shared/types";

const dataDir = process.env.AGENT_CC_DATA
  ? path.resolve(process.env.AGENT_CC_DATA)
  : path.join(os.homedir(), ".agent-cc");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "agent-cc.json");
const dbTmpPath = dbPath + ".tmp";

export interface DBData {
  entities: Record<string, Entity>;
  relationships: Relationship[];
  markdownBackups: MarkdownBackup[];
  discoveryCache: Record<string, { results: string; cachedAt: string }>;
  nextRelId: number;
  nextBackupId: number;
  appSettings: AppSettings;
  customNodes: CustomNode[];
  customEdges: CustomEdge[];
  entityOverrides: Record<string, EntityOverride>;
  sessionSummaries: Record<string, SessionSummary>;
  promptTemplates: Record<string, PromptTemplate>;
  workflowConfig: WorkflowConfig;
  sessionNotes: Record<string, SessionNote>;
  pinnedSessions: string[];
  sessionNames: Record<string, string>;
  markdownMeta: Record<string, { locked?: boolean; pinned?: boolean }>;
  terminalPanel: TerminalPanelState;
  costRecords: Record<string, CostRecord>;
  costIndexState: CostIndexState;
  boardConfig: { projectColors: Record<string, string>; archivedMilestones: string[] };
  staleCounts: Record<string, number>;
  /**
   * Persisted chat UI tab state — which conversations are currently open as
   * tabs, their ordering, and which one is active. Hydrated on the client by
   * `client/src/stores/chat-tabs-store.ts` via `GET /api/chat/tabs`, and
   * written back by `PUT /api/chat/tabs`. Missing on older DBs (migration-safe
   * default is applied below).
   */
  chatUIState: ChatTabState;
  /**
   * Maps conversationId → sessionId for chat-originated sessions. When a chat
   * prompt creates a Claude CLI session, the session ID is captured from the
   * stream init and stored here so the sidebar can distinguish chat sessions
   * from scanner-discovered ones. Added in chat-scanner-unification task002.
   */
  chatSessions: Record<string, { sessionId: string; title: string; createdAt: string }>;
  /**
   * Global chat composer defaults — new conversations inherit these on open.
   * Per-conversation overrides are held client-side in the Zustand settings
   * store; only the global layer round-trips through the server via
   * `GET/PUT /api/settings/chat-defaults`. Added in chat-composer-controls
   * task001.
   */
  chatDefaults: ChatGlobalDefaults;
  /**
   * Configured chat providers. Ships with two built-in entries
   * (`claude-code`, `ollama`) that cannot be deleted — users add more
   * OpenAI-compatible providers through the settings UI. CRUD lives in
   * `server/routes/providers.ts`; API keys are server-only and masked in
   * every response. Added in chat-provider-system task001.
   */
  providers: ProviderConfig[];
}

/** Migration-safe default chat composer settings. */
export const defaultChatDefaults: ChatGlobalDefaults = {
  providerId: "claude-code",
  model: "claude-sonnet-4-6",
  effort: "medium",
};

/**
 * Default provider list — seeded on fresh DBs and re-added by the migration
 * guard below if a legacy DB is missing the `providers` field. The Ollama
 * entry's `baseUrl` honors `OLLAMA_URL` so devs running Ollama on a non-
 * default port (or a remote host) can override without editing the DB.
 */
export function defaultProviders(): ProviderConfig[] {
  return [
    {
      id: "claude-code",
      name: "Claude Code",
      type: "claude-cli",
      auth: { type: "none" },
      capabilities: {
        thinking: true,
        effort: true,
        webSearch: true,
        systemPrompt: true,
        fileAttachments: true,
        projectContext: true,
      },
      builtin: true,
    },
    {
      id: "ollama",
      name: "Ollama",
      type: "openai-compatible",
      baseUrl: process.env.OLLAMA_URL || "http://localhost:11434",
      auth: { type: "none" },
      capabilities: {
        temperature: true,
        systemPrompt: true,
      },
      builtin: true,
    },
  ];
}

export const defaultAppSettings: AppSettings = {
  appName: "Agent CC",
  onboarded: true,
  billingMode: "auto",
  healthThresholds: {
    context: { yellow: 20, red: 50 },
    cost: { yellow: 3, red: 5 },
    messages: { yellow: 30, red: 60 },
    dataSize: { yellow: 500, red: 2000 },
  },
  scanPaths: {
    homeDir: null,
    claudeDir: null,
    extraMcpFiles: [],
    extraProjectDirs: [],
    extraSkillDirs: [],
    extraPluginDirs: [],
  },
};

function defaultData(): DBData {
  return {
    entities: {},
    relationships: [],
    markdownBackups: [],
    discoveryCache: {},
    nextRelId: 1,
    nextBackupId: 1,
    appSettings: { ...defaultAppSettings, scanPaths: { ...defaultAppSettings.scanPaths } },
    customNodes: [],
    customEdges: [],
    entityOverrides: {},
    sessionSummaries: {},
    promptTemplates: {},
    workflowConfig: { autoSummarize: false, autoArchiveStale: false, costAlertThreshold: null },
    sessionNotes: {},
    pinnedSessions: [],
    sessionNames: {},
    markdownMeta: {},
    terminalPanel: {
      height: 300,
      collapsed: false,
      groups: [],
      activeGroupId: null,
    },
    costRecords: {},
    costIndexState: { files: {}, totalRecords: 0, lastIndexAt: "", version: 1 },
    boardConfig: { projectColors: {}, archivedMilestones: [] },
    staleCounts: {},
    chatUIState: { openTabs: [], activeTabId: null, tabOrder: [] },
    chatSessions: {},
    chatDefaults: { ...defaultChatDefaults },
    providers: defaultProviders(),
  };
}

let data: DBData;

try {
  if (fs.existsSync(dbPath)) {
    data = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
    // Ensure all fields exist
    if (!data.entities) data.entities = {};
    if (!data.relationships) data.relationships = [];
    if (!data.markdownBackups) data.markdownBackups = [];
    if (!data.discoveryCache) data.discoveryCache = {};
    if (!data.nextRelId) data.nextRelId = 1;
    if (!data.nextBackupId) data.nextBackupId = 1;
    if (!data.appSettings) data.appSettings = defaultData().appSettings;
    if (!data.customNodes) data.customNodes = [];
    if (!data.customEdges) data.customEdges = [];
    if (!data.entityOverrides) data.entityOverrides = {};
    if (!data.sessionSummaries) data.sessionSummaries = {};
    if (!data.promptTemplates) data.promptTemplates = {};
    if (!data.workflowConfig) data.workflowConfig = { autoSummarize: false, autoArchiveStale: false, costAlertThreshold: null };
    if (!data.sessionNotes) data.sessionNotes = {};
    if (!data.pinnedSessions) data.pinnedSessions = [];
    if (!data.sessionNames) data.sessionNames = {};
    if (!data.markdownMeta) data.markdownMeta = {};
    if (!data.terminalPanel) data.terminalPanel = defaultData().terminalPanel;
    // Migrate old flat-tab format to groups
    if ((data.terminalPanel as any).tabs && !(data.terminalPanel as any).groups) {
      const oldTabs = (data.terminalPanel as any).tabs as Array<{ id: string; name: string }>;
      const oldActiveTabId = (data.terminalPanel as any).activeTabId as string | null;
      const oldSplitTabId = (data.terminalPanel as any).splitTabId as string | null;
      if (oldTabs.length > 0) {
        // Build groups — if there was an active split, group those two together
        const splitPairIds = new Set<string>();
        if (oldActiveTabId && oldSplitTabId && oldActiveTabId !== oldSplitTabId) {
          splitPairIds.add(oldActiveTabId);
          splitPairIds.add(oldSplitTabId);
        }

        const groups: Array<{ id: string; instances: Array<{ id: string; name: string }> }> = [];
        const handled = new Set<string>();

        // First: create the split group if applicable
        if (splitPairIds.size === 2) {
          const activeTab = oldTabs.find((t) => t.id === oldActiveTabId);
          const splitTab = oldTabs.find((t) => t.id === oldSplitTabId);
          if (activeTab && splitTab) {
            groups.push({
              id: activeTab.id,
              instances: [
                { id: activeTab.id, name: activeTab.name },
                { id: splitTab.id, name: splitTab.name },
              ],
            });
            handled.add(activeTab.id);
            handled.add(splitTab.id);
          }
        }

        // Then: each remaining tab becomes its own group
        for (const tab of oldTabs) {
          if (!handled.has(tab.id)) {
            groups.push({ id: tab.id, instances: [{ id: tab.id, name: tab.name }] });
          }
        }

        data.terminalPanel = {
          height: data.terminalPanel.height,
          collapsed: data.terminalPanel.collapsed,
          groups,
          // Validate activeGroupId exists in migrated groups
          activeGroupId: groups.some((g) => g.id === oldActiveTabId)
            ? oldActiveTabId
            : groups[0].id,
        };
      } else {
        // Empty old tabs — preserve height/collapsed preferences
        const defaults = defaultData().terminalPanel;
        data.terminalPanel = {
          ...defaults,
          height: data.terminalPanel.height ?? defaults.height,
          collapsed: data.terminalPanel.collapsed ?? defaults.collapsed,
        };
      }
    }
    if (!data.costRecords) data.costRecords = {};
    if (!data.costIndexState) data.costIndexState = { files: {}, totalRecords: 0, lastIndexAt: "", version: 1 };
    if (!data.boardConfig) data.boardConfig = { projectColors: {}, archivedMilestones: [] };
    if (!data.boardConfig.archivedMilestones) data.boardConfig.archivedMilestones = [];
    if (!data.staleCounts) data.staleCounts = {};
    if (!data.chatUIState) {
      data.chatUIState = { openTabs: [], activeTabId: null, tabOrder: [] };
    }
    if (!data.chatSessions) {
      data.chatSessions = {};
    }
    if (!data.chatDefaults) {
      data.chatDefaults = { ...defaultChatDefaults };
    }
    if (!data.providers || !Array.isArray(data.providers)) {
      data.providers = defaultProviders();
    } else {
      // Guarantee built-ins are present — if a legacy DB was hand-edited to
      // delete `claude-code` or `ollama`, re-seed them so the rest of the
      // app (chat composer, provider dropdown) always has a baseline.
      for (const p of defaultProviders()) {
        if (!data.providers.some((x) => x.id === p.id)) {
          data.providers.push(p);
        }
      }
    }
    // Silently discard leftover pipeline keys from older DB files
    delete (data as any).pipelineConfig;
    delete (data as any).pipelineRun;
    if (data.appSettings.onboarded === undefined) data.appSettings.onboarded = false;
    if (!data.appSettings.billingMode) data.appSettings.billingMode = "auto";
  } else {
    data = defaultData();
  }
} catch (err) {
  console.error("[db] Failed to load database:", (err as Error).message);
  // If the file exists but can't be parsed, create a backup instead of overwriting
  if (fs.existsSync(dbPath)) {
    const backupPath = dbPath + ".corrupt." + Date.now();
    try {
      fs.copyFileSync(dbPath, backupPath);
      console.warn(`[db] Corrupted DB backed up to: ${backupPath}`);
    } catch {}
  }
  data = defaultData();
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Atomic write: write to .tmp then rename */
function writeAtomic(content: string): void {
  fs.writeFileSync(dbTmpPath, content, "utf-8");
  fs.renameSync(dbTmpPath, dbPath);
}

export function save(): void {
  // Debounced save
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      writeAtomic(JSON.stringify(data));
    } catch (err) {
      console.error("[db] Failed to save:", err);
    }
  }, 500);
}

export function saveSync(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    writeAtomic(JSON.stringify(data));
  } catch (err) {
    console.error("[db] Failed to save:", err);
  }
}

export function getDB(): DBData {
  return data;
}

// Flush pending writes on process exit
function onExit() {
  saveSync();
}
process.on("SIGTERM", onExit);
process.on("SIGINT", onExit);
process.on("beforeExit", onExit);
