/**
 * Client re-export shim for the canonical formatters in `shared/format.ts`.
 * Keeps the `@/lib/format` import path stable for client code while ensuring
 * only one implementation exists project-wide.
 */
export * from "@shared/format";
