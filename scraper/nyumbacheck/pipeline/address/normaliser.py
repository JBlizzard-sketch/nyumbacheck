"""
Nairobi address normalisation.

Converts messy listing addresses into canonical neighbourhood names.
Handles the many spelling variants, abbreviations, and partial addresses
that appear across listing platforms.
"""

import re
from rapidfuzz import process, fuzz

# Canonical Nairobi neighbourhoods with their aliases
NAIROBI_NEIGHBOURHOODS: dict[str, list[str]] = {
    "Kilimani": ["kilimani", "kirimani", "kiliamni", "kilmani"],
    "Westlands": ["westlands", "west lands", "wstlands", "westland"],
    "Lavington": ["lavington", "lavigton", "lavingston"],
    "Karen": ["karen", "karren", "karin"],
    "Parklands": ["parklands", "park lands", "parkland"],
    "Kileleshwa": ["kileleshwa", "kileleshwa", "kilelshwa", "kilele"],
    "Hurlingham": ["hurlingham", "hurlinghm", "hurligham"],
    "Upper Hill": ["upper hill", "upperhill", "upper-hill"],
    "Ngong Road": ["ngong road", "ngong rd", "ngong"],
    "Lang'ata": ["langata", "lang'ata", "lang ata", "langate"],
    "South B": ["south b", "south-b", "southb"],
    "South C": ["south c", "south-c", "southc"],
    "Ruaka": ["ruaka", "ruwaka"],
    "Ruiru": ["ruiru", "ruiru town"],
    "Thika Road": ["thika road", "thika rd", "thika superhighway"],
    "Kasarani": ["kasarani", "kasarni", "kasarani estate"],
    "Embakasi": ["embakasi", "embaksi", "embakassi"],
    "Donholm": ["donholm", "don holm", "donholme"],
    "Umoja": ["umoja", "umoja estate"],
    "Buruburu": ["buruburu", "buru buru", "buru-buru"],
    "Rongai": ["rongai", "rongaia"],
    "Kikuyu": ["kikuyu", "kikuiyu"],
    "Kiambu Road": ["kiambu road", "kiambu rd"],
    "Muthaiga": ["muthaiga", "muthiga", "muthaiga north"],
    "Runda": ["runda", "runda estate"],
    "Spring Valley": ["spring valley", "springvalley"],
    "Gigiri": ["gigiri", "giguiri"],
    "Loresho": ["loresho", "loresho ridge", "lorensho"],
    "Eastleigh": ["eastleigh", "eastely", "eastleigh section"],
    "Industrial Area": ["industrial area", "industrial zone", "ind area"],
    "Upperhill": ["upperhill", "upper hill"],
    "Nairobi CBD": ["cbd", "nairobi cbd", "city centre", "city center", "town"],
    "Ruaraka": ["ruaraka", "ruraka"],
    "Pipeline": ["pipeline", "pipeline estate", "embakasi south"],
    "Mlolongo": ["mlolongo", "mlolnga"],
    "Syokimau": ["syokimau", "syokiamu"],
    "Athi River": ["athi river", "athiriver", "athi-river", "mavoko"],
}

# Build reverse lookup: alias -> canonical
_ALIAS_TO_CANONICAL: dict[str, str] = {}
for canonical, aliases in NAIROBI_NEIGHBOURHOODS.items():
    _ALIAS_TO_CANONICAL[canonical.lower()] = canonical
    for alias in aliases:
        _ALIAS_TO_CANONICAL[alias.lower()] = canonical

# All canonical names for fuzzy matching
_ALL_CANONICALS = list(NAIROBI_NEIGHBOURHOODS.keys())


def normalise_phone(phone: str) -> str:
    """Normalise a Kenyan phone number to +254XXXXXXXXX format."""
    digits = re.sub(r"[^\d+]", "", phone)
    if digits.startswith("+254"):
        return digits
    if digits.startswith("254"):
        return "+" + digits
    if digits.startswith("07") or digits.startswith("01"):
        return "+254" + digits[1:]
    if digits.startswith("7") or digits.startswith("1"):
        return "+254" + digits
    return digits


def extract_neighbourhood(address: str) -> str | None:
    """
    Extract and canonicalise a neighbourhood name from a raw address string.

    Strategy:
    1. Exact or alias match (case-insensitive)
    2. Fuzzy match against all canonical names (threshold 80)
    3. Return None if no confident match
    """
    if not address:
        return None

    lower = address.lower()

    # 1. Exact / alias lookup
    for alias, canonical in _ALIAS_TO_CANONICAL.items():
        if alias in lower:
            return canonical

    # 2. Fuzzy match on tokens
    tokens = re.split(r"[,\-/\s]+", lower)
    for token in tokens:
        if len(token) < 4:
            continue
        result = process.extractOne(
            token,
            _ALIAS_TO_CANONICAL.keys(),
            scorer=fuzz.ratio,
            score_cutoff=82,
        )
        if result:
            return _ALIAS_TO_CANONICAL[result[0]]

    # 3. Whole-string fuzzy match
    result = process.extractOne(
        lower,
        _ALL_CANONICALS,
        scorer=fuzz.partial_ratio,
        score_cutoff=75,
    )
    if result:
        return result[0]

    return None


def normalise_address(raw: str) -> str:
    """Basic address normalisation: strip noise, normalise whitespace."""
    if not raw:
        return raw
    # Remove common prefixes
    cleaned = re.sub(r"^(located in|situated in|found in|near|off)\s+", "", raw, flags=re.IGNORECASE)
    # Collapse whitespace
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned
