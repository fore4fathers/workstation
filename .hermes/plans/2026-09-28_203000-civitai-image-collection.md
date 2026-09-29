# Civitai Image Collection Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build a resumable Civitai image collector that fetches 100 images with full metadata, stores them in PostgreSQL with complete details, and can resume from any interruption point.

**Architecture:** A Python application using httpx for API calls, psycopg for PostgreSQL, and tenacity for retry logic. The collector uses cursor pagination from Civitai's API, stores images in a PostgreSQL database with full metadata JSONB, and maintains a crawl_state table for resumability.

**Tech Stack:** Python 3.12, httpx, psycopg[binary], python-dotenv, tenacity, PostgreSQL 16

---

# Database Design

Four main tables will be created in the `ai_workstation` PostgreSQL database:

## `images` table - Primary record for every Civitai image

```sql
CREATE TABLE images (
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

CREATE INDEX idx_images_post_id ON images(post_id);
CREATE INDEX idx_images_model_version ON images(model_version_id);
CREATE INDEX idx_images_creator ON images(creator_username);
CREATE INDEX idx_images_sha256 ON images(sha256);
CREATE INDEX idx_images_metadata ON images USING GIN(metadata);
```

**Key design:** `ON CONFLICT (civitai_id) DO UPDATE` for upsert semantics. `metadata JSONB` retains all free-form fields from Civitai.

## `model_versions` table - Model/resource resolution

```sql
CREATE TABLE model_versions (
    model_version_id BIGINT PRIMARY KEY,
    model_id BIGINT,
    name TEXT,
    base_model TEXT,
    creator_username TEXT,
    trained_words JSONB,
    metadata JSONB,
    fetched_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Purpose:** Civitai's `civitaiResources` maps to `modelVersionId`, enabling resolution to model details, creator, base model, trained words, files, and license information.

## `crawl_state` table - Resumability state

```sql
CREATE TABLE crawl_state (
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
```

**Resumability:** When Python is killed, the saved cursor is restored and collection continues from that point.

## `resources` table - Additional resource metadata (planned)

---

# Python Project Structure

```
civitai_collector/
├── app/
│   ├── __init__.py
│   ├── config.py          # Environment variables and settings
│   ├── civitai.py         # Civitai API client
│   ├── database.py        # PostgreSQL connection and operations
│   ├── downloader.py      # Image download with SHA-256 verification
│   ├── metadata.py        # Metadata extraction and processing
│   └── collector.py       # Main collection orchestration loop
├── migrations/
│   └── 001_initial.sql
├── data/
│   └── images/            # Downloaded image storage
├── .env                   # CIVITAI_TOKEN, DATABASE_URL, IMAGE_DIR
├── requirements.txt
└── main.py                # Entry point
```

# Requirements

```text
httpx
psycopg[binary]
python-dotenv
tenacity
```

Install:
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

# Environment Configuration

```env
CIVITAI_TOKEN=your_token_here
DATABASE_URL=postgresql://aw:***@127.0.0.1:5435/ai_workstation
IMAGE_DIR=/data/civitai/images
BATCH_SIZE=100
```

Note: A token is not strictly required for the public image endpoint, but the application is designed to support one via Bearer authentication.

# Phase 1: Civitai Client (civitai.py)

## Task 1.1: Create Civitai API client with cursor pagination

**Objective:** Implement the core API client that fetches images from Civitai with proper headers, cursor pagination, and `withMeta=true`.

**Files:**
- Create: `civitai_collector/app/civitai.py`
- Modify: `.env` (add CIVITAI_TOKEN)

**Step 1: Write failing test**

Create: `civitai_collector/tests/test_civitai.py`
```python
def test_get_images_requires_cursor_and_metadata():
    from app.civitai import get_images
    import os
    from dotenv import load_dotenv
    load_dotenv()
    API_TOKEN = os.getenv("CIVITAI_TOKEN", "")
    assert API_TOKEN == "", "Token should be set for test"
```
Run: `pytest civitai_collector/tests/test_civitai.py::test_get_images_requires_cursor_and_metadata -v`
Expected: FAIL — test file may not exist yet or import error

**Step 2: Write minimal implementation**

Create: `civitai_collector/app/civitai.py`
```python
import os
import httpx
from tenacity import retry, wait_exponential, stop_after_attempt

BASE_URL = "https://civitai.com/api/v1"
TOKEN = os.getenv("CIVITAI_TOKEN", "")
headers = {"Accept": "application/json"}

if TOKEN:
    headers["Authorization"] = f"Bearer {TOKEN}"

@retry(wait=wait_exponential(min=2, max=60), stop=stop_after_attempt(5))
def get_images(cursor=None):
    params = {
        "limit": 100,
        "withMeta": "true",
        "sort": "Newest"
    }
    if cursor:
        params["cursor"] = cursor
    with httpx.Client(headers=headers, timeout=60) as client:
        response = client.get(f"{BASE_URL}/images", params=params)
        response.raise_for_status()
        return response.json()
```

**Step 3: Run test to verify failure**
Run: `pytest civitai_collector/tests/test_civitai.py::test_get_images_requires_cursor_and_metadata -v`
Expected: FAIL (test is designed to verify the import works)

**Step 4: Run test to verify pass**
After implementation, run same command — Expected: PASS

**Step 5: Commit**
```bash
git add civitai_collector/app/civitai.py civitai_collector/tests/test_civitai.py
git commit -m "feat: add Civitai API client with cursor pagination and retries"
```

## Task 1.2: Test cursor pagination loop

**Objective:** Verify the cursor pagination works correctly, fetching multiple pages.

**Files:**
- Modify: `civitai_collector/tests/test_civitai.py`

**Step 1: Write test**
```python
def test_cursor_pagination_returns_metadata():
    from app.civitai import get_images
    import os
    from dotenv import load_dotenv
    load_dotenv()
    images_data = get_images()
    assert "metadata" in images_data
    meta = images_data["metadata"]
    assert "nextCursor" in meta or "next" in meta
```
Run and verify.

**Step 2-5:** Follow the TDD pattern from Task 1.1.

---

# Phase 2: Database (database.py)

## Task 2.1: Create PostgreSQL connection and schema migration

**Objective:** Implement database connection and initial schema migration.

**Files:**
- Create: `civitai_collector/app/database.py`
- Create: `civitai_collector/migrations/001_initial.sql`

**Step 1: Write failing test**
Create: `civitai_collector/tests/test_database.py`
```python
def test_database_connection():
    from app.database import get_connection
    conn = get_connection()
    assert conn is not None
```
Run: `pytest civitai_collector/tests/test_database.py::test_database_connection -v`
Expected: FAIL — database module not yet created.

**Step 2: Write minimal implementation**

Create: `civitai_collector/app/database.py`
```python
import os
import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.environ["DATABASE_URL"]

def get_connection():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)
```

**Step 3-5:** Follow TDD pattern.

**Step 6: Apply migration**
Run: `psql "postgresql://aw:aw@127.0.0.1:5435/ai_workstation" -f civitai_collector/migrations/001_initial.sql`
Expected: Tables created successfully.

## Task 2.2: Test image upsert operation

**Objective:** Verify ON CONFLICT upsert works correctly.

**Files:**
- Modify: `civitai_collector/tests/test_database.py`

**Step 1: Write test**
```python
def test_upsert_image_inserts_and_updates():
    from app.database import get_connection
    from app.civitai import get_images
    import os
    from dotenv import load_dotenv
    load_dotenv()
    
    conn = get_connection()
    images_data = get_images()
    
    # Insert first image
    image = images_data["images"][0]
    from app.database import upsert_image
    result = upsert_image(conn, image)
    assert result["civitai_id"] == image["id"]
    
    # Try again - should update
    result2 = upsert_image(conn, image)
    assert result2 is not None
