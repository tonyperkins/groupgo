import pytest
from app.services.showtime_service import normalize_time, extract_format, parse_serpapi_showtimes


# ── normalize_time ────────────────────────────────────────────────────────────

def test_normalize_time_pm():
    assert normalize_time("7:30pm") == "19:30"

def test_normalize_time_am():
    assert normalize_time("10:00am") == "10:00"

def test_normalize_time_noon():
    assert normalize_time("12:00pm") == "12:00"

def test_normalize_time_midnight():
    assert normalize_time("12:00am") == "00:00"

def test_normalize_time_with_space():
    assert normalize_time("7:30 PM") == "19:30"

def test_normalize_time_already_24h():
    assert normalize_time("19:30") == "19:30"

def test_normalize_time_single_digit_hour():
    assert normalize_time("9:15pm") == "21:15"


# ── extract_format ────────────────────────────────────────────────────────────

def test_extract_format_imax():
    assert extract_format("7:00 PM (IMAX)") == "IMAX"

def test_extract_format_3d():
    assert extract_format("7:00 PM 3D") == "3D"

def test_extract_format_dolby():
    assert extract_format("Dolby Cinema 7:30pm") == "Dolby"

def test_extract_format_standard():
    assert extract_format("7:00 PM") == "Standard"

def test_extract_format_case_insensitive():
    assert extract_format("7:00 PM (imax)") == "IMAX"


# ── parse_serpapi_showtimes ───────────────────────────────────────────────────

SAMPLE_SERPAPI_RESPONSE = {
    "showtimes": [
        {
            "day": "FriMar 13",
            "theaters": [
                {
                    "name": "Test Theater",
                    "showing": [
                        {"type": "Standard", "time": ["5:00pm", "7:30pm", "10:00pm"]},
                        {"type": "IMAX", "time": ["7:00pm"]},
                    ],
                },
                {
                    "name": "Other Theater",
                    "showing": [
                        {"type": "Standard", "time": ["6:00pm"]},
                    ],
                },
            ],
        }
    ]
}


def test_parse_serpapi_returns_correct_movie():
    results = parse_serpapi_showtimes(
        raw=SAMPLE_SERPAPI_RESPONSE,
        movie_title="Test Movie",
        theater_id=1,
        event_id=10,
        poll_id=1,
        target_date="2026-03-13",
        theater_name="Test Theater",
    )
    # Should return 4 sessions (3 Standard + 1 IMAX) from Test Theater only
    assert len(results) == 4


def test_parse_serpapi_normalizes_times():
    results = parse_serpapi_showtimes(
        raw=SAMPLE_SERPAPI_RESPONSE,
        movie_title="Test Movie",
        theater_id=1,
        event_id=10,
        poll_id=1,
        target_date="2026-03-13",
        theater_name="Test Theater",
    )
    times = [r["session_time"] for r in results]
    assert "17:00" in times
    assert "19:30" in times
    assert "22:00" in times
    assert "19:00" in times


def test_parse_serpapi_extracts_formats():
    results = parse_serpapi_showtimes(
        raw=SAMPLE_SERPAPI_RESPONSE,
        movie_title="Test Movie",
        theater_id=1,
        event_id=10,
        poll_id=1,
        target_date="2026-03-13",
        theater_name="Test Theater",
    )
    formats = [r["format"] for r in results]
    assert "Standard" in formats
    assert "IMAX" in formats


def test_parse_serpapi_excludes_other_theaters():
    results = parse_serpapi_showtimes(
        raw=SAMPLE_SERPAPI_RESPONSE,
        movie_title="Test Movie",
        theater_id=1,
        event_id=10,
        poll_id=1,
        target_date="2026-03-13",
        theater_name="Test Theater",
    )
    # "Other Theater" should not be included when theater_name is specified
    assert len(results) == 4  # not 5


def test_parse_serpapi_empty_response():
    results = parse_serpapi_showtimes(
        raw={},
        movie_title="Test Movie",
        theater_id=1,
        event_id=10,
        poll_id=1,
        target_date="2026-03-13",
        theater_name="Test Theater",
    )
    assert results == []


def test_parse_serpapi_sets_event_and_theater_ids():
    results = parse_serpapi_showtimes(
        raw=SAMPLE_SERPAPI_RESPONSE,
        movie_title="Test Movie",
        theater_id=7,
        event_id=42,
        poll_id=3,
        target_date="2026-03-13",
        theater_name="Test Theater",
    )
    for r in results:
        assert r["theater_id"] == 7
        assert r["event_id"] == 42
        assert r["poll_id"] == 3
