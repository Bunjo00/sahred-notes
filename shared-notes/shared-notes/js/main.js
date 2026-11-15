/** Wires the store, state and UI modules together. */
import { CONFIG } from './config.js';
import { $ } from './lib/utils.js';
import { identity } from './lib/identity.js';
import { createNotesState } from './state.js';
import { createStore, TRASH_DAYS } from './store/index.js';
import { createList } from './ui/list.js';
import { createEditor } from './ui/editor.js';
import { confirmDialog, askName, askPassword, showFatal } from './ui/dialog.js';
import { setStatus, showBanner } from './ui/status.js';

const state = createNotesState();
let store = null;
let view = 'notes';   // 'notes' | 'trash'

const list = createList({
  container: $('list'),
  searchInput: $('search'),
  onOpen: (id) => openNote(id),
});

const editor = createEditor({
  autosaveDelayMs: CONFIG.autosaveDelayMs,
  async onSave(id, patch) {
    const note = await store.update(id, { ...patch, updated_by: identity.displayName, editor_id: identity.clientId });
    state.upsert(note);
    return note;
  },
  async onPin(note) {
    try {
      const updated = await store.update(note.id, { pinned: !note.pinned });
      state.upsert(updated);
      editor.applyRemote(state.get(note.id));
    } catch { showBanner('Couldn’t change the pin. Try again.'); }
  },
  async onDelete(note) {
    const ok = await confirmDialog('Move to trash?', `Anyone can restore it from Trash for ${TRASH_DAYS} days.`, 'Move to trash');
    if (!ok) return;
    closeNote();
    try { state.upsert(await store.update(note.id, { deleted_at: new Date().toISOString(), deleted_by: identity.displayName })); }
    catch { showBanner('Couldn’t delete the note. Try again.'); refresh(); }
  },
  async onRestore(note) {
    try {
      state.upsert(await store.update(note.id, { deleted_at: null, deleted_by: null }));
      setView('notes');
      await openNote(note.id);
      showBanner('Note restored.', 3000);
    } catch { showBanner('Couldn’t restore the note. Try again.'); }
  },
  onClose: () => closeNote(),
});

// ── Rendering & navigation ───────────────────────────────────
function render() {
  list.render(state.all(), editor.currentId, { view });
  const trashCount = state.all().filter((n) => n.deleted_at).length;
  $('trashBtn').textContent = view === 'trash' ? '‹ Back to notes' : `Trash${trashCount ? ` (${trashCount})` : ''}`;
  editor.renderMeta();
}

function setView(v) {
  if (view === v) return;
  view = v;
  document.querySelector('.brand h1').textContent = v === 'trash' ? 'Trash' : CONFIG.appName;
  $('newBtn').hidden = v === 'trash';
  $('search').value = '';
  if (editor.currentId) closeNote();
  render();
}

function setHash(id) {
  try { history.replaceState(null, '', id ? `#n-${id}` : location.pathname + location.search); } catch { /* ignore */ }
}

async function openNote(id) {
  const note = state.get(id);
  if (!note) return;
  await editor.open(note);
  setHash(id);
  render();
}

function closeNote() {
  editor.close();
  setHash(null);
  render();
}

async function createNote() {
  if (!store) return;
  await editor.flush();
  $('newBtn').disabled = true;
  try {
    const note = await store.create({ title: '', body: '', updated_by: identity.displayName, editor_id: identity.clientId });
    state.upsert(note);
    await openNote(note.id);
    editor.focusTitle();
  } catch (err) {
    showBanner(`Couldn’t create a note: ${err.message || 'try again'}`);
  } finally {
    $('newBtn').disabled = false;
  }
}

// ── Data sync ────────────────────────────────────────────────
async function refresh() {
  try {
    state.replaceAll(await store.list());
    if (editor.currentId && !state.has(editor.currentId)) closeNote();
  } catch {
    setStatus('warn', 'Can’t reach the database');
  }
}

function handleEvent(evt) {
  if (evt.type === 'delete') {
    if (!evt.id) return;
    if (evt.id === editor.currentId) closeNote();
    state.remove(evt.id);
    return;
  }
  const n = evt.note;
  if (!n?.id) return;
  const prev = state.get(n.id);
  state.upsert(n);
  const now = state.get(n.id);

  if (n.id === editor.currentId && !!prev?.deleted_at !== !!now.deleted_at) {
    // The open note was moved to / out of trash by someone else.
    closeNote();
    showBanner(now.deleted_at
      ? `${now.deleted_by || 'Someone'} moved that note to trash. You can restore it from Trash.`
      : 'That note was restored by someone.');
    return;
  }
  editor.applyRemote(now);
}

// ── Access (group password) ──────────────────────────────────
async function unlock() {
  let error = '';
  for (;;) {
    const pw = await askPassword(error);
    if (!pw) { error = 'Type the password first.'; continue; }
    try {
      if (await store.unlock(pw)) return;
      error = 'That password isn’t right.';
    } catch (err) {
      error = err.message || 'Couldn’t check the password. Try again.';
    }
  }
}

function renderMe() {
  $('meBtn').textContent = `You: ${identity.displayName} ✎`;
}

// ── Start ────────────────────────────────────────────────────
async function init() {
  document.title = CONFIG.appName;
  document.querySelector('.brand h1').textContent = CONFIG.appName;
  state.onChange(render);

  const created = await createStore();
  store = created.store;

  setStatus('', 'Checking access…');
  let access;
  try { access = await store.ensureAccess(); }
  catch (err) { setStatus('warn', 'Setup problem'); return showFatal('Can’t open the notes', err.message || 'Unknown error'); }
  if (access === 'needs-password') await unlock();

  if (created.mode === 'local') {
    showBanner('Demo mode: notes are saved in this browser only. Add your Supabase details to js/config.js to share them.', 0);
  }
  if (!identity.name) identity.name = (await askName('', true)) || '';
  renderMe();
  $('meBtn').onclick = async () => {
    const n = await askName(identity.name);
    if (n !== null) { identity.name = n; renderMe(); }
  };
  $('newBtn').onclick = createNote;
  $('newBtn').disabled = false;
  $('trashBtn').onclick = () => setView(view === 'trash' ? 'notes' : 'trash');

  // Subscribe first so nothing is missed while the first list loads.
  let wasOffline = false;
  const loadTimer = setTimeout(() => setStatus('warn', 'Still connecting…'), 10000);
  store.subscribe(handleEvent, (s) => {
    if (s === 'live') {
      clearTimeout(loadTimer);
      setStatus('live', 'Live · synced');
      if (wasOffline) refresh();   // catch up on anything missed while offline
      wasOffline = false;
    } else if (s === 'offline') {
      wasOffline = true;
      setStatus('warn', 'Reconnecting…');
    } else {
      setStatus('', 'Connecting…');
    }
  });

  store.cleanupTrash().catch(() => {});
  await refresh();

  const m = location.hash.match(/^#n-(.+)$/);
  if (m && state.has(m[1])) {
    if (state.get(m[1]).deleted_at) setView('trash');
    openNote(m[1]);
  }

  // Keep "5m ago" labels fresh.
  setInterval(render, 60_000);
}

init().catch((err) => {
  console.error(err);
  setStatus('warn', 'Something went wrong — reload the page');
});
