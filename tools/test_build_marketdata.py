# Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
# SPDX-License-Identifier: MIT

"""Checks the generated marketdata file against known values in the source data.

Run after build_marketdata.py:  python tools/test_build_marketdata.py
"""
import csv
import gzip
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "internal", "marketdata", "marketdata.json.gz")


def csv_value(path, geo, line="1"):
    with open(os.path.join(ROOT, "datasets", path), newline="", encoding="latin-1") as f:
        for row in csv.reader(f):
            if len(row) > 8 and row[0].strip().strip('"') == geo and row[4].strip() == line:
                return round(float(row[-1]), 2)
    raise AssertionError(f"{geo} not in {path}")


def main():
    assert os.path.getsize(OUT) < 8_000_000, "marketdata file should stay under 8 MB"
    with gzip.open(OUT, "rt", encoding="utf-8") as f:
        d = json.load(f)

    # Known OEWS May 2025 values (checked by hand against the xlsx).
    assert d["wages"]["US"]["15-1252"][1:] == [105210, 135980, 171980, 214670], d["wages"]["US"]["15-1252"]
    assert d["occupations"]["15-1252"] == "Software Developers"

    denver = d["areas"]["19740"]
    assert denver["type"] == "metro" and denver["state"] == "CO"
    assert denver["rpp"] == csv_value("MARPP/MARPP_MSA_2008_2024.csv", "19740"), denver
    assert denver["rppLevel"] == "metro"

    us = d["areas"]["US"]
    assert us["rpp"] == 100.0 and us["rppLevel"] == "national"

    # BEA publishes no RPPs for territories (PR, GU, VI); those fall back to national.
    territories = {"PR", "GU", "VI"}
    nonmetro = [a for a in d["areas"].values() if a["type"] == "nonmetro" and a["state"] not in territories]
    assert nonmetro and all(a["rppLevel"] == "state nonmetro portion" for a in nonmetro)
    assert all("rpp" in a for a in d["areas"].values()), "every area needs a cost-of-living index"

    top_coded = sum(1 for occs in d["wages"].values() for pts in occs.values() if -1 in pts)
    assert top_coded > 0, "top-coded wages should be stored as -1"
    assert not any(p is not None and p < -1 for occs in d["wages"].values() for pts in occs.values() for p in pts)

    print("marketdata OK:", len(d["areas"]), "areas,", len(d["occupations"]), "occupations,", top_coded, "top-coded rows")


if __name__ == "__main__":
    main()
