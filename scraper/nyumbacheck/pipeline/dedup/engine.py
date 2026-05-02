"""
Duplicate detection engine.

Combines address normalisation, image hashing, price clustering,
and agent phone fingerprinting to identify listings that refer to
the same physical property.
"""

from dataclasses import dataclass, field


@dataclass
class ListingCandidate:
    """A listing with enough data to participate in dedup matching."""
    listing_id: int
    platform_slug: str
    normalised_address: str | None
    neighbourhood: str | None
    bedrooms: int | None
    bathrooms: int | None
    sqft: float | None
    property_type: str | None
    price_ksh: float | None
    agent_phone_normalised: str | None
    image_hashes: list[str] = field(default_factory=list)


@dataclass
class DedupMatch:
    """A pair of listings determined to be duplicates with a confidence score."""
    listing_id_a: int
    listing_id_b: int
    confidence: float  # 0.0 - 1.0
    reasons: list[str]  # e.g. ["address_match", "image_hash", "agent_phone"]


def _address_similarity(a: str | None, b: str | None) -> float:
    """Return a 0-1 similarity score between two normalised addresses."""
    if not a or not b:
        return 0.0
    if a.lower() == b.lower():
        return 1.0
    from rapidfuzz import fuzz
    return fuzz.token_sort_ratio(a.lower(), b.lower()) / 100.0


def _images_overlap(hashes_a: list[str], hashes_b: list[str]) -> float:
    """Return the proportion of images in A that are found in B."""
    if not hashes_a or not hashes_b:
        return 0.0
    from nyumbacheck.pipeline.images.hasher import images_are_duplicates
    matches = sum(
        1 for h_a in hashes_a
        for h_b in hashes_b
        if images_are_duplicates(h_a, h_b)
    )
    return matches / len(hashes_a)


def _price_within_band(
    price_a: float | None,
    price_b: float | None,
    band_pct: float = 0.20,
) -> bool:
    """Return True if two prices are within band_pct of each other."""
    if not price_a or not price_b:
        return True  # unknown price doesn't disqualify
    lower = min(price_a, price_b)
    upper = max(price_a, price_b)
    return (upper - lower) / lower <= band_pct


def compute_match_confidence(a: ListingCandidate, b: ListingCandidate) -> DedupMatch | None:
    """
    Compute whether two listings are likely the same property.

    Returns a DedupMatch with confidence score, or None if they're clearly different.
    """
    reasons: list[str] = []
    confidence = 0.0

    # 1. Must be in the same neighbourhood (if known)
    if a.neighbourhood and b.neighbourhood:
        if a.neighbourhood != b.neighbourhood:
            return None  # different neighbourhoods → definitely different properties
        reasons.append("same_neighbourhood")
        confidence += 0.15

    # 2. Must have compatible bedroom count (if known)
    if a.bedrooms and b.bedrooms:
        if abs(a.bedrooms - b.bedrooms) > 1:
            return None  # bedroom count too different
        if a.bedrooms == b.bedrooms:
            confidence += 0.10
            reasons.append("bedroom_match")

    # 3. Address similarity
    addr_sim = _address_similarity(a.normalised_address, b.normalised_address)
    if addr_sim >= 0.85:
        confidence += 0.30
        reasons.append("address_match")
    elif addr_sim >= 0.65:
        confidence += 0.15
        reasons.append("address_partial_match")

    # 4. Image hash overlap
    img_overlap = _images_overlap(a.image_hashes, b.image_hashes)
    if img_overlap >= 0.6:
        confidence += 0.30
        reasons.append("image_hash")
    elif img_overlap >= 0.2:
        confidence += 0.15
        reasons.append("image_partial_match")

    # 5. Agent phone fingerprint
    if a.agent_phone_normalised and b.agent_phone_normalised:
        if a.agent_phone_normalised == b.agent_phone_normalised:
            confidence += 0.20
            reasons.append("agent_phone")

    # 6. Price within 20% band
    if a.price_ksh and b.price_ksh:
        if _price_within_band(a.price_ksh, b.price_ksh):
            confidence += 0.05
            reasons.append("price_proximity")
        else:
            confidence -= 0.05  # penalise if prices are very different

    confidence = max(0.0, min(1.0, confidence))

    # Only return a match if confidence is above threshold
    if confidence < 0.40:
        return None

    return DedupMatch(
        listing_id_a=a.listing_id,
        listing_id_b=b.listing_id,
        confidence=confidence,
        reasons=reasons,
    )


def find_duplicates(listings: list[ListingCandidate]) -> list[DedupMatch]:
    """
    Find all duplicate pairs in a list of listings.

    O(n²) — intended for neighbourhood-scoped batches (hundreds, not millions).
    """
    matches: list[DedupMatch] = []
    for i, a in enumerate(listings):
        for b in listings[i + 1:]:
            match = compute_match_confidence(a, b)
            if match:
                matches.append(match)
    return matches
