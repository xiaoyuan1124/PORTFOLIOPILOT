# PortfolioPilot Cloud Sync

PortfolioPilot remains local-first. Cloud sync is an optional second layer.

## Why manual sync first

The first cloud release deliberately uses two explicit actions:

- Upload this device to cloud
- Load cloud onto this device

This prevents silent conflict resolution from overwriting a user's investment records while the data model is still evolving.

## Supabase boundary

Only a **dedicated PortfolioPilot Supabase project** may be used.

Never reuse another app's:

- project
- database
- environment variables
- service-role / secret key

Browser-safe variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Never expose a secret or service-role key to the browser.

## Data model

User-private tables:

- `profiles`
- `portfolio_preferences`
- `holdings`
- `journal_entries`

Every table has Row Level Security enabled. Authenticated users can only access rows owned by their own `auth.uid()`.

The RPC `replace_portfolio_state` is used so a full manual upload is applied inside one database transaction.

## Applying the migration

Apply:

`supabase/migrations/202609270001_initial_user_sync.sql`

Then run Supabase security advisors and fix any RLS or function warnings before treating cloud sync as production-ready.

## Deployment

GitHub Pages/Vercel must receive the two public environment variables at build time. GitHub Pages does not provide secret runtime injection to a static export, so only the publishable key belongs in the frontend bundle.
