"""Tests for the fraud scoring engine."""

import pytest
from nyumbacheck.pipeline.fraud.scorer import compute_fraud_score


def test_clean_listing_gets_low_score():
    result = compute_fraud_score(
        platform_count=1,
        price_min=50000,
        price_max=50000,
        agent_listing_count=3,
        days_on_market=15,
        image_match_count=0,
        total_images=5,
        price_ksh=50000,
        neighbourhood_median_ksh=52000,
    )
    assert result.score < 25
    assert result.risk_level == "low"


def test_ghost_listing_gets_high_score():
    result = compute_fraud_score(
        platform_count=5,
        price_min=40000,
        price_max=90000,
        agent_listing_count=60,
        days_on_market=400,
        image_match_count=8,
        total_images=10,
        price_ksh=40000,
        neighbourhood_median_ksh=70000,
    )
    assert result.score >= 70
    assert result.risk_level in ("high", "critical")
    assert len(result.signals) > 0


def test_summary_is_human_readable():
    result = compute_fraud_score(
        platform_count=4,
        price_min=45000,
        price_max=80000,
        agent_listing_count=25,
    )
    assert isinstance(result.summary, str)
    assert len(result.summary) > 20


def test_explainability_signals_present():
    result = compute_fraud_score(
        platform_count=3,
        price_min=60000,
        price_max=100000,
    )
    signal_types = [s.type for s in result.signals]
    assert "platform_count" in signal_types
    assert "price_spread" in signal_types
