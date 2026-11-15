/**
 * Note editor: title + body with autosave.
 * - Saves after a short pause in typing, one save at a time per note.
 * - Applies other people's edits live when you aren't mid-edit.
 * - Notes in trash open read-only with a Restore button.
 */
import { $, debounce, timeAgo } from '../lib/utils.js';
import { identity } from '../lib/identity.js';
import { showBanner, hideBanner } from './status.js';

export function createEditor({ autosaveDelayMs = 700, onSave, onPin, onDelete, onRestore, onClose }) {
  const app = $('app'), title = $('title'), body = $('body');
  const saved = $('saved'), meta = $('meta');
  const pinBtn = $('pinBtn'), delBtn = $('delBtn'), restoreBtn = $('restoreBtn');

  let note = null;          // the note currently open (latest known copy)
  let dirty = false;        // typed but not sent yet
  let saving = false;
  let again = false;

  const scheduled = debounce(() => save(), autosaveDelayMs);
  const inTrash = () => !!note?.deleted_at;

  function show(open) {
    $('toolbar').hidden = !open;
    $('editorWrap').hidden = !open;
    $('placeholder').hidden = open;
    app.classList.toggle('editing', open);
  }

  function renderMeta() {
    if (!note) return;
    const trashed = inTrash();
    title.readOnly = body.readOnly = trashed;
    pinBtn.hidden = delBtn.hidden = trashed;
    restoreBtn.hidden = !trashed;
    if (trashed) {
      meta.textContent = `In trash · deleted by ${note.deleted_by || 'someone'} · ${timeAgo(note.deleted_at)}`;
      saved.textContent = 'Read-only while in trash';
    } else {
      const who = identity.isMe(note) ? 'you' : (note.updated_by || 'someone');
      meta.textContent = `Last edited by ${who} · ${timeAgo(note.updated_at)}`;
      pinBtn.textContent = note.pinned ? 'Unpin' : 'Pin';
      pinBtn.classList.toggle('on', !!note.pinned);
    }
  }

  function onInput() {
    if (!note || inTrash()) return;
    dirty = true;
    saved.textContent = 'Editing…';
    scheduled();
  }

  async function save() {
    if (!note || !dirty) return;
    if (saving) { again = true; return; }
    saving = true;
    dirty = false;
    const id = note.id;
    saved.textContent = 'Saving…';
    try {
      const result = await onSave(id, { title: title.value, body: body.value });
      if (note?.id === id) {
        note = { ...note, ...result };
        renderMeta();
        saved.textContent = dirty ? 'Editing…' : 'Saved';
      }
    } catch (err) {
      if (note?.id !== id) return;
      if (err?.name === 'NotFoundError') {
        saved.textContent = 'Couldn’t save: this note is gone, or your access was reset. Reload the page.';
      } else {
        dirty = true;
        saved.textContent = 'Couldn’t save — retrying…';
        setTimeout(() => { if (note?.id === id) save(); }, 2000 + Math.random() * 1000);
      }
    } finally {
      saving = false;
      if (again) { again = false; save(); }
    }
  }

  /** Send any pending typing right now (before switching notes, hiding the tab…). */
  async function flush() {
    if (scheduled.pending()) scheduled.cancel();
    if (dirty) await save();
  }

  async function open(n) {
    if (note && note.id !== n.id) await flush();
    note = n;
    dirty = false;
    title.value = n.title || '';
    body.value = n.body || '';
    saved.textContent = '';
    hideBanner();
    show(true);
    renderMeta();
  }

  function close() {
    scheduled.cancel();
    note = null;
    dirty = false;
    show(false);
  }

  /** Someone (maybe us, echoed back) changed the open note. */
  function applyRemote(n) {
    if (!note || n.id !== note.id) return;
    const fromSomeoneElse = !identity.isMe(n);
    note = { ...note, ...n };
    renderMeta();
    if (dirty || saving) {
      if (fromSomeoneElse) showBanner(`${n.updated_by || 'Someone'} is editing this note too. Your latest typing will be what’s kept.`);
      return;
    }
    swapValue(title, n.title || '');
    swapValue(body, n.body || '');
  }

  function swapValue(field, value) {
    if (field.value === value) return;
    const focused = document.activeElement === field;
    const { selectionStart: s, selectionEnd: e } = field;
    field.value = value;
    if (focused) field.setSelectionRange(Math.min(s, value.length), Math.min(e, value.length));
  }

  title.addEventListener('input', onInput);
  body.addEventListener('input', onInput);
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); body.focus(); } });
  pinBtn.addEventListener('click', async () => { if (note) { await flush(); onPin(note); } });
  delBtn.addEventListener('click', async () => { if (note) { await flush(); onDelete(note); } });
  restoreBtn.addEventListener('click', () => note && onRestore(note));
  $('backBtn').addEventListener('click', async () => { await flush(); onClose(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  window.addEventListener('pagehide', () => { flush(); });

  return {
    open, close, flush, applyRemote, renderMeta,
    get currentId() { return note?.id ?? null; },
    get currentInTrash() { return inTrash(); },
    focusTitle: () => title.focus(),
  };
}
