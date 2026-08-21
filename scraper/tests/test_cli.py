from datetime import date

import pytest

from elon_scraper import cli
from elon_scraper.importer import ImporterError, import_menu_payload, validate_menu_payload
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


def test_empty_menu_does_not_replace_existing_data():
    payload = {
        "service_date": "2026-07-18",
        "foods_count": 22,
        "restaurants": [
            {
                "name": "Lakeside Dining Hall",
                "meals": [{
                    "name": "Summer Break",
                    "time_open": "2026-07-18T11:00:00-04:00",
                    "time_closed": "2026-07-18T14:00:00-04:00",
                    "stations": [],
                }],
            }
        ],
    }

    with pytest.raises(ImporterError, match="no foods; refusing to replace existing data"):
        import_menu_payload(payload)


def test_partially_populated_menu_does_not_replace_existing_data():
    payload = {
        "service_date": "2026-08-10",
        "restaurants": [
            {
                "name": "Lakeside Dining Hall",
                "meals": [
                    {
                        "name": "Summer Break",
                        "time_open": "2026-08-10T11:00:00-04:00",
                        "time_closed": "2026-08-10T14:00:00-04:00",
                        "stations": [{"name": "Allgood", "foods": [{"external_id": "food-1"}]}],
                    },
                    {
                        "name": "Football Breakfast",
                        "time_open": "2026-08-10T06:00:00-04:00",
                        "time_closed": "2026-08-10T09:00:00-04:00",
                        "stations": [],
                    },
                    {
                        "name": "Football Dinner",
                        "time_open": "2026-08-10T17:00:00-04:00",
                        "time_closed": "2026-08-10T20:00:00-04:00",
                        "stations": [],
                    },
                ],
            }
        ],
    }

    with pytest.raises(ImporterError, match="Football Breakfast.*Football Dinner"):
        import_menu_payload(payload)


def test_verified_payload_allows_structurally_valid_hours_only_meals():
    content_hash = "a" * 64
    payload = {
        "source_contract_version": 4,
        "collection_status": "complete",
        "service_date": "2026-08-21",
        "restaurants_count": 2,
        "meals_count": 2,
        "stations_count": 1,
        "foods_count": 1,
        "distinct_recipes_count": 1,
        "food_variants_count": 1,
        "menu_item_placements_count": 1,
        "restaurants": [
            {
                "name": "Acorn Coffee Shop",
                "url": "https://www.elondining.com/locations/acorn-coffee-shop/?date=2026-08-21",
                "source_kind": "elon_location",
                "menu_status": "available",
                "meals": [{
                    "name": "Open",
                    "time_open": "2026-08-21T08:00:00-04:00",
                    "time_closed": "2026-08-21T17:00:00-04:00",
                    "menu_status": "available",
                    "stations": [{"name": "Coffee", "foods": [{"external_id": "recipe-1", "content_hash": content_hash}]}],
                }],
            },
            {
                "name": "Fountain Market",
                "url": "https://www.elondining.com/locations/fountain-market/?date=2026-08-21",
                "source_kind": "elon_location",
                "menu_status": "hours_only",
                "meals": [{
                    "name": "Open",
                    "time_open": "2026-08-21T11:00:00-04:00",
                    "time_closed": "2026-08-21T20:00:00-04:00",
                    "menu_status": "hours_only",
                    "stations": [],
                }],
            },
        ],
    }

    validation = validate_menu_payload(payload)

    assert validation["restaurants_count"] == 2
    assert validation["foods_count"] == 1
    assert validation["hours_only_restaurants"] == 1


def test_verified_payload_rejects_count_drift():
    payload = {
        "source_contract_version": 4,
        "collection_status": "complete",
        "service_date": "2026-08-21",
        "restaurants_count": 2,
        "meals_count": 1,
        "stations_count": 0,
        "foods_count": 0,
        "distinct_recipes_count": 0,
        "food_variants_count": 0,
        "menu_item_placements_count": 0,
        "restaurants": [{
            "name": "Legal Grounds",
            "url": "https://www.elondining.com/locations/legal-grounds/?date=2026-08-21",
            "source_kind": "elon_location",
            "menu_status": "hours_only",
            "meals": [{
                "name": "Hours",
                "time_open": "2026-08-21T07:30:00-04:00",
                "time_closed": "2026-08-21T14:00:00-04:00",
                "menu_status": "hours_only",
                "stations": [],
            }],
        }],
    }

    with pytest.raises(ImporterError, match="count mismatch"):
        validate_menu_payload(payload)


def test_scheduler_default_includes_morning_and_midday_imports():
    args = cli.build_parser().parse_args(["schedule-import"])

    assert args.times == "06:30,12:15,15:15"


def test_env_bool_reads_scheduler_startup_flag(monkeypatch):
    monkeypatch.setenv("SCRAPER_RUN_ON_START", "true")
    assert cli.env_bool("SCRAPER_RUN_ON_START", False) is True

    monkeypatch.setenv("SCRAPER_RUN_ON_START", "0")
    assert cli.env_bool("SCRAPER_RUN_ON_START", True) is False

    monkeypatch.delenv("SCRAPER_RUN_ON_START")
    assert cli.env_bool("SCRAPER_RUN_ON_START", True) is True


def test_env_bool_rejects_ambiguous_scheduler_startup_flag(monkeypatch):
    monkeypatch.setenv("SCRAPER_RUN_ON_START", "sometimes")

    with pytest.raises(ImporterError, match="SCRAPER_RUN_ON_START must be true or false"):
        cli.env_bool("SCRAPER_RUN_ON_START", False)
