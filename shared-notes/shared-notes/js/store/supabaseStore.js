/**
 * Supabase backend: Postgres table + realtime change feed.
 * Access: each device signs in anonymously, then enters the group password
 * once (checked inside the database by join_group). Only members can see notes.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { NotFoundError } from './index.js';

export function createSupabaseStore({ supabaseUrl, supabaseKey, table = 'notes' }) {
  const sb = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'shared-notes.auth' },
  });

  const check = ({ data, error }) => {
    if (error) {
      // PGRST116 = .single() matched zero rows → gone, or no longer allowed
      if (error.code === 'PGRST116') throw new NotFoundError();
      throw new Error(error.message || 'Database error');
    }
    return data;
  };

  return {
    async ensureAccess() {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        const { error } = await sb.auth.signInAnonymously();
        if (error) {
          throw new Error(/anonymous/i.test(error.message)
            ? 'Anonymous sign-ins are turned off in Supabase. Turn them on (README, step 1).'
            : error.message);
        }
      }
      const isMember = check(await sb.rpc('is_member'));
      return isMember ? 'ok' : 'needs-password';
    },

    async unlock(password) {
      return check(await sb.rpc('join_group', { p_password: password })) === true;
    },

    async list() {
      return check(await sb.from(table).select('*').order('updated_at', { ascending: false }).limit(1000));
    },

    subscribe(onEvent, onStatus = () => {}) {
      onStatus('connecting');
      const channel = sb
        .channel(`${table}-live`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, (p) => {
          if (p.eventType === 'DELETE') onEvent({ type: 'delete', id: p.old?.id });
          else onEvent({ type: 'upsert', note: p.new });
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') onStatus('live');
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onStatus('offline');
        });
      return () => sb.removeChannel(channel);
    },

    async create(fields) {
      return check(await sb.from(table).insert(fields).select().single());
    },

    async update(id, patch) {
      return check(await sb.from(table).update(patch).eq('id', id).select().single());
    },

    async cleanupTrash() {
      await sb.rpc('purge_old_trash');
    },
  };
}
