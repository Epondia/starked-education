-- UP
-- Course catalog backing GET /api/courses. Columns map to the response
-- fields the discovery UI consumes (see the listing handler in
-- backend/src/routes/courses.js).
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    short_description TEXT,
    description TEXT,
    category VARCHAR(100),
    level VARCHAR(50),
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    duration_hours NUMERIC(5, 1) NOT NULL DEFAULT 0,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    rating NUMERIC(3, 2) NOT NULL DEFAULT 0,
    review_count INTEGER NOT NULL DEFAULT 0,
    enrollment_count INTEGER NOT NULL DEFAULT 0,
    provider VARCHAR(200),
    thumbnail TEXT NOT NULL DEFAULT '',
    tags TEXT[] NOT NULL DEFAULT '{}',
    skills TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_courses_category ON courses(category);
CREATE INDEX IF NOT EXISTS idx_courses_level ON courses(level);

-- @undo
DROP TABLE IF EXISTS courses;
