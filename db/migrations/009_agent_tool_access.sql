create table imported_tools (
  id text primary key,
  imported_at timestamptz not null default now()
);

alter table agent_cards add column tool_ids text[] not null default '{}';
