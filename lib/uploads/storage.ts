import { LocalDiskStorage } from "./local-disk-storage";
import type { StorageAdapter } from "./storage-adapter";

/** The active storage backend for every upload (product and category
 *  photos). Swap this one line to move uploads elsewhere (e.g. S3). */
export const uploadStorage: StorageAdapter = new LocalDiskStorage();
