/** Wires the store, state and UI modules together. */
import { CONFIG } from './config.js';
import { $, safeStorage } from './lib/utils.js';
import { identity } from './lib/identity.js';
import { createNotesState } from './state.js';
import { createStore, TRASH_DAYS } from './store/index.js';
import { createList } from './ui/list.js';
import { createEditor } from './ui/editor.js';
import { confirmDialog, askName, askPassword, askText, showFatal } from './ui/dialog.js';
import { createFolderBar } from './ui/folders.js';
import { setStatus, showBanner } from './ui/status.js';
import { maybeShowInstallHint } from './ui/installHint.js';

const state = createNotesState();
let store = null;
let view = 'notes';   // 'notes' | 'trash'

// Folders: 'all' | 'unfiled' | a folder id. Remembered per device.
const FOLDER_KEY = 'shared-notes.folder';
let folderSel = safeStorage.get(FOLDER_KEY) || 'all';
let foldersEnabled = false;   // false until the database has the folders table
const folderName = (id) => (id && state.folder(id)?.name) || '';
// The folder actually shown: falls back to 'all' if the saved one was deleted
// (without forgetting the saved choice while folders are still loading).
function currentFolder() {
  if (!foldersEnabled) return 'all';
  if (folderSel === 'all' || folderSel === 'unfiled' || state.folder(folderSel)) return folderSel;
  return 'all';
}

const list = createList({
  container: $('list'),
  searchInput: $('search'),
  onOpen: (id) => openNote(id),
});

const folderBar = createFolderBar({
  bar: $('folderBar'),
  container: $('folders'),
  addButton: $('addFolderBtn'),
  actions: $('folderActions'),
  onSelect: (id) => selectFolder(id),
  onCreate: () => newFolder(),
  onRename: (f) => renameFolder(f),
  onDelete: (f) => deleteFolder(f),
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
  async onMove(note, folderId) {
    try {
      state.upsert(await store.update(note.id, { folder_id: folderId }));
      editor.applyRemote(state.get(note.id));
      showBanner(folderId ? `Moved to “${folderName(folderId)}”.` : 'Removed from its folder.', 2500);
    } catch { showBanner('Couldn’t move the note. Try again.'); editor.renderMeta(); }
  },
  onClose: () => closeNote(),
});

// ── Rendering & navigation ───────────────────────────────────
function render() {
  const folders = state.folders();
  const sel = currentFolder();
  folderBar.render({ folders, notes: state.all(), selected: sel, visible: foldersEnabled && view === 'notes' });
  editor.setFolders(folders, foldersEnabled);
  list.render(state.all(), editor.currentId, { view, folderId: sel, folderName });
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

// Each open note gets one history entry, so the phone's back button / swipe-back
// returns to the list instead of leaving the app.
async function openNote(id, { fromHistory = false } = {}) {
  const note = state.get(id);
  if (!note) return;
  await editor.open(note);
  if (!fromHistory && location.hash !== `#n-${id}`) {
    try {
      if (history.state?.note) history.replaceState({ note: id }, '', `#n-${id}`);
      else history.pushState({ note: id }, '', `#n-${id}`);
    } catch { /* ignore */ }
  }
  render();
}

function closeNote({ fromHistory = false } = {}) {
  editor.close();
  if (!fromHistory && location.hash) {
    try {
      if (history.state?.note) history.back();
      else history.replaceState(null, '', location.pathname + location.search);
    } catch { /* ignore */ }
  }
  render();
}

window.addEventListener('popstate', async () => {
  const m = location.hash.match(/^#n-(.+)$/);
  if (m && state.has(m[1])) {
    if (editor.currentId !== m[1]) openNote(m[1], { fromHistory: true });
  } else if (editor.currentId) {
    await editor.flush();
    closeNote({ fromHistory: true });
  }
});

async function createNote() {
  if (!store) return;
  await editor.flush();
  $('newBtn').disabled = true;
  try {
    const fields = { title: '', body: '', updated_by: identity.displayName, editor_id: identity.clientId };
    if (state.folder(currentFolder())) fields.folder_id = currentFolder();   // new notes go in the open folder
    const note = await store.create(fields);
    state.upsert(note);
    await openNote(note.id);
    editor.focusTitle();
  } catch (err) {
    showBanner(`Couldn’t create a note: ${err.message || 'try again'}`);
  } finally {
    $('newBtn').disabled = false;
  }
}

// ── Folders ──────────────────────────────────────────────────
function selectFolder(id) {
  folderSel = id;
  safeStorage.set(FOLDER_KEY, id);
  render();
}

const findFolderByName = (name) =>
  state.folders().find((f) => f.name.localeCompare(name, undefined, { sensitivity: 'base' }) === 0);

async function newFolder() {
  const name = await askText({ title: 'New folder', placeholder: 'e.g. Trips, Shopping, Ideas', okLabel: 'Create' });
  if (!name) return;
  const existing = findFolderByName(name);
  if (existing) return selectFolder(existing.id);
  try {
    const f = await store.createFolder(name);
    state.upsertFolder(f);
    selectFolder(f.id);
  } catch (err) { showBanner(`Couldn’t create the folder: ${err.message || 'try again'}`); }
}

async function renameFolder(folder) {
  const name = await askText({ title: 'Rename folder', value: folder.name, okLabel: 'Rename' });
  if (!name || name === folder.name) return;
  const clash = findFolderByName(name);
  if (clash && clash.id !== folder.id) return showBanner(`There’s already a folder called “${clash.name}”.`);
  try { state.upsertFolder(await store.renameFolder(folder.id, name)); }
  catch (err) { showBanner(`Couldn’t rename the folder: ${err.message || 'try again'}`); }
}

async function deleteFolder(folder) {
  const n = state.all().filter((x) => x.folder_id === folder.id && !x.deleted_at).length;
  const ok = await confirmDialog(
    `Delete “${folder.name}”?`,
    n ? `Its ${n} note${n === 1 ? '' : 's'} won’t be deleted. They’ll move to “No folder”.` : 'The folder is empty.',
    'Delete folder');
  if (!ok) return;
  try {
    await store.deleteFolder(folder.id);
    state.removeFolder(folder.id);
    selectFolder('all');
  } catch (err) { showBanner(`Couldn’t delete the folder: ${err.message || 'try again'}`); }
}

// ── Data sync ────────────────────────────────────────────────
async function refreshFolders() {
  try {
    const folders = await store.listFolders();
    if (folders === null) {           // database not upgraded yet
      if (foldersEnabled !== false) { foldersEnabled = false; render(); }
      return;
    }
    foldersEnabled = true;
    state.replaceFolders(folders);
  } catch { /* keep what we have */ }
}

async function refresh() {
  try {
    await refreshFolders();
    state.replaceAll(await store.list());
    if (editor.currentId && !state.has(editor.currentId)) closeNote();
  } catch {
    setStatus('warn', 'Can’t reach the database');
  }
}

function handleEvent(evt) {
  if (evt.type === 'folder-upsert') { if (evt.folder) state.upsertFolder(evt.folder); return; }
  if (evt.type === 'folder-delete') { if (evt.id) state.removeFolder(evt.id); return; }
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
  if (created.mode !== 'local') maybeShowInstallHint();
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
