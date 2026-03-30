CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE subjects (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title       TEXT NOT NULL,
    description TEXT,
    deadline    TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE submissions (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject_id        UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    student_firstname TEXT NOT NULL,
    student_lastname  TEXT NOT NULL,
    repo_url          TEXT NOT NULL,
    commit_hash       TEXT NOT NULL,
    submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
