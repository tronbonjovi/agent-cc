import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const tmpDir = path.join(os.tmpdir(), "cc-rename-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
process.env.AGENT_CC_DATA = tmpDir;

const { getDB, save } = await import("../server/db");
const { storage } = await import("../server/storage");

function resetDB() {
  const dbPath = path.join(tmpDir, "agent-cc.json");
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const tmpPath = dbPath + ".tmp";
  if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  // Reset in-memory state by clearing sessionNames
  const db = getDB();
  db.sessionNames = {};
}

describe("session rename", () => {
  beforeEach(() => {
    resetDB();
  });

  it("sessionNames exists in default DB", () => {
    const db = getDB();
    expect(db.sessionNames).toEqual({});
  });

  it("stores and retrieves a session name", () => {
    const db = getDB();
    db.sessionNames["test-session-id"] = "My Auth Refactor";
    save();
    const db2 = getDB();
    expect(db2.sessionNames["test-session-id"]).toBe("My Auth Refactor");
  });

  it("deletes a session name", () => {
    const db = getDB();
    db.sessionNames["test-session-id"] = "My Auth Refactor";
    save();
    delete db.sessionNames["test-session-id"];
    save();
    expect(getDB().sessionNames["test-session-id"]).toBeUndefined();
  });
});

describe("session rename storage", () => {
  beforeEach(() => {
    resetDB();
  });

  it("storage sets and gets a name", () => {
    storage.setSessionName("abc-123", "Dashboard Redesign");
    expect(storage.getSessionName("abc-123")).toBe("Dashboard Redesign");
  });

  it("storage delete clears the entry", () => {
    storage.setSessionName("abc-123", "Something");
    storage.deleteSessionName("abc-123");
    expect(storage.getSessionName("abc-123")).toBeNull();
  });

  it("cleanupSessionData removes session name", () => {
    storage.setSessionName("cleanup-test", "Will Be Removed");
    storage.cleanupSessionData("cleanup-test");
    expect(storage.getSessionName("cleanup-test")).toBeNull();
  });

  it("getSessionNames returns all names", () => {
    storage.setSessionName("id-1", "First");
    storage.setSessionName("id-2", "Second");
    const names = storage.getSessionNames();
    expect(names["id-1"]).toBe("First");
    expect(names["id-2"]).toBe("Second");
  });
});
