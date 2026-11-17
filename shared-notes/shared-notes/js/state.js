/**
 * In-memory notes and folders, the single source of truth for the UI.
 * Stores push changes in; UI modules read from it and re-render on change.
 */
export function createNotesState() {
  const notes = new Map();
  const folders = new Map();
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());

  return {
    // Notes
    get: (id) => notes.get(id),
    has: (id) => notes.has(id),
    all: () => [...notes.values()],
    size: () => notes.size,

    replaceAll(list) {
      notes.clear();
      for (const n of list) notes.set(n.id, n);
      emit();
    },
    upsert(note) {
      if (!note?.id) return;
      notes.set(note.id, { ...notes.get(note.id), ...note });
      emit();
    },
    remove(id) {
      if (notes.delete(id)) emit();
    },

    // Folders (sorted A→Z)
    folder: (id) => folders.get(id),
    folders: () => [...folders.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    replaceFolders(list) {
      folders.clear();
      for (const f of list) folders.set(f.id, f);
      emit();
    },
    upsertFolder(folder) {
      if (!folder?.id) return;
      folders.set(folder.id, { ...folders.get(folder.id), ...folder });
      emit();
    },
    removeFolder(id) {
      if (!folders.delete(id)) return;
      // The database un-files these notes too; mirror it right away.
      for (const [nid, n] of notes) if (n.folder_id === id) notes.set(nid, { ...n, folder_id: null });
      emit();
    },

    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
