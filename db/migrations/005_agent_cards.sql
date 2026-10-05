create table "agent_cards" (
  "id" text primary key,
  "name" text not null,
  "role" text not null,
  "mission" text not null,
  "responsibilities" text not null,
  "inputs" text not null,
  "outputs" text not null,
  "collaboration" text not null,
  "use_design_guidelines" boolean not null default false,
  "x" double precision not null,
  "y" double precision not null,
  "updated_at" timestamptz not null default now()
);
