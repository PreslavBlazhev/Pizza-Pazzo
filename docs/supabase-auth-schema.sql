-- ═══════════════════════════════════════════════════════════════════════════
-- Pizza Pazzo — Auth схема: profiles, user_roles, user_addresses
-- ═══════════════════════════════════════════════════════════════════════════
--
-- КАК СЕ ПУСКА:
--   1. Supabase Dashboard → твоят проект → SQL Editor → New query
--   2. Копирай ЦЕЛИЯ файл и натисни Run
--   3. Скриптът е идемпотентен (може да се пуска повторно без грешки)
--
-- КАКВО ПРАВИ:
--   - създава 3 таблици: profiles, user_roles, user_addresses
--   - включва Row Level Security (RLS) на всяка от тях
--   - създава helper функции за роли (is_admin, is_super_admin, ...)
--   - създава trigger, който автоматично прави profile + роля 'customer'
--     при всяка нова регистрация в auth.users
--
-- РОЛИ:
--   customer     — обикновен клиент (по подразбиране при регистрация)
--   staff        — служител: вижда и обработва поръчки
--   admin        — администратор: меню, продукти, потребители
--   super_admin  — главен администратор: може да прави други админи
--
-- ВАЖНО: няма реални ключове/пароли в този файл. Първият super_admin се прави
-- ръчно — виж последната секция „СТЪПКА СЛЕД ИНСТАЛАЦИЯ“.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 0. Разширения
-- ───────────────────────────────────────────────────────────────────────────
-- gen_random_uuid() идва от pgcrypto. В новите Supabase проекти вече е налично,
-- но го подсигуряваме.
create extension if not exists pgcrypto;


-- ───────────────────────────────────────────────────────────────────────────
-- 1. Таблица: profiles
-- ───────────────────────────────────────────────────────────────────────────
-- Профилни данни на потребителя. auth.users е системна таблица на Supabase и
-- не се пипа директно — всичко наше живее тук, свързано 1:1 по id.
create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  full_name           text not null,
  email               text not null,
  phone               text,
  avatar_url          text,
  -- FK-то към user_addresses се добавя по-долу, след като таблицата съществува.
  default_address_id  uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.profiles is 'Профилни данни на потребител, 1:1 с auth.users';


-- ───────────────────────────────────────────────────────────────────────────
-- 2. Таблица: user_roles
-- ───────────────────────────────────────────────────────────────────────────
-- Ролята е в отделна таблица, а НЕ в profiles. Причина: profiles може да се
-- update-ва от самия потребител (име, телефон). Ако ролята беше там, клиент
-- можеше да си пише role = 'admin'. Тук потребителят има само read достъп.
--
-- ⚠️ ЗАБЕЛЕЖКА за user_id: сочи към public.profiles(id), а НЕ директно към
-- auth.users(id). Причина: PostgREST (Supabase API) може да прави join
-- (`profiles.select("*, user_roles(role)")`) само ако между двете таблици има
-- пряк foreign key. Ако и двете сочеха към auth.users, заявката в
-- app/actions/admin-users.ts би върнала грешка:
--   "Could not find a relationship between 'profiles' and 'user_roles'".
--
-- Поведението при триене е същото, защото profiles.id сам по себе си е FK към
-- auth.users(id) on delete cascade — веригата е:
--   auth.users → profiles → user_roles
create table if not exists public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'customer',
  created_at  timestamptz not null default now(),

  -- Само една роля на потребител.
  constraint user_roles_user_id_key unique (user_id),

  -- Разрешени стойности за роля.
  constraint user_roles_role_check
    check (role in ('customer', 'staff', 'admin', 'super_admin'))
);

comment on table public.user_roles is 'Роля на потребител. Пише се само от super_admin.';

create index if not exists user_roles_user_id_idx on public.user_roles(user_id);


