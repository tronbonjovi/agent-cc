// client/src/components/chat/chat-tab-bar.tsx
//
// Tab bar UI for the integrated chat panel — shipped in
// chat-workflows-tabs-task002 as the user-facing surface on top of the
// persisted tab store from task001, completed in task007 (per-tab
// conversation retarget + close-confirm on dirty draft).
//
// Responsibilities:
//   - Render one chip per open tab, in the store's authoritative `order`.
//   - Highlight the active tab (aria-selected + visual treatment).
//   - Support click-to-switch, close (X), new-tab (+), and drag-to-reorder.
//   - Persist every action through the store (all mutations are async and
//     throw on PUT failure — we log and swallow here so the tab bar stays
//     resilient to transient backend hiccups; toast UI is task008).
//   - Confirm before discarding a tab's unsent draft (shadcn AlertDialog).
//     Clean tabs close immediately; dirty tabs pop a Cancel/Discard dialog.
//
// Draft-aware close flow:
//   The draft text for each tab lives on `useChatStore.drafts`, keyed by
//   conversationId. We read it here only to decide whether to show the
//   confirm dialog — the actual editing happens in `chat-panel.tsx`. On
//   close (either path), the draft entry is cleared via `setDraft(id, '')`
//   so a future re-open of the same conversation starts fresh.
//
// Iteration must go through `buildOrderedTabs(tabs, order)`, never
// `tabs.map(...)` directly — source-text guard in
// tests/chat-tab-bar-source.test.ts pins that.

import { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, Plus, Download } from 'lucide-react';

import { useChatTabsStore } from '@/stores/chat-tabs-store';
import { useChatStore } from '@/stores/chat-store';
import {
  buildOrderedTabs,
  reorderIds,
  type OrderedTab,
} from '@/lib/chat-tab-order';
import { Button } from '@/components/ui/button';
import { ImportSessionModal } from '@/components/chat/import-session-modal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

