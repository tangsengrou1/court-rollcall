CREATE TABLE members(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,role TEXT NOT NULL CHECK(role IN ('管理员','教练','队员')),salt TEXT,password_hash TEXT,auth_version INTEGER NOT NULL DEFAULT 0,invite_hash TEXT UNIQUE,invite_expires INTEGER,enabled INTEGER NOT NULL DEFAULT 1);
CREATE TABLE sessions(hash TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id),auth_version INTEGER NOT NULL,expires INTEGER NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expires);
CREATE TABLE team_state(id TEXT PRIMARY KEY,data TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,action TEXT NOT NULL,detail TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
CREATE INDEX rate_expiry ON rate_limits(expires);
