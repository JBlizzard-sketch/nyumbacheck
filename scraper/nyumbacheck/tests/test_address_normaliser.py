"""Tests for the address normalisation module."""

import pytest
from nyumbacheck.pipeline.address.normaliser import extract_neighbourhood, normalise_phone


@pytest.mark.parametrize("address,expected", [
    ("2 bedroom flat in Kilimani", "Kilimani"),
    ("Apartment for rent, Westlands, Nairobi", "Westlands"),
    ("Near Junction Mall, Ngong Road", "Ngong Road"),
    ("kileleshwa estate, nairobi", "Kileleshwa"),
    ("Off Langata Road, Nairobi", "Lang'ata"),
    ("Hurlingham area, 3 bed", "Hurlingham"),
])
def test_neighbourhood_extraction(address, expected):
    result = extract_neighbourhood(address)
    assert result == expected, f"Expected {expected!r} for {address!r}, got {result!r}"


@pytest.mark.parametrize("phone,expected", [
    ("0712345678", "+254712345678"),
    ("254712345678", "+254712345678"),
    ("+254712345678", "+254712345678"),
    ("0112345678", "+254112345678"),
])
def test_phone_normalisation(phone, expected):
    assert normalise_phone(phone) == expected
