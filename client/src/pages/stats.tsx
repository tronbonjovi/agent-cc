import { PageContainer } from "@/components/page-container";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ChartsTab from "@/components/analytics/charts/ChartsTab";
import CostsTab from "@/components/analytics/costs/CostsTab";
import { SessionsTab } from "@/components/analytics/sessions/SessionsTab";
import { MessagesTab } from "@/components/analytics/messages/MessagesTab";
import { EntityGraph } from "@/components/analytics/entity-graph";

// ---- Main Analytics Page ----

export default function Stats() {
  const defaultTab = new URLSearchParams(window.location.search).get("tab") || "nerve-center";

  return (
    <PageContainer title="Analytics">
      <p className="text-sm text-muted-foreground -mt-2">
        Nerve center, costs, charts, sessions, and messages
      </p>

      <Tabs defaultValue={defaultTab}>
        <div className="overflow-x-auto whitespace-nowrap scrollbar-thin">
          <TabsList>
            <TabsTrigger value="nerve-center" className="whitespace-nowrap">Nerve Center</TabsTrigger>
            <TabsTrigger value="costs" className="whitespace-nowrap">Costs</TabsTrigger>
            <TabsTrigger value="charts" className="whitespace-nowrap">Charts</TabsTrigger>
            <TabsTrigger value="sessions" className="whitespace-nowrap">Sessions</TabsTrigger>
            <TabsTrigger value="messages" className="whitespace-nowrap">Messages</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="nerve-center" className="mt-4">
          <EntityGraph />
        </TabsContent>

        <TabsContent value="costs" className="mt-4">
          <CostsTab />
        </TabsContent>

        <TabsContent value="charts" className="mt-4">
          <ChartsTab />
        </TabsContent>

        <TabsContent value="sessions" className="mt-4">
          <SessionsTab />
        </TabsContent>

        <TabsContent value="messages" className="mt-4">
          <MessagesTab />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
