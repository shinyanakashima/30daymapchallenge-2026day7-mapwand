"""令和2年国勢調査 人口等基本集計から、都道府県別の指標と主要都市の人口を抽出する。

入力 : data/raw/t1-1.xlsx（第1-1表）, data/raw/t2-3.xlsx（第2-3表）
出力 : data/processed/stats_2020.json, data/processed/stats_2020.csv

指標はすべて統計表に掲載された値をそのまま使う（平均世帯人員のみ表の 2 列から計算）。
境界ポリゴンの面積などからは計算しない。欠損があれば処理を止める。
"""
import csv
import hashlib
import json
import pathlib
import sys

import openpyxl

ROOT = pathlib.Path(__file__).resolve().parents[2]
RAW = ROOT / "data/raw"
OUT = ROOT / "data/processed"
CITY_MIN = 500_000  # 主要都市：人口 50 万以上の市と東京都特別区部

# 都道府県の英語名（ヘボン式ローマ字、長音記号なし）
PREF_EN = [
    "Hokkaido", "Aomori", "Iwate", "Miyagi", "Akita", "Yamagata", "Fukushima", "Ibaraki", "Tochigi", "Gunma",
    "Saitama", "Chiba", "Tokyo", "Kanagawa", "Niigata", "Toyama", "Ishikawa", "Fukui", "Yamanashi", "Nagano",
    "Gifu", "Shizuoka", "Aichi", "Mie", "Shiga", "Kyoto", "Osaka", "Hyogo", "Nara", "Wakayama",
    "Tottori", "Shimane", "Okayama", "Hiroshima", "Yamaguchi", "Tokushima", "Kagawa", "Ehime", "Kochi", "Fukuoka",
    "Saga", "Nagasaki", "Kumamoto", "Oita", "Miyazaki", "Kagoshima", "Okinawa",
]

INDICATORS = [
    {
        "key": "density", "label": "人口密度", "unit": "人/km²", "digits": 1, "diverging": None,
        "table": "第1-1表", "column": "人口密度（1km2当たり）",
        "note": "面積は国土地理院「令和2年全国都道府県市区町村別面積調（10月1日時点）」。調査対象外とした地域の面積を除いて算出",
        "en": {"label": "Population density", "unit": "people/km²", "table": "Table 1-1", "note": "Area from GSI's 2020 area survey (Oct 1), excluding areas outside the census"},
    },
    {
        "key": "growth", "label": "人口増減率", "unit": "%", "digits": 2, "diverging": 0,
        "table": "第1-1表", "column": "5年間の人口増減率（2015年→2020年、2015年は2020年の境域に組み替えた値）",
        "note": "2015年→2020年の5年間",
        "en": {"label": "Population change", "unit": "%", "table": "Table 1-1", "note": "Change over the five years 2015–2020"},
    },
    {
        "key": "household", "label": "平均世帯人員", "unit": "人/世帯", "digits": 2, "diverging": None,
        "table": "第1-1表", "column": "一般世帯人員 ÷ 一般世帯数",
        "note": "一般世帯の1世帯当たり人員（施設等の世帯を除く）",
        "en": {"label": "Household size", "unit": "persons/household", "table": "Table 1-1", "note": "Persons per private household (institutional households excluded)"},
    },
    {
        "key": "sexratio", "label": "人口性比", "unit": "女性100人当たり男性", "digits": 1, "diverging": None,
        "table": "第1-1表", "column": "人口性比",
        "note": "女性100人に対する男性の数",
        "en": {"label": "Sex ratio", "unit": "males per 100 females", "table": "Table 1-1", "note": "Males per 100 females"},
    },
    {
        "key": "aging", "label": "高齢化率", "unit": "%", "digits": 1, "diverging": None,
        "table": "第2-3表", "column": "人口構成比［年齢別］65歳以上（国籍総数・男女総数）",
        "note": "65歳以上人口の割合。年齢「不詳」を除いて算出",
        "en": {"label": "Aging rate", "unit": "% aged 65+", "table": "Table 2-3", "note": "Share of people aged 65 and over, excluding unknown age"},
    },
]


