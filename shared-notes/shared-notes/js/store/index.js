/**
 * Picks a storage backend. Every backend implements the same interface:
 *
 *   ensureAccess()               → Promise<'ok' | 'needs-password'>
 *   unlock(password)             → Promise<boolean>  (rejects with a message, e.g. too many tries)
 *   list()                       → Promise<Note[]>   (includes notes in trash)
 *   subscribe(onEvent, onStatus) → unsubscribe()
 *        onEvent({ type: 'upsert', note })        | onEvent({ type: 'delete', id })
 *        onEvent({ type: 'folder-upsert', folder }) | onEvent({ type: 'folder-delete', id })
 *        onStatus('connecting' | 'live' | 'offline')
 *   create(fields)               → Promise<Note>
 *   update(id, patch)            → Promise<Note>    (rejects NotFoundError if gone)
 *   cleanupTrash()               → Promise<void>    (drops trash older than 30 days)
 *
 *   listFolders()                → Promise<Folder[]>
 *   createFolder(name)           → Promise<Folder>
 *   renameFolder(id, name)       → Promise<Folder>
 *   deleteFolder(id)             → Promise<void>    (its notes become unfiled, never deleted)
 *
 * Note   = { id, title, body, pinned, folder_id, updated_by, editor_id,
 *            created_at, updated_at, deleted_at, deleted_by }
 * Folder = { id, name, created_at }
 *
 * "Move to folder" means update(id, { folder_id }) (null = unfiled).
 *
 * "Delete" means update(id, { deleted_at, deleted_by }) → the note goes to Trash.
 * "Restore" means update(id, { deleted_at: null }).
 *
 * To add another backend (Firebase, PocketBase, your own API…), write a file
 * that returns this shape and add a branch below. Nothing else changes.
 */
import { CONFIG } from '../config.js';

export class NotFoundError extends Error {
  constructor() { super('Note no longer exists'); this.name = 'NotFoundError'; }
}

export const TRASH_DAYS = 30;

export async function createStore() {
  if (CONFIG.supabaseUrl && CONFIG.supabaseKey) {
    const { createSupabaseStore } = await import('./supabaseStore.js');
    return { mode: 'supabase', store: createSupabaseStore(CONFIG) };
  }
  const { createLocalStore } = await import('./localStore.js');
  return { mode: 'local', store: createLocalStore() };
}
