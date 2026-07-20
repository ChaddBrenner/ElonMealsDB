import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path

from .importer import (
    ImporterError,
    build_failure_summary,
    import_menu_payload,
    parse_run_times,
    record_scraper_failure,
    service_dates,
    sleep_until_next_run,
)
from .parser import ScraperError, collect_menu


def parse_iso_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("date must use YYYY-MM-DD") from exc


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Collect structured Elon Dining menu data.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    collect = subparsers.add_parser("collect", help="Fetch menu-hours and location menu pages.")
    collect.add_argument("--date", type=parse_iso_date, required=True, help="Service date in YYYY-MM-DD format.")
    collect.add_argument("--output", type=Path, help="Write normalized JSON to this file instead of stdout.")
    collect.add_argument("--timeout", type=float, default=20.0, help="HTTP timeout in seconds.")
    collect.add_argument("--max-restaurants", type=int, default=None, help="Optional limit for parser/debug runs.")

    import_db = subparsers.add_parser("import-db", help="Fetch Elon Dining data and upsert it into MySQL.")
    import_db.add_argument("--date", type=parse_iso_date, help="Service date in YYYY-MM-DD format. Defaults to today in Eastern time.")
    import_db.add_argument("--days-back", type=int, default=0, help="Number of days before --date/today to import.")
    import_db.add_argument("--days-ahead", type=int, default=0, help="Number of days after --date/today to import.")
    import_db.add_argument("--timeout", type=float, default=20.0, help="HTTP timeout in seconds.")

    schedule = subparsers.add_parser("schedule-import", help="Run database imports on a recurring daily schedule.")
    schedule.add_argument("--times", default="05:15,12:15,15:15", help="Comma-separated Eastern times in HH:MM format.")
    schedule.add_argument("--days-back", type=int, default=0, help="Number of days before today to import each run.")
    schedule.add_argument("--days-ahead", type=int, default=1, help="Number of days after today to import each run.")
    schedule.add_argument("--timeout", type=float, default=20.0, help="HTTP timeout in seconds.")
    schedule.add_argument(
        "--run-on-start",
        dest="run_on_start",
        action="store_true",
        default=None,
        help="Run once immediately before waiting for the schedule.",
    )
    schedule.add_argument(
        "--no-run-on-start",
        dest="run_on_start",
        action="store_false",
        help="Wait for the next scheduled time before importing.",
    )

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    try:
        if args.command == "collect":
            payload = collect_menu(args.date, timeout=args.timeout, max_restaurants=args.max_restaurants)
            write_json(payload, args.output)
        elif args.command == "import-db":
            summaries = import_dates(args.date, args.days_back, args.days_ahead, args.timeout)
            write_json({"imports": summaries}, None)
        elif args.command == "schedule-import":
            run_times = parse_run_times(args.times)
            run_on_start = args.run_on_start
            if run_on_start is None:
                run_on_start = env_bool("SCRAPER_RUN_ON_START", False)
            if run_on_start:
                summaries = import_dates(None, args.days_back, args.days_ahead, args.timeout, continue_on_error=True)
                write_json({"imports": summaries}, None)
            while True:
                sleep_until_next_run(run_times)
                summaries = import_dates(None, args.days_back, args.days_ahead, args.timeout, continue_on_error=True)
                write_json({"imports": summaries}, None)
        else:
            raise ScraperError(f"Unsupported command: {args.command}")
    except (ImporterError, ScraperError) as exc:
        print(f"scraper error: {exc}", file=sys.stderr)
        return 1

    return 0


def env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ImporterError(f"{name} must be true or false")


def import_dates(
    anchor: date | None,
    days_back: int,
    days_ahead: int,
    timeout: float,
    continue_on_error: bool = False,
) -> list[dict[str, object]]:
    if days_back < 0 or days_ahead < 0:
        raise ImporterError("days-back and days-ahead must be zero or greater")

    summaries = []
    for service_date in service_dates(anchor, days_back, days_ahead):
        source_url = None
        try:
            payload = collect_menu(service_date, timeout=timeout)
            source_url = payload.get("source_url")
            summary = import_menu_payload(payload)
            summaries.append(summary)
            print(f"imported {service_date.isoformat()}: {summary}", file=sys.stderr, flush=True)
        except Exception as exc:
            failure = record_failure(service_date, exc, source_url)
            print(f"failed {service_date.isoformat()}: {failure}", file=sys.stderr, flush=True)
            if continue_on_error:
                summaries.append(failure)
                continue
            if isinstance(exc, (ImporterError, ScraperError)):
                raise
            raise ImporterError(f"Import failed for {service_date.isoformat()}: {exc}") from exc
    return summaries


def record_failure(service_date: date, exc: BaseException, source_url: str | None) -> dict[str, object]:
    try:
        return record_scraper_failure(service_date, exc, source_url=source_url)
    except Exception as record_exc:
        print(
            f"failed to record scraper failure for {service_date.isoformat()}: {record_exc}",
            file=sys.stderr,
            flush=True,
        )
        return build_failure_summary(service_date.isoformat(), exc)


def write_json(payload: dict[str, object], output: Path | None) -> None:
    text = json.dumps(payload, indent=2, sort_keys=True)
    if output:
        output.write_text(f"{text}\n", encoding="utf-8")
    else:
        print(text)


if __name__ == "__main__":
    raise SystemExit(main())
