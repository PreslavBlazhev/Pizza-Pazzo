import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { getUploadsRoot } from "./paths";
import type { StorageAdapter } from "./storage-adapter";

/**
 * Filesystem implementation of StorageAdapter — writes under
 * `getUploadsRoot()` (the Render Persistent Disk in production; see
 * paths.ts). `subdir` and `filename` are trusted by this class; validating
 * them (no `..`, no separators) is the caller's job — see
 * lib/uploads/filename.ts, used before this class is ever touched.
 */
export class LocalDiskStorage implements StorageAdapter {
  private resolve(subdir: string, filename: string): string {
    return path.join(getUploadsRoot(), subdir, filename);
  }

  async save(subdir: string, filename: string, bytes: Uint8Array): Promise<void> {
    const dir = path.join(getUploadsRoot(), subdir);
    await mkdir(dir, { recursive: true });
    await writeFile(this.resolve(subdir, filename), bytes, { mode: 0o644 });
  }

  async remove(subdir: string, filename: string): Promise<void> {
    try {
      await rm(this.resolve(subdir, filename), { force: true });
    } catch {
      // Best-effort: a missing or locked file must never fail the caller.
    }
  }

  async read(subdir: string, filename: string): Promise<Uint8Array | null> {
    try {
      return await readFile(this.resolve(subdir, filename));
    } catch {
      return null;
    }
  }
}
