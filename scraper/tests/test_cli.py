from datetime import date

import pytest

from elon_scraper import cli
from elon_scraper.importer import ImporterError
from elon_scraper.parser import ScraperError


def test_scheduled_import_records_failure_and_continues(monkeypatch):
    recorded = []

    def fail_collect(service_date, timeout):
        raise ScraperError(f"site unavailable for {service_date.isoformat()}")

    def fake_record(service_date, exc, source_url=None):
        recorded.append((service_date, str(exc), source_url))
        return {
            "service_date": service_date.isoformat(),
            "status": "failed",
            "restaurants": 0,
            "meals": 0,
            "stations": 0,
            "station_foods": 0,
            "foods": 0,
            "error_message": str(exc),
        }

    monkeypatch.setattr(cli, "collect_menu", fail_collect)
    monkeypatch.setattr(cli, "record_scraper_failure", fake_record)

    summaries = cli.import_dates(date(2026, 7, 1), days_back=0, days_ahead=1, timeout=1.0, continue_on_error=True)

    assert [summary["status"] for summary in summaries] == ["failed", "failed"]
    assert [item[0] for item in recorded] == [date(2026, 7, 1), date(2026, 7, 2)]


def test_one_shot_import_records_failure_then_raises(monkeypatch):
    recorded = []

    def fail_collect(service_date, timeout):
        raise ScraperError("menu-hours markup changed")

    def fake_record(service_date, exc, source_url=None):
        recorded.append((service_date, str(exc), source_url))
        return {
            "service_date": service_date.isoformat(),
            "status": "failed",
            "error_message": str(exc),
        }

    monkeypatch.setattr(cli, "collect_menu", fail_collect)
    monkeypatch.setattr(cli, "record_scraper_failure", fake_record)

    with pytest.raises(ScraperError):
        cli.import_dates(date(2026, 7, 1), days_back=0, days_ahead=0, timeout=1.0)

    assert recorded == [(date(2026, 7, 1), "menu-hours markup changed", None)]


def test_unexpected_import_errors_are_recorded_and_wrapped(monkeypatch):
    recorded = []

    def collect(service_date, timeout):
        return {
            "source_url": "https://www.elondining.com/menu-hours/?date=2026-07-01",
            "service_date": service_date.isoformat(),
            "restaurants": [{"name": "Lakeside Dining Hall"}],
        }

    def fail_import(payload):
        raise RuntimeError("database socket closed")

    def fake_record(service_date, exc, source_url=None):
        recorded.append((service_date, str(exc), source_url))
        return {
            "service_date": service_date.isoformat(),
            "status": "failed",
            "error_message": str(exc),
        }

    monkeypatch.setattr(cli, "collect_menu", collect)
    monkeypatch.setattr(cli, "import_menu_payload", fail_import)
    monkeypatch.setattr(cli, "record_scraper_failure", fake_record)

    with pytest.raises(ImporterError, match="Import failed for 2026-07-01"):
        cli.import_dates(date(2026, 7, 1), days_back=0, days_ahead=0, timeout=1.0)

    assert recorded == [(
        date(2026, 7, 1),
        "database socket closed",
        "https://www.elondining.com/menu-hours/?date=2026-07-01",
    )]
