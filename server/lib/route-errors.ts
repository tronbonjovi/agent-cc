// server/lib/route-errors.ts
//
// Canonical route error helper + lightweight error classes.
//
// Every server route that returns a JSON error should go through
// `handleRouteError`. Routes can either:
//   1. `throw` a `ValidationError` / `NotFoundError` / `ConflictError` and
//      let a surrounding try/catch forward it to the helper, or
//   2. Call `handleRouteError(res, err, 'context')` directly inside a catch.
//
// Canonical response shape: `{ error: string, detail?: string }`.
// Status codes are inferred from the error class, defaulting to 500 for
// unknown errors. 500+ responses are logged with the route context; 4xx
// client-error responses are NOT logged (they are expected, not incidents).
//
// This module is deliberately tiny — one function plus three error
// classes. Higher-order middleware wrapping would be over-engineering.

import type { Response } from "express";

export class ValidationError extends Error {
  constructor(message: string, public detail?: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * Map an unknown thrown value to a JSON error response. Does NOT rethrow.
 *
 * @param res      Express response to write the error to.
 * @param err      The thrown value. Error subclasses map to their canonical
 *                 status code; anything else defaults to 500.
 * @param context  Short identifier used as the log prefix on 500+ paths.
 *                 Example: `routes/projects/delete`.
 */
export function handleRouteError(
  res: Response,
  err: unknown,
  context: string,
): void {
  if (err instanceof ValidationError) {
    const body: { error: string; detail?: string } = { error: err.message };
    if (err.detail !== undefined) body.detail = err.detail;
    res.status(400).json(body);
    return;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof ConflictError) {
    res.status(409).json({ error: err.message });
    return;
  }
  // Unknown thrown value — treat as internal server error.
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[${context}]`, err);
  res.status(500).json({ error: "Internal server error", detail });
}
