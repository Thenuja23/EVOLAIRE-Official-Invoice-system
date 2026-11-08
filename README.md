# EVOLAIRE Invoice Management System

A responsive owner-only invoice and customer management app for EVOLAIRE. It uses React, TypeScript, Vite, Tailwind CSS, Supabase, TanStack Query, and A4 PDF/print output.

## Requirements

- Node.js 20 or later and npm
- A Supabase project
- The Supabase CLI only if you want to generate database types or apply migrations from the terminal

## Supabase setup

1. Create a project in the [Supabase Dashboard](https://supabase.com/dashboard). Keep the database password and API keys private.
2. Apply [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql):
   - For a new project, open **SQL Editor**, create a query, paste the complete migration, and run it.
   - Alternatively, link this repository to the Supabase CLI and run `supabase db push`.
3. In **Authentication → Users**, create the owner's user with email and password. The migration creates that user's settings row automatically.
4. After creating the owner account, open **Authentication → Settings / Providers → Email** and disable public email sign-ups. Do not add a public registration page.
5. In **Project Settings → API**, copy the project URL and the `anon`/publishable key. Never put the service-role key in the browser or in `.env.local`.

The migration creates the schema, constraints, RPC functions, summary and aggregate queries, RLS policies, and the private `logos` Storage bucket. It can be run in the Supabase SQL Editor without installing the CLI.

## Configure and run locally

```sh
npm install
cp .env.example .env.local
```

Set the project values in `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Then start and build the app:

```sh
npm run dev
npm run build
```

Open the local URL printed by Vite and sign in with the owner account. The application cannot access the database until the migration is applied and both environment values are set.

## Database types

The checked-in `src/types/database.ts` contains the generated schema types used by the app. Regenerate it after schema changes with the Supabase CLI:

```sh
supabase gen types typescript --project-id YOUR_PROJECT_REF --schema public > src/types/database.ts
```

Alternatively, set `SUPABASE_PROJECT_ID` in your shell and run `npm run gen:types`. The generated file contains schema information, not credentials.

## Deploy

Build the project with `npm run build`; Vite writes the static app to `dist/`. Deploy that directory to Vercel or Netlify and configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as build environment variables. The included [`vercel.json`](./vercel.json) and [`netlify.toml`](./netlify.toml) configure SPA route fallback for those hosts.

Use the platform's standard Vite build command (`npm run build`) and output directory (`dist`). Keep the owner account provisioned in Supabase; the client deliberately has no sign-up flow.

## Included workflows

- Login-protected app with owner-scoped data and private logo uploads
- Invoice editing with database-calculated totals, draft autosave, payments, A4 preview, PDF and print
- Invoice search, filters, pagination, CSV/Excel export, trash, restore, and permanent deletion
- Customers, dashboard aggregates, settings, sample invoice, and JSON backup/restore
- Dark mode for the app interface; invoice output remains white

Logo image files are stored separately in Supabase Storage and are not embedded in JSON backups.
