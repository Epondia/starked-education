-- UP
-- Application user accounts (auth routes). Columns align with what
-- migration 002_add_user_roles.js expects (role, created_at, updated_at)
-- and with the fields the auth routes persist (username, email, password).
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'student',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- @undo
DROP TABLE IF EXISTS users;
