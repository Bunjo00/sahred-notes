/**
 * Folder bar: a row of tabs above the note list, with "+ Folder" pinned on the right.
 *   All · <each folder> · No folder        [+ Folder]
 * When a real folder is selected, a small row offers Rename / Delete folder.
 *
 * Selection ids: 'all', 'unfiled', or a folder id.
 */
import { el } from '../lib/utils.js';

export function createFolderBar({ bar, container, addButton, actions, onSelect, onCreate, onRename, onDelete }) {
  let lastSelected = null;
  addButton.addEventListener('click', () => onCreate());

  function render({ folders, notes, selected, visible }) {
    bar.hidden = !visible;
    const folder = folders.find((f) => f.id === selected);
    actions.hidden = !visible || !folder;
    if (!visible) return;

    const live = notes.filter((n) => !n.deleted_at);
    const known = new Set(folders.map((f) => f.id));
    const count = (pred) => live.filter(pred).length;
    const unfiled = count((n) => !n.folder_id || !known.has(n.folder_id));

    const chips = [chip('all', 'All', live.length, selected)];
    for (const f of folders) chips.push(chip(f.id, f.name, count((n) => n.folder_id === f.id), selected));
    if (folders.length) chips.push(chip('unfiled', 'No folder', unfiled, selected));
    container.replaceChildren(...chips);

    actions.replaceChildren();
    if (folder) {
      actions.append(
        el('span', { className: 'fa-name' }, folder.name),
        el('button', { className: 'fa-btn', type: 'button', onclick: () => onRename(folder) }, 'Rename'),
        el('button', { className: 'fa-btn del', type: 'button', onclick: () => onDelete(folder) }, 'Delete folder'),
      );
    }

    // Scroll the chosen tab into view when the selection changes (long folder lists on phones).
    if (selected !== lastSelected) {
      lastSelected = selected;
      const on = container.querySelector('.chip.on');
      if (on) container.scrollLeft = Math.max(0, on.offsetLeft - container.clientWidth / 2 + on.clientWidth / 2);
    }
  }

  function chip(id, label, n, selected) {
    return el('button', {
      className: `chip${id === selected ? ' on' : ''}`,
      type: 'button',
      onclick: () => onSelect(id),
    }, el('span', { className: 'chip-label' }, label), el('span', { className: 'n' }, String(n)));
  }

  return { render };
}
