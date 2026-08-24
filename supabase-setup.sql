-- Run once in Supabase SQL Editor. It protects product edits with Row Level Security.
create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null default 0,
  image_url text not null,
  gallery_urls jsonb not null default '[]'::jsonb,
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
alter table public.products add column if not exists gallery_urls jsonb not null default '[]'::jsonb;
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
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admins where user_id = auth.uid()); $$;

grant execute on function public.is_admin() to anon, authenticated;
alter table public.products enable row level security;
alter table public.admins enable row level security;

drop policy if exists "Anyone can view products" on public.products;
drop policy if exists "Admins manage products" on public.products;
drop policy if exists "Admins can see themselves" on public.admins;

create policy "Anyone can view products" on public.products for select using (true);
create policy "Admins manage products" on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins can see themselves" on public.admins for select to authenticated using (user_id = auth.uid());
