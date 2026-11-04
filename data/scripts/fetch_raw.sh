#!/usr/bin/env bash
# 元データを data/raw/ へ取得する（data/raw は Git 管理外）
set -euo pipefail
cd "$(dirname "$0")/../raw"

# 令和2年国勢調査 人口等基本集計 第1-1表（e-Stat, statInfId=000032142402）
if [ ! -f t1-1.xlsx ]; then
  curl -fL -o t1-1.xlsx "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000032142402&fileKind=0"
fi

# 国土数値情報 行政区域データ N03 2020年（令和2年1月1日時点）
if [ ! -f n03/N03-20_200101.shp ]; then
  curl -fL -o N03-20200101_GML.zip "https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2020/N03-20200101_GML.zip"
  unzip -o -q N03-20200101_GML.zip -d n03
fi
sha256sum t1-1.xlsx N03-20200101_GML.zip 2>/dev/null || true
