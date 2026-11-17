-- SAN KUAFÖR FRANCHISE FINANS - Supabase SQL
-- Bu dosyayı Supabase Dashboard > SQL Editor bölümünde bir kez çalıştırın.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'viewer' check (role in ('admin','finance','viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null default '',
  contact_name text not null default '',
  phone text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.monthly_entries (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  period text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  turnover numeric(14,2) not null default 0 check (turnover >= 0),
  dues numeric(14,2) not null default 0,
  adjustment numeric(14,2) not null default 0,
  note text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique(branch_id, period)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  amount numeric(14,2) not null check (amount > 0),
  method text not null check (method in ('cash','bank')),
  payment_date date not null,
  reference text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.instruments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  kind text not null check (kind in ('check','note')),
  amount numeric(14,2) not null check (amount > 0),
  received_date date not null,
  due_date date not null,
  bank text not null default '',
  drawer text not null default '',
  instrument_no text not null default '',
  note text not null default '',
  status text not null default 'portfolio' check (status in ('portfolio','endorsed','collected','dishonored','cancelled')),
  collected_date date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text not null,
  operation text not null,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);

-- Create profile row automatically for newly registered auth users.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Audit trail for financial records. Changes are append-only from the client side.
create or replace function public.write_audit_log()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  rid text;
begin
  if TG_OP = 'DELETE' then rid := old.id::text;
  else rid := new.id::text; end if;
  insert into public.audit_logs(table_name, record_id, operation, changed_by, old_data, new_data)
  values (TG_TABLE_NAME, rid, TG_OP, auth.uid(),
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(new) else null end);
  if TG_OP = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists audit_branches on public.branches;
create trigger audit_branches after insert or update or delete on public.branches for each row execute procedure public.write_audit_log();
drop trigger if exists audit_monthly_entries on public.monthly_entries;
create trigger audit_monthly_entries after insert or update or delete on public.monthly_entries for each row execute procedure public.write_audit_log();
drop trigger if exists audit_payments on public.payments;
create trigger audit_payments after insert or update or delete on public.payments for each row execute procedure public.write_audit_log();
drop trigger if exists audit_instruments on public.instruments;
create trigger audit_instruments after insert or update or delete on public.instruments for each row execute procedure public.write_audit_log();

-- updated_by / updated_at fields
create or replace function public.touch_updated_fields()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;
drop trigger if exists touch_monthly_entries on public.monthly_entries;
create trigger touch_monthly_entries before update on public.monthly_entries for each row execute procedure public.touch_updated_fields();
drop trigger if exists touch_instruments on public.instruments;
create trigger touch_instruments before update on public.instruments for each row execute procedure public.touch_updated_fields();

create or replace function public.current_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;
create or replace function public.can_write()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.current_role() in ('admin','finance'), false) $$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.current_role() = 'admin', false) $$;

alter table public.profiles enable row level security;
alter table public.branches enable row level security;
alter table public.monthly_entries enable row level security;
alter table public.payments enable row level security;
alter table public.instruments enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles: users can see their own profile; admin can see/manage all profiles.
drop policy if exists "profile read" on public.profiles;
create policy "profile read" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());
drop policy if exists "admin profile update" on public.profiles;
create policy "admin profile update" on public.profiles for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- All signed-in users can read operational data; finance/admin can write.
do $$
declare t text;
begin
  foreach t in array array['branches','monthly_entries','payments','instruments'] loop
    execute format('drop policy if exists "read %1$s" on public.%1$I',t);
    execute format('create policy "read %1$s" on public.%1$I for select to authenticated using (true)',t);
    execute format('drop policy if exists "write %1$s" on public.%1$I',t);
    execute format('create policy "write %1$s" on public.%1$I for insert to authenticated with check (public.can_write())',t);
    execute format('drop policy if exists "update %1$s" on public.%1$I',t);
    execute format('create policy "update %1$s" on public.%1$I for update to authenticated using (public.can_write()) with check (public.can_write())',t);
    execute format('drop policy if exists "delete %1$s" on public.%1$I',t);
    execute format('create policy "delete %1$s" on public.%1$I for delete to authenticated using (public.is_admin())',t);
  end loop;
end $$;

drop policy if exists "audit read admin" on public.audit_logs;
create policy "audit read admin" on public.audit_logs for select to authenticated using (public.is_admin());
-- No client insert/update/delete policy for audit_logs.

-- Bootstrap instructions:
-- 1) Create the first user in Authentication > Users (invite/create user).
-- 2) Find that user's UUID, then run:
-- update public.profiles set full_name='Sistem Yöneticisi', role='admin' where id='USER-UUID';
-- 3) Create up to four more users in Authentication > Users.
-- 4) Set each profile role to 'finance' or 'viewer' using the SQL below:
-- update public.profiles set full_name='Muhasebe Kullanıcısı', role='finance' where id='USER-UUID';
