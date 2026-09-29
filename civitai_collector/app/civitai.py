"""Civitai API client with cursor pagination, retries, and rate limiting."""

import os
import httpx
from tenacity import retry, wait_exponential, stop_after_attempt

from app.config import BASE_URL, TOKEN, RETRY_MIN_WAIT, RETRY_MAX_WAIT, RETRY_MAX_ATTEMPTS

# Build headers - support optional Bearer token
headers = {"Accept": "application/json"}
if TOKEN:
    headers["Authorization"] = f"Bearer {TOKEN}"


@retry(
    wait=wait_exponential(min=RETRY_MIN_WAIT, max=RETRY_MAX_WAIT),
    stop=stop_after_attempt(RETRY_MAX_ATTEMPTS),
)
def get_images(cursor=None):
    """Fetch images from Civitai API with cursor pagination and metadata.

    Args:
        cursor: Pagination cursor from previous response, or None for first page.

    Returns:
        JSON response from Civitai API containing images and metadata.
    """
    params = {
        "limit": 100,
        "withMeta": "true",
        "sort": "Newest",
    }
    if cursor:
        params["cursor"] = cursor

    with httpx.Client(headers=headers, timeout=60) as client:
        response = client.get(f"{BASE_URL}/images", params=params)
        response.raise_for_status()
        return response.json()