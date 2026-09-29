"""Main collection orchestration with resumable crawl state."""

from app.database import get_connection
from app.civitai import get_images


def get_crawl_state():
    """Get the current crawl state from database."""
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM crawl_state WHERE id = 1")
        state = cur.fetchone()
    conn.close()
    return state


def save_crawl_state(cursor, images_seen, images_saved, images_failed, last_civitai_id):
    """Save crawl state to database."""
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """UPDATE crawl_state 
               SET cursor = %s, images_seen = %s, images_saved = %s, 
                   images_failed = %s, last_civitai_id = %s, updated_at = NOW()
             WHERE id = 1""",
            (cursor, images_seen, images_saved, images_failed, last_civitai_id),
        )
    conn.commit()
    conn.close()


def start_collection(target_count=100):
    """Start collecting images until target_count is reached.
    
    Args:
        target_count: Number of images to collect (default 100).
        
    Returns:
        Dict with collection statistics.
    """
    state = get_crawl_state()
    cursor = state["cursor"]
    images_seen = state["images_seen"]
    images_saved_total = state["images_saved"]
    
    print(f"Resuming from cursor: {cursor}")
    print(f"Images already seen: {images_seen}")
    print(f"Images already saved: {images_saved_total}")
    
    conn = get_connection()
    images_failed = 0
    
    while images_saved_total < target_count:
        print(f"\nFetching page (cursor={cursor})...")
        try:
            images_data = get_images(cursor=cursor)
        except Exception as e:
            print(f"Error fetching images: {e}")
            images_failed += 1
            if images_failed > 5:
                raise
            continue
        
        items = images_data.get("items", images_data.get("images", []))
        
        if not items:
            print("No more images available")
            break
            
        print(f"Fetched {len(items)} images")
        images_seen += len(items)
        
        for image in items:
            if images_saved_total >= target_count:
                break
            
            try:
                with conn.cursor() as cur:
                    # Check if already exists
                    cur.execute(
                        "SELECT 1 FROM images WHERE civitai_id = %s",
                        (image["id"],)
                    )
                    exists = cur.fetchone()
                
                if not exists:
                    result = upsert_image(conn, image)
                    images_saved_total += 1
                    print(f"  Saved: {result['civitai_id']} (total: {images_saved_total}/{target_count})")
                else:
                    print(f"  Skip (exists): {image['id']}")
                
            except Exception as e:
                print(f"  Error saving {image['id']}: {e}")
                images_failed += 1
        
        cursor = images_data.get("metadata", {}).get("nextCursor")
        
        # Save state after each page
        save_crawl_state(
            cursor, 
            images_seen, 
            images_saved_total, 
            images_failed,
            items[-1]["id"] if items else None
        )
        
        if not cursor:
            print("No more pages (cursor exhausted)")
            break
    
    conn.close()
    return {
        "images_seen": images_seen,
        "images_saved": images_saved_total,
        "images_failed": images_failed,
        "cursor": cursor,
    }


def upsert_image(conn, image):
    """Insert or update an image record using ON CONFLICT upsert."""
    import json
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


if __name__ == "__main__":
    import os
    os.environ["DATABASE_URL"] = "postgresql://aw:aw@127.0.0.1:5435/ai_workstation"
    
    result = start_collection(100)
    print(f"\n=== Collection Complete ===")
    print(f"Images seen: {result['images_seen']}")
    print(f"Images saved: {result['images_saved']}")
    print(f"Images failed: {result['images_failed']}")
    print(f"Final cursor: {result['cursor']}")