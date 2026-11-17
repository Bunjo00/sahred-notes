# Shared Notes

A notes app you and your friends edit together. Changes show up for everyone live. No accounts: friends open the link, type the **group password** once and they're in.

**Runs free, 24/7:** Cloudflare Pages hosts the site (it never sleeps) and Supabase stores the notes. A GitHub Action pings the database every 3 days so the free Supabase project never pauses.

---

## How safe is it?

| | |
|---|---|
| ✅ Encrypted connection (HTTPS) | Nobody on your Wi-Fi can read your notes. |
| ✅ Group password, checked by the database | A leaked link or key alone shows **nothing**. The page can't skip the check because the database enforces it. |
| ✅ Brute-force limit | 5 wrong guesses per device locks it out for 10 minutes. |
| ✅ Trash bin | "Delete" moves a note to Trash for 30 days, and anyone can restore it. **Nobody can permanently delete through the app or the API**: trash empties itself after 30 days. |
| ⚠️ Members can still edit | Anyone with the password can change or empty a note's text. Only give it to people you trust. |
| ⚠️ Names aren't verified | "Last edited by" is whatever name someone typed. |
| ⚠️ No automatic backups (free plan) | Export a copy now and then (see *Backups*). |

**Don't store** passwords, bank or ID details, or anything you'd hate to see leaked.

---

## Setup (about 15–20 minutes)

### 1. Create the database (Supabase)
1. Sign up at **supabase.com** (free, no card) and click **New project**. Pick any name and a region close to you, and save the database password somewhere.
2. When it's ready, open **SQL Editor → New query**, paste everything in `supabase/schema.sql` and click **Run**. You should see "Success".
3. **Set your group password.** In a new query, run this, with your own password:
   ```sql
   select set_group_password('correct horse battery staple');
   ```
   Use a few random words (12+ characters). This is what friends will type.
4. **Turn on anonymous sign-ins:** go to **Authentication → Sign In / Providers** (or **Auth settings**), switch on **Allow anonymous sign-ins** and save. Each device gets an invisible "guest" login; the group password decides whether that guest can see notes.
5. Go to **Project Settings → API Keys** and copy the **publishable key** (or the legacy **anon** key). Then copy the **Project URL** (it's on the project home page, or under **Data API**).
   - Never use the **secret** or **service_role** key.

### 2. Connect the app
Open `js/config.js` and paste the two values:
```js
supabaseUrl: 'https://YOURPROJECT.supabase.co',
supabaseKey: 'sb_publishable_…',
```

### 3. Put the code on GitHub
1. Make a free account at **github.com** and click **New repository** (private is fine).
2. Click **uploading an existing file**, then drag in **everything inside this folder**, including the hidden `.github` folder. (On a Mac, press `Cmd+Shift+.` in Finder to show hidden folders.)
3. Click **Commit changes**.

### 4. Publish the site (Cloudflare Pages)
1. Sign up at **dash.cloudflare.com** (free).
2. Go to **Workers & Pages → Create → Pages → Connect to Git** and pick your repository.
3. Build settings: **Framework preset: None**, **Build command:** leave empty, **Build output directory:** `/`.
4. Click **Save and Deploy**. After about a minute you'll get a link like `https://shared-notes.pages.dev`.
5. Send friends the **link**, and send the **password** separately (e.g. say it out loud, or in a different chat).

Every time you change a file on GitHub, the site updates on its own.

### 5. Keep the database awake
In your GitHub repository go to **Settings → Secrets and variables → Actions → New repository secret** and add:
- `SUPABASE_URL`: your Project URL
- `SUPABASE_KEY`: your publishable or anon key

Then open the **Actions** tab, click **Keep Supabase awake → Run workflow** once to check it turns green.
(GitHub turns off scheduled actions in repos with no activity for 60 days. If you get an email about that, click to re-enable it.)

---

## Folders
Tabs above the list: **All**, one per folder, and **No folder**. **+ Folder** makes a new one.
- **New notes** go into whichever folder is open.
- **Move a note:** open it, then tap the folder button in its top bar.
- **Rename / delete:** select the folder; the options appear just under the tabs. Deleting a folder never deletes notes: they move to **No folder**.

**Already set up before folders existed?** Run `supabase/add-folders.sql` once in the SQL Editor. Until then, the app works as before, just without folders.

---

## On phones
The site adapts to phones and tablets. To use it like an app with its own icon:
- **iPhone/iPad (Safari):** tap **Share** → **Add to Home Screen**.
- **Android (Chrome):** tap **⋮** → **Add to Home screen** (or **Install app**).

It then opens full-screen without the browser bar. The back gesture returns to the note list.

---

## Everyday admin (SQL Editor)

| To… | Run |
|---|---|
| Change the password (people already in stay in) | `select set_group_password('new pass phrase');` |
| Kick everyone out and make them re-enter the password | `delete from public.members;` |
| Restore notes someone emptied | Open **Table Editor → notes**, then edit the row (the text history isn't kept, so export backups) |

If a friend leaves the group or the password leaks: change the password, then run the kick-out line. Everyone else just types the new password once.

## Backups
**Table Editor → notes → Export → CSV**. Doing this once a month is plenty.

---

## Try it without any setup
Open the folder with any local web server, for example:
```bash
npx serve .        # or: python3 -m http.server
```
With `js/config.js` left empty, the app runs in **demo mode**: no password, notes are saved in your browser only, and two tabs stay in sync.

---

## How the code is organised

```
index.html              page layout
css/styles.css          all styling (light + dark)
js/
  config.js             ← the only file you need to edit
  main.js               wires everything together (views, access, sync)
  state.js              in-memory list of notes; UI re-renders from it
  lib/
    utils.js            DOM, debounce, "5m ago", safe localStorage
    identity.js         your display name + a per-browser id
  store/
    index.js            picks a backend + documents the store interface
    supabaseStore.js    Supabase backend (guest sign-in, password, live updates)
    localStore.js       demo backend (this browser only)
  ui/
    list.js             sidebar list, search, notes/trash views
    editor.js           editor, autosave, live merge, read-only trash view
    dialog.js           in-page confirm / name / password dialogs
    status.js           connection dot + banners
supabase/schema.sql     tables, password check, permissions, trash, live updates
.github/workflows/
  keep-alive.yml        pings Supabase every 3 days
```

**Swapping the backend:** every store has the same functions (`ensureAccess`, `unlock`, `list`, `subscribe`, `create`, `update`, `cleanupTrash`), described at the top of `js/store/index.js`. To use Firebase, PocketBase or your own server instead, add a new file there that returns the same shape and point `createStore()` at it. The UI doesn't change.

**Adding a feature** usually touches one UI module, plus a column in `schema.sql` if it needs new data. For example, tags would mean a `tags text[]` column, chips in `ui/editor.js` and a filter in `ui/list.js`.

## Good to know
- **Two people typing in the same note at the same second:** the last save wins, and the app warns you when someone else is editing the note you have open.
- **Free plan space:** 500 MB of database is millions of words.
