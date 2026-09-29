civit_api_key=55ce76bc0a54cc28ba06e862d7c25617



Yes. Given your goal, I’d build this as a **proper resumable ingestion pipeline**, not a scraper.

Civitai currently exposes a public `GET /api/v1/images` endpoint, supports up to 200 results per request, cursor pagination for deep traversal, and `withMeta=true` for generation metadata. The metadata is free-form, and `civitaiResources` can identify the Civitai model versions used. ([GitHub][1])

## Architecture

```text
                    CIVITAI
                       │
                       ▼
             ┌───────────────────┐
             │   API Collector   │
             │                   │
             │ cursor pagination │
             │ withMeta=true     │
             │ retries           │
             │ rate limiting     │
             └─────────┬─────────┘
                       │
             ┌─────────▼─────────┐
             │    PostgreSQL     │
             │                   │
             │ images            │
             │ metadata          │
             │ resources/models  │
             │ crawl_state       │
             └─────────┬─────────┘
                       │
                       │ only if new
                       ▼
             ┌───────────────────┐
             │  Image Downloader │
             │                   │
             │ SHA-256           │
             │ atomic downloads  │
             │ retries           │
             └─────────┬─────────┘
                       │
                       ▼
              /data/images/
```

The key idea is:

**PostgreSQL becomes your source of truth.**

If the program dies at image 783, it doesn't start over. It looks at `crawl_state` and continues.

---

# 1. Database design

I'd use four main tables.

### `images`

The primary record for every Civitai image.

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

CREATE INDEX idx_images_post_id
    ON images(post_id);

CREATE INDEX idx_images_model_version
    ON images(model_version_id);

CREATE INDEX idx_images_creator
    ON images(creator_username);

CREATE INDEX idx_images_sha256
    ON images(sha256);

CREATE INDEX idx_images_metadata
    ON images USING GIN(metadata);
```

The important field here is:

```sql
metadata JSONB
```

**Don't throw away anything from Civitai's metadata.**

Civitai explicitly says the metadata object is free-form because different generation tools can produce different fields. ([GitHub][1])

So you can extract convenient fields like:

```text
prompt
negative_prompt
model
steps
sampler
seed
cfg
```

while still retaining the original:

```json
{
    "Size": "1024x1536",
    "Model": "...",
    "prompt": "...",
    "sampler": "...",
    "steps": 30,
    "seed": 12345,
    "...": "anything else"
}
```

---

# 2. Model/resource table

I'd also create:

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

Why?

Because Civitai metadata can tell you:

```text
image
   ↓
civitaiResources
   ↓
modelVersionId
```

Civitai specifically documents `civitaiResources` as the mapping between referenced resources and their Civitai `modelVersionId`. ([GitHub][1])

You can then resolve:

```text
modelVersionId
       ↓
Civitai API
       ↓
model
       ↓
model creator
       ↓
base model
       ↓
trained words
       ↓
files
       ↓
license information
```

That makes your database much more powerful.

---

# 3. Crawl state

This is what makes the collector **resumable**.

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

Your crawler essentially does:

```python
state = get_crawl_state()

cursor = state.cursor

while True:

    response = get_civitai_images(cursor)

    save_images(response)

    cursor = response["metadata"]["nextCursor"]

    save_crawl_state(cursor)

    if not cursor:
        break
```

If Python gets killed:

```text
cursor = saved cursor
```

so it continues from there.

---

# 4. Python project

I'd structure it like this:

```text
civitai_collector/
│
├── app/
│   ├── __init__.py
│   ├── config.py
│   ├── civitai.py
│   ├── database.py
│   ├── downloader.py
│   ├── metadata.py
│   └── collector.py
│
├── migrations/
│   └── 001_initial.sql
│
├── data/
│   └── images/
│
├── .env
├── requirements.txt
└── main.py
```

---

# 5. Requirements

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

---

# 6. Environment

`.env`

```env
CIVITAI_TOKEN=your_token_here

DATABASE_URL=postgresql://civitai:civitai_password@localhost:5432/civitai

IMAGE_DIR=/data/civitai/images

