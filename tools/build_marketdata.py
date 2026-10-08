# Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
# SPDX-License-Identifier: MIT

"""Build marketdata/marketdata.json.gz from the raw government datasets in datasets/.

Inputs (download yearly, see README):
  datasets/all_data_M_2025.xlsx                  BLS OEWS May 2025, "All data" file
  datasets/MARPP/MARPP_MSA_2008_2024.csv         BEA Regional Price Parities by MSA
  datasets/PARPP/PARPP_PORT_2008_2024.csv        BEA RPP by state metro/nonmetro portion
  datasets/SARPP/SARPP_STATE_2008_2024.csv       BEA RPP by state

Run with a Python that has openpyxl:  python tools/build_marketdata.py
"""
import csv
import datetime
import gzip
import json
import os
import sys

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASETS = os.path.join(ROOT, "datasets")
OUT = os.path.join(ROOT, "marketdata", "marketdata.json.gz")

OEWS_FILE = "all_data_M_2025.xlsx"
OEWS_RELEASE = "May 2025"
RPP_FILES = {
    "msa": "MARPP/MARPP_MSA_2008_2024.csv",
    "portion": "PARPP/PARPP_PORT_2008_2024.csv",
    "state": "SARPP/SARPP_STATE_2008_2024.csv",
}
# OEWS area types: 1 national, 2 state, 4 metropolitan, 6 nonmetropolitan. (3 = territory, skipped.)
AREA_TYPES = {"1": "national", "2": "state", "4": "metro", "6": "nonmetro"}
PERCENTILES = ("A_PCT10", "A_PCT25", "A_MEDIAN", "A_PCT75", "A_PCT90")
TOP_CODED = -1  # OEWS "#": annual wage at or above the published cap ($239,200)


def wage(value):
    """OEWS cell -> int dollars, -1 for top-coded, None for not available."""
    if value is None or value == "*" or value == "":
        return None
    if value == "#":
        return TOP_CODED
    return int(round(float(value)))


def read_oews(path):
    ws = openpyxl.load_workbook(path, read_only=True)["All May 2025 data"]
    rows = ws.iter_rows(values_only=True)
    ix = {h: i for i, h in enumerate(next(rows))}
    occupations, areas, wages = {}, {}, {}
    for r in rows:
        kind = AREA_TYPES.get(str(r[ix["AREA_TYPE"]]))
        if not kind or r[ix["I_GROUP"]] != "cross-industry" or r[ix["O_GROUP"]] != "detailed":
            continue
        pts = [wage(r[ix[c]]) for c in PERCENTILES]
        if all(p is None for p in pts):
            continue
        code = "US" if kind == "national" else str(r[ix["AREA"]])
        if code not in areas:
            areas[code] = {"title": r[ix["AREA_TITLE"]], "type": kind, "state": r[ix["PRIM_STATE"]]}
        occ = r[ix["OCC_CODE"]]
        occupations.setdefault(occ, r[ix["OCC_TITLE"]])
        wages.setdefault(code, {})[occ] = pts
    return occupations, areas, wages


def read_rpp(path):
    """GeoFIPS -> {"all": idx, "housing": idx} using the latest year column."""
    out = {}
    with open(path, newline="", encoding="latin-1") as f:
        reader = csv.reader(f)
        header = next(reader)
        latest = len(header) - 1
        for row in reader:
            if len(row) <= latest:
                continue  # footer notes
            line = row[4].strip()
            if line not in ("1", "3"):
                continue
            try:
                value = round(float(row[latest]), 2)
            except ValueError:
                continue
            key = "all" if line == "1" else "housing"
            out.setdefault(row[0].strip().strip('"'), {})[key] = value
    return out, header[latest]


def attach_cost_of_living(areas, rpp):
    """Give every area an RPP, walking MSA -> state portion -> state -> US. Records which level was used."""
    state_fips = {a["state"]: code for code, a in areas.items() if a["type"] == "state"}
    for code, a in areas.items():
        fips = state_fips.get(a["state"])
        candidates = []
        if a["type"] == "national":
            candidates = [("national", "00000")]
        elif a["type"] == "metro":
            candidates = [("metro", code), ("state metro portion", f"{fips}998"), ("state", f"{fips}000")]
        elif a["type"] == "nonmetro":
            candidates = [("state nonmetro portion", f"{code[:2]}999"), ("state", f"{code[:2]}000")]
        elif a["type"] == "state":
            candidates = [("state", f"{code}000")]
        candidates.append(("national", "00000"))
        for level, geo in candidates:
            if geo in rpp and "all" in rpp[geo]:
                a["rpp"] = rpp[geo]["all"]
                a["rppHousing"] = rpp[geo].get("housing")
                a["rppLevel"] = level
                break


def main():
    occupations, areas, wages = read_oews(os.path.join(DATASETS, OEWS_FILE))
    rpp, rpp_year = {}, None
    for path in RPP_FILES.values():
        part, rpp_year = read_rpp(os.path.join(DATASETS, path))
        rpp.update(part)
    attach_cost_of_living(areas, rpp)

    data = {
        "meta": {
            "built": datetime.date.today().isoformat(),
            "sources": {
                "bls": {
                    "name": "BLS Occupational Employment and Wage Statistics (OEWS)",
                    "release": OEWS_RELEASE,
                    "url": "https://www.bls.gov/oes/",
                    "note": "Annual wages; values at or above $239,200 are top-coded by BLS.",
                },
                "bea": {
                    "name": "BEA Regional Price Parities (RPP)",
                    "release": str(rpp_year),
                    "url": "https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area",
                    "note": "US average = 100.",
                },
            },
        },
        "occupations": occupations,
        "areas": areas,
        "wages": wages,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with gzip.open(OUT, "wt", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))
    rows = sum(len(v) for v in wages.values())
    print(f"wrote {OUT}: {len(areas)} areas, {len(occupations)} occupations, {rows} wage rows, "
          f"{os.path.getsize(OUT) / 1e6:.1f} MB, RPP year {rpp_year}")


if __name__ == "__main__":
    sys.exit(main())
