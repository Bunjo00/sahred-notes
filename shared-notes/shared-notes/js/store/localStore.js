/**
 * Demo backend: saves in this browser's localStorage and syncs between tabs.
 * Used automatically when js/config.js has no Supabase details. Handy for
 * trying the app or working on the UI offline. No password in demo mode.
 */
import { safeStorage, randomId } from '../lib/utils.js';
import { NotFoundError, TRASH_DAYS } from './index.js';

const KEY = 'shared-notes.local-db';

export function createLocalStore() {
  const read = () => { try { return JSON.parse(safeStorage.get(KEY) || '{}'); } catch { return {}; } };
  const write = (db) => safeStorage.set(KEY, JSON.stringify(db));
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(KEY) : null;
  const broadcast = (msg) => channel?.postMessage(msg);
  const now = () => new Date().toISOString();

  return {
    async ensureAccess() { return 'ok'; },
    async unlock() { return true; },

    async list() {
      return Object.values(read());
    },

    subscribe(onEvent, onStatus = () => {}) {
      const handler = (e) => onEvent(e.data);
      channel?.addEventListener('message', handler);
      setTimeout(() => onStatus('live'), 0);
      return () => channel?.removeEventListener('message', handler);
    },

    async create(fields) {
      const db = read();
      const t = now();
      const note = { title: '', body: '', pinned: false, ...fields, id: randomId(), created_at: t, updated_at: t, deleted_at: null, deleted_by: null };
      db[note.id] = note; write(db);
      broadcast({ type: 'upsert', note });
      return note;
    },

    // Mirrors the rules the database trigger enforces in supabase/schema.sql.
    async update(id, patch) {
      const db = read();
      const old = db[id];
      if (!old) throw new NotFoundError();
      const note = { ...old, ...patch };
      const textChanged = note.title !== old.title || note.body !== old.body;
      if (textChanged) note.updated_at = now();
      else Object.assign(note, { updated_at: old.updated_at, updated_by: old.updated_by, editor_id: old.editor_id });
      if (note.deleted_at && !old.deleted_at) note.deleted_at = now();
      else if (note.deleted_at) note.deleted_at = old.deleted_at;
      if (!note.deleted_at) { note.deleted_at = null; note.deleted_by = null; }
      db[id] = note; write(db);
      broadcast({ type: 'upsert', note });
      return note;
    },

    async cleanupTrash() {
      const db = read();
      const cutoff = Date.now() - TRASH_DAYS * 86400e3;
      for (const [id, n] of Object.entries(db)) {
        if (n.deleted_at && Date.parse(n.deleted_at) < cutoff) {
          delete db[id];
          broadcast({ type: 'delete', id });
        }
      }
      write(db);
    },
  };
}