BATCH_SIZE=100
```

You don't necessarily need a token for the public image endpoint, but I'd design the application to support one. Civitai's current API documentation supports Bearer authentication. ([GitHub][2])

---

# 7. Civitai client

`civitai.py`

```python
import os
import httpx
from tenacity import retry, wait_exponential, stop_after_attempt

BASE_URL = "https://civitai.com/api/v1"

TOKEN = os.getenv("CIVITAI_TOKEN")

headers = {
    "Accept": "application/json"
}

if TOKEN:
    headers["Authorization"] = f"Bearer {TOKEN}"


@retry(
    wait=wait_exponential(min=2, max=60),
    stop=stop_after_attempt(5)
)
def get_images(cursor=None):

    params = {
        "limit": 100,
        "withMeta": "true",
        "sort": "Newest"
    }

    if cursor:
        params["cursor"] = cursor

    with httpx.Client(
        headers=headers,
        timeout=60
    ) as client:

        response = client.get(
            f"{BASE_URL}/images",
            params=params
        )

        response.raise_for_status()

        return response.json()
```

Civitai recommends cursor pagination for traversing beyond the first 1,000 results. ([GitHub][1])

---

# 8. PostgreSQL connection

`database.py`

```python
import os
import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.environ["DATABASE_URL"]


def get_connection():

    return psycopg.connect(
        DATABASE_URL,
        row_factory=dict_row
    )
```

---

# 9. Insert images

The important part is using:

```sql
ON CONFLICT (civitai_id) DO UPDATE
```

rather than blindly inserting.

```python
def save_image(conn, image):

    meta = image.get("meta") or {}

    with conn.cursor() as cur:

        cur.execute(
            """
            INSERT INTO images (
                civitai_id,
                post_id,
                creator_id,
                creator_username,
                source_url,
                width,
                height,
                nsfw_level,
                type,
                blurhash,
                prompt,
                negative_prompt,
                model_name,
                sampler,
                steps,
                cfg_scale,
                seed,
                created_at,
                metadata
            )
            VALUES (
                %(id)s,
                %(postId)s,
                %(creatorId)s,
                %(username)s,
                %(url)s,
                %(width)s,
                %(height)s,
                %(nsfwLevel)s,
                %(type)s,
                %(hash)s,
                %(prompt)s,
                %(negative_prompt)s,
                %(model)s,
                %(sampler)s,
                %(steps)s,
                %(cfg)s,
                %(seed)s,
                %(createdAt)s,
                %(metadata)s
            )

            ON CONFLICT (civitai_id)
            DO UPDATE SET
                metadata = EXCLUDED.metadata,
                prompt = EXCLUDED.prompt,
                negative_prompt = EXCLUDED.negative_prompt,
                updated_at = NOW()

            RETURNING *
            """,
            {
                **image,
                "prompt": meta.get("prompt"),
                "negative_prompt": meta.get("negativePrompt"),
                "model": meta.get("Model"),
                "sampler": meta.get("sampler"),
                "steps": meta.get("steps"),
                "cfg": meta.get("cfgScale"),
                "seed": meta.get("seed"),
                "metadata": meta
            }
        )

    conn.commit()
```

---

# 10. Deduplication

I'd use **two levels of deduplication**.

### Level 1 — Civitai ID

```text
civitai_id UNIQUE
```

If Civitai sends the same image again:

```text
9173928
```

you don't create another database row.

### Level 2 — SHA-256

When you actually download the image:

```python
import hashlib


def sha256_file(path):

    h = hashlib.sha256()

    with open(path, "rb") as f:

        while chunk := f.read(1024 * 1024):
            h.update(chunk)

    return h.hexdigest()
```

Then:

```text
Civitai image A
        │
        ▼
SHA256
        │
        ▼
abc123...
```

If another Civitai ID produces exactly the same file:

```text
Civitai image B
        │
        ▼
SHA256
        │
        ▼
abc123...
```

you know they're byte-for-byte identical.

That's valuable because the same image can potentially appear in multiple places.

---

# 11. Download safely

Don't download directly into the final filename.

Do:

```text
image.tmp
    ↓
download completely
    ↓
