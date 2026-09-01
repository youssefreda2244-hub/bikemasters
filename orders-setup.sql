-- Run this complete file in Supabase SQL Editor after supabase-setup.sql.
-- It enables Cash on Delivery orders and enforces policy acceptance server-side.

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(), customer_name text not null, phone text not null,
  address text not null, city text not null, payment_method text not null default 'cash_on_delivery',
  policy_accepted boolean not null default false, policy_accepted_at timestamptz,
  status text not null default 'new' check (status in ('new','confirmed','preparing','shipped','delivered','cancelled')),
  total numeric not null default 0 check (total >= 0), created_at timestamptz not null default now()
);
alter table public.orders add column if not exists policy_accepted boolean not null default false;
alter table public.orders add column if not exists policy_accepted_at timestamptz;
alter table public.orders drop constraint if exists orders_total_check;
alter table public.orders add constraint orders_total_check check (total >= 0);

create table if not exists public.order_items (
  id bigint generated always as identity primary key, order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null, product_name text not null,
  unit_price numeric not null check (unit_price >= 0), quantity integer not null check (quantity > 0)
);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
drop policy if exists "Admins manage orders" on public.orders;
drop policy if exists "Admins manage order items" on public.order_items;
create policy "Admins manage orders" on public.orders for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage order items" on public.order_items for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Visitors cannot access order tables directly. The controlled function below is the only checkout entry point.
revoke all on table public.orders, public.order_items from anon, authenticated;
grant select, update on public.orders to authenticated;
grant select on public.order_items to authenticated;

create or replace function public.place_order(order_data jsonb, items jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  new_order uuid; item jsonb; product_row public.products; product_id uuid; requested_quantity integer;
  total_value numeric := 0; seen_product_ids uuid[] := array[]::uuid[];
  customer_name_value text := btrim(coalesce(order_data->>'name', ''));
  phone_value text := btrim(coalesce(order_data->>'phone', ''));
  address_value text := btrim(coalesce(order_data->>'address', ''));
  city_value text := btrim(coalesce(order_data->>'city', ''));
begin
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 or jsonb_array_length(items) > 20 then raise exception 'Invalid cart'; end if;
  if coalesce((order_data->>'policyAccepted')::boolean, false) is not true then raise exception 'You must accept the store policies before placing an order'; end if;
  if char_length(customer_name_value) < 2 or char_length(customer_name_value) > 120
    or char_length(phone_value) < 6 or char_length(phone_value) > 30
    or char_length(address_value) < 5 or char_length(address_value) > 300
    or char_length(city_value) < 2 or char_length(city_value) > 100 then raise exception 'Please provide valid delivery details'; end if;

  for item in select * from jsonb_array_elements(items) loop
    product_id := (item->>'id')::uuid; requested_quantity := (item->>'quantity')::integer;
    if requested_quantity is null or requested_quantity < 1 or requested_quantity > 10 then raise exception 'Invalid item quantity'; end if;
    if product_id = any(seen_product_ids) then raise exception 'Duplicate products are not allowed'; end if;
    seen_product_ids := array_append(seen_product_ids, product_id);
    select * into product_row from public.products where id = product_id for update;
    if product_row.id is null or product_row.status <> 'available' or product_row.quantity < requested_quantity then raise exception 'A product is out of stock'; end if;
    total_value := total_value + product_row.price * requested_quantity;
  end loop;

  insert into public.orders (customer_name, phone, address, city, payment_method, policy_accepted, policy_accepted_at, total)
  values (customer_name_value, phone_value, address_value, city_value, 'cash_on_delivery', true, now(), total_value)
  returning id into new_order;
  for item in select * from jsonb_array_elements(items) loop
    product_id := (item->>'id')::uuid; requested_quantity := (item->>'quantity')::integer;
    select * into product_row from public.products where id = product_id;
    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity)
      values (new_order, product_row.id, product_row.name, product_row.price, requested_quantity);
    update public.products set quantity = quantity - requested_quantity,
      status = case when quantity - requested_quantity <= 0 then 'sold_out' else status end where id = product_row.id;
  end loop;
  return new_order;
end; $$;

revoke all on function public.place_order(jsonb, jsonb) from public;
grant execute on function public.place_order(jsonb, jsonb) to anon, authenticated;
