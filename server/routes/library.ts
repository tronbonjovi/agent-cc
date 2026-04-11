import { Router, type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { runFullScan } from "../scanner/index";

// Define locally to avoid conflicts with parallel Task 001 (library scanner)
const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const LIBRARY_DIR = path.join(CLAUDE_DIR, "library");

const VALID_TYPES = ["skills", "agents", "plugins"] as const;
type LibraryType = (typeof VALID_TYPES)[number];

function isValidType(t: string): t is LibraryType {
  return (VALID_TYPES as readonly string[]).includes(t);
}

/** Resolve paths for library and active directories based on entity type */
function resolvePaths(type: LibraryType, itemName: string) {
  const claudeDir = path.join(os.homedir(), ".claude");
  const libraryDir = path.join(claudeDir, "library");
  const libraryBase = path.join(libraryDir, type);
  const activeBase = path.join(claudeDir, type);
  const libraryPath = path.join(libraryBase, itemName);
  const activePath = path.join(activeBase, itemName);
  return { libraryBase, activeBase, libraryPath, activePath };
}

/** Install: move item from library to active directory */
export async function installItem(type: LibraryType, itemName: string): Promise<{ success: boolean; error?: string }> {
  const { libraryPath, activePath, activeBase } = resolvePaths(type, itemName);

  if (!fs.existsSync(libraryPath)) {
    return { success: false, error: `Item "${itemName}" not found in library` };
  }

  if (fs.existsSync(activePath)) {
    return { success: false, error: `"${itemName}" already exists in active directory. Remove it first or use a different name.` };
  }

  // Ensure target directory exists
  fs.mkdirSync(activeBase, { recursive: true });

  // Move from library to active
  fs.renameSync(libraryPath, activePath);
  return { success: true };
}

/** Uninstall: move item from active directory to library */
export async function uninstallItem(type: LibraryType, itemName: string): Promise<{ success: boolean; error?: string }> {
  const { libraryPath, activePath, libraryBase } = resolvePaths(type, itemName);

  if (!fs.existsSync(activePath)) {
    return { success: false, error: `Item "${itemName}" not found in active directory` };
  }

  // Ensure library directory exists
  fs.mkdirSync(libraryBase, { recursive: true });

  if (fs.existsSync(libraryPath)) {
    // Library copy already exists — overwrite it
    fs.rmSync(libraryPath, { recursive: true, force: true });
  }

  // Move from active to library
  fs.renameSync(activePath, libraryPath);
  return { success: true };
}

/** Remove: permanently delete item from library */
export async function removeItem(type: LibraryType, itemName: string): Promise<{ success: boolean; error?: string }> {
  const { libraryPath } = resolvePaths(type, itemName);

  if (!fs.existsSync(libraryPath)) {
    return { success: false, error: `Item "${itemName}" not found in library` };
  }

  fs.rmSync(libraryPath, { recursive: true, force: true });
  return { success: true };
}

const router = Router();

// POST /api/library/:type/:id/install
router.post("/api/library/:type/:id/install", async (req: Request, res: Response) => {
  const type = req.params.type as string;
  const id = req.params.id as string;
  if (!isValidType(type)) return res.status(400).json({ message: `Invalid type: ${type}` });

  const result = await installItem(type, id);
  if (!result.success) return res.status(400).json({ message: result.error });

  // Trigger rescan so UI reflects changes
  runFullScan().catch(() => {});
  res.json({ message: `Installed "${id}"` });
});

// POST /api/library/:type/:id/uninstall
router.post("/api/library/:type/:id/uninstall", async (req: Request, res: Response) => {
  const type = req.params.type as string;
  const id = req.params.id as string;
  if (!isValidType(type)) return res.status(400).json({ message: `Invalid type: ${type}` });

  const result = await uninstallItem(type, id);
  if (!result.success) return res.status(400).json({ message: result.error });

  runFullScan().catch(() => {});
  res.json({ message: `Uninstalled "${id}" — moved to library` });
});

// DELETE /api/library/:type/:id
router.delete("/api/library/:type/:id", async (req: Request, res: Response) => {
  const type = req.params.type as string;
  const id = req.params.id as string;
  if (!isValidType(type)) return res.status(400).json({ message: `Invalid type: ${type}` });

  const result = await removeItem(type, id);
  if (!result.success) return res.status(400).json({ message: result.error });

  runFullScan().catch(() => {});
  res.json({ message: `Removed "${id}" from library` });
});

// GET /api/library/:type — list library items for a type
router.get("/api/library/:type", (req: Request, res: Response) => {
  const type = req.params.type as string;
  if (!isValidType(type)) return res.status(400).json({ message: `Invalid type: ${type}` });

  const claudeDir = path.join(os.homedir(), ".claude");
  const typeDir = path.join(claudeDir, "library", type);
  if (!fs.existsSync(typeDir)) return res.json([]);

  try {
    const entries = fs.readdirSync(typeDir, { withFileTypes: true });
    const items = entries
      .filter(e => e.isDirectory() || e.name.endsWith(".md"))
      .map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
    res.json(items);
  } catch {
    res.json([]);
  }
});

export default router;