def sha(p: pathlib.Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def read_t11():
    ws = openpyxl.load_workbook(RAW / "t1-1.xlsx", read_only=True, data_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    head, sub, unit = rows[9], rows[12], rows[13]
    # 列の位置を見出しで確認する
    c = {
        "pop": 7, "growth": head.index("5年間の人口増減率"), "sexratio": head.index("人口性比"),
        "area": head.index("面積（参考）"), "density": head.index("人口密度"),
        "hh_general": 17, "pp_general": 23,
    }
    assert head[c["pop"]] == "人口" and sub[c["pop"]] == "0_総数"
    assert head[c["hh_general"]] == "世帯数" and sub[c["hh_general"]] == "1_一般世帯"
    assert head[c["pp_general"]] == "世帯人員" and sub[c["pp_general"]] == "1_一般世帯"
    assert unit[c["density"]] == "1km2当たり" and unit[c["growth"]] == "％"
    prefs, national, cities = {}, None, []
    for r in rows[15:]:
        if not r or r[0] is None:
            continue
        code5, name = str(r[5]), str(r[6]).split("_", 1)[1]
        if r[0] == "a" and code5.endswith("000"):
            rec = {
                "code": code5[:2], "name": name, "population": int(r[c["pop"]]),
                "name_en": PREF_EN[int(code5[:2]) - 1] if code5[:2] != "00" else "Japan",
                "area_km2": float(r[c["area"]]),
                "density": float(r[c["density"]]),
                "growth": round(float(r[c["growth"]]), 3),
                "sexratio": round(float(r[c["sexratio"]]), 2),
                "household": round(r[c["pp_general"]] / r[c["hh_general"]], 3),
            }
            if rec["code"] == "00":
                national = rec
            else:
                prefs[rec["code"]] = rec
        elif (r[0] in ("1", "2") or code5 == "13100") and isinstance(r[7], int) and r[7] >= CITY_MIN:
            cities.append({
                "code": code5,
                "name": "東京23区" if code5 == "13100" else name,
                "population": r[7],
            })
    return prefs, national, cities


def read_t23(prefs, national):
    ws = openpyxl.load_workbook(RAW / "t2-3.xlsx", read_only=True, data_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    col = rows[8].index("3_65歳以上")
    assert rows[5][col] == "人口構成比［年齢別］" and rows[9][col] == "％"
    seen = 0
    for r in rows[11:]:
        if not r or r[0] != "0_国籍総数" or r[1] != "0_総数" or r[2] != "a":
            continue
        code = str(r[3])[:2]
        v = round(float(r[col]), 2)
        if code == "00":
            national["aging"] = v
        elif code in prefs:
            prefs[code]["aging"] = v
            seen += 1
    assert seen == 47, seen


def main() -> int:
    prefs, national, cities = read_t11()
    if sorted(prefs) != [f"{i:02d}" for i in range(1, 48)]:
        print("都道府県の抽出件数・コードが不正", file=sys.stderr)
        return 1
    assert sum(p["population"] for p in prefs.values()) == national["population"]
    read_t23(prefs, national)
    for p in prefs.values():
        for ind in INDICATORS:
            v = p.get(ind["key"])
            if not isinstance(v, float) or v != v:
                print("欠損:", p["name"], ind["key"], file=sys.stderr)
                return 1
    # 一般世帯の平均人員（全国）
    doc = {
        "survey": "令和2年国勢調査 人口等基本集計（総務省統計局）",
        "reference_date": "2020-10-01",
        "sources": [
            {"table": "第1-1表", "statInfId": "000032142402",
             "url": "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000032142402&fileKind=0",
             "sha256": sha(RAW / "t1-1.xlsx")},
            {"table": "第2-3表", "statInfId": "000032142406",
             "url": "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000032142406&fileKind=0",
             "sha256": sha(RAW / "t2-3.xlsx")},
        ],
        "indicators": INDICATORS,
        "national": national,
        "prefectures": [prefs[k] for k in sorted(prefs)],
        "cities": {"min_population": CITY_MIN, "items": cities},
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "stats_2020.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    keys = ["code", "name", "population", "area_km2"] + [i["key"] for i in INDICATORS]
    with open(OUT / "stats_2020.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(keys)
        for k in sorted(prefs):
            w.writerow([prefs[k][x] for x in keys])
    print(f"ok: 47 prefectures x {len(INDICATORS)} indicators, {len(cities)} cities >= {CITY_MIN}")
    for ind in INDICATORS:
        vs = sorted((p[ind['key']], p['name']) for p in prefs.values())
        print(f"  {ind['key']}: {vs[0]} .. {vs[-1]} national={national.get(ind['key'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