calculate SHA256
    ↓
rename
```

Example:

```python
import os
import httpx


def download_image(url, destination):

    tmp = destination + ".part"

    with httpx.stream(
        "GET",
        url,
        timeout=120,
        follow_redirects=True
    ) as response:

        response.raise_for_status()

        with open(tmp, "wb") as f:

            for chunk in response.iter_bytes(1024 * 1024):

                f.write(chunk)

    os.replace(tmp, destination)
```

This means if your server crashes halfway through a 10 MB image, you don't accidentally consider the 4 MB partial file complete.

---

# 12. Better file structure

I wouldn't dump 10 million images into one directory.

Use the Civitai ID:

```text
/data/civitai/images/

9173928/
    image.jpg
    metadata.json

9173929/
    image.jpg
    metadata.json

9173930/
    image.jpg
    metadata.json
```

Or hash-based:

```text
/data/civitai/images/
ab/
    abcdef123....jpg

cd/
    cd987654....jpg
```

For a serious dataset, I prefer:

```text
SHA256
  ↓
first 2 chars
  ↓
next 2 chars
```

Example:

```text
abcdef123456...

/ab/cd/abcdef123456.jpg
```

This prevents huge directory problems.

---

# 13. Main collector

This is the heart of it.

```python
import time

from civitai import get_images
from database import get_connection


def get_cursor(conn):

    with conn.cursor() as cur:

        cur.execute(
            """
            SELECT cursor
            FROM crawl_state
            WHERE id = 1
            """
        )

        row = cur.fetchone()

        return row["cursor"] if row else None


def save_cursor(conn, cursor):

    with conn.cursor() as cur:

        cur.execute(
            """
            UPDATE crawl_state

            SET
                cursor = %s,
                updated_at = NOW()

            WHERE id = 1
            """,
            (cursor,)
        )

    conn.commit()


def collect():

    conn = get_connection()

    cursor = get_cursor(conn)

    while True:

        print("Fetching:", cursor)

        response = get_images(cursor)

        items = response.get("items", [])

        if not items:

            print("No more images.")

            break

        for image in items:

            try:

                save_image(conn, image)

                print(
                    "Saved:",
                    image["id"]
                )

            except Exception as e:

                conn.rollback()

                print(
                    "ERROR:",
                    image.get("id"),
                    e
                )

        cursor = (
            response
            .get("metadata", {})
            .get("nextCursor")
        )

        save_cursor(conn, cursor)

        if not cursor:

            break

        time.sleep(1)

    conn.close()
```

---

# 14. But I'd improve this further

The above is the **basic architecture**.

For the version I'd actually run on your server, I'd split the system into two workers.

```text
                 Civitai API
                      │
                      ▼
                INGEST WORKER
                      │
                      ▼
                 PostgreSQL
                      │
                      ▼
                DOWNLOAD QUEUE
                      │
                      ▼
               DOWNLOAD WORKER
                      │
                      ▼
                Image Storage
```

Why?

Because downloading thousands of images can be much slower than collecting metadata.

You don't want:

```text
API
 ↓
download image
 ↓
wait
 ↓
API
 ↓
download image
 ↓
wait
```

Instead:

```text
API → DB → DB → DB → DB → DB
                  ↓
              downloader
              downloader
              downloader
              downloader
```

You can have **4–8 download workers** operating independently.

---

# 15. Download queue

Add:

```sql
CREATE TABLE download_queue (
    id BIGSERIAL PRIMARY KEY,

    image_id BIGINT NOT NULL
        REFERENCES images(id)
        ON DELETE CASCADE,

    status TEXT NOT NULL DEFAULT 'pending',

    attempts INTEGER DEFAULT 0,

    last_error TEXT,

    locked_at TIMESTAMPTZ,

    downloaded_at TIMESTAMPTZ,

    UNIQUE(image_id)
);

CREATE INDEX idx_download_queue_status
    ON download_queue(status);
```

When an image is discovered:

```text
images
  +
