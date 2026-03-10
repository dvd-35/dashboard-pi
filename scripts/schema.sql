-- scripts/schema.sql
-- Schéma de la base de données Dashboard Pi
-- Exécuter : psql -U dashboard_user -d dashboard_pi -f scripts/schema.sql

-- Extension pour les UUID (optionnel)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- UTILISATEURS
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    username    VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(100) NOT NULL,  -- bcrypt hash
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login  TIMESTAMP WITH TIME ZONE
);

-- Index pour les lookups de login (performances)
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ============================================
-- SESSIONS (géré par connect-pg-simple)
-- ============================================
-- La table est créée automatiquement par connect-pg-simple
-- avec l'option createTableIfMissing: true

-- ============================================
-- NOTES
-- ============================================
CREATE TABLE IF NOT EXISTS notes (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       VARCHAR(200) NOT NULL,
    content     TEXT DEFAULT '',
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);

-- Trigger pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notes_updated_at ON notes;
CREATE TRIGGER notes_updated_at
    BEFORE UPDATE ON notes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================
-- BOOKMARKS
-- ============================================
CREATE TABLE IF NOT EXISTS bookmarks (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       VARCHAR(200) NOT NULL,
    url         TEXT NOT NULL,
    category    VARCHAR(50) DEFAULT 'Général',
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_category ON bookmarks(category);
