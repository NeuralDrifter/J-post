"""Run one JobSpy search for a single site and print the results as one JSON line.

Embedded in the Go binary and run by discover.go. The last line on stdout is always
one of:
  {"jobs": [...]}   on success
  {"error": "..."}  on failure
JSON is ASCII-escaped so the Windows console code page can't corrupt it.
"""
import argparse
import json
import math
import sys


def emit(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=True) + "\n")
    sys.stdout.flush()


def num(value):
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f


def text(value):
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    return str(value)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", default="indeed")
    parser.add_argument("--term", default="")
    parser.add_argument("--location", default="")
    parser.add_argument("--remote", action="store_true")
    parser.add_argument("--results", type=int, default=20)
    parser.add_argument("--hours-old", type=int, default=0, help="only postings newer than this (0 = no limit)")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    try:
        from jobspy import scrape_jobs
    except Exception as e:  # report any import problem to the app
        emit({"error": f"could not import jobspy: {e}"})
        return

    if args.self_test:
        emit({"jobs": []})
        return

    hours_old = args.hours_old or None
    if args.site == "indeed" and args.remote:
        # JobSpy can't combine Indeed's remote filter with hours_old; the remote
        # filter changes what's shown, hours_old only saves time, so keep remote.
        hours_old = None

    try:
        df = scrape_jobs(
            site_name=[args.site],
            search_term=args.term,
            location=args.location or None,
            is_remote=args.remote,
            results_wanted=args.results,
            country_indeed="USA",
            linkedin_fetch_description=True,
            hours_old=hours_old,
        )
    except Exception as e:
        emit({"error": str(e) or e.__class__.__name__})
        return

    jobs = []
    for row in df.to_dict(orient="records"):
        jobs.append({
            "title": text(row.get("title")),
            "company": text(row.get("company")),
            "location": text(row.get("location")),
            "is_remote": text(row.get("is_remote")).lower() == "true",
            "min_amount": num(row.get("min_amount")),
            "max_amount": num(row.get("max_amount")),
            "interval": text(row.get("interval")),
            "description": text(row.get("description")),
            "date_posted": text(row.get("date_posted")),
            "job_url": text(row.get("job_url")),
            "site": text(row.get("site")) or args.site,
        })
    emit({"jobs": jobs})


if __name__ == "__main__":
    main()
