// tests/route-errors.test.ts
//
// Covers the route error helper + lightweight error classes in
// server/lib/route-errors.ts. These tests pin the canonical shape
// (`{error, detail?}`) and the logging policy (log on 500+, stay quiet
// on 4xx client-error paths).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
} from "../server/lib/route-errors";

// Minimal mock of Express's Response. The helper only touches `status()`
// (chainable) and `json()`.
function makeRes() {
  const calls: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      calls.status = code;
      return res;
    },
    json(body: unknown) {
      calls.body = body;
      return res;
    },
  };
  return { res: res as unknown as import("express").Response, calls };
}

describe("handleRouteError", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  describe("ValidationError", () => {
    it("maps to 400 with {error, detail}", () => {
      const { res, calls } = makeRes();
      handleRouteError(res, new ValidationError("bad input", "missing field"), "routes/test");
      expect(calls.status).toBe(400);
      expect(calls.body).toEqual({ error: "bad input", detail: "missing field" });
    });

    it("omits detail key when not provided", () => {
      const { res, calls } = makeRes();
      handleRouteError(res, new ValidationError("bad input"), "routes/test");
      expect(calls.status).toBe(400);
      expect(calls.body).toEqual({ error: "bad input" });
    });

    it("does NOT log to console (4xx is a client error, not an incident)", () => {
      const { res } = makeRes();
      handleRouteError(res, new ValidationError("bad input"), "routes/test");
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe("NotFoundError", () => {
    it("maps to 404 with {error}", () => {
      const { res, calls } = makeRes();
      handleRouteError(res, new NotFoundError("nope"), "routes/test");
      expect(calls.status).toBe(404);
      expect(calls.body).toEqual({ error: "nope" });
    });

    it("does NOT log to console", () => {
      const { res } = makeRes();
      handleRouteError(res, new NotFoundError("nope"), "routes/test");
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe("ConflictError", () => {
    it("maps to 409 with {error}", () => {
      const { res, calls } = makeRes();
      handleRouteError(res, new ConflictError("already exists"), "routes/test");
      expect(calls.status).toBe(409);
      expect(calls.body).toEqual({ error: "already exists" });
    });

    it("does NOT log to console", () => {
      const { res } = makeRes();
      handleRouteError(res, new ConflictError("dup"), "routes/test");
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe("unknown Error", () => {
    it("maps to 500 with {error: 'Internal server error', detail}", () => {
      const { res, calls } = makeRes();
      handleRouteError(res, new Error("boom"), "routes/test");
      expect(calls.status).toBe(500);
      expect(calls.body).toEqual({
        error: "Internal server error",
        detail: "boom",
      });
    });

    it("logs with the route context prefix", () => {
      const { res } = makeRes();
      const err = new Error("boom");
      handleRouteError(res, err, "routes/widgets/compute");
      expect(errorSpy).toHaveBeenCalledTimes(1);
      // First arg should be the [context] prefix, second arg should be the error
      const firstArg = errorSpy.mock.calls[0][0];
      expect(String(firstArg)).toContain("routes/widgets/compute");
      const secondArg = errorSpy.mock.calls[0][1];
      expect(secondArg).toBe(err);
    });
  });

  describe("thrown non-Error values", () => {
    it("handles thrown string with 500 {error, detail}", () => {
      const { res, calls } = makeRes();
      handleRouteError(res, "something broke", "routes/test");
      expect(calls.status).toBe(500);
      expect(calls.body).toEqual({
        error: "Internal server error",
        detail: "something broke",
      });
    });

    it("handles thrown number", () => {
      const { res, calls } = makeRes();
      handleRouteError(res, 42, "routes/test");
      expect(calls.status).toBe(500);
      expect((calls.body as { detail: string }).detail).toBe("42");
    });

    it("handles thrown null", () => {
      const { res, calls } = makeRes();
      handleRouteError(res, null, "routes/test");
      expect(calls.status).toBe(500);
      // null → "null" via String()
      expect((calls.body as { detail: string }).detail).toBe("null");
    });

    it("still logs on 500 for non-Error values", () => {
      const { res } = makeRes();
      handleRouteError(res, "oops", "routes/test");
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("subclassing behavior", () => {
    it("ValidationError is an instance of Error", () => {
      const err = new ValidationError("x");
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe("ValidationError");
      expect(err.message).toBe("x");
    });

    it("NotFoundError is an instance of Error", () => {
      const err = new NotFoundError("x");
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe("NotFoundError");
    });

    it("ConflictError is an instance of Error", () => {
      const err = new ConflictError("x");
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe("ConflictError");
    });
  });
});
