-- Run in the Supabase SQL editor (or psql) for your project.
create extension if not exists "pgcrypto";

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled course',
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_session_idx on messages(session_id, created_at);

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references sessions(id) on delete cascade,
  plan jsonb not null,
  updated_at timestamptz not null default now()
);
