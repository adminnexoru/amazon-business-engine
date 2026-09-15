<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Amazon Business Engine

Autonomous Amazon Business Engine: a system of agents that scouts, evaluates, and
tracks decisions about candidate products to sell on Amazon, with a human in the
loop for final BUY/TEST/REJECT calls.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS v4
- Supabase (Postgres + Auth + Data API) via `@supabase/supabase-js`
- Package manager: pnpm
- Production domain: **abe.nexoru.ai**, deployed via Vercel (project `amazon-business-engine`)

## Database schema

Managed with the Supabase CLI under `supabase/migrations/`. Current tables (all in
`public`, all with Row Level Security enabled):

- **`product_candidates`** — product opportunities found by the Scout agent.
  `id`, `created_at`, `source`, `title`, `asin`, `category`, `estimated_price`,
  `estimated_demand`, `estimated_competition`, `estimated_margin_pct`, `raw_data`
  (jsonb), `status` (default `'pending'`).
- **`agent_runs`** — execution history for every agent run.
  `id`, `created_at`, `agent_name`, `status` (default `'running'`), `input` (jsonb),
  `output` (jsonb), `error_message`, `duration_ms`.
- **`decisions`** — human decisions tied to a candidate (BUY/TEST/REJECT, inventory
  approvals, etc.). `id`, `created_at`, `product_candidate_id` (FK →
  `product_candidates.id`), `decision_type`, `decision`, `notes`, `decided_by`.

`product_candidates` currently has a temporary public-read policy plus an `anon`
`SELECT` grant for Phase 0 testing — tighten before shipping real data.

## Migrations convention

Use the Supabase CLI, never hand-edit the remote schema:

```bash
supabase migration new <descriptive_name>   # creates supabase/migrations/<timestamp>_<name>.sql
supabase db push                            # applies pending migrations to the linked project
```

Migration files are timestamp-prefixed and immutable once pushed — to change a table,
add a new migration rather than editing an existing one. Keep each migration focused
(schema change, policy change, and grants can be separate files, as in the initial
3 migrations).
