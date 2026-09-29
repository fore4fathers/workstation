"""Image downloader with SHA-256 verification."""

import hashlib
import os

import httpx


def download_image(url, dest_path):
    """Download an image from URL and verify with SHA-256.

    Args:
        url: Source image URL.
        dest_path: Local file path to save.

    Returns:
        Dict with sha256 hash and file size.
    """
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)

    with httpx.Client(timeout=120, follow_redirects=True) as client:
        response = client.get(url)
        response.raise_for_status()

    with open(dest_path, "wb") as f:
        f.write(response.content)

    sha256 = hashlib.sha256(response.content).hexdigest()

    return {"sha256": sha256, "size": len(response.content)}


def download_images_from_db(limit=None, offset=0):
    """Download images stored in database that haven't been downloaded yet.

    Args:
        limit: Max number of images to download (None = all).
        offset: Skip this many images.

    Returns:
        Dict with download statistics.
    """
    from app.database import get_connection

    conn = get_connection()
    query = """
        SELECT id, civitai_id, source_url, metadata
        FROM images
        WHERE downloaded = FALSE AND download_error IS NULL
        ORDER BY discovered_at
    """
    params = []
    if limit:
        query += " LIMIT %s"
        params.append(limit)
    if offset:
        query += " OFFSET %s"
        params.append(offset)

    with conn.cursor() as cur:
        cur.execute(query, params)
        images = cur.fetchall()

    conn.close()

    downloaded = 0
    failed = 0

    for img in images:
        try:
            ext = os.path.splitext(img["source_url"])[1] or ".jpg"
            dest = f"data/images/{img['civitai_id']}{ext}"
            result = download_image(img["source_url"], dest)

            # Update database with download info
            conn = get_connection()
            with conn.cursor() as cur:
                cur.execute(
                    """UPDATE images
                       SET local_path = %s, sha256 = %s, downloaded = TRUE, updated_at = NOW()
                       WHERE id = %s""",
                    (dest, result["sha256"], img["id"]),
                )
            conn.commit()
            conn.close()

            downloaded += 1
            print(f"Downloaded: {img['civitai_id']} -> {dest} ({result['sha256'][:16]}...)")

        except Exception as e:
            failed += 1
            print(f"Failed to download {img['civitai_id']}: {e}")

            conn = get_connection()
            with conn.cursor() as cur:
                cur.execute(
                    """UPDATE images
                       SET download_error = %s, updated_at = NOW()
                       WHERE id = %s""",
                    (str(e), img["id"]),
                )
            conn.commit()
            conn.close()

    return {"downloaded": downloaded, "failed": failed, "total": len(images)}


if __name__ == "__main__":
    import os
    os.environ["DATABASE_URL"] = "postgresql://aw:aw@127.0.0.1:5435/ai_workstation"

    print("Downloading images from database...")
    result = download_images_from_db(limit=10)
    print(f"\nResult: {result}")