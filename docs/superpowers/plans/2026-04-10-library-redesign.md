# Library Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate Skills, Plugins, MCP Servers, Agents, and File Editor into a single Library page with tabs, using a consistent saved/installed/marketplace three-tier pattern per entity type.

**Architecture:** New `/library` page with Radix Tabs. Each entity tab is extracted from its existing standalone page into a section component. A shared `EntityCard` component provides visual consistency. Old standalone routes become redirects to `/library?tab=<type>`.

**Tech Stack:** TypeScript, React, Radix Tabs (existing shadcn/ui), Tailwind, React Query (existing hooks)

**Depends on:** Spec 1 (Nav Restructure) must be complete — the `/library` nav entry and placeholder page must exist.

---

### Task 1: Create Library Page Shell

**Files:**
- Modify: `client/src/pages/library.tsx` (replace placeholder redirect with real page)

- [ ] **Step 1: Write the Library page shell with tabs**

Replace `client/src/pages/library.tsx` (currently a redirect to `/skills`):

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation, useSearch } from "wouter";
import { Library as LibraryIcon, Wand2, Puzzle, Server, Bot, FileText } from "lucide-react";
import { useEntities } from "@/hooks/use-entities";
import { useAgentDefinitions } from "@/hooks/use-agents";
import { useMarkdownFiles } from "@/hooks/use-markdown";

const TABS = [
  { id: "skills", label: "Skills", icon: Wand2 },
  { id: "plugins", label: "Plugins", icon: Puzzle },
  { id: "mcps", label: "MCP Servers", icon: Server },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "editor", label: "File Editor", icon: FileText },
] as const;

