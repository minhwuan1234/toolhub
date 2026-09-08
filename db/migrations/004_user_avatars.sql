CREATE TABLE user_avatars (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  image_data bytea NOT NULL CHECK (octet_length(image_data) <= 524288),
  updated_at timestamptz NOT NULL DEFAULT now()
);
