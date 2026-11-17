/** In-page dialogs (no browser alert/confirm/prompt). */
import { $ } from '../lib/utils.js';

function open({ title, text, input = null, okLabel = 'OK', danger = false, cancellable = true, error = '' }) {
  const modal = $('modal'), form = $('modalCard'), field = $('modalInput');
  const ok = $('modalOk'), cancel = $('modalCancel'), err = $('modalError');
  $('modalTitle').textContent = title;
  $('modalText').textContent = text;
  err.textContent = error;
  err.hidden = !error;
  ok.textContent = okLabel;
  ok.className = `btn ${danger ? 'danger' : 'primary'}`;
  cancel.hidden = !cancellable;
  field.hidden = input === null;
  if (input !== null) {
    field.type = input.type || 'text';
    field.value = input.value || '';
    field.placeholder = input.placeholder || '';
    field.maxLength = input.maxLength || 40;
    field.autocomplete = input.type === 'password' ? 'current-password' : 'off';
  }
  modal.classList.add('show');
  setTimeout(() => (input !== null ? field : ok).focus(), 30);

  return new Promise((resolve) => {
    const done = (result) => {
      modal.classList.remove('show');
      form.onsubmit = cancel.onclick = modal.onclick = document.onkeydown = null;
      resolve(result);
    };
    form.onsubmit = (e) => { e.preventDefault(); done(input !== null ? field.value.trim() : true); };
    cancel.onclick = () => done(input !== null ? null : false);
    modal.onclick = (e) => { if (e.target === modal && cancellable) cancel.onclick(); };
    document.onkeydown = (e) => { if (e.key === 'Escape' && cancellable) cancel.onclick(); };
  });
}

export const confirmDialog = (title, text, okLabel = 'Delete', danger = true) =>
  open({ title, text, okLabel, danger });

/** Ask for a short piece of text. Resolves the trimmed text, or null if cancelled. */
export const askText = ({ title, text = '', value = '', placeholder = '', okLabel = 'Save', maxLength = 60 }) =>
  open({ title, text, input: { value, placeholder, maxLength }, okLabel });

export const askName = (current = '', firstTime = false) =>
  open({
    title: firstTime ? 'What should we call you?' : 'Change your name',
    text: 'Your friends will see this next to notes you edit.',
    input: { value: current, placeholder: 'Your name', maxLength: 40 },
    okLabel: 'Save',
    cancellable: !firstTime,
  });

export const askPassword = (error = '') =>
  open({
    title: 'Enter the group password',
    text: 'Ask whoever shared this link. You only need to enter it once on this device.',
    input: { type: 'password', placeholder: 'Group password', maxLength: 200 },
    okLabel: 'Unlock',
    cancellable: false,
    error,
  });

/** A blocking message with no way out (setup problems). */
export const showFatal = (title, text) =>
  open({ title, text, okLabel: 'Reload', cancellable: false }).then(() => location.reload());
