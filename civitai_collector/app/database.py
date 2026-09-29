"""PostgreSQL connection and operations for the Civitai image collector."""

import json

import psycopg
from psycopg.rows import dict_row

from app.config import DATABASE_URL


def get_connection():
    """Get a PostgreSQL connection with dict row factory."""
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def upsert_image(conn, image):
    """Insert or update an image record using ON CONFLICT upsert.

    Args:
        conn: Open psycopg connection.
        image: Dict containing image data from Civitai API.

    Returns:
        The inserted/updated image record.
    """
    meta = image.get("meta") or {}

    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO images (
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
            ) VALUES (
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
            RETURNING *""",
            {
                "id": image.get("id"),
                "postId": image.get("postId"),
                "creatorId": image.get("creatorId"),
                "username": image.get("username"),
                "url": image.get("url"),
                "width": image.get("width"),
                "height": image.get("height"),
                "nsfwLevel": image.get("nsfwLevel"),
                "type": image.get("type"),
                "hash": image.get("hash"),
                "prompt": meta.get("prompt"),
                "negative_prompt": meta.get("negativePrompt"),
                "model": meta.get("Model"),
                "sampler": meta.get("sampler"),
                "steps": meta.get("steps"),
                "cfg": meta.get("cfgScale"),
                "seed": meta.get("seed"),
                "createdAt": image.get("createdAt"),
                "metadata": json.dumps(meta),
            },
        )
        result = cur.fetchone()
    conn.commit()
    return result