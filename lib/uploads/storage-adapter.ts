/**
 * Storage abstraction for uploaded files.
 *
 * Deliberately filesystem-agnostic at this layer: callers only ever deal in
 * `(subdir, filename)` pairs, never a raw path. `LocalDiskStorage`
 * (local-disk-storage.ts) is the only implementation today — it writes to the
 * Render Persistent Disk (or a local dev folder, see paths.ts). Swapping in
 * Cloudinary/S3/etc. later means writing one new class against this same
 * interface; nothing above it (the API route, the public serving route, the
 * admin UI) needs to change.
 */
export interface StorageAdapter {
  save(subdir: string, filename: string, bytes: Uint8Array): Promise<void>;

  /** Deletes the file if it exists. Never throws when it is already gone. */
  remove(subdir: string, filename: string): Promise<void>;

  /** Reads the file back, or null if it does not exist. */
  read(subdir: string, filename: string): Promise<Uint8Array | null>;
}
