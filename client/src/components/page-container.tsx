import React from "react";

interface PageContainerProps {
  children: React.ReactNode;
  title?: string;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Shared page wrapper that applies consistent responsive padding,
 * max-width, and section spacing using the sizing tokens from task001.
 *
 * - Padding: var(--page-padding) — scales across breakpoints
 * - Section gap: var(--section-gap) — scales across breakpoints
 * - Header: optional title (h1) + actions, stacks vertically on mobile
 */
export function PageContainer({
  children,
  title,
  actions,
  className,
}: PageContainerProps) {
  return (
    <div
      className={`w-full h-full overflow-y-auto ${className ?? ""}`}
      style={{ padding: "var(--page-padding)" }}
    >
      {title && (
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {actions && (
            <div className="flex flex-row items-center gap-2">{actions}</div>
          )}
        </header>
      )}
      <div
        className="flex flex-col flex-1 min-h-0"
        style={{ gap: "var(--section-gap)" }}
      >
        {children}
      </div>
    </div>
  );
}