export default function LibraryPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const activeTab = params.get("tab") || "skills";
  const [, setLocation] = useLocation();

  const handleTabChange = (value: string) => {
    setLocation(`/library?tab=${value}`, { replace: true });
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <LibraryIcon className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Library</h1>
          <p className="text-sm text-muted-foreground">Skills, plugins, servers, agents, and files</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          {TABS.map(tab => (
            <TabsTrigger key={tab.id} value={tab.id} className="gap-1.5">
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="skills" className="mt-4">
          <div className="text-muted-foreground text-sm">Skills section — will be implemented in Task 3</div>
        </TabsContent>
        <TabsContent value="plugins" className="mt-4">
          <div className="text-muted-foreground text-sm">Plugins section — will be implemented in Task 4</div>
        </TabsContent>
        <TabsContent value="mcps" className="mt-4">
          <div className="text-muted-foreground text-sm">MCPs section — will be implemented in Task 5</div>
        </TabsContent>
        <TabsContent value="agents" className="mt-4">
          <div className="text-muted-foreground text-sm">Agents section — will be implemented in Task 6</div>
        </TabsContent>
        <TabsContent value="editor" className="mt-4">
          <div className="text-muted-foreground text-sm">File Editor — will be implemented in Task 7</div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Verify the page loads**

Run: `npm run check`
Run: `npm run dev` and navigate to `/library`
Expected: Page loads with 5 tabs, placeholder content in each.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/library.tsx
git commit -m "feat: create Library page shell with tab structure"
```

---

### Task 2: Create Shared EntityCard Component

**Files:**
- Create: `client/src/components/library/entity-card.tsx`

- [ ] **Step 1: Write the shared card component**

Create `client/src/components/library/entity-card.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export interface EntityCardProps {
  name: string;
  description?: string;
  icon?: React.ReactNode;
  status?: "installed" | "saved" | "available";
  health?: "healthy" | "degraded" | "error";
  category?: string;
  categoryColor?: string;
  tags?: string[];
  actions?: React.ReactNode;
  onClick?: () => void;
  children?: React.ReactNode;
}

const statusColors = {
  installed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  saved: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  available: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

const healthDots = {
  healthy: "bg-emerald-400",
  degraded: "bg-amber-400",
  error: "bg-red-400",
};

export function EntityCard({
  name,
  description,
  icon,
  status,
  health,
  category,
  categoryColor,
  tags,
  actions,
  onClick,
  children,
}: EntityCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 transition-all duration-150",
        onClick && "cursor-pointer hover:bg-accent/50 hover:shadow-md"
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {icon && <div className="flex-shrink-0 mt-0.5">{icon}</div>}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{name}</span>
            {health && (
              <div className={cn("h-2 w-2 rounded-full", healthDots[health])} />
            )}
            {status && (
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", statusColors[status])}>
                {status}
              </Badge>
            )}
          </div>
          {description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{description}</p>
          )}
          {(category || (tags && tags.length > 0)) && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {category && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0"
                  style={categoryColor ? { borderColor: categoryColor, color: categoryColor } : undefined}
                >
                  {category}
                </Badge>
              )}
              {tags?.map(tag => (
                <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
        {actions && <div className="flex-shrink-0">{actions}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add client/src/components/library/entity-card.tsx
git commit -m "feat: add shared EntityCard component for Library page"
```

---

### Task 3: Create Skills Section

**Files:**
- Create: `client/src/components/library/skills-section.tsx`
- Modify: `client/src/pages/library.tsx`

- [ ] **Step 1: Extract skills content into section component**

Create `client/src/components/library/skills-section.tsx`. Lift the content from `client/src/pages/skills.tsx` into this component. The component should:

- Use `useEntities<SkillEntity>("skill")` hook for data
- Include the search filter
- Render cards in a grid layout
- Preserve the expandable preview, copy command, edit button, invocable badge
- Add a three-tier grouping header structure:
  - **Installed** section: skills found in active configuration
  - **Saved** section: skills on disk but not active (may not apply to all skills initially — show all under "Installed" if the distinction isn't clear from data)
  - **Marketplace** section: placeholder with "Coming soon" message

```tsx
import { useState } from "react";
import { useEntities } from "@/hooks/use-entities";
import type { SkillEntity } from "@shared/types";
import { EntityCard } from "./entity-card";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export function SkillsSection() {
  const { data: skills, isLoading } = useEntities<SkillEntity>("skill");
  const [search, setSearch] = useState("");

  const filtered = (skills || []).filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.description || "").toLowerCase().includes(search.toLowerCase())
  );

  // Sort: invocable first, then alphabetical
  const sorted = [...filtered].sort((a, b) => {
    if (a.userInvocable && !b.userInvocable) return -1;
    if (!a.userInvocable && b.userInvocable) return 1;
    return a.name.localeCompare(b.name);
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading skills...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search skills..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Installed */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">
          Installed <span className="text-xs text-muted-foreground/60">({sorted.length})</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {sorted.map(skill => (
            <EntityCard
              key={skill.id}
              name={skill.name}
              description={skill.description}
              status="installed"
              tags={skill.userInvocable ? ["invocable"] : undefined}
            />
          ))}
        </div>
        {sorted.length === 0 && (
          <div className="text-sm text-muted-foreground/50 py-8 text-center">
            {search ? "No skills match your search" : "No skills found"}
          </div>
        )}
      </div>

      {/* Marketplace placeholder */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Marketplace</h3>
        <div className="text-sm text-muted-foreground/50 py-6 text-center border border-dashed rounded-lg">
          Skill marketplace coming soon
        </div>
      </div>
    </div>
  );
}
```

Note: This is a starting point. Preserve all existing functionality from `skills.tsx` — expandable cards, copy command button, edit link, project name display. The above shows the structure; the implementer should reference `skills.tsx` for the full card content.

- [ ] **Step 2: Wire into Library page**

In `client/src/pages/library.tsx`, import and render:

```tsx
import { SkillsSection } from "@/components/library/skills-section";

// Replace the skills TabsContent placeholder:
<TabsContent value="skills" className="mt-4">
  <SkillsSection />
</TabsContent>
```

- [ ] **Step 3: Verify**

Run: `npm run check`
Navigate to `/library?tab=skills` — should show the skills list.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/library/skills-section.tsx client/src/pages/library.tsx
git commit -m "feat: add Skills section to Library page"
```

---

### Task 4: Create Plugins Section

**Files:**
- Create: `client/src/components/library/plugins-section.tsx`
- Modify: `client/src/pages/library.tsx`

- [ ] **Step 1: Extract plugins content into section component**

Create `client/src/components/library/plugins-section.tsx`. Lift content from `client/src/pages/plugins.tsx`:

- Use `useEntities<PluginEntity>("plugin")` hook
- Preserve category grouping with color coding
- Preserve marketplace vs blocked vs active filtering
- Preserve health indicator
- Add three-tier layout: Installed (active plugins), Saved (downloaded but inactive), Marketplace (available to install)
- Category colors: dev-tools, integration, ai, browser, productivity, code-quality, lsp

Follow the same pattern as `SkillsSection` — search bar, three-tier headers, EntityCard usage. Reference `plugins.tsx` for the full card content and category logic.

- [ ] **Step 2: Wire into Library page**

```tsx
import { PluginsSection } from "@/components/library/plugins-section";

<TabsContent value="plugins" className="mt-4">
  <PluginsSection />
</TabsContent>
```

- [ ] **Step 3: Verify and commit**

Run: `npm run check`
Navigate to `/library?tab=plugins`

```bash
git add client/src/components/library/plugins-section.tsx client/src/pages/library.tsx
git commit -m "feat: add Plugins section to Library page"
```

---

### Task 5: Create MCP Servers Section

**Files:**
- Create: `client/src/components/library/mcps-section.tsx`
- Modify: `client/src/pages/library.tsx`

- [ ] **Step 1: Extract MCPs content into section component**

Create `client/src/components/library/mcps-section.tsx`. Lift content from `client/src/pages/mcps.tsx`:

- Use `useEntities<MCPEntity>("mcp")` hook
- Preserve search filter (name + path + description)
- Preserve expandable accordion layout
- Preserve copy command, open source file buttons
- Preserve optional category grouping toggle
- Preserve category colors
- Add three-tier layout with health indicators on Installed section
- MCP servers have the clearest installed/available distinction — servers in active config are Installed, servers found but not configured are Saved

- [ ] **Step 2: Wire into Library page**

```tsx
import { MCPsSection } from "@/components/library/mcps-section";

<TabsContent value="mcps" className="mt-4">
  <MCPsSection />
</TabsContent>
```

- [ ] **Step 3: Verify and commit**

Run: `npm run check`
Navigate to `/library?tab=mcps`

```bash
git add client/src/components/library/mcps-section.tsx client/src/pages/library.tsx
git commit -m "feat: add MCP Servers section to Library page"
```

---

### Task 6: Create Agents Section

**Files:**
- Create: `client/src/components/library/agents-section.tsx`
- Modify: `client/src/pages/library.tsx`

- [ ] **Step 1: Extract agents content into section component**

Create `client/src/components/library/agents-section.tsx`. Lift content from `client/src/pages/agents.tsx`:

- Use `useAgentDefinitions()` and `useAgentExecutions()` hooks (note: agents use separate hooks, not the generic `useEntities`)
- Preserve model color coding
- Preserve copy functionality
- Preserve open file/folder buttons
- Preserve creation dialog
- Preserve execution history view
- Add three-tier layout: Installed (agent definitions found on disk), Saved (placeholder), Marketplace (placeholder)

- [ ] **Step 2: Wire into Library page**

```tsx
import { AgentsSection } from "@/components/library/agents-section";

<TabsContent value="agents" className="mt-4">
  <AgentsSection />
</TabsContent>
```

- [ ] **Step 3: Verify and commit**

Run: `npm run check`
Navigate to `/library?tab=agents`

```bash
git add client/src/components/library/agents-section.tsx client/src/pages/library.tsx
git commit -m "feat: add Agents section to Library page"
```

---

### Task 7: Create File Editor Section

**Files:**
- Create: `client/src/components/library/editor-section.tsx`
- Modify: `client/src/pages/library.tsx`

- [ ] **Step 1: Extract markdown files content into section component**

Create `client/src/components/library/editor-section.tsx`. Lift content from `client/src/pages/markdown-files.tsx`:

- Use `useMarkdownFiles()` hook
- Preserve category tabs (All, CLAUDE.md, Memory, Skill, README, Other) — these become sub-tabs or filter buttons within the section
- Preserve memory type badges (feedback, project, reference, user)
- Preserve content search with highlighting
- Preserve file operations (create, delete, export)
- Preserve link to markdown editor (`/markdown/:id` route stays)
- This section is functionally an editor/browser, not a catalog — the three-tier pattern doesn't apply here

- [ ] **Step 2: Wire into Library page**

```tsx
import { EditorSection } from "@/components/library/editor-section";

<TabsContent value="editor" className="mt-4">
  <EditorSection />
</TabsContent>
```

- [ ] **Step 3: Verify and commit**

Run: `npm run check`
Navigate to `/library?tab=editor`

```bash
git add client/src/components/library/editor-section.tsx client/src/pages/library.tsx
git commit -m "feat: add File Editor section to Library page"
```

---

### Task 8: Convert Old Pages to Redirects

**Files:**
- Modify: `client/src/pages/skills.tsx`
- Modify: `client/src/pages/plugins.tsx`
- Modify: `client/src/pages/mcps.tsx`
- Modify: `client/src/pages/agents.tsx`
- Modify: `client/src/pages/markdown-files.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Convert each standalone page to a redirect**

Replace `client/src/pages/skills.tsx`:
```tsx
import { Redirect } from "wouter";
export default function Skills() {
  return <Redirect to="/library?tab=skills" />;
}
```

Replace `client/src/pages/plugins.tsx`:
```tsx
import { Redirect } from "wouter";
export default function Plugins() {
  return <Redirect to="/library?tab=plugins" />;
}
```

Replace `client/src/pages/mcps.tsx`:
```tsx
import { Redirect } from "wouter";
export default function MCPs() {
  return <Redirect to="/library?tab=mcps" />;
}
```

Replace `client/src/pages/agents.tsx`:
```tsx
import { Redirect } from "wouter";
export default function Agents() {
  return <Redirect to="/library?tab=agents" />;
}
```

Replace `client/src/pages/markdown-files.tsx`:
```tsx
import { Redirect } from "wouter";
export default function MarkdownFiles() {
  return <Redirect to="/library?tab=editor" />;
}
```

- [ ] **Step 2: Verify redirects work**

Run: `npm run dev`
- `/skills` → `/library?tab=skills`
- `/plugins` → `/library?tab=plugins`
- `/mcps` → `/library?tab=mcps`
- `/agents` → `/library?tab=agents`
- `/markdown` → `/library?tab=editor`
- `/markdown/:id` still loads the editor directly (this route is unchanged)

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/skills.tsx client/src/pages/plugins.tsx client/src/pages/mcps.tsx client/src/pages/agents.tsx client/src/pages/markdown-files.tsx
git commit -m "refactor: convert standalone entity pages to Library redirects"
```

---

### Task 9: Update Tests

**Files:**
- Modify: relevant test files that reference old entity page routes or components

- [ ] **Step 1: Search for test references to old pages**

Run: `grep -rn 'skills\.tsx\|plugins\.tsx\|mcps\.tsx\|agents\.tsx\|markdown-files\.tsx\|/skills\|/plugins\|/mcps\|/agents\|/markdown' tests/`

Update any test assertions that:
- Check for specific page components rendering at old routes
- Reference entity pages as standalone pages
- Test navigation to old routes (should now expect redirects)

- [ ] **Step 2: Add Library page tests**

Create `tests/library.test.ts` with basic tests:
- Library page renders with 5 tabs
- Tab navigation updates URL parameter
- Each section loads its data from the correct hook
- Old routes redirect to Library with correct tab parameter

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "test: add Library page tests, update entity page test references"
```

---

### Task 10: Update Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

- Update file structure section to reflect `client/src/components/library/` directory
- Note that entity pages are now redirects to Library
- Add Library tab structure to any relevant docs
- Update nav item count references

- [ ] **Step 2: Run safety tests**

Run: `npx vitest run tests/new-user-safety.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for Library page consolidation"
```

---

### Task 11: Final Verification and Deploy

**Files:** None (verification only)

- [ ] **Step 1: Run full checks**

```bash
npm run check && npm test
```

- [ ] **Step 2: Manual smoke test**

- Navigate to `/library` — all 5 tabs load
- Each tab shows its entity data correctly
- Search works on tabs that support it
- Old routes (`/skills`, `/plugins`, etc.) redirect correctly
- `/markdown/:id` still opens the editor
- Three-tier layout visible on entity tabs (Installed section populated, Marketplace placeholder)
- EntityCard component renders consistently across tabs

- [ ] **Step 3: Deploy**

```bash
scripts/deploy.sh
```