download_queue
```

Then your downloader grabs:

```text
pending
```

jobs.

---

# 16. PostgreSQL makes the queue safe

This is one of the nicest parts.

Workers can claim jobs using:

```sql
SELECT id, image_id
FROM download_queue
WHERE status = 'pending'
ORDER BY id
FOR UPDATE SKIP LOCKED
LIMIT 10;
```

That means:

```text
Worker 1 → image 100
Worker 2 → image 101
Worker 3 → image 102
Worker 4 → image 103
```

They don't fight over the same image.

---

# 17. Automatic recovery

You also want stale jobs recovered.

Imagine:

```text
Worker 2
   ↓
downloads image 900
   ↓
SERVER CRASH
```

The job remains:

```text
status = downloading
```

Forever unless you handle it.

So periodically:

```sql
UPDATE download_queue

SET
    status = 'pending',
    locked_at = NULL

WHERE status = 'downloading'
AND locked_at < NOW() - INTERVAL '30 minutes';
```

Now it gets retried.

---

# 18. The really useful part: querying your dataset

Once you've built this, you can do things that Civitai's website isn't designed for.

### Find images generated with a particular model

```sql
SELECT *
FROM images
WHERE model_version_id = 123456;
```

### Search prompts

```sql
SELECT
    civitai_id,
    prompt
FROM images
WHERE prompt ILIKE '%cyberpunk%';
```

### Find images generated with a particular LoRA

If you retain the complete metadata:

```sql
SELECT *
FROM images
WHERE metadata::text ILIKE '%987654%';
```

Later you can normalize resources into their own table for much faster queries.

---

# 19. I'd actually create a `resources` table

Something like:

```sql
CREATE TABLE image_resources (

    image_id BIGINT
        REFERENCES images(id)
        ON DELETE CASCADE,

    model_version_id BIGINT,

    model_name TEXT,

    resource_type TEXT,

    strength DOUBLE PRECISION,

    PRIMARY KEY (
        image_id,
        model_version_id
    )
);
```

Then:

```text
IMAGE
 │
 ├── Checkpoint
 │
 ├── LoRA
 │
 ├── LoRA
 │
 └── Embedding
```

becomes queryable.

---

# 20. Example end result

Your database could eventually answer:

```text
IMAGE
────────────────────────────────

ID:
9173928

Prompt:
"cinematic portrait of..."

Negative:
"blurry, low quality..."

Checkpoint:
RealVisXL

Checkpoint Version:
123456

LoRA:
Film Photography
Version:
987654

Sampler:
DPM++ 2M Karras

Steps:
30

CFG:
7

Seed:
123456789

Resolution:
1024 × 1536

Creator:
some_user

SHA256:
a83f...

Civitai:
https://civitai.com/images/9173928
```

And you still retain the **original raw metadata JSON**.

---

## One thing I'd change from your original idea

I wouldn't make the goal:

> **"Download as many Civitai images as possible."**

I'd make it:

> **"Build a clean, queryable AI-generation dataset."**

That distinction matters.

Your pipeline should preserve:

**Image → Civitai ID → creator → post → prompt → generation parameters → checkpoint → model version → LoRAs → hashes → license/source information → original metadata.**

Civitai's API is already designed to expose much of that, so scraping HTML would throw away a lot of structure. ([GitHub][1])

Also, keep the Civitai source URL and creator information in your database and check the applicable creator/model/image licensing before redistributing the downloaded images. Civitai's API documentation notes that creators can impose authentication requirements on resource downloads, and model files also carry scan/status metadata. ([GitHub][2])

**If you're serious about running this at scale, I'd use PostgreSQL + Python `asyncio` + 4–8 download workers + cursor checkpointing + SHA-256 deduplication + JSONB metadata.** That gives you a collector that can run for days/weeks, survive crashes, and resume without starting over.

[1]: https://github.com/civitai/civitai-developer-docs/blob/main/site/reference/images.md?utm_source=chatgpt.com "civitai-developer-docs/site/reference/images.md at main · civitai/civitai-developer-docs · GitHub"
[2]: https://github.com/civitai/civitai/wiki/REST-API-Reference/e34d23767078ec6f536ec824a9cf95840d918dbc?utm_source=chatgpt.com "REST API Reference · civitai/civitai Wiki · GitHub"


