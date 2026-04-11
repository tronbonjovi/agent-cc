// client/src/components/library/discover-panel.tsx

import { useState } from "react";
import { AlertTriangle, Search, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EntityCard } from "@/components/library/entity-card";
import { useDiscoverSearch, useDiscoverSources, useSaveToLibrary } from "@/hooks/use-library";

// Exported for testing
export const SAFETY_DISCLAIMER =
  "Please use caution when installing code from online sources. Review files before installing.";
export const VIRUSTOTAL_URL = "https://www.virustotal.com/";

interface DiscoverPanelProps {
  entityType: "skills" | "agents" | "plugins";
}

export function DiscoverPanel({ entityType }: DiscoverPanelProps) {
  const [inputValue, setInputValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: results, isLoading } = useDiscoverSearch(entityType, searchTerm);
  const { data: sources } = useDiscoverSources(entityType);
  const saveToLibrary = useSaveToLibrary();

  const browseSources = sources?.filter((s) => s.type === "web") ?? [];

  const handleSearch = () => {
    const trimmed = inputValue.trim();
    if (trimmed.length >= 2) {
      setSearchTerm(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="space-y-4">
      {/* Safety disclaimer */}
      <div className="flex items-start gap-3 rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
        <div className="text-sm">
          <p className="text-amber-200/90">{SAFETY_DISCLAIMER}</p>
          <a
            href={VIRUSTOTAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-amber-500/70 hover:text-amber-500 inline-flex items-center gap-1 mt-1"
          >
            Scan with VirusTotal <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Browse sources */}
      {browseSources.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Browse</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {browseSources.map((source) => (
              <a
                key={source.id}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md border border-border p-2 hover:bg-muted/30 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{source.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{source.description}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`Search GitHub for ${entityType}...`}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-9"
          />
        </div>
        <Button onClick={handleSearch} variant="secondary" size="sm">
          Search
        </Button>
      </div>

      {/* Results / states */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Searching...</p>
      ) : searchTerm.length >= 2 && results ? (
        results.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-card">
            {results.map((item) => (
              <EntityCard
                key={item.url}
                name={item.name}
                description={item.description ?? undefined}
                status="available"
                tags={[
                  ...(item.stars > 0 ? [`${item.stars} stars`] : []),
                  item.source,
                ]}
                actions={[
                  {
                    label: "Save to Library",
                    onClick: () =>
                      saveToLibrary.mutate({
                        type: entityType,
                        repoUrl: item.url,
                        name: item.name,
                      }),
                    variant: "default" as const,
                  },
                  {
                    label: "View",
                    onClick: () => window.open(item.url, "_blank"),
                    variant: "ghost" as const,
                  },
                ]}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            No results found for &apos;{searchTerm}&apos;
          </p>
        )
      ) : (
        <div className="flex flex-col items-center justify-center py-12 space-y-2">
          <Search className="h-8 w-8 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">
            Search GitHub for community {entityType}
          </p>
        </div>
      )}
    </div>
  );
}
