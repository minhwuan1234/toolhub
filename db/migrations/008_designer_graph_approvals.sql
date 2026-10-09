CREATE TABLE designer_graph_approvals (
  id uuid PRIMARY KEY,
  source_node_id text NOT NULL,
  approval_node_id text NOT NULL,
  source_name text NOT NULL,
  output text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  feedback text,
  feedback_consumed_at timestamptz,
  branch_targets jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE INDEX designer_graph_approvals_pending_idx ON designer_graph_approvals (created_at) WHERE status = 'pending';
CREATE INDEX designer_graph_approvals_feedback_idx ON designer_graph_approvals (source_node_id, decided_at DESC) WHERE status = 'denied' AND feedback_consumed_at IS NULL;
