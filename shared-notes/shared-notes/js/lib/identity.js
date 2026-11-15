/**
 * Who is editing, without accounts.
 * - name: a display name the person picks (shown as "last edited by").
 * - clientId: random id for this browser, used to tell "my" edits from others'.
 */
import { safeStorage, randomId } from './utils.js';

const NAME_KEY = 'shared-notes.name';
const ID_KEY = 'shared-notes.client-id';

let clientId = safeStorage.get(ID_KEY);
if (!clientId) { clientId = randomId(); safeStorage.set(ID_KEY, clientId); }

export const identity = {
  clientId,
  get name() { return safeStorage.get(NAME_KEY) || ''; },
  set name(v) { safeStorage.set(NAME_KEY, (v || '').trim().slice(0, 40)); },
  get displayName() { return this.name || 'Guest'; },
  isMe(note) { return !!note && note.editor_id === clientId; },
};
