"""
Explainable fraud scoring engine.

Computes a fraud score (0-100) for a dedup cluster or individual listing,
with a human-readable explanation of every contributing signal.
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class FraudSignalResult:
    type: str
    label: str
    description: str
    weight: float  # 0-1, how much this signal contributes to the total
    raw_value: float | str | None
    score: float  # 0-100, how suspicious this signal is


@dataclass
class FraudScoreResult:
    score: float  # 0-100 composite
    risk_level: str  # "low" | "medium" | "high" | "critical"
    summary: str
    signals: list[FraudSignalResult] = field(default_factory=list)

    # Component scores
    platform_count_score: Optional[float] = None
    price_spread_score: Optional[float] = None
    agent_phone_overlap_score: Optional[float] = None
    days_on_market_score: Optional[float] = None
    image_reuse_score: Optional[float] = None
    price_anomaly_score: Optional[float] = None


# Weight of each signal in the composite score
SIGNAL_WEIGHTS = {
    "platform_count": 0.25,
    "price_spread": 0.20,
    "agent_phone_overlap": 0.20,
    "days_on_market": 0.15,
    "image_reuse": 0.10,
    "price_anomaly": 0.10,
}


def score_platform_count(platform_count: int) -> tuple[float, str]:
    """
    Score based on how many platforms list this property.
    1 platform = 0, 2 = 30, 3 = 60, 4+ = 90+
    """
    if platform_count <= 1:
        return 0.0, "Listed on 1 platform — normal."
    if platform_count == 2:
        return 30.0, f"Listed on {platform_count} platforms — possible duplicate."
    if platform_count == 3:
        return 65.0, f"Listed on {platform_count} platforms — likely duplicate/ghost listing."
    score = min(90.0 + (platform_count - 4) * 5, 100.0)
    return score, f"Listed on {platform_count} platforms — strong indicator of ghost listing."


def score_price_spread(price_min: float, price_max: float) -> tuple[float, str]:
    """
    Score based on the % spread between lowest and highest price for the same property.
    <5% = 0, 5-20% = 20-50, 20-50% = 50-75, >50% = 75-100
    """
    if price_min <= 0:
        return 0.0, "Unable to compute price spread."
    spread_pct = (price_max - price_min) / price_min * 100
    if spread_pct < 5:
        return 0.0, f"Price spread of {spread_pct:.1f}% — consistent pricing."
    if spread_pct < 20:
        score = 20.0 + (spread_pct - 5) / 15 * 30
        return score, f"Price spread of {spread_pct:.1f}% across platforms — moderate inconsistency."
    if spread_pct < 50:
        score = 50.0 + (spread_pct - 20) / 30 * 25
        return score, f"Price spread of {spread_pct:.1f}% (Ksh {price_min:,.0f}–{price_max:,.0f}) — high inconsistency, suspicious."
    score = min(75.0 + (spread_pct - 50) / 50 * 25, 100.0)
    return score, f"Price spread of {spread_pct:.1f}% (Ksh {price_min:,.0f}–{price_max:,.0f}) — extreme inconsistency, very suspicious."


def score_agent_phone_overlap(listing_count_for_phone: int) -> tuple[float, str]:
    """
    Score based on how many listings share the same agent phone number.
    High counts indicate agents farming phantom listings.
    """
    if listing_count_for_phone <= 5:
        return 0.0, f"Agent phone linked to {listing_count_for_phone} listings — normal."
    if listing_count_for_phone <= 15:
        score = (listing_count_for_phone - 5) / 10 * 40
        return score, f"Agent phone linked to {listing_count_for_phone} listings — elevated."
    if listing_count_for_phone <= 40:
        score = 40.0 + (listing_count_for_phone - 15) / 25 * 40
        return score, f"Agent phone linked to {listing_count_for_phone} listings — suspicious volume."
    score = min(80.0 + (listing_count_for_phone - 40) / 60 * 20, 100.0)
    return score, f"Agent phone linked to {listing_count_for_phone} listings — extremely high volume, likely scammer."


def score_days_on_market(days: int) -> tuple[float, str]:
    """
    Score based on how long a listing has been on the market.
    Ghost listings stay forever because no one can view or rent them.
    """
    if days < 30:
        return 0.0, f"{days} days on market — fresh listing."
    if days < 90:
        score = (days - 30) / 60 * 20
        return score, f"{days} days on market — normal range."
    if days < 180:
        score = 20.0 + (days - 90) / 90 * 30
        return score, f"{days} days on market — unusually long, may be ghost listing."
    if days < 365:
        score = 50.0 + (days - 180) / 185 * 30
        return score, f"{days} days on market — very long, high probability of ghost listing."
    score = min(80.0 + (days - 365) / 365 * 20, 100.0)
    return score, f"{days} days on market — over a year, almost certainly a ghost listing."


def score_image_reuse(image_match_count: int, total_images: int) -> tuple[float, str]:
    """
    Score based on what proportion of listing images appear in other listings.
    """
    if total_images == 0:
        return 0.0, "No images to analyse."
    reuse_rate = image_match_count / total_images
    if reuse_rate < 0.1:
        return 0.0, "Images appear unique — no reuse detected."
    if reuse_rate < 0.4:
        score = reuse_rate / 0.4 * 30
        return score, f"{image_match_count}/{total_images} images reused across other listings."
    if reuse_rate < 0.8:
        score = 30.0 + (reuse_rate - 0.4) / 0.4 * 40
        return score, f"{image_match_count}/{total_images} images reused — likely duplicate."
    score = min(70.0 + (reuse_rate - 0.8) / 0.2 * 30, 100.0)
    return score, f"All or nearly all images ({image_match_count}/{total_images}) reused — strong duplicate signal."


def score_price_anomaly(price_ksh: float, neighbourhood_median_ksh: float) -> tuple[float, str]:
    """
    Score based on how far the listing price deviates from neighbourhood median.
    Both very high and very low are suspicious.
    """
    if neighbourhood_median_ksh <= 0:
        return 0.0, "No neighbourhood median data available."
    ratio = price_ksh / neighbourhood_median_ksh
    if 0.7 <= ratio <= 1.5:
        return 0.0, f"Price (Ksh {price_ksh:,.0f}) is within normal range for this neighbourhood."
    if ratio < 0.5:
        score = min((0.7 - ratio) / 0.7 * 80, 100.0)
        return score, f"Price (Ksh {price_ksh:,.0f}) is {(1-ratio)*100:.0f}% below neighbourhood median — unusually cheap, possible scam."
    if ratio > 2.0:
        score = min((ratio - 1.5) / 0.5 * 40, 80.0)
        return score, f"Price (Ksh {price_ksh:,.0f}) is {(ratio-1)*100:.0f}% above neighbourhood median — check if overpriced/fraudulent."
    # 50-70% below or 1.5-2x above
    score = 20.0
    return score, f"Price (Ksh {price_ksh:,.0f}) is slightly outside the normal range for this neighbourhood."


def compute_fraud_score(
    platform_count: int = 1,
    price_min: float = 0,
    price_max: float = 0,
    agent_listing_count: int = 0,
    days_on_market: int = 0,
    image_match_count: int = 0,
    total_images: int = 0,
    price_ksh: float = 0,
    neighbourhood_median_ksh: float = 0,
) -> FraudScoreResult:
    """
    Compute the composite fraud score for a listing/cluster.

    Returns a FraudScoreResult with full signal breakdown and human-readable summary.
    """
    signals: list[FraudSignalResult] = []
    weighted_total = 0.0
    total_weight = 0.0

    def add_signal(
        signal_type: str,
        label: str,
        weight: float,
        score: float,
        description: str,
        raw_value: float | str | None,
    ) -> None:
        nonlocal weighted_total, total_weight
        signals.append(FraudSignalResult(
            type=signal_type,
            label=label,
            description=description,
            weight=weight,
            raw_value=raw_value,
            score=score,
        ))
        weighted_total += score * weight
        total_weight += weight

    # Signal 1: Platform count
    s, desc = score_platform_count(platform_count)
    add_signal("platform_count", "Cross-platform presence", SIGNAL_WEIGHTS["platform_count"], s, desc, platform_count)

    # Signal 2: Price spread
    s, desc = score_price_spread(price_min, price_max)
    add_signal("price_spread", "Price inconsistency", SIGNAL_WEIGHTS["price_spread"], s, desc, f"Ksh {price_min:,.0f}–{price_max:,.0f}")

    # Signal 3: Agent phone overlap
    if agent_listing_count > 0:
        s, desc = score_agent_phone_overlap(agent_listing_count)
        add_signal("agent_phone_overlap", "Agent phone volume", SIGNAL_WEIGHTS["agent_phone_overlap"], s, desc, agent_listing_count)

    # Signal 4: Days on market
    if days_on_market > 0:
        s, desc = score_days_on_market(days_on_market)
        add_signal("days_on_market", "Days on market", SIGNAL_WEIGHTS["days_on_market"], s, desc, days_on_market)

    # Signal 5: Image reuse
    if total_images > 0:
        s, desc = score_image_reuse(image_match_count, total_images)
        add_signal("image_reuse", "Image reuse across listings", SIGNAL_WEIGHTS["image_reuse"], s, desc, f"{image_match_count}/{total_images}")

    # Signal 6: Price anomaly
    if price_ksh > 0 and neighbourhood_median_ksh > 0:
        s, desc = score_price_anomaly(price_ksh, neighbourhood_median_ksh)
        add_signal("price_anomaly", "Price vs. neighbourhood median", SIGNAL_WEIGHTS["price_anomaly"], s, desc, price_ksh)

    composite = weighted_total / total_weight if total_weight > 0 else 0.0
    composite = round(min(composite, 100.0), 1)

    if composite < 25:
        risk_level = "low"
    elif composite < 50:
        risk_level = "medium"
    elif composite < 75:
        risk_level = "high"
    else:
        risk_level = "critical"

    # Build human-readable summary from the highest-scoring signals
    sorted_signals = sorted(signals, key=lambda s: s.score * s.weight, reverse=True)
    top_reasons = [s.description for s in sorted_signals[:3] if s.score > 20]
    summary = f"Fraud score: {composite}/100 ({risk_level.upper()} risk). " + " ".join(top_reasons)

    return FraudScoreResult(
        score=composite,
        risk_level=risk_level,
        summary=summary,
        signals=signals,
        platform_count_score=next((s.score for s in signals if s.type == "platform_count"), None),
        price_spread_score=next((s.score for s in signals if s.type == "price_spread"), None),
        agent_phone_overlap_score=next((s.score for s in signals if s.type == "agent_phone_overlap"), None),
        days_on_market_score=next((s.score for s in signals if s.type == "days_on_market"), None),
        image_reuse_score=next((s.score for s in signals if s.type == "image_reuse"), None),
        price_anomaly_score=next((s.score for s in signals if s.type == "price_anomaly"), None),
    )