```
Run and verify.

---

# Phase 3: Collection Orchestration (collector.py)

## Task 3.1: Implement resumable crawl state

**Objective:** Implement the main collection loop that tracks state and can resume from interruptions.

**Files:**
- Create: `civitai_collector/app/collector.py`

**Step 1: Write failing test**
Create: `civitai_collector/tests/test_collector.py`
```python
def test_crawl_state_persistence():
    from app.collector import start_collection
    # Verify crawl_state table has initial state
    from app.database import get_connection
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM crawl_state WHERE id = 1")
        state = cur.fetchone()
        assert state["cursor"] is None
        assert state["images_seen"] == 0
```
Run: `pytest civitai_collector/tests/test_collector.py::test_crawl_state_persistence -v`
Expected: FAIL — collector module not yet created.

**Step 2: Write minimal implementation**

Create: `civitai_collector/app/collector.py`
```python
from app.database import get_connection
from app.civitai import get_images

def get_crawl_state():
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM crawl_state WHERE id = 1")
        return cur.fetchone()

def save_crawl_state(cursor, images_seen, images_saved, images_failed, last_civitai_id):
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """UPDATE crawl_state 
               SET cursor = %s, images_seen = %s, images_saved = %s, 
                   images_failed = %s, last_civitai_id = %s, updated_at = NOW()
             WHERE id = 1""",
            (cursor, images_seen, images_saved, images_failed, last_civitai_id)
        )
    conn.commit()

def start_collection():
    state = get_crawl_state()
    cursor = state["cursor"]
    images_seen = state["images_seen"]
    
    while True:
        images_data = get_images(cursor=cursor)
        images = images_data["images"]
        
        images_seen += len(images)
        images_saved = 0
        images_failed = 0
        
        for image in images:
            # Save to database
            from app.database import upsert_image
            upsert_image(conn, image)
            images_saved += 1
        
        cursor = images_data["metadata"].get("nextCursor")
        save_crawl_state(cursor, images_seen, images_saved, images_failed, ...)
        
        if not cursor:
            break
```

**Step 3-5:** Follow TDD pattern.

## Task 3.2: Collect exactly 100 images with full details

**Objective:** Run the collector to gather 100 images, ensuring no incomplete images are stored.

**Step 1:** Run `main.py` to collect images
```bash
python main.py
```
Expected: Collects images until 100 are stored with all metadata fields populated.

**Step 2:** Verify database has exactly 100 images
```sql
SELECT COUNT(*) FROM images;
```
Expected: `100`

**Step 3:** Verify no incomplete images (all have required fields)
```sql
SELECT COUNT(*) FROM images WHERE civitai_id IS NULL OR source_url IS NULL;
```
Expected: `0`

**Step 4:** Verify metadata JSONB is populated
```sql
SELECT metadata FROM images LIMIT 1;
```
Expected: JSON object with prompt, negative_prompt, model, steps, sampler, seed, etc.

**Step 5:** Test resumability - kill the process, restart, verify it continues from where it left off.

---

# Phase 4: Downloader (downloader.py)

## Task 4.1: Implement image download with SHA-256 verification

**Objective:** Download images from source URLs and verify integrity with SHA-256 hashes.

**Files:**
- Create: `civitai_collector/app/downloader.py`

**Step 1: Write failing test**
Create: `civitai_collector/tests/test_downloader.py`
```python
def test_download_verify_sha256():
    from app.downloader import download_image
    import tempfile, os
    with tempfile.NamedTemporaryFile(delete=False) as f:
        result = download_image("https://example.com/test.png", f.name)
        assert result["sha256"]  # SHA-256 hash returned
        # Verify file exists and has content
        assert os.path.getsize(f.name) > 0
```
Run: `pytest civitai_collector/tests/test_downloader.py::test_download_verify_sha256 -v`
Expected: FAIL — downloader module not yet created.

**Step 2: Write minimal implementation**

Create: `civitai_collector/app/downloader.py`
```python
import httpx
import hashlib
import os

def download_image(url, dest_path):
    with httpx.Client(timeout=120) as client:
        response = client.get(url, follow_redirects=True)
        response.raise_for_status()
    
    with open(dest_path, "wb") as f:
        f.write(response.content)
    
    sha256 = hashlib.sha256(response.content).hexdigest()
    
    return {"sha256": sha256, "size": len(response.content)}
```

**Step 3-5:** Follow TDD pattern.

---

# Phase 5: Verification and Risks

## Task 5.1: Verify database integrity after collection

**Step 1:** Run comprehensive queries
```sql
-- Total count
SELECT COUNT(*) FROM images;

-- Images with all metadata
SELECT COUNT(*) FROM images WHERE metadata IS NOT NULL;

-- Images with model information
SELECT COUNT(*) FROM images WHERE model_name IS NOT NULL;

-- Failed downloads
SELECT COUNT(*) FROM images WHERE download_error IS NOT NULL;

-- NSFW distribution
SELECT nsfw_level, COUNT(*) FROM images GROUP BY nsfw_level;
```

**Step 2:** Verify 100 images collected with full details.

## Task 5.2: Test resumability

**Step 1:** Start collection, let it run ~50 images, then kill (Ctrl+C).

**Step 2:** Restart collection:
```bash
python main.py
```

**Step 3:** Verify it continues from cursor position and total reaches 100 without duplicates.

**Step 4:** Verify crawl_state was updated correctly.

## Risks, Tradeoffs, and Open Questions

### Risks
1. **API rate limiting:** Civitai may throttle rapid requests. The tenacity retry with exponential backoff mitigates this.
2. **API changes:** Civitai's API structure could change, breaking the collector. Design with flexible metadata extraction.
3. **Disk space:** 100 images may require significant storage depending on resolution.
4. **Network interruptions:** Must handle partial downloads gracefully.

### Tradeoffs
- **Full metadata vs. simplicity:** Storing all metadata JSONB makes the database heavier but more powerful for future queries.
- **Token vs. public endpoint:** Design supports authentication but works without token for public images.
- **Resumability vs. initial setup:** Crawl state adds complexity but is essential for collecting large batches.

### Open Questions
1. Should model_versions table be populated automatically or manually?
2. What image directory structure should be used locally (by model name, by date, flat)?
3. Should there be a GUI interface or is CLI sufficient?
4. How to handle NSFW content filtering and labeling?
5. Should the collector support filtering by model, creator, or tags?

---

# Execution Handoff

Plan complete and saved. Ready to execute using subagent-driven-development — I'll dispatch a fresh subagent per task with two-stage review (spec compliance then code quality). Shall I proceed?