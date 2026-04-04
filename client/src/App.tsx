import { Toaster } from "sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Switch, Route } from "wouter";
import { Suspense, lazy, useEffect } from "react";
import { Layout } from "@/components/layout";
import { ErrorBoundary } from "@/components/error-boundary";
import { GlobalSearch } from "@/components/global-search";
import { useAppSettings } from "@/hooks/use-settings";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { ThemeProvider } from "@/hooks/use-theme";
// OnboardingWizard disabled — will be rewritten later
// import { OnboardingWizard } from "@/components/onboarding-wizard";
import { KeyboardShortcutsOverlay } from "@/components/keyboard-shortcuts";
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Projects = lazy(() => import("@/pages/projects"));
const ProjectDetail = lazy(() => import("@/pages/project-detail"));
const MCPs = lazy(() => import("@/pages/mcps"));
const Skills = lazy(() => import("@/pages/skills"));
const Plugins = lazy(() => import("@/pages/plugins"));
const MarkdownFiles = lazy(() => import("@/pages/markdown-files"));
const MarkdownEdit = lazy(() => import("@/pages/markdown-edit"));
const GraphPage = lazy(() => import("@/pages/graph"));
const ActivityPage = lazy(() => import("@/pages/activity"));
const Sessions = lazy(() => import("@/pages/sessions"));
const Agents = lazy(() => import("@/pages/agents"));
const Live = lazy(() => import("@/pages/live"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const Stats = lazy(() => import("@/pages/stats"));
const MessageHistory = lazy(() => import("@/pages/message-history"));
const APIs = lazy(() => import("@/pages/apis"));
const Prompts = lazy(() => import("@/pages/prompts"));
import NotFound from "@/pages/not-found";

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-screen animate-fade-in-up">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/30 border-t-primary" />
    </div>
  );
}

function DynamicTitle() {
  const { data: settings } = useAppSettings();
  useEffect(() => {
    document.title = settings?.appName || "Command Center";
  }, [settings?.appName]);
  return null;
}

function Router() {
  useKeyboardShortcuts();
  return (
    <Layout>
      <DynamicTitle />
      {/* <OnboardingWizard /> — disabled, will be rewritten */}
      <ErrorBoundary pageName="Application">
        <Suspense fallback={<PageLoader />}>
          <Switch>
            <Route path="/">
              <ErrorBoundary pageName="Dashboard"><Dashboard /></ErrorBoundary>
            </Route>
            <Route path="/projects">
              <ErrorBoundary pageName="Projects"><Projects /></ErrorBoundary>
            </Route>
            <Route path="/projects/:id">
              <ErrorBoundary pageName="Project Detail"><ProjectDetail /></ErrorBoundary>
            </Route>
            <Route path="/mcps">
              <ErrorBoundary pageName="MCPs"><MCPs /></ErrorBoundary>
            </Route>
            <Route path="/skills">
              <ErrorBoundary pageName="Skills"><Skills /></ErrorBoundary>
            </Route>
            <Route path="/plugins">
              <ErrorBoundary pageName="Plugins"><Plugins /></ErrorBoundary>
            </Route>
            <Route path="/markdown">
              <ErrorBoundary pageName="Markdown Files"><MarkdownFiles /></ErrorBoundary>
            </Route>
            <Route path="/markdown/:id">
              <ErrorBoundary pageName="Markdown Editor"><MarkdownEdit /></ErrorBoundary>
            </Route>
            <Route path="/graph">
              <ErrorBoundary pageName="Graph"><GraphPage /></ErrorBoundary>
            </Route>
            <Route path="/activity">
              <ErrorBoundary pageName="Activity"><ActivityPage /></ErrorBoundary>
            </Route>
            <Route path="/sessions">
              <ErrorBoundary pageName="Sessions"><Sessions /></ErrorBoundary>
            </Route>
            <Route path="/agents">
              <ErrorBoundary pageName="Agents"><Agents /></ErrorBoundary>
            </Route>
            <Route path="/live">
              <ErrorBoundary pageName="Live View"><Live /></ErrorBoundary>
            </Route>
            <Route path="/settings">
              <ErrorBoundary pageName="Settings"><SettingsPage /></ErrorBoundary>
            </Route>
            <Route path="/stats">
              <ErrorBoundary pageName="Stats"><Stats /></ErrorBoundary>
            </Route>
            <Route path="/messages">
              <ErrorBoundary pageName="Messages"><MessageHistory /></ErrorBoundary>
            </Route>
            <Route path="/apis">
              <ErrorBoundary pageName="APIs"><APIs /></ErrorBoundary>
            </Route>
            <Route path="/prompts">
              <ErrorBoundary pageName="Prompts"><Prompts /></ErrorBoundary>
            </Route>
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Router />
          <GlobalSearch />
          <KeyboardShortcutsOverlay />
          <Toaster richColors position="bottom-right" />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
