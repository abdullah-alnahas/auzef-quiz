"""Characterisation tests for label classification shared by discovery."""
import pytest

from discover import classify, is_mock, norm, period_of


@pytest.mark.parametrize("text,expected", [
    ("2025-26 Büt Soruları", "butunleme"),
    ("2024-2025 Bütünleme Soruları", "butunleme"),
    ("2026 Vize Soruları", "vize"),
    ("2022-23 Vize (Güz)", "vize"),
    ("Ara Sınav 2021", "vize"),
    ("2025-26 Final Soruları", "final"),
    ("Yaz Okulu 2023", "yaz-okulu"),
    ("Ünite 3 Soruları", "unite"),
    ("2024 Üç Ders Soruları", "uc-ders"),
    ("2021 Deneme -1", "deneme"),
])
def test_classify(text, expected):
    assert classify(text) == expected


@pytest.mark.parametrize("text,expected", [
    ("2025-26 Büt Soruları", "2025-2026"),
    ("2022-23 Vize (Güz)", "2022-2023"),
    ("2026 Vize Soruları", "2026"),
    ("Soru seti", None),
    ("2021-2022 Final Soruları", "2021-2022"),
])
def test_period_of(text, expected):
    assert period_of(text) == expected


def test_mock_detection():
    assert is_mock("2026 Vize Deneme 1")
    assert not is_mock("2026 Vize Soruları")


def test_norm_collapses_whitespace_and_zero_width():
    assert norm(" a\u00a0 b\u200b\n c ") == "a b c"
