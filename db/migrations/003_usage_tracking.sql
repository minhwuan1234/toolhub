CREATE TABLE usage_tracking (
  period_key text PRIMARY KEY,
  budget numeric(12,2) NOT NULL DEFAULT 5 CHECK (budget > 0),
  external_costs jsonb NOT NULL DEFAULT '{}',
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
