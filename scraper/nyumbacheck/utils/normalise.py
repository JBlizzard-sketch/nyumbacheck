"""
Shared normalisation helpers used by all NyumbaCheck spiders.
Converts raw scraped text into clean, typed values.
"""
from __future__ import annotations

import re
from typing import Optional

# ── Price ─────────────────────────────────────────────────────────────────────

_PRICE_RE = re.compile(
    r"(?:KES?|Ksh\.?|KSH\.?|Kshs?\.?)?\s*([\d,]+(?:\.\d{1,2})?)",
    re.IGNORECASE,
)
_MILLION_SUFFIX = re.compile(r"([\d.]+)\s*(?:m(?:illion)?|mn)", re.IGNORECASE)
_THOUSAND_SUFFIX = re.compile(r"([\d.]+)\s*(?:k)", re.IGNORECASE)


def normalise_price(raw: str) -> Optional[float]:
    """Parse a price string to a float KSH value, or None if unparseable."""
    if not raw:
        return None
    text = raw.strip()

    # "45M" / "45 million"
    m = _MILLION_SUFFIX.search(text)
    if m:
        return float(m.group(1)) * 1_000_000

    # "250k"
    m = _THOUSAND_SUFFIX.search(text)
    if m:
        return float(m.group(1)) * 1_000

    m = _PRICE_RE.search(text)
    if m:
        try:
            return float(m.group(1).replace(",", ""))
        except ValueError:
            return None

    return None


# ── Phone ─────────────────────────────────────────────────────────────────────

_PHONE_STRIP = re.compile(r"[\s\-().+]")


def normalise_phone(raw: str) -> Optional[str]:
    """
    Normalise a Kenyan phone number to E.164 format (+254XXXXXXXXX).
    Returns None if the input doesn't look like a valid KE number.
    """
    if not raw:
        return None
    digits = _PHONE_STRIP.sub("", raw)

    # Strip leading country code without +
    if digits.startswith("254"):
        digits = digits[3:]
    elif digits.startswith("0"):
        digits = digits[1:]

    # Must be exactly 9 digits and start with 7 or 1 (Safaricom / Airtel / Telkom)
    if len(digits) == 9 and digits[0] in "71":
        return f"+254{digits}"

    return None


# ── Neighbourhood ─────────────────────────────────────────────────────────────

# Maps common spelling variants to a canonical neighbourhood name.
# Extend as new areas appear in scraping.
_NEIGHBOURHOOD_MAP: dict[str, str] = {
    # Westlands cluster
    "westlands": "Westlands",
    "parklands": "Parklands",
    "spring valley": "Spring Valley",
    "brookside": "Brookside",
    # Karen / Langata
    "karen": "Karen",
    "langata": "Lang'ata",
    "lang'ata": "Lang'ata",
    "ngong road": "Ngong Road",
    # Kilimani / Kileleshwa
    "kilimani": "Kilimani",
    "kileleshwa": "Kileleshwa",
    "lavington": "Lavington",
    "valley arcade": "Valley Arcade",
    # Runda / Muthaiga / Gigiri
    "runda": "Runda",
    "muthaiga": "Muthaiga",
    "gigiri": "Gigiri",
    "ridgeways": "Ridgeways",
    # Kasarani / Roysambu
    "kasarani": "Kasarani",
    "roysambu": "Roysambu",
    "thika road": "Thika Road",
    # South C / South B / Mlolongo
    "south c": "South C",
    "south b": "South B",
    "mlolongo": "Mlolongo",
    # Eastlands
    "eastleigh": "Eastleigh",
    "buruburu": "Buruburu",
    "umoja": "Umoja",
    "donholm": "Donholm",
    # Embakasi / Airport
    "embakasi": "Embakasi",
    "imara daima": "Imara Daima",
    "syokimau": "Syokimau",
    # CBD
    "cbd": "CBD",
    "nairobi cbd": "CBD",
    "upper hill": "Upper Hill",
    "community": "Upper Hill",
    # Ruaka / Banana
    "ruaka": "Ruaka",
    "banana": "Banana Hill",
    # Kitisuru / Loresho
    "kitisuru": "Kitisuru",
    "loresho": "Loresho",
    # Ngong / Rongai
    "ngong": "Ngong",
    "rongai": "Rongai",
}


def canonical_neighbourhood(raw_address: str) -> Optional[str]:
    """
    Return a canonical neighbourhood name extracted from a raw address string,
    or None if no known neighbourhood is found.
    """
    if not raw_address:
        return None
    lower = raw_address.lower()
    for keyword, canonical in _NEIGHBOURHOOD_MAP.items():
        if keyword in lower:
            return canonical
    return None
