"""Wikidata（CC0）から県庁所在都市と人口50万以上の市の代表点を取得する。

出力: data/processed/places_wikidata.json（取得結果をそのまま保存し、以降の加工はこのファイルから行う）
- 都道府県（P31=Q50337）の P36（首都・所在地）とその P625（座標）
- 全国地方公共団体コード（P429）の上5桁で指定した市の P625

座標は各市の代表点（多くは市役所付近）で、庁舎の位置そのものではない。
"""
import json
import pathlib
import re
import unicodedata
import sys
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "data/processed/places_wikidata.json"
UA = "MapWand-data-build/0.1 (https://github.com/shinyanakashima/30daymapchallenge-2026day7-mapwand)"


def sparql(q: str):
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q})
    req = urllib.request.Request(url, headers={"Accept": "application/sparql-results+json", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)["results"]["bindings"]


def point(wkt: str):
    lon, lat = wkt.replace("Point(", "").replace(")", "").split()
    return [round(float(lon), 5), round(float(lat), 5)]


def en_name(b, key: str) -> str:
    """英語ラベル。都道府県名の表記に合わせ、県名付き（「Kawaguchi, Saitama」）・「-shi」・長音記号を外す"""
    v = b.get(key, {}).get("value", "").split(",")[0].strip()
    v = re.sub(r"-shi$", "", v)
    return "".join(ch for ch in unicodedata.normalize("NFKD", v) if not unicodedata.combining(ch))


def main(city_codes: list[str]) -> int:
    caps = sparql(
        """SELECT ?pref ?code ?cap ?capLabel ?capEn ?coord WHERE {
          ?pref wdt:P31 wd:Q50337 ; wdt:P429 ?code ; wdt:P36 ?cap .
          OPTIONAL { ?cap rdfs:label ?capEn . FILTER(LANG(?capEn) = "en") }
          ?cap p:P625 ?st . ?st ps:P625 ?coord . ?st wikibase:rank ?rank .
          FILTER(?rank != wikibase:DeprecatedRank)
          SERVICE wikibase:label { bd:serviceParam wikibase:language "ja". }
        } ORDER BY ?code"""
    )
    capitals = {}
    for b in caps:
        pc = b["code"]["value"][:2]
        if pc in capitals:
            continue  # 複数の座標があるときは最初の 1 件
        capitals[pc] = {
            "pref": pc,
            "name": b["capLabel"]["value"],
            "name_en": en_name(b, "capEn"),
            "wikidata": b["cap"]["value"].rsplit("/", 1)[1],
            "lonlat": point(b["coord"]["value"]),
        }
    values = " ".join(f'"{c}"' for c in city_codes)
    rows = sparql(
        f"""SELECT ?city ?code ?cityLabel ?cityEn ?coord WHERE {{
          VALUES ?c5 {{ {values} }}
          OPTIONAL {{ ?city rdfs:label ?cityEn . FILTER(LANG(?cityEn) = "en") }}
          ?city wdt:P429 ?code . FILTER(STRSTARTS(?code, ?c5) && STRLEN(?code) = 6)
          ?city p:P625 ?st . ?st ps:P625 ?coord . ?st wikibase:rank ?rank .
          FILTER(?rank != wikibase:DeprecatedRank)
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "ja". }}
        }} ORDER BY ?code"""
    )
    cities = {}
    for b in rows:
        c5 = b["code"]["value"][:5]
        if c5 in cities:
            continue
        cities[c5] = {
            "code": c5,
            "name": b["cityLabel"]["value"],
            "name_en": en_name(b, "cityEn"),
            "wikidata": b["city"]["value"].rsplit("/", 1)[1],
            "lonlat": point(b["coord"]["value"]),
        }
    doc = {
        "source": "Wikidata (CC0)",
        "endpoint": "https://query.wikidata.org/sparql",
        "capitals": [capitals[k] for k in sorted(capitals)],
        "cities": [cities[k] for k in sorted(cities)],
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    no_en = [x["name"] for x in [*capitals.values(), *cities.values()] if not x["name_en"]]
    if no_en:
        print("英語名がない地点:", no_en, file=sys.stderr)
        return 1
    missing = [c for c in city_codes if c not in cities]
    print(f"capitals {len(capitals)}/47, cities {len(cities)}/{len(city_codes)} missing={missing}")
    return 0 if len(capitals) == 47 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
