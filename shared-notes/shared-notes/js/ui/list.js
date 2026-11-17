/**
 * Sidebar: searchable list of notes.
 *  • notes view: pinned first, then newest edits on top, filtered by folder
 *  • trash view: most recently deleted on top (all folders)
 *
 * folderId: 'all' | 'unfiled' | a folder id.  folderName(id) → name or ''.
 */
import { el, timeAgo } from '../lib/utils.js';
import { identity } from '../lib/identity.js';
import { TRASH_DAYS } from '../store/index.js';

export function createList({ container, searchInput, onOpen }) {
  let last = null;
  searchInput.addEventListener('input', () => last && render(...last));

  function render(notes, currentId, { view = 'notes', folderId = 'all', folderName = () => '' } = {}) {
    last = [notes, currentId, { view, folderId, folderName }];
    const inTrash = view === 'trash';
    const q = searchInput.value.trim().toLowerCase();

    let items = notes.filter((n) => !!n.deleted_at === inTrash);
    if (!inTrash && folderId === 'unfiled') items = items.filter((n) => !n.folder_id || !folderName(n.folder_id));
    else if (!inTrash && folderId !== 'all') items = items.filter((n) => n.folder_id === folderId);
    const showFolder = !inTrash && folderId === 'all';
    if (q) items = items.filter((n) => `${n.title}\n${n.body}`.toLowerCase().includes(q));
    const key = inTrash ? 'deleted_at' : 'updated_at';
    items.sort((a, b) => String(b[key]).localeCompare(String(a[key])));

    container.replaceChildren();
    if (!items.length) {
      container.append(el('div', { className: 'empty-list' },
        q ? 'No notes match that search.'
          : inTrash ? `Trash is empty. Deleted notes stay here for ${TRASH_DAYS} days.`
          : folderId === 'unfiled' ? 'Every note is in a folder.'
          : folderId !== 'all' ? 'This folder is empty. Hit "+ New" to add a note here, or move one in from the folder button on any note.'
          : 'No notes yet. Hit "+ New" to write the first one.'));
      return;
    }

    if (inTrash) {
      container.append(el('div', { className: 'section' }, `Kept for ${TRASH_DAYS} days`));
      items.forEach((n) => container.append(row(n, n.id === currentId, true, '')));
      return;
    }
    const pinned = items.filter((n) => n.pinned);
    const rest = items.filter((n) => !n.pinned);
    const section = (label, group) => {
      if (!group.length) return;
      if (pinned.length) container.append(el('div', { className: 'section' }, label));
      group.forEach((n) => container.append(row(n, n.id === currentId, false, showFolder ? folderName(n.folder_id) : '')));
    };
    section('Pinned', pinned);
    section('Notes', rest);
  }

  function row(n, active, inTrash, folderLabel) {
    const who = inTrash ? (n.deleted_by || 'Someone') : identity.isMe(n) ? 'You' : (n.updated_by || 'Someone');
    const when = timeAgo(inTrash ? n.deleted_at : n.updated_at);
    const preview = (n.body || '').replace(/\s+/g, ' ').slice(0, 90) || 'No text';
    return el('button', { className: `item${active ? ' active' : ''}`, onclick: () => onOpen(n.id) },
      el('div', { className: 't' }, !inTrash && n.pinned && el('span', { className: 'pin' }, '●'), n.title || 'Untitled'),
      el('div', { className: 'p' }, preview),
      el('div', { className: 'm' },
        folderLabel && el('span', { className: 'tag' }, folderLabel),
        inTrash ? `Deleted by ${who} · ${when}` : `${who} · ${when}`),
    );
  }

  return { render, refresh: () => last && render(...last) };
}
