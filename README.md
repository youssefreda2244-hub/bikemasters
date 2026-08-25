# Bike Masters Website

Static website with a Supabase-powered product catalog and private admin dashboard. It is ready for GitHub Pages.

## Files

- `index.html` — page structure, live catalog, and admin dashboard
- `assets/css/styles.css` — all site styling
- `assets/js/config.js` — public Supabase connection details (publishable key only)
- `assets/js/app.js` — catalog rendering, login, and product management
- `assets/images/` — local image files
- `supabase-setup.sql` — copy this one-time database and RLS setup into Supabase SQL Editor
- `supabase-storage-setup.sql` — enables safe admin photo uploads from a computer

## One-time Supabase setup

Open **Supabase → SQL Editor → New query**, paste the complete contents of [`supabase-setup.sql`](supabase-setup.sql), and click **Run**. It creates (or completes) the exact fields the website uses and locks down editing so only users listed in `public.admins` can add, edit, or delete products. The same SQL is included below for convenience.

```sql
create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null default 0,
  image_url text not null,
  badge text,
  subtitle text,
  quantity integer not null default 0,
  status text not null default 'available' check (status in ('available', 'sold_out')),
  specs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.products add column if not exists name text;
alter table public.products add column if not exists price numeric not null default 0;
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists badge text;
alter table public.products add column if not exists subtitle text;
alter table public.products add column if not exists quantity integer not null default 0;
alter table public.products add column if not exists status text not null default 'available';
alter table public.products add column if not exists specs jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists created_at timestamptz not null default now();

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select exists (select 1 from public.admins where user_id = auth.uid()); $$;

grant execute on function public.is_admin() to anon, authenticated;

alter table public.products enable row level security;
alter table public.admins enable row level security;

drop policy if exists "Anyone can view products" on public.products;
drop policy if exists "Admins manage products" on public.products;
drop policy if exists "Admins can see themselves" on public.admins;

create policy "Anyone can view products"
on public.products for select using (true);

create policy "Admins manage products"
on public.products for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can see themselves"
on public.admins for select to authenticated
using (user_id = auth.uid());
```

The previously inserted administrator remains valid. If you need to add another administrator, sign that person up in **Authentication → Users**, then run this (replace the UUID):

```sql
insert into public.admins (user_id) values ('USER-UUID-HERE')
on conflict (user_id) do nothing;
```

Never put a `service_role` key in this project. The included `sb_publishable_...` key is intentionally the only key stored in the browser.

## Using the dashboard

1. Open the website and click **Admin** in the top-right corner.
2. Sign in with the administrator email and password from Supabase Authentication.
3. Add a product or use **Edit** / **Delete**. Choose **Road bike**, **Mountain bike**, or **Kids bike** for every product. Visitors can click the matching category card to see only that type.
4. In Supabase SQL Editor, run the complete contents of `supabase-storage-setup.sql` once. This makes a safe image bucket that only administrators can upload to.
5. Choose a main photo from your computer. You can choose multiple extra photos from your computer too. Files must be JPG, PNG, or WebP and less than 8 MB each.
6. Click a bike card to open its own page in the same browser tab. Its photos appear as selectable thumbnails.

Photo uploads are protected: everyone may view public product images, but only accounts in `public.admins` may upload them.

## Publish with GitHub Pages

1. Create a GitHub repository.
2. Upload every file and folder in this directory.
3. Open the repository **Settings** → **Pages**.
4. Select **Deploy from a branch**, choose `main`, then `/(root)`.
5. Save and wait for GitHub to show the website link.

## Updating GitHub

After the one-time SQL setup, publish these changed files with:

```powershell
git add index.html assets/css/styles.css assets/js README.md supabase-setup.sql
git commit -m "Add Supabase product admin dashboard"
git push
```
