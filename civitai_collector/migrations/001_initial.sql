-- 001_initial.sql: Initial database schema for Civitai image collector

-- Drop tables if they exist (for fresh setup)
-- DROP TABLE IF EXISTS images, model_versions, crawl_state CASCADE;

-- crawl_state table - resumability state
CREATE TABLE IF NOT EXISTS crawl_state (
    id INTEGER PRIMARY KEY,
    cursor TEXT,
    images_seen BIGINT DEFAULT 0,
    images_saved BIGINT DEFAULT 0,
    images_downloaded BIGINT DEFAULT 0,
    images_failed BIGINT DEFAULT 0,
    last_civitai_id BIGINT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO crawl_state (id)
VALUES (1)
ON CONFLICT DO NOTHING;

-- model_versions table - model/resource resolution
CREATE TABLE IF NOT EXISTS model_versions (
    model_version_id BIGINT PRIMARY KEY,
    model_id BIGINT,
    name TEXT,
    base_model TEXT,
    creator_username TEXT,
    trained_words JSONB,
    metadata JSONB,
    fetched_at TIMESTAMPTZ DEFAULT NOW()
);

-- images table - primary record for every Civitai image
CREATE TABLE IF NOT EXISTS images (
    id BIGSERIAL PRIMARY KEY,
    civitai_id BIGINT UNIQUE NOT NULL,
    post_id BIGINT,
    creator_id BIGINT,
    creator_username TEXT,
    source_url TEXT NOT NULL,
    local_path TEXT,
    width INTEGER,
    height INTEGER,
    nsfw_level TEXT,
    type TEXT,
    blurhash TEXT,
    prompt TEXT,
    negative_prompt TEXT,
    model_name TEXT,
    model_version_id BIGINT,
    sampler TEXT,
    steps INTEGER,
    cfg_scale DOUBLE PRECISION,
    seed BIGINT,
    created_at TIMESTAMPTZ,
    sha256 CHAR(64) UNIQUE,
    metadata JSONB,
    downloaded BOOLEAN DEFAULT FALSE,
    download_error TEXT,
    discovered_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_images_post_id ON images(post_id);
CREATE INDEX IF NOT EXISTS idx_images_model_version ON images(model_version_id);
CREATE INDEX IF NOT EXISTS idx_images_creator ON images(creator_username);
CREATE INDEX IF NOT EXISTS idx_images_sha256 ON images(sha256);
CREATE INDEX IF NOT EXISTS idx_images_metadata ON images USING GIN(metadata);

-- Grant permissions for the aw user
GRANT ALL ON ALL TABLES IN SCHEMA public TO aw;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO aw;
GRANT USAGE, SELECT ON SEQUENCE images_id_seq TO aw;

COMMENT ON TABLE images IS 'Primary record for every Civitai image collected';
COMMENT ON TABLE model_versions IS 'Model/resource resolution from Civitai civitaiResources';
COMMENT ON TABLE crawl_state IS 'Resumability state for collection progress';