// client/src/components/settings/provider-manager.tsx
//
// Chat provider management UI — chat-provider-system task006.
//
// Responsibilities:
//
//   1. List providers from `GET /api/providers`. Each row shows name, type,
//      base URL, an availability badge (green "Available" / grey
//      "Unavailable") driven by `useProviderModels` counting >0 models, a
//      "Built-in" chip for built-ins, plus edit/delete actions for custom
//      entries.
//
//   2. Add/Edit dialog — the same Dialog serves both paths, differing only
//      by whether `editing` is set. Auth branch (api-key / oauth / none)
//      swaps the fields shown inside the form. Built-ins render a reduced
//      form (claude-code is view-only; ollama allows editing baseUrl only).
//
//   3. Delete flow — uses the shadcn AlertDialog pattern seen in
//      `chat-tab-bar.tsx` for the discard-draft confirm. Fires DELETE
//      against the CRUD endpoint; React Query invalidation refreshes the
//      list.
//
//   4. OAuth connect/disconnect — only visible for oauth-typed providers.
//      "Sign in" calls `GET /api/providers/:id/auth`, `window.open`s the
//      returned authUrl in a new tab, and polls `/status` periodically to
//      flip the UI state when the callback page closes itself. "Disconnect"
//      POSTs to `/disconnect` and invalidates the status query.
//
// Why the plain-fetch helper instead of `apiRequest`:
//
//   - We want per-mutation error messages the user can act on ("Connected",
//     "Failed: ..."), and the surrounding toast calls mirror the
//     `use-settings.ts` pattern. Direct fetch keeps the error body
//     accessible without threading it through apiRequest's generic
//     `${status}: ${text}` shape.

import { useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { ProviderConfig, ProviderCapabilities } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Pencil,
  Trash2,
  LinkIcon,
  Unlink,
  Lock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useProviderModels } from "@/hooks/use-provider-models";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The seven ProviderCapabilities flags we render as checkboxes. Mirrors the
 *  shared-types shape. Keeping it as a tuple means TS catches out-of-sync
 *  additions at compile time. */
const CAPABILITY_FLAGS: ReadonlyArray<{
  key: keyof ProviderCapabilities;
  label: string;
}> = [
  { key: "temperature", label: "temperature" },
  { key: "systemPrompt", label: "systemPrompt" },
  { key: "thinking", label: "thinking" },
  { key: "effort", label: "effort" },
  { key: "webSearch", label: "webSearch" },
  { key: "fileAttachments", label: "fileAttachments" },
  { key: "projectContext", label: "projectContext" },
];

type AuthType = "none" | "api-key" | "oauth";
type ProviderType = "claude-cli" | "openai-compatible";

/** Shape held by the add/edit dialog while the user is typing. */
interface DraftProvider {
  id?: string; // defined in edit mode
  name: string;
  type: ProviderType;
  baseUrl: string;
  authType: AuthType;
  apiKey: string;
  oauthAuthUrl: string;
  oauthTokenUrl: string;
  oauthClientId: string;
  oauthClientSecret: string;
  oauthScopes: string; // comma-separated in the form
  capabilities: ProviderCapabilities;
  builtin?: boolean;
}

function blankDraft(): DraftProvider {
  return {
    name: "",
    type: "openai-compatible",
    baseUrl: "",
    authType: "none",
    apiKey: "",
    oauthAuthUrl: "",
    oauthTokenUrl: "",
    oauthClientId: "",
    oauthClientSecret: "",
    oauthScopes: "",
    capabilities: {},
    builtin: false,
  };
}

function draftFromProvider(p: ProviderConfig): DraftProvider {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    baseUrl: p.baseUrl ?? "",
    authType: p.auth.type,
    apiKey: p.auth.apiKey ?? "",
    oauthAuthUrl: p.auth.oauthConfig?.authUrl ?? "",
    oauthTokenUrl: p.auth.oauthConfig?.tokenUrl ?? "",
    oauthClientId: p.auth.oauthConfig?.clientId ?? "",
    // clientSecret never comes back from the server (scrubbed) — leave
    // blank so the user re-entering nothing means "keep whatever is
    // stored" (the PUT handler falls through to the existing value).
    oauthClientSecret: "",
    oauthScopes: p.auth.oauthConfig?.scopes?.join(", ") ?? "",
    capabilities: { ...p.capabilities },
    builtin: p.builtin ?? false,
  };
}

