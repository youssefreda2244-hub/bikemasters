-- Run after supabase-setup.sql to enable on-site Cash on Delivery orders.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(), customer_name text not null, phone text not null,
  address text not null, city text not null, payment_method text not null default 'cash_on_delivery',
  status text not null default 'new' check (status in ('new','confirmed','preparing','shipped','delivered','cancelled')),
  total numeric not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.order_items (
  id bigint generated always as identity primary key, order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null, product_name text not null,
  unit_price numeric not null, quantity integer not null check (quantity > 0)
);
alter table public.orders enable row level security; alter table public.order_items enable row level security;
drop policy if exists "Admins manage orders" on public.orders;
drop policy if exists "Admins manage order items" on public.order_items;
create policy "Admins manage orders" on public.orders for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage order items" on public.order_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, update on public.orders to authenticated;
grant select on public.order_items to authenticated;
create or replace function public.place_order(order_data jsonb, items jsonb)
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_order uuid; item jsonb; product_row products; total_value numeric := 0;
begin
  if jsonb_array_length(items) = 0 then raise exception 'Cart is empty'; end if;
  for item in select * from jsonb_array_elements(items) loop
    select * into product_row from products where id = (item->>'id')::uuid for update;
    if product_row.id is null or product_row.status <> 'available' or product_row.quantity < (item->>'quantity')::integer then raise exception 'A product is out of stock'; end if;
    total_value := total_value + product_row.price * (item->>'quantity')::integer;
  end loop;
  insert into orders(customer_name, phone, address, city, payment_method, total) values (order_data->>'name', order_data->>'phone', order_data->>'address', order_data->>'city', 'cash_on_delivery', total_value) returning id into new_order;
  for item in select * from jsonb_array_elements(items) loop
    select * into product_row from products where id = (item->>'id')::uuid;
    insert into order_items(order_id, product_id, product_name, unit_price, quantity) values (new_order, product_row.id, product_row.name, product_row.price, (item->>'quantity')::integer);
    update products set quantity = quantity - (item->>'quantity')::integer, status = case when quantity - (item->>'quantity')::integer <= 0 then 'sold_out' else status end where id = product_row.id;
  end loop;
  return new_order;
end; $$;
grant execute on function public.place_order(jsonb, jsonb) to anon, authenticated;