-- ───────────────────────────────────────────────────────────────────────────
-- 3. Таблица: user_addresses
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.user_addresses (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  -- Nullable, with no default: a label written here in one language would stay
  -- in that language for the other. An unlabelled address is rendered with the
  -- translated `profile.address.fallbackLabel` instead.
  label          text,
  full_name      text,
  phone          text,
  city           text default 'Варна',
  address_line   text not null,
  entrance       text,
  floor          text,
  apartment      text,
  delivery_note  text,
  is_default     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.user_addresses is 'Адреси за доставка на клиента';

create index if not exists user_addresses_user_id_idx on public.user_addresses(user_id);

-- Сега можем да закачим FK-то от profiles.default_address_id.
-- on delete set null: изтрит адрес не бива да чупи профила.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_default_address_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_default_address_id_fkey
      foreign key (default_address_id)
      references public.user_addresses(id)
      on delete set null;
  end if;
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 4. Helper функции за роли
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ КЛЮЧОВ МОМЕНТ: тези функции са SECURITY DEFINER.
--
-- Причина: RLS policy върху user_roles, която сама чете от user_roles, води до
-- безкрайна рекурсия ("infinite recursion detected in policy"). SECURITY
-- DEFINER функцията се изпълнява с правата на собственика и заобикаля RLS,
-- което прекъсва цикъла. `set search_path = public` е задължителен от
-- съображения за сигурност (иначе може да се подмени search_path-а).

create or replace function public.get_current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.user_roles where user_id = auth.uid() limit 1),
    'customer'
  );
$$;

comment on function public.get_current_user_role() is 'Ролята на текущия потребител (customer по подразбиране)';


create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and role in ('admin', 'super_admin')
  );
$$;

comment on function public.is_admin() is 'true за admin и super_admin';


create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and role = 'super_admin'
  );
$$;

comment on function public.is_super_admin() is 'true само за super_admin';


