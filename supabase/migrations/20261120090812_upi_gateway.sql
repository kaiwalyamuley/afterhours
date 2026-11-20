-- Optional self-hosted UPI gateway (YOUPI PG). Off until the owner switches it on.
alter table public.store_settings add column if not exists upi_gateway_on boolean not null default false;
alter table public.orders add column if not exists gateway_payment_id text;
alter table public.orders add column if not exists gateway_state text not null default '';

-- One row per webhook delivery, so a retried delivery is applied only once.
create table if not exists private.gateway_deliveries (
  delivery_id text primary key,
  event text not null,
  order_id uuid,
  received_at timestamptz not null default now()
);
revoke all on private.gateway_deliveries from public, anon, authenticated;

-- Applies one signed gateway event to an order. Called only by the youpi-webhook
-- function with the service role, after it has checked the signature.
-- OBSERVED_SUCCESS fills the reference and marks the payment submitted, exactly as
-- if the customer had typed it, so the owner still verifies it. RECONCILED (a bank
-- statement line matched) marks it verified.
create or replace function public.gateway_event(
  p_delivery_id text, p_event text, p_order_id uuid, p_payment_id text, p_amount_paise bigint, p_utr text
) returns text
language plpgsql security definer set search_path to ''
as $$
declare
  v_order public.orders;
  v_utr text := regexp_replace(coalesce(p_utr, ''), '\s', '', 'g');
begin
  insert into private.gateway_deliveries (delivery_id, event, order_id) values (p_delivery_id, p_event, p_order_id)
  on conflict (delivery_id) do nothing;
  if not found then return 'duplicate'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then return 'unknown order'; end if;
  if p_amount_paise <> v_order.amount_due_now::bigint * 100 then
    update public.orders set gateway_state = 'AMOUNT_MISMATCH', updated_at = now() where id = p_order_id;
    return 'amount mismatch';
  end if;

  update public.orders set gateway_payment_id = p_payment_id, gateway_state = p_event, updated_at = now() where id = p_order_id;

  if p_event = 'OBSERVED_SUCCESS' and v_utr ~ '^[0-9]{12}$' and v_order.status = 'pending' and v_order.payment_status in ('awaiting', 'failed') then
    begin
      update public.orders set upi_ref = v_utr, payment_status = 'submitted', payment_submitted_at = now() where id = p_order_id;
    exception when unique_violation then
      update public.orders set gateway_state = 'DUPLICATE_UTR' where id = p_order_id;
      return 'duplicate utr';
    end;
  elsif p_event = 'RECONCILED' and v_utr ~ '^[0-9]{12}$' and v_order.payment_status in ('awaiting', 'failed', 'submitted') then
    begin
      update public.orders set upi_ref = v_utr, payment_status = 'verified',
        payment_submitted_at = coalesce(payment_submitted_at, now()), payment_verified_at = now() where id = p_order_id;
    exception when unique_violation then
      update public.orders set gateway_state = 'DUPLICATE_UTR' where id = p_order_id;
      return 'duplicate utr';
    end;
  end if;
  return 'ok';
end $$;
revoke all on function public.gateway_event(text, text, uuid, text, bigint, text) from public, anon, authenticated;
grant execute on function public.gateway_event(text, text, uuid, text, bigint, text) to service_role;
