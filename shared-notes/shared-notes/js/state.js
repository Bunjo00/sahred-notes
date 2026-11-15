/**
 * In-memory list of notes, the single source of truth for the UI.
 * Stores push changes in; UI modules read from it and re-render on change.
 */
export function createNotesState() {
  const notes = new Map();
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());

  return {
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
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