-- Помощна: true за staff/admin/super_admin (достъп до админ панела).
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and role in ('staff', 'admin', 'super_admin')
  );
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 5. Trigger: автоматичен профил + роля при регистрация
-- ───────────────────────────────────────────────────────────────────────────
-- Когато Supabase Auth създаде ред в auth.users, този trigger създава profile
-- и роля 'customer'. full_name/phone идват от raw_user_meta_data, което
-- попълваме при signUp() в app/actions/auth.ts (options.data).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;

  -- Ролята може да е подадена от service-role клиента при създаване на
  -- служебен профил (app/actions/admin-users.ts). Иначе — 'customer'.
  insert into public.user_roles (user_id, role)
  values (
    new.id,
    case
      when new.raw_user_meta_data ->> 'role' in ('staff', 'admin')
        then new.raw_user_meta_data ->> 'role'
      else 'customer'
    end
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- ЗАБЕЛЕЖКА за сигурност: 'super_admin' СЪЗНАТЕЛНО липсва в case-а по-горе.
-- Роля super_admin не може да се получи през регистрация или през UI-а —
-- само с ръчен SQL update (виж последната секция).

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ───────────────────────────────────────────────────────────────────────────
-- 6. Trigger: updated_at
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists user_addresses_touch_updated_at on public.user_addresses;
create trigger user_addresses_touch_updated_at
  before update on public.user_addresses
  for each row execute function public.touch_updated_at();


-- ───────────────────────────────────────────────────────────────────────────
-- 7. Trigger: само един адрес по подразбиране на потребител
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.enforce_single_default_address()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_default then
    update public.user_addresses
      set is_default = false
      where user_id = new.user_id
        and id <> new.id
        and is_default;
  end if;
  return new;
end;
$$;

drop trigger if exists user_addresses_single_default on public.user_addresses;
create trigger user_addresses_single_default
  after insert or update of is_default on public.user_addresses
  for each row execute function public.enforce_single_default_address();


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════
-- Без RLS всеки с anon key чете всичко. Включваме я навсякъде.
-- Service role клиентът (app/actions/admin-users.ts) заобикаля RLS по дизайн.

alter table public.profiles       enable row level security;
alter table public.user_roles     enable row level security;
alter table public.user_addresses enable row level security;


-- ── profiles ──────────────────────────────────────────────────────────────

drop policy if exists "Потребителят чете своя профил" on public.profiles;
create policy "Потребителят чете своя профил"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Потребителят обновява своя профил" on public.profiles;
create policy "Потребителят обновява своя профил"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Админ чете всички профили" on public.profiles;
create policy "Админ чете всички профили"
  on public.profiles for select
  using (public.is_admin());

-- Няма INSERT policy: профили се създават САМО от trigger-а handle_new_user
-- (той е security definer и заобикаля RLS). Няма DELETE policy: профилът се
-- трие каскадно при триене на auth.users.


-- ── user_roles ────────────────────────────────────────────────────────────

drop policy if exists "Потребителят чете своята роля" on public.user_roles;
create policy "Потребителят чете своята роля"
  on public.user_roles for select
  using (auth.uid() = user_id);

drop policy if exists "Админ чете всички роли" on public.user_roles;
create policy "Админ чете всички роли"
  on public.user_roles for select
  using (public.is_admin());

-- Само super_admin може да променя роли. `for all` покрива insert/update/delete.
drop policy if exists "Super admin управлява роли" on public.user_roles;
create policy "Super admin управлява роли"
  on public.user_roles for all
  using (public.is_super_admin())
  with check (public.is_super_admin());


-- ── user_addresses ────────────────────────────────────────────────────────

drop policy if exists "Потребителят чете своите адреси" on public.user_addresses;
create policy "Потребителят чете своите адреси"
  on public.user_addresses for select
  using (auth.uid() = user_id);

drop policy if exists "Потребителят създава свои адреси" on public.user_addresses;
create policy "Потребителят създава свои адреси"
  on public.user_addresses for insert
  with check (auth.uid() = user_id);

drop policy if exists "Потребителят обновява своите адреси" on public.user_addresses;
create policy "Потребителят обновява своите адреси"
  on public.user_addresses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Потребителят трие своите адреси" on public.user_addresses;
create policy "Потребителят трие своите адреси"
  on public.user_addresses for delete
  using (auth.uid() = user_id);

-- ЗАБЕЛЕЖКА: админ достъп до адреси СЪЗНАТЕЛНО липсва засега.
-- Адресът е лични данни (GDPR) и админът няма причина да го вижда, докато няма
-- поръчки. Когато дойде етапът с поръчките, се добавя policy от типа:
--
--   create policy "Админ чете адреси по поръчка"
--     on public.user_addresses for select
--     using (
--       public.is_staff()
--       and exists (
--         select 1 from public.orders o
--         where o.address_id = user_addresses.id
--       )
--     );


-- ───────────────────────────────────────────────────────────────────────────
-- 9. Права
-- ───────────────────────────────────────────────────────────────────────────
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.user_addresses to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.user_roles to authenticated;

grant execute on function public.get_current_user_role() to authenticated;
grant execute on function public.is_admin()              to authenticated;
grant execute on function public.is_super_admin()        to authenticated;
grant execute on function public.is_staff()              to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- СТЪПКА СЛЕД ИНСТАЛАЦИЯ — направи първия super_admin
-- ═══════════════════════════════════════════════════════════════════════════
--
-- super_admin НЕ може да се направи през сайта — по дизайн. Първият се прави
-- ръчно тук, веднъж:
--
--   1. Регистрирай се нормално през сайта (/auth/register) с твоя имейл.
--   2. Пусни следното, с твоя имейл:
--
--        update public.user_roles
--        set role = 'super_admin'
--        where user_id = (
--          select id from auth.users where email = 'tvoya-email@example.com'
--        );
--
--   3. Излез и влез отново, за да се презаредят правата.
--
-- Оттам нататък можеш да правиш staff/admin профили от /admin/users.
--
-- ── Полезни проверки ──────────────────────────────────────────────────────
--
--   -- кой каква роля има:
--   select p.email, p.full_name, r.role
--   from public.profiles p
--   join public.user_roles r on r.user_id = p.id
--   order by p.created_at desc;
--
--   -- RLS включена ли е:
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public'
--     and tablename in ('profiles', 'user_roles', 'user_addresses');
-- ═══════════════════════════════════════════════════════════════════════════
