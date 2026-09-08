CREATE TABLE departments (name text PRIMARY KEY);
INSERT INTO departments(name) VALUES ('Account'),('Business Development'),('Production'),('Project Management'),('HR'),('Andy Tran'),('Marketing');
ALTER TABLE users ADD CONSTRAINT users_department_fk FOREIGN KEY (department) REFERENCES departments(name);
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user','admin'));
CREATE UNIQUE INDEX users_email_case_insensitive ON users(lower(email));
CREATE TABLE auth_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_events_user_time ON auth_events(user_id,created_at DESC);
CREATE FUNCTION log_auth_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    INSERT INTO auth_events(user_id,event) VALUES (NEW.id,'registered');
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO auth_events(user_id,event) VALUES (NEW.user_id,'session_created');
    RETURN NEW;
  ELSE
    INSERT INTO auth_events(user_id,event) VALUES (OLD.user_id,'session_ended');
    RETURN OLD;
  END IF;
END;
$$;
CREATE TRIGGER users_audit AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION log_auth_event();
CREATE TRIGGER sessions_audit AFTER INSERT OR DELETE ON sessions FOR EACH ROW EXECUTE FUNCTION log_auth_event();
