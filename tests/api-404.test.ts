import { describe, it, expect } from "vitest";
import express from "express";
import { createServer } from "http";
import { registerRoutes } from "../server/routes/index";

describe("API 404 handling", () => {
  it("returns JSON 404 for unmatched /api/* routes", async () => {
    const app = express();
    app.use(express.json());
    const server = createServer(app);

    await registerRoutes(server, app);

    const port = 0; // OS picks a free port
    await new Promise<void>((resolve) => {
      server.listen(port, "127.0.0.1", () => resolve());
    });

    try {
      const addr = server.address() as { port: number };
      const res = await fetch(`http://127.0.0.1:${addr.port}/api/nonexistent`);

      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toMatch(/json/);

      const body = await res.json();
      expect(body).toEqual({ message: "Not found" });
    } finally {
      server.close();
    }
  });

  it("does not affect non-API routes", async () => {
    const app = express();
    app.use(express.json());
    const server = createServer(app);

    await registerRoutes(server, app);

    const port = 0;
    await new Promise<void>((resolve) => {
      server.listen(port, "127.0.0.1", () => resolve());
    });

    try {
      const addr = server.address() as { port: number };
      const res = await fetch(`http://127.0.0.1:${addr.port}/health`);

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe("ok");
    } finally {
      server.close();
    }
  });
});
