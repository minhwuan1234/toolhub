CREATE TABLE designer_graphs (
  id text PRIMARY KEY,
  document jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE designer_graph_outputs (
  node_id text PRIMARY KEY,
  content text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