interface ChatTabChipProps {
  tab: OrderedTab;
  active: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

/**
 * One draggable tab chip. Kept inline so the sortable wiring stays close
 * to the container and nobody re-imports the wrong store.
 */
function ChatTabChip({ tab, active, onSelect, onClose }: ChatTabChipProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.conversationId });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="tab"
      aria-selected={active}
      data-testid={`chat-tab-${tab.conversationId}`}
      onClick={() => onSelect(tab.conversationId)}
      className={cn(
        'group flex items-center gap-2 border-r px-3 py-1.5 text-sm cursor-pointer select-none',
        'min-w-[120px] max-w-[200px]',
        active
          ? 'bg-background text-foreground'
          : 'bg-muted/40 text-muted-foreground hover:bg-muted/60',
      )}
    >
      <span className="truncate flex-1">{tab.title}</span>
      <button
        type="button"
        aria-label={`Close ${tab.title}`}
        className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
        onClick={(e) => {
          // Keep the close click from also selecting the tab — otherwise the
          // store would fire setActiveTab just before closeTab and the user
          // briefly sees the wrong content flash.
          e.stopPropagation();
          onClose(tab.conversationId);
        }}
        // dnd-kit listens on pointer events via the chip wrapper; stop
        // propagation here too so grabbing the X doesn't start a drag.
        onPointerDown={(e) => e.stopPropagation()}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ChatTabBar() {
  const tabs = useChatTabsStore((s) => s.tabs);
  const order = useChatTabsStore((s) => s.order);
  const activeId = useChatTabsStore((s) => s.activeTabId);
  const loaded = useChatTabsStore((s) => s.loaded);
  const openTab = useChatTabsStore((s) => s.openTab);
  const closeTab = useChatTabsStore((s) => s.closeTab);
  const setActiveTab = useChatTabsStore((s) => s.setActiveTab);
  const reorder = useChatTabsStore((s) => s.reorder);

  // Drafts live on the chat store, keyed by conversationId. We read the
  // whole map once here so the dirty-check for close-confirm can look up
  // any tab in O(1) without re-subscribing on every keystroke of every
  // non-active tab.
  const drafts = useChatStore((s) => s.drafts);
  const setDraft = useChatStore((s) => s.setDraft);

  // Close-confirm dialog state — local to the tab bar because it's only
  // reachable from clicking the X on a chip. `pendingCloseId` holds the
  // tab we're asking the user to confirm; null means no dialog is open.
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null);

  // Import-session modal state (chat-import-platforms-task003). Opened
  // by the Import button next to the `+` new-tab button.
  const [importOpen, setImportOpen] = useState(false);

  // A tiny drag-activation distance keeps the click-to-switch UX responsive
  // — without it, even tiny pointer jitter on a plain click is treated as a
  // drag and swallows the selection.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  if (!loaded) {
    // Skeleton placeholder so the layout doesn't jump when load() resolves.
    return (
      <div
        className="h-9 border-b bg-muted/20"
        data-testid="chat-tab-bar-loading"
      />
    );
  }

  const orderedTabs = buildOrderedTabs(tabs, order);

  const handleNewTab = async () => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      await openTab(id, 'New chat');
      await setActiveTab(id);
    } catch (err) {
      console.error('[chat-tab-bar] openTab failed', err);
    }
  };

  /**
   * Actually close a tab — clears its draft from the store and calls the
   * persisted close action. Used by both the clean-close path and the
   * confirm-discard path.
   */
  const performClose = async (id: string) => {
    // Drop the draft first so a future re-open of the same conversation
    // starts fresh. Even if closeTab fails we don't want to leak the
    // stale draft into a tab the user thought was gone.
    setDraft(id, '');
    try {
      await closeTab(id);
    } catch (err) {
      console.error('[chat-tab-bar] closeTab failed', err);
    }
  };

  const handleClose = async (id: string) => {
    const hasDirtyDraft = (drafts[id] ?? '').trim().length > 0;
    if (hasDirtyDraft) {
      // Defer close to the dialog's Discard action.
      setPendingCloseId(id);
      return;
    }
    await performClose(id);
  };

  const handleConfirmDiscard = async () => {
    if (!pendingCloseId) return;
    const id = pendingCloseId;
    setPendingCloseId(null);
    await performClose(id);
  };

  const pendingTab = pendingCloseId
    ? tabs.find((t) => t.conversationId === pendingCloseId)
    : undefined;
  const pendingTitle = pendingTab?.title ?? '';

  const handleSelect = async (id: string) => {
    if (id === activeId) return;
    try {
      await setActiveTab(id);
    } catch (err) {
      console.error('[chat-tab-bar] setActiveTab failed', err);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const newOrder = reorderIds(
      order,
      String(active.id),
      String(over.id),
    );
    try {
      await reorder(newOrder);
    } catch (err) {
      console.error('[chat-tab-bar] reorder failed', err);
    }
  };

  return (
    <div
      className="flex items-center border-b overflow-x-auto"
      role="tablist"
      data-testid="chat-tab-bar"
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={orderedTabs.map((t) => t.conversationId)}
          strategy={horizontalListSortingStrategy}
        >
          {orderedTabs.map((tab) => (
            <ChatTabChip
              key={tab.conversationId}
              tab={tab}
              active={tab.conversationId === activeId}
              onSelect={handleSelect}
              onClose={handleClose}
            />
          ))}
        </SortableContext>
      </DndContext>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="New chat"
        onClick={handleNewTab}
        className="shrink-0 h-9 px-2 rounded-none"
        data-testid="chat-tab-new"
      >
        <Plus className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Import session"
        onClick={() => setImportOpen(true)}
        className="shrink-0 h-9 px-2 rounded-none"
        data-testid="chat-tab-import"
      >
        <Download className="h-4 w-4" />
      </Button>
      <ImportSessionModal open={importOpen} onOpenChange={setImportOpen} />
      {/* Close-confirm dialog — only rendered when a dirty tab is pending.
          The open state is driven by `pendingCloseId`; the Cancel path
          nulls it, the Discard path calls `performClose` which clears the
          draft and calls the tabs-store close action. */}
      <AlertDialog
        open={pendingCloseId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingCloseId(null);
        }}
      >
        <AlertDialogContent data-testid="chat-tab-close-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Discard unsent message in &#39;{pendingTitle}&#39;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your draft text will be lost. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDiscard}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
