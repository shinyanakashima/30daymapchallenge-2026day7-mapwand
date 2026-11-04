#!/usr/bin/env bash
# 元データを data/raw/ へ取得する（data/raw は Git 管理外）
set -euo pipefail
cd "$(dirname "$0")/../raw"

# 令和2年国勢調査 人口等基本集計 第1-1表（e-Stat, statInfId=000032142402）
if [ ! -f t1-1.xlsx ]; then
  curl -fL -o t1-1.xlsx "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000032142402&fileKind=0"
fi

# 令和2年国勢調査 人口等基本集計 第2-3表（年齢3区分の人口構成比, statInfId=000032142406）
if [ ! -f t2-3.xlsx ]; then
  curl -fL -o t2-3.xlsx "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000032142406&fileKind=0"
fi

# 国土数値情報 鉄道データ N02 2020年度
if [ ! -f n02/N02-20_GML/N02-20_RailroadSection.shp ]; then
  curl -fL -o N02-20_GML.zip "https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-20/N02-20_GML.zip"
  unzip -o -q N02-20_GML.zip -d n02
fi

# 国土数値情報 人口集中地区データ A16 2020年
if [ ! -f a16/A16-20_00_DID.shp ]; then
  curl -fL -o A16-20_GML.zip "https://nlftp.mlit.go.jp/ksj/gml/data/A16/A16-20/A16-20_GML.zip"
  unzip -o -q A16-20_GML.zip -d a16
fi

# 国土数値情報 行政区域データ N03 2020年（令和2年1月1日時点）
if [ ! -f n03/N03-20_200101.shp ]; then
  curl -fL -o N03-20200101_GML.zip "https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2020/N03-20200101_GML.zip"
  unzip -o -q N03-20200101_GML.zip -d n03
fi
sha256sum t1-1.xlsx t2-3.xlsx N03-20200101_GML.zip N02-20_GML.zip A16-20_GML.zip 2>/dev/null || true
