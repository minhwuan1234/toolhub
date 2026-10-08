CREATE TABLE agent_api_spend (
  id integer PRIMARY KEY CHECK (id = 1),
  spent_micro_usd bigint NOT NULL DEFAULT 0 CHECK (spent_micro_usd >= 0),
  reserved_micro_usd bigint NOT NULL DEFAULT 0 CHECK (reserved_micro_usd >= 0)
);

INSERT INTO agent_api_spend (id) VALUES (1);

CREATE TABLE agent_api_spend_reservations (
  id uuid PRIMARY KEY,
  reserved_micro_usd bigint NOT NULL CHECK (reserved_micro_usd > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
