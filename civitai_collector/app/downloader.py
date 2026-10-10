"""Image downloader with SHA-256 verification."""

import hashlib
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse

import httpx

from app.config import IMAGE_DIR


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


def download_images_from_db(limit=None, offset=0, target_downloaded=None, workers=5):
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
        SELECT id, civitai_id, source_url, local_path, downloaded, sha256, metadata
        FROM images
        WHERE type = 'image'
          AND nsfw_level = 'None'
          AND NULLIF(BTRIM(prompt), '') IS NOT NULL
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
    existing = 0
    target_path = Path(IMAGE_DIR)
    target_path.mkdir(parents=True, exist_ok=True)

    def saved_file(img):
        name = Path(img["local_path"]).name if img.get("local_path") else ""
        if name:
            candidate = target_path / name
            if candidate.is_file() and candidate.stat().st_size:
                return candidate
        return None

    pending = []
    for img in images:
        if saved_file(img):
            existing += 1
        else:
            pending.append(img)

    if target_downloaded is not None and existing >= target_downloaded:
        return {"downloaded": 0, "failed": 0, "existing": existing, "total": len(images)}

    if limit is not None:
        pending = pending[:limit]

    def download_and_register(img):
        try:
            ext = os.path.splitext(urlparse(img["source_url"]).path)[1] or ".jpg"
            dest = target_path / f"{img['civitai_id']}{ext}"
            result = download_image(img["source_url"], str(dest))
            relpath = (Path("civitai_collector") / "data" / "images" / dest.name).as_posix()

            # Update database with download info
            conn = get_connection()
            with conn.cursor() as cur:
                cur.execute(
                    """UPDATE images
                       SET local_path = %s, sha256 = %s, downloaded = TRUE,
                           download_error = NULL, updated_at = NOW()
                       WHERE id = %s""",
                    (relpath, result["sha256"], img["id"]),
                )
            conn.commit()
            conn.close()

            print(f"Downloaded: {img['civitai_id']} -> {dest} ({result['sha256'][:16]}...)")
            return True

        except Exception as e:
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
            return False

    batch_size = max(1, workers)
    with ThreadPoolExecutor(max_workers=batch_size) as executor:
        for start in range(0, len(pending), batch_size):
            if target_downloaded is not None and existing >= target_downloaded:
                break
            batch = pending[start:start + batch_size]
            futures = [executor.submit(download_and_register, img) for img in batch]
            results = [future.result() for future in as_completed(futures)]
            successes = sum(results)
            downloaded += successes
            failed += len(results) - successes
            existing += successes

    return {"downloaded": downloaded, "failed": failed, "existing": existing, "total": len(images)}


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Download safe, prompted Civitai images for AI labeling.")
    parser.add_argument("--target-downloaded", type=int, default=50,
                        help="Ensure at least this many eligible images exist locally (default: 50).")
    parser.add_argument("--limit", type=int, default=None,
                        help="Maximum number of download attempts in this run.")
    parser.add_argument("--workers", type=int, default=5,
                        help="Maximum number of parallel downloads (default: 5).")
    args = parser.parse_args()
    print("Downloading images from database...")
    result = download_images_from_db(
        limit=args.limit, target_downloaded=args.target_downloaded, workers=args.workers
    )
    print(f"\nResult: {result}")
