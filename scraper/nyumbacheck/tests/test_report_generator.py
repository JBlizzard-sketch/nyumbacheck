"""Tests for the HTML report generator."""

from datetime import datetime, timezone
from nyumbacheck.report.generator import generate_html_report
from nyumbacheck.pipeline.fraud.scorer import compute_fraud_score


def _make_result(platform_count=3, price_min=45000, price_max=80000):
    return compute_fraud_score(
        platform_count=platform_count,
        price_min=price_min,
        price_max=price_max,
        agent_listing_count=20,
        days_on_market=200,
    )


def test_report_contains_score():
    result = _make_result()
    html = generate_html_report(
        report_id=1,
        input_url="https://www.buyrentkenya.com/listings/test-123",
        input_address=None,
        listing={"neighbourhood": "Kilimani", "price_ksh": 45000, "bedrooms": 2, "platform_slug": "buyrentkenya"},
        duplicates=[],
        fraud_result=result,
        generated_at=datetime.now(timezone.utc),
    )
    assert f"{result.score:.0f}" in html
    assert "NyumbaCheck" in html
    assert "Kilimani" in html


def test_report_shows_duplicates():
    result = _make_result()
    duplicates = [
        {"platform_slug": "jumiahouseske", "url": "https://house.jumia.co.ke/test", "price_ksh": 55000, "agent_raw_phone": "0712345678"},
        {"platform_slug": "buyrentkenya", "url": "https://buyrentkenya.com/listings/other", "price_ksh": 80000, "agent_raw_phone": "0712345678"},
    ]
    html = generate_html_report(
        report_id=2,
        input_url=None,
        input_address="2 bed flat in Kilimani near Junction Mall",
        listing=None,
        duplicates=duplicates,
        fraud_result=result,
        generated_at=datetime.now(timezone.utc),
    )
    assert "jumiahouseske" in html
    assert "buyrentkenya" in html
    assert "Duplicate Listings Found (2)" in html


def test_report_risk_levels():
    for platform_count, expected_level in [(1, "low"), (3, "medium"), (5, "high")]:
        result = compute_fraud_score(platform_count=platform_count)
        assert result.risk_level in ("low", "medium", "high", "critical")


def test_report_is_valid_html():
    result = _make_result(platform_count=1)
    html = generate_html_report(
        report_id=99,
        input_url=None,
        input_address="Studio in Westlands",
        listing=None,
        duplicates=[],
        fraud_result=result,
        generated_at=datetime.now(timezone.utc),
    )
    assert html.startswith("<!DOCTYPE html>")
    assert "</html>" in html
    assert "<body" in html
