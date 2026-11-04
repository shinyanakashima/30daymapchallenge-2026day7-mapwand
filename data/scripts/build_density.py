"""令和2年国勢調査 第1-1表(xlsx)から都道府県別の人口・面積・人口密度を抽出する。

入力 : data/raw/t1-1.xlsx
出力 : data/processed/density_2020.json, data/processed/density_2020.csv

人口密度は表に掲載された値（1km2当たり、調査対象外地域の面積を除いて統計局が算出）を
そのまま採用し、境界ポリゴンの面積からは計算しない。
"""
import csv
import hashlib
import json
import pathlib
import sys

import openpyxl

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "data/raw/t1-1.xlsx"
OUT = ROOT / "data/processed"

HEADER_ROW = 9  # 0始まり。項目名の行
UNIT_ROW = 13


def main() -> int:
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    head = rows[HEADER_ROW]
    unit = rows[UNIT_ROW]
    col_pop = 7  # 人口 / 0_総数
    col_area = head.index("面積（参考）")
    col_dens = head.index("人口密度")
    assert head[col_pop] == "人口" and rows[12][col_pop] == "0_総数", head
    assert unit[col_area] == "km2" and unit[col_dens] == "1km2当たり", unit

    prefs = []
    national = None
    for r in rows[UNIT_ROW + 2:]:
        if not r or r[0] is None:
            continue
        code5 = str(r[5])
        # 2020年地域コードが XX000 の行 = 全国・都道府県
        if r[0] != "a" or not code5.endswith("000"):
            continue
        name = str(r[6]).split("_", 1)[1]
        rec = {
            "code": code5[:2],
            "name": name,
            "population": int(r[col_pop]),
            "area_km2": float(r[col_area]),
            "density": float(r[col_dens]),
        }
        if rec["code"] == "00":
            national = rec
        else:
            prefs.append(rec)

    codes = [p["code"] for p in prefs]
    if len(prefs) != 47 or codes != [f"{i:02d}" for i in range(1, 48)]:
        print("都道府県の抽出件数・コードが不正:", codes, file=sys.stderr)
        return 1
    if any(p["density"] is None or p["density"] <= 0 for p in prefs):
        print("人口密度の欠損があります", file=sys.stderr)
        return 1
    total = sum(p["population"] for p in prefs)
    assert national and total == national["population"], (total, national)

    OUT.mkdir(parents=True, exist_ok=True)
    sha = hashlib.sha256(SRC.read_bytes()).hexdigest()
    doc = {
        "source": "総務省統計局「令和2年国勢調査 人口等基本集計」第1-1表",
        "statInfId": "000032142402",
        "url": "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000032142402&fileKind=0",
        "reference_date": "2020-10-01",
        "unit": "人/km2",
        "source_sha256": sha,
        "national": national,
        "prefectures": prefs,
    }
    (OUT / "density_2020.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    with open(OUT / "density_2020.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["code", "name", "population", "area_km2", "density_per_km2"])
        for p in prefs:
            w.writerow([p["code"], p["name"], p["population"], p["area_km2"], p["density"]])
    print(f"ok: {len(prefs)} prefectures, national density {national['density']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
