# Flo Golf Draft

Player ratings and a weekly draft board. Everyone in the pool rates everyone
else out of 100 across five categories, an admin controls how much each
category counts toward the overall score, and the weekly draft runs either as
a throwaway mock or as a live draft where captains pick from their own phones.

Built with Next.js 16, Supabase (Postgres, auth, storage, realtime), and
Tailwind v4.

---

## Setup

You need to do steps 1 through 4. They involve accounts and credentials, so
they are yours to run. Everything after that is a single command.

### 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) and create a project. The free
   tier is plenty for a golf league.
2. Pick a region near you and save the database password somewhere safe.
3. Wait for it to finish provisioning, roughly two minutes.

### 2. Run the migration

1. In the Supabase dashboard open **SQL Editor** and click **New query**.
2. Paste the entire contents of
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
3. Click **Run**.

That creates every table, the row level security policies, the draft turn
logic, the photo storage bucket, and seeds the five categories with their
starting weights.

> Supabase's linter will flag the two aggregate views as `SECURITY DEFINER`.
> That is deliberate and the file explains why: it is what lets everyone see
> average scores while the raw ratings underneath stay private.

### 3. Set up Google sign in

**In Google Cloud Console** ([console.cloud.google.com](https://console.cloud.google.com)):

1. Create a project, or reuse one.
2. Go to **APIs & Services → OAuth consent screen**. Choose **External**,
   fill in an app name and your email, and save. You can leave it in Testing
   mode and add your golf group as test users, or publish it.
3. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
4. Application type: **Web application**.
5. Under **Authorized redirect URIs** add exactly this, with your own project
   reference:

   ```
   https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
   ```

   Your project ref is in the Supabase dashboard under **Project Settings → General**.
6. Create it, then copy the **Client ID** and **Client secret**.

**In Supabase**:

1. Go to **Authentication → Sign In / Providers → Google**.
2. Enable it, paste the Client ID and Client secret, and save.
3. Go to **Authentication → URL Configuration** and set:
   - **Site URL**: `http://localhost:3000` for now, your Vercel URL later.
   - **Redirect URLs**: add `http://localhost:3000/**`

### 4. Add your environment variables

```bash
cp .env.local.example .env.local
```

Fill in both values from **Project Settings → API** in Supabase:

- `NEXT_PUBLIC_SUPABASE_URL` is the Project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the anon public key.

Both are safe in the browser. Row level security is what protects the data, so
there is no service role key anywhere in this app.

### 5. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with Google.

**The first person to sign in automatically becomes the admin.** Make that
you. If someone else beats you to it, run this in the Supabase SQL editor:

```sql
update public.profiles set is_admin = true where email = 'you@example.com';
```

---

## First run checklist

1. **Admin → Golfers**: add everyone in the pool. Photos are optional and can
   be added later; cards fall back to initials.
2. **Admin → People**: as your friends sign in they appear here. Link each
   login to their golfer card. This is what blocks self rating and lets
   captains make their own picks in a live draft.
3. **Admin → Weights**: adjust if you disagree with the defaults
   (Distance 25, Putting 25, Short Game 20, Accuracy 20, Clutch 10).
4. **Rankings**: everyone rates everyone. This is the slow part, so start it
   before you need the draft.
5. **Drafts**: create one, pick captains, confirm who is playing this week,
   run a mock, then start it live.

---

## How scoring works

Raw submissions are never modified. Each golfer's category score is the
average of every submission for that category, and the overall is a weighted
average of those category scores, normalized so the weights do not have to add
up to 100.

Two consequences worth knowing:

- **Changing a weight reshuffles the board instantly.** Nothing is recomputed
  and stored, so you can tune weights and watch the rankings move.
- **Categories nobody has rated are skipped, not counted as zero.** A golfer
  rated only on Putting shows their Putting average rather than a number
  dragged toward zero by four blanks.

## How the Balanced draft works

For each pick, the engine looks at the best score the team already holds in
each category. Max, not average, because a scramble plays the best ball, so
what matters is whether *anyone* on the team can hit the shot.

Each available golfer is then scored on how much they would raise that best
ball, weighted by the admin's category weights. A team that already has a 95
Distance player gains nothing from a 92 Distance player, so that pick collapses
and the choice swings to whoever is strongest in a category the team still
lacks.

Because it reads the same weights as the rankings, tuning weights tunes the
draft too.

You can watch the difference yourself:

```bash
npx tsx scripts/verify-draft.ts
```

That runs both strategies against a deliberately lopsided pool and prints the
resulting rosters.

---

## Security model

Everything is enforced in Postgres, not in the browser:

- **One rating per person per golfer** is a unique constraint, not a check in
  the UI. Ratings can be updated by their author and by nobody else.
- **Self rating** is blocked by a database trigger.
- **Raw ratings** are readable only by their author and by admins. Everyone
  else sees aggregates only.
- **Draft picks** have no insert policy at all. Every pick goes through the
  `make_pick()` function, which verifies the draft is running, that it really
  is your turn under snake order, and that the golfer is available. Picking
  out of turn from the browser console does not work.
- **Admin promotion** is guarded by a trigger, so nobody promotes themselves.

`proxy.ts` redirects signed out visitors, but the Next.js docs are explicit
that proxy is an optimistic check rather than an authorization layer, so every
page independently calls `requireUser()` or `requireAdmin()`.

---

## Deploying to Vercel

```bash
npx vercel
```

Then:

1. Add both environment variables in the Vercel project settings.
2. In Supabase, update **Authentication → URL Configuration**: set Site URL to
   your Vercel URL and add `https://your-app.vercel.app/**` to Redirect URLs.
3. Redeploy.

Google OAuth needs no change, since it points at Supabase rather than at your
app.

---

## Notes

- Node 22 or later is recommended. The Supabase client prints a deprecation
  warning on Node 20. Everything still works, and Vercel runs a newer Node.
- There is no pick timer. An admin can pick on behalf of any captain and can
  undo the last pick, which covers the case of someone going quiet.
- Mock drafts are never saved. Live drafts save every pick with its round and
  pick number, so you build a season record.
