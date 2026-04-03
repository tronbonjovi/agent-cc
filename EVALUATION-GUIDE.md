# Claude Command Center — "How Does It Feel?" Evaluation Guide

This guide walks you through sorlen008/claude-command-center so you can take structured notes on what works, what doesn't, and what you'd want in our own version. Fill in the notes sections as you go — they become the input for our brainstorm.

---

## Setup

```bash
cd reference/claude-command-center
npm install
npm run dev
```

Then open http://localhost:5100 in your browser.

If it doesn't start, note what went wrong here:

**Setup notes:**
> 

---

## First Impressions (spend 2 minutes just clicking around)

Before diving into individual pages, just poke around. Get the vibe.

- **Does it feel fast or sluggish?**
  > 

- **Is the layout intuitive or confusing?**
  > 

- **Does it correctly discover your projects/sessions/MCP servers?**
  > 

- **Anything immediately impressive or annoying?**
  > 

---

## Page-by-Page Evaluation

For each page, spend a few minutes exploring, then answer the prompts.

Use this rating scale:
- **1** = Useless / broken
- **2** = Meh, wouldn't use
- **3** = Decent idea, rough execution
- **4** = Useful, would use regularly
- **5** = Nailed it, keep this

---

### Dashboard

The landing page with entity counts, health indicators, and quick stats.

- **Rating (1-5):**
- **What info is actually useful here?**
  > 
- **What's clutter?**
  > 
- **What's missing that you'd want at a glance?**
  > 

---

### Projects

Discovered projects with session counts and tech stack.

- **Rating (1-5):**
- **Did it find all your projects correctly?**
  > 
- **Is the per-project info useful?**
  > 
- **What would you want to see per-project?**
  > 

---

### MCP Servers

Every MCP server found across `.mcp.json` files.

- **Rating (1-5):**
- **Did it discover your MCP servers accurately?**
  > 
- **Is this view useful vs just reading the JSON?**
  > 
- **What actions would you want (enable/disable, edit, test)?**
  > 

---

### Skills

User-invocable and system skills.

- **Rating (1-5):**
- **Did it find your skills?**
  > 
- **Is browsing skills here better than the CLI?**
  > 
- **Notes:**
  > 

---

### Plugins

Installed and available plugins.

- **Rating (1-5):**
- **Notes:**
  > 

---

### Markdown (CLAUDE.md / Memory files)

Editor for CLAUDE.md, memory files, READMEs with version history.

- **Rating (1-5):**
- **Would you actually edit CLAUDE.md here vs your editor?**
  > 
- **Is the version history useful?**
  > 
- **Notes:**
  > 

---

### Sessions

Deep search, AI summaries, cost per session, diffs, notes, pins, delegation.

- **Rating (1-5):**
- **Is session search useful? Can you find old conversations?**
  > 
- **Are the cost breakdowns accurate/useful?**
  > 
- **Session health scores — meaningful or noise?**
  > 
- **What session info do you actually care about?**
  > 

---

### Sessions — Analytics Tab

Cost analytics, file heatmap, bash knowledge base, decision log, continuation intelligence.

- **Rating (1-5):**
- **Cost analytics — does the spending breakdown help?**
  > 
- **File heatmap — interesting or just noise?**
  > 
- **Continuation intelligence — does "resume unfinished work" actually work?**
  > 
- **Which analytics features would you keep?**
  > 

---

### Agents

Agent definitions and execution logs.

- **Rating (1-5):**
- **Did it find your agents?**
  > 
- **Is this view useful?**
  > 
- **Notes:**
  > 

---

### Live View

Active sessions, agents, context usage, cost estimates in real-time.

- **Rating (1-5):**
- **Does it actually show live sessions?**
  > 
- **Is the context usage meter useful?**
  > 
- **Would you keep this open while working?**
  > 

---

### Graph

Interactive node graph of your ecosystem with AI-assisted suggestions.

- **Rating (1-5):**
- **Does the visualization help you understand anything?**
  > 
- **Is it just eye candy or actually useful?**
  > 
- **Notes:**
  > 

---

### Discovery

Finds unconfigured projects and MCP servers on disk.

- **Rating (1-5):**
- **Did it find anything you didn't know about?**
  > 
- **Notes:**
  > 

---

### Config

Claude Code settings, permissions, MCP configs.

- **Rating (1-5):**
- **Easier than editing JSON files directly?**
  > 
- **Would you trust it to modify your config?**
  > 
- **Notes:**
  > 

---

### Activity

File-change timeline from the watcher.

- **Rating (1-5):**
- **Notes:**
  > 

---

## Overall Assessment

### Top 3 features you'd want in our version:
1. 
2. 
3. 

### Top 3 things to leave out or do differently:
1. 
2. 
3. 

### Anything it doesn't do that you wish it did?
> 

### How often would you realistically use a tool like this?
- [ ] Always open while coding
- [ ] Check it daily
- [ ] Check it weekly
- [ ] Only when I need something specific
- [ ] Rarely

### What's the #1 problem a command center should solve for you?
> 

---

## Next Step

When you're done, bring these notes to a new Claude Code session and say:

> "Let's brainstorm our command center. Here are my notes from evaluating the reference project."

Then paste or reference this file. We'll use your notes to design exactly what you need.
