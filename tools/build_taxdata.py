# Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
# SPDX-License-Identifier: MIT

"""Build taxdata/us_2026.json: federal 2026 figures plus all state income tax tables.

State data: Tax Foundation, "State Individual Income Tax Rates and Brackets, 2026"
  https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/
  file: datasets/tf_2026_state_income_tax.xlsx (sheet "2026")
Federal data: IRS Rev. Proc. 2025-32 (brackets, standard deductions) and SSA (2026 wage base).

Run:  python tools/build_taxdata.py
"""
import json
import os
import re

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "datasets", "tf_2026_state_income_tax.xlsx")
OUT = os.path.join(ROOT, "taxdata", "us_2026.json")
YEAR = 2026
STATE_SOURCE = "Tax Foundation, State Individual Income Tax Rates and Brackets, 2026"

FEDERAL = {
    "source": "IRS Rev. Proc. 2025-32 (tax year 2026); SSA 2026 wage base; IRS 2026 401(k) deferral limit",
    "year": YEAR,
    # [threshold where the rate starts, rate]
    "brackets": {
        "single": [[0, 0.10], [12400, 0.12], [50400, 0.22], [105700, 0.24], [201775, 0.32], [256225, 0.35], [640600, 0.37]],
        "married": [[0, 0.10], [24800, 0.12], [100800, 0.22], [211400, 0.24], [403550, 0.32], [512450, 0.35], [768700, 0.37]],
        "head": [[0, 0.10], [17700, 0.12], [67450, 0.22], [105700, 0.24], [201750, 0.32], [256200, 0.35], [640600, 0.37]],
    },
    "standardDeduction": {"single": 16100, "married": 32200, "head": 24150},
    "socialSecurity": {"rate": 0.062, "wageBase": 184500},
    "k401Limit": 24500,  # employee elective deferral limit, under age 50
    "medicare": {"rate": 0.0145, "additionalRate": 0.009, "threshold": {"single": 200000, "married": 250000, "head": 200000}},
}

STATES = {
    "Ala.": ("AL", "Alabama"), "Alaska": ("AK", "Alaska"), "Ariz.": ("AZ", "Arizona"), "Ark.": ("AR", "Arkansas"),
    "Calif.": ("CA", "California"), "Colo.": ("CO", "Colorado"), "Conn.": ("CT", "Connecticut"), "Del.": ("DE", "Delaware"),
    "Fla.": ("FL", "Florida"), "Ga.": ("GA", "Georgia"), "Hawaii": ("HI", "Hawaii"), "Idaho": ("ID", "Idaho"),
    "Ill.": ("IL", "Illinois"), "Ind.": ("IN", "Indiana"), "Iowa": ("IA", "Iowa"), "Kans.": ("KS", "Kansas"),
    "Ky.": ("KY", "Kentucky"), "La.": ("LA", "Louisiana"), "Maine": ("ME", "Maine"), "Md.": ("MD", "Maryland"),
    "Mass.": ("MA", "Massachusetts"), "Mich.": ("MI", "Michigan"), "Minn.": ("MN", "Minnesota"), "Miss.": ("MS", "Mississippi"),
    "Mo.": ("MO", "Missouri"), "Mont.": ("MT", "Montana"), "Nebr.": ("NE", "Nebraska"), "Nev.": ("NV", "Nevada"),
    "N.H.": ("NH", "New Hampshire"), "N.J.": ("NJ", "New Jersey"), "N.M.": ("NM", "New Mexico"), "N.Y.": ("NY", "New York"),
    "N.C.": ("NC", "North Carolina"), "N.D.": ("ND", "North Dakota"), "Ohio": ("OH", "Ohio"), "Okla.": ("OK", "Oklahoma"),
    "Ore.": ("OR", "Oregon"), "Pa.": ("PA", "Pennsylvania"), "R.I.": ("RI", "Rhode Island"), "S.C.": ("SC", "South Carolina"),
    "S.D.": ("SD", "South Dakota"), "Tenn.": ("TN", "Tennessee"), "Tex.": ("TX", "Texas"), "Utah": ("UT", "Utah"),
    "Vt.": ("VT", "Vermont"), "Va.": ("VA", "Virginia"), "Wash.": ("WA", "Washington"), "W.Va.": ("WV", "West Virginia"),
    "Wis.": ("WI", "Wisconsin"), "Wyo.": ("WY", "Wyoming"), "D.C.": ("DC", "District of Columbia"),
}


def blank(v):
    return v is None or (isinstance(v, str) and v.strip() in ("", "\xa0"))


def money(v):
    """Cell -> (amount, is_credit). 'n.a.' and blanks are 0."""
    if blank(v) or (isinstance(v, str) and v.strip().startswith("n.a")):
        return 0, False
    if isinstance(v, (int, float)):
        return int(v), False
    m = re.match(r"\$([\d,]+) credit", v.strip())
    if m:
        return int(m.group(1).replace(",", "")), True
    raise ValueError(f"unexpected money cell {v!r}")


def main():
    ws = openpyxl.load_workbook(SRC, data_only=True)[str(YEAR)]
    states, cur = {}, None
    for r in ws.iter_rows(min_row=3, values_only=True):
        label = r[0].strip() if isinstance(r[0], str) else ""
        if label and not label.startswith("("):
            key = label.split(" (")[0].strip()
            code, name = STATES[key]
            cur = states[code] = {
                "name": name, "type": "brackets", "source": STATE_SOURCE, "year": YEAR,
                "brackets": {"single": [], "married": []},
                "standardDeduction": {"single": 0, "married": 0},
                "exemption": {"single": 0, "married": 0},
                "credit": {"single": 0, "married": 0},
            }
            if isinstance(r[1], str) and not blank(r[1]):
                cur["type"] = "none"  # "none" or "Capital gains income only" (no tax on wages)
                continue
            for field, col_single, col_married in (("standardDeduction", 7, 8), ("exemption", 9, 10)):
                for status, col in (("single", col_single), ("married", col_married)):
                    amount, is_credit = money(r[col])
                    cur["credit" if is_credit else field][status] += amount
        if cur is None or cur["type"] == "none":
            continue
        for status, rate_col, thr_col in (("single", 1, 3), ("married", 4, 6)):
            rate, thr = r[rate_col], r[thr_col]
            if isinstance(rate, (int, float)) and isinstance(thr, (int, float)):
                cur["brackets"][status].append([int(thr), round(float(rate), 6)])

    for code, s in states.items():
        if s["type"] == "brackets":
            if len(s["brackets"]["single"]) == 1:
                s["type"] = "flat"
            for status in ("single", "married"):
                if not s["brackets"][status]:
                    raise ValueError(f"{code}: no {status} brackets")
        else:
            for k in ("brackets", "standardDeduction", "exemption", "credit"):
                s.pop(k, None)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"year": YEAR, "federal": FEDERAL, "states": dict(sorted(states.items()))}, f, indent=1)
    counts = {t: sum(1 for s in states.values() if s["type"] == t) for t in ("none", "flat", "brackets")}
    print(f"wrote {OUT}: {len(states)} jurisdictions {counts}")


if __name__ == "__main__":
    main()