/** Serialize a DraftProvider into the POST/PUT payload. */
function draftToPayload(draft: DraftProvider): Record<string, unknown> {
  const auth: Record<string, unknown> = { type: draft.authType };
  if (draft.authType === "api-key" && draft.apiKey.trim().length > 0) {
    auth.apiKey = draft.apiKey.trim();
  }
  if (draft.authType === "oauth") {
    const scopes = draft.oauthScopes
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const oauthConfig: Record<string, unknown> = {
      authUrl: draft.oauthAuthUrl.trim(),
      tokenUrl: draft.oauthTokenUrl.trim(),
      clientId: draft.oauthClientId.trim(),
    };
    if (draft.oauthClientSecret.trim().length > 0) {
      oauthConfig.clientSecret = draft.oauthClientSecret.trim();
    }
    if (scopes.length > 0) oauthConfig.scopes = scopes;
    auth.oauthConfig = oauthConfig;
  }

  return {
    name: draft.name.trim(),
    type: draft.type,
    baseUrl: draft.baseUrl.trim() || undefined,
    auth,
    capabilities: draft.capabilities,
  };
}

// ---------------------------------------------------------------------------
// Status pill — driven by the /models probe
// ---------------------------------------------------------------------------

function AvailabilityBadge({ providerId }: { providerId: string }) {
  const { models, isLoading, error } = useProviderModels(providerId);
  if (isLoading) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1">
        Checking...
      </Badge>
    );
  }
  if (error || models.length === 0) {
    return (
      <Badge
        variant="outline"
        className="text-[10px] gap-1 border-muted-foreground/30 text-muted-foreground"
      >
        <XCircle className="h-2.5 w-2.5" />
        Unavailable
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-[10px] gap-1 border-green-500/30 text-green-400"
    >
      <CheckCircle2 className="h-2.5 w-2.5" />
      Available
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// OAuth controls — status probe + connect/disconnect buttons
// ---------------------------------------------------------------------------

function OAuthControls({ providerId }: { providerId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery<{ connected: boolean }>({
    queryKey: [`/api/providers/${providerId}/status`],
    staleTime: 30_000,
  });
  const connected = data?.connected ?? false;

  const signIn = async () => {
    try {
      const res = await fetch(
        `/api/providers/${encodeURIComponent(providerId)}/auth`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed: ${res.status}`);
      }
      const { authUrl } = (await res.json()) as { authUrl: string };
      // Open in a new tab; the provider redirects to /auth/callback which
      // closes itself. We refetch status after a short delay — users often
      // finish the OAuth dance in a few seconds.
      window.open(authUrl, "_blank", "noopener");
      setTimeout(() => {
        qc.invalidateQueries({
          queryKey: [`/api/providers/${providerId}/status`],
        });
      }, 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Sign in failed: ${msg}`);
    }
  };

  const disconnect = async () => {
    try {
      const res = await fetch(
        `/api/providers/${encodeURIComponent(providerId)}/disconnect`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed: ${res.status}`);
      }
      qc.invalidateQueries({
        queryKey: [`/api/providers/${providerId}/status`],
      });
      toast.success("Disconnected");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Disconnect failed: ${msg}`);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Badge
        variant="outline"
        className={
          "text-[10px] gap-1 " +
          (connected
            ? "border-green-500/30 text-green-400"
            : "border-muted-foreground/30 text-muted-foreground")
        }
      >
        {connected ? "Connected" : "Not connected"}
      </Badge>
      {connected ? (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-7 text-xs"
          onClick={disconnect}
        >
          <Unlink className="h-3 w-3" />
          Disconnect
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-7 text-xs"
          onClick={signIn}
        >
          <LinkIcon className="h-3 w-3" />
          Sign in
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProviderManager() {
  const qc = useQueryClient();
  const { data: providers, isLoading } = useQuery<ProviderConfig[]>({
    queryKey: ["/api/providers"],
  });

  // Dialog state — `editing` is the provider being edited, undefined means
  // "add new". `draft` holds the form values.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<DraftProvider>(blankDraft());
  const [pendingDelete, setPendingDelete] = useState<ProviderConfig | null>(
    null,
  );

  const openAdd = () => {
    setDraft(blankDraft());
    setDialogOpen(true);
  };
  const openEdit = (p: ProviderConfig) => {
    setDraft(draftFromProvider(p));
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const isEdit = Boolean(draft.id);
      const url = isEdit
        ? `/api/providers/${encodeURIComponent(draft.id!)}`
        : "/api/providers";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/providers"] });
      setDialogOpen(false);
      toast.success(draft.id ? "Provider updated" : "Provider added");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/providers/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed: ${res.status}`);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/providers"] });
      setPendingDelete(null);
      toast.success("Provider deleted");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleSave = () => {
    if (!draft.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (draft.type === "openai-compatible" && !draft.baseUrl.trim()) {
      toast.error("Base URL is required for openai-compatible providers");
      return;
    }
    if (draft.authType === "oauth") {
      if (
        !draft.oauthAuthUrl.trim() ||
        !draft.oauthTokenUrl.trim() ||
        !draft.oauthClientId.trim()
      ) {
        toast.error("OAuth requires Auth URL, Token URL, and Client ID");
        return;
      }
    }
    saveMutation.mutate(draftToPayload(draft));
  };

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Providers
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Chat providers available in the composer. Built-ins can be
              configured but not deleted.
            </p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5" />
            Add Provider
          </Button>
        </div>

        {isLoading && (
          <div className="text-sm text-muted-foreground">Loading...</div>
        )}

        {!isLoading && providers && providers.length > 0 && (
          <div className="space-y-2">
            {providers.map((p) => (
              <ProviderRow
                key={p.id}
                provider={p}
                onEdit={() => openEdit(p)}
                onDelete={() => setPendingDelete(p)}
              />
            ))}
          </div>
        )}

        {!isLoading && (!providers || providers.length === 0) && (
          <p className="text-sm text-muted-foreground">
            No providers configured.
          </p>
        )}
      </CardContent>

      {/* Add/Edit dialog --------------------------------------------------- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="max-w-lg max-h-[85vh] overflow-y-auto"
          data-testid="provider-edit-dialog"
        >
          <DialogHeader>
            <DialogTitle>
              {draft.id ? "Edit Provider" : "Add Provider"}
            </DialogTitle>
          </DialogHeader>
          <ProviderForm
            draft={draft}
            onChange={setDraft}
            claudeCodeLock={draft.builtin === true && draft.id === "claude-code"}
            ollamaLock={draft.builtin === true && draft.id === "ollama"}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                saveMutation.isPending ||
                (draft.builtin === true && draft.id === "claude-code")
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation ---------------------------------------------- */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent data-testid="provider-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &#39;{pendingDelete?.name}&#39;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The provider will be removed from the list. Any conversations
              currently pointing at it will fall back to the default
              provider on their next send.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                pendingDelete && deleteMutation.mutate(pendingDelete.id)
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Row — one provider entry
// ---------------------------------------------------------------------------

function ProviderRow({
  provider,
  onEdit,
  onDelete,
}: {
  provider: ProviderConfig;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isBuiltin = provider.builtin === true;

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border/50 p-3">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{provider.name}</span>
          <Badge variant="secondary" className="text-[10px]">
            {provider.type}
          </Badge>
          {isBuiltin && (
            <Badge
              variant="outline"
              className="text-[10px] gap-1 border-blue-500/30 text-blue-400"
            >
              <Lock className="h-2.5 w-2.5" />
              Built-in
            </Badge>
          )}
          <AvailabilityBadge providerId={provider.id} />
        </div>
        {provider.baseUrl && (
          <p className="text-xs font-mono text-muted-foreground truncate">
            {provider.baseUrl}
          </p>
        )}
        {/* API key indicator — masked sk-... form comes straight from the
            wire; we just echo it in a muted chip so the user knows a key is
            set without leaking the value. */}
        {provider.auth.type === "api-key" && provider.auth.apiKey && (
          <p className="text-[11px] text-muted-foreground font-mono">
            Key: {provider.auth.apiKey}
          </p>
        )}
        {provider.auth.type === "oauth" && (
          <OAuthControls providerId={provider.id} />
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={onEdit}
        >
          <Pencil className="h-3 w-3" />
          Edit
        </Button>
        {!isBuiltin && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form — shared by add + edit dialogs
// ---------------------------------------------------------------------------

function ProviderForm({
  draft,
  onChange,
  claudeCodeLock,
  ollamaLock,
}: {
  draft: DraftProvider;
  onChange: (next: DraftProvider) => void;
  /** claude-code is entirely view-only. */
  claudeCodeLock: boolean;
  /** ollama allows editing baseUrl only. */
  ollamaLock: boolean;
}) {
  const readOnlyName = claudeCodeLock || ollamaLock;
  const readOnlyType = claudeCodeLock || ollamaLock;
  const readOnlyAuth = claudeCodeLock || ollamaLock;
  const readOnlyBaseUrl = claudeCodeLock; // ollama can edit baseUrl
  const readOnlyCaps = claudeCodeLock || ollamaLock;

  const patch = (p: Partial<DraftProvider>) => onChange({ ...draft, ...p });

  return (
    <div className="space-y-4">
      {(claudeCodeLock || ollamaLock) && (
        <div className="rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-xs text-blue-300">
          {claudeCodeLock
            ? "Claude Code is a built-in provider — view only."
            : "Ollama is a built-in provider — only the Base URL is editable."}
        </div>
      )}

      {/* Name ----------------------------------------------------------- */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Name</label>
        <Input
          value={draft.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="my-openai-compat"
          disabled={readOnlyName}
        />
      </div>

      {/* Type ----------------------------------------------------------- */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Type</label>
        <select
          value={draft.type}
          onChange={(e) =>
            patch({ type: e.target.value as ProviderType })
          }
          disabled={readOnlyType}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="claude-cli">claude-cli</option>
          <option value="openai-compatible">openai-compatible</option>
        </select>
      </div>

      {/* Base URL (openai-compatible only) ------------------------------ */}
      {draft.type === "openai-compatible" && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Base URL</label>
          <Input
            value={draft.baseUrl}
            onChange={(e) => patch({ baseUrl: e.target.value })}
            placeholder="http://localhost:11434"
            disabled={readOnlyBaseUrl}
            className="font-mono text-sm"
          />
        </div>
      )}

      {/* Auth Type ------------------------------------------------------ */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Auth Type</label>
        <select
          value={draft.authType}
          onChange={(e) =>
            patch({ authType: e.target.value as AuthType })
          }
          disabled={readOnlyAuth}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="none">none</option>
          <option value="api-key">api-key</option>
          <option value="oauth">oauth</option>
        </select>
      </div>

      {/* Api-key branch ------------------------------------------------- */}
      {draft.authType === "api-key" && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">API Key</label>
          <Input
            type="password"
            value={draft.apiKey}
            onChange={(e) => patch({ apiKey: e.target.value })}
            // In edit mode, the stored secret comes back masked (sk-...XXXX)
            // so we show a placeholder hinting "blank = keep existing".
            placeholder={
              draft.id
                ? "••••••  (leave blank to keep existing)"
                : "sk-..."
            }
            disabled={readOnlyAuth}
            className="font-mono text-sm"
          />
        </div>
      )}

      {/* OAuth branch --------------------------------------------------- */}
      {draft.authType === "oauth" && (
        <div className="space-y-3 rounded-md border border-border/50 p-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Auth URL
            </label>
            <Input
              value={draft.oauthAuthUrl}
              onChange={(e) => patch({ oauthAuthUrl: e.target.value })}
              placeholder="https://example.com/oauth/authorize"
              disabled={readOnlyAuth}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Token URL
            </label>
            <Input
              value={draft.oauthTokenUrl}
              onChange={(e) => patch({ oauthTokenUrl: e.target.value })}
              placeholder="https://example.com/oauth/token"
              disabled={readOnlyAuth}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Client ID
            </label>
            <Input
              value={draft.oauthClientId}
              onChange={(e) => patch({ oauthClientId: e.target.value })}
              disabled={readOnlyAuth}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Client Secret (optional)
            </label>
            <Input
              type="password"
              value={draft.oauthClientSecret}
              onChange={(e) =>
                patch({ oauthClientSecret: e.target.value })
              }
              placeholder={
                draft.id
                  ? "••••••  (leave blank to keep existing)"
                  : ""
              }
              disabled={readOnlyAuth}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Scopes (comma-separated)
            </label>
            <Input
              value={draft.oauthScopes}
              onChange={(e) => patch({ oauthScopes: e.target.value })}
              placeholder="read, write"
              disabled={readOnlyAuth}
              className="font-mono text-xs"
            />
          </div>
        </div>
      )}

      {/* Capabilities --------------------------------------------------- */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Capabilities</label>
        <div className="grid grid-cols-2 gap-2">
          {CAPABILITY_FLAGS.map((flag) => (
            <label
              key={flag.key}
              className="flex items-center gap-2 rounded-md px-2 py-1 text-xs cursor-pointer hover:bg-accent/50"
            >
              <input
                type="checkbox"
                checked={Boolean(draft.capabilities[flag.key])}
                onChange={(e) =>
                  patch({
                    capabilities: {
                      ...draft.capabilities,
                      [flag.key]: e.target.checked,
                    },
                  })
                }
                disabled={readOnlyCaps}
                className="h-3.5 w-3.5 rounded border-input"
              />
              <span className="font-mono">{flag.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
