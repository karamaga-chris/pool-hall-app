CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE user_role      AS ENUM ('owner', 'staff');
CREATE TYPE table_status   AS ENUM ('idle', 'active', 'reserved', 'maintenance');
CREATE TYPE session_status AS ENUM ('active', 'completed', 'cancelled');
CREATE TYPE payment_method AS ENUM ('cash', 'momo', 'card', 'waived');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'refunded');
CREATE TYPE rate_type      AS ENUM ('peak', 'off_peak');

CREATE TABLE users (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name  VARCHAR(120) NOT NULL,
  phone      VARCHAR(20)  NOT NULL UNIQUE,
  pin_hash   TEXT         NOT NULL,
  role       user_role    NOT NULL DEFAULT 'staff',
  is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE pool_tables (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_number SMALLINT     NOT NULL UNIQUE,
  label        VARCHAR(60)  NOT NULL,
  status       table_status NOT NULL DEFAULT 'idle',
  hardware_id  VARCHAR(60)  UNIQUE,
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  notes        TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Fixed price per game (peak and off-peak)
CREATE TABLE rate_rules (
  id              UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
  pool_table_id   UUID      REFERENCES pool_tables(id) ON DELETE CASCADE,
  rate_type       rate_type NOT NULL,
  price_per_game  NUMERIC(8,2) NOT NULL,
  peak_start      TIME      NOT NULL,
  peak_end        TIME      NOT NULL,
  applies_on      SMALLINT[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  is_active       BOOLEAN   NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE players (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name    VARCHAR(120) NOT NULL,
  phone        VARCHAR(20)  UNIQUE,
  photo_url    TEXT,
  total_spend  NUMERIC(12,2) NOT NULL DEFAULT 0,
  games_played INTEGER       NOT NULL DEFAULT 0,
  is_active    BOOLEAN       NOT NULL DEFAULT TRUE,
  notes        TEXT,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pool_table_id   UUID NOT NULL REFERENCES pool_tables(id),
  started_by      UUID NOT NULL REFERENCES users(id),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  rate_type       rate_type    NOT NULL,
  price_per_game  NUMERIC(8,2) NOT NULL,   -- snapshot at session start
  amount_due      NUMERIC(10,2),           -- set when session ends
  status          session_status NOT NULL DEFAULT 'active',
  expected_payer_id UUID REFERENCES players(id),  -- who staff designated to pay, if deferred
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE session_players (
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES players(id),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, player_id)
);

CREATE TABLE payments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id  UUID NOT NULL REFERENCES sessions(id),
  received_by UUID NOT NULL REFERENCES users(id),
  amount      NUMERIC(10,2) NOT NULL,
  method      payment_method NOT NULL,
  status      payment_status NOT NULL DEFAULT 'pending',
  paid_by_player_id UUID REFERENCES players(id),  -- which player settled this session
  momo_ref    VARCHAR(80),
  paid_at     TIMESTAMPTZ,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sessions_table      ON sessions(pool_table_id);
CREATE INDEX idx_sessions_status     ON sessions(status);
CREATE INDEX idx_sessions_started_at ON sessions(started_at);
CREATE INDEX idx_payments_session    ON payments(session_id);
CREATE INDEX idx_players_phone       ON players(phone);

-- Auto update timestamp
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pool_tables_updated_at
  BEFORE UPDATE ON pool_tables FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_players_updated_at
  BEFORE UPDATE ON players FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed data
INSERT INTO users (full_name, phone, pin_hash, role)
VALUES ('Owner', '+250700000000', crypt('1234', gen_salt('bf')), 'owner');

INSERT INTO pool_tables (table_number, label)
VALUES (1, 'Table 1');

-- Default prices: RWF 500 off-peak, RWF 700 peak per game
-- Change these to your actual prices
INSERT INTO rate_rules (pool_table_id, rate_type, price_per_game, peak_start, peak_end)
VALUES
  (NULL, 'off_peak', 500, '08:00', '17:00'),
  (NULL, 'peak',     700, '17:00', '23:00');