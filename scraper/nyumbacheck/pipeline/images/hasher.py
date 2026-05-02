"""
Perceptual image hashing for duplicate detection.

Uses pHash (perceptual hash) to detect when the same property photo
appears across multiple listings, even after minor resizing or compression.

Hamming distance < 10 = likely the same image.
"""

import io
import asyncio
from typing import Optional

import aiohttp
import imagehash
from PIL import Image

from nyumbacheck.utils.logger import get_logger

log = get_logger(__name__)

HAMMING_THRESHOLD = 10  # images with distance < this are considered duplicates


async def fetch_image(session: aiohttp.ClientSession, url: str) -> Optional[bytes]:
    """Download an image, returning raw bytes or None on failure."""
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status == 200:
                content_type = resp.headers.get("Content-Type", "")
                if "image" in content_type:
                    return await resp.read()
    except Exception as exc:
        log.debug("image.fetch_failed", url=url, error=str(exc))
    return None


def compute_phash(image_bytes: bytes) -> Optional[str]:
    """Compute the pHash of an image given its raw bytes."""
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        h = imagehash.phash(img)
        return str(h)
    except Exception as exc:
        log.debug("image.hash_failed", error=str(exc))
        return None


async def hash_image_url(url: str) -> Optional[str]:
    """Download a single image URL and compute its pHash."""
    async with aiohttp.ClientSession() as session:
        data = await fetch_image(session, url)
        if data:
            return compute_phash(data)
    return None


async def hash_image_urls(urls: list[str]) -> list[Optional[str]]:
    """Download and hash a list of image URLs concurrently."""
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_image(session, url) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    hashes = []
    for result in results:
        if isinstance(result, bytes):
            hashes.append(compute_phash(result))
        else:
            hashes.append(None)
    return hashes


def images_are_duplicates(hash_a: str, hash_b: str) -> bool:
    """Return True if two pHash strings are within the duplicate threshold."""
    try:
        a = imagehash.hex_to_hash(hash_a)
        b = imagehash.hex_to_hash(hash_b)
        return (a - b) < HAMMING_THRESHOLD
    except Exception:
        return False


def find_matching_hashes(
    candidate_hashes: list[str],
    existing_hashes: list[str],
) -> list[tuple[str, str, int]]:
    """
    Find all pairs of hashes that are likely duplicates.

    Returns a list of (hash_a, hash_b, hamming_distance) tuples.
    """
    matches = []
    for h_a in candidate_hashes:
        for h_b in existing_hashes:
            try:
                a = imagehash.hex_to_hash(h_a)
                b = imagehash.hex_to_hash(h_b)
                dist = a - b
                if dist < HAMMING_THRESHOLD:
                    matches.append((h_a, h_b, dist))
            except Exception:
                continue
    return matches
