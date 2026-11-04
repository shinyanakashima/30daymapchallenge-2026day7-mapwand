#!/usr/bin/env bash
# pio run の出力を 1 つの書き込み用バイナリ（0x0 から書く）にまとめる
set -euo pipefail
cd "$(dirname "$0")/.."
B=.pio/build/m5stickc_plus
BOOT_APP0="$HOME/.platformio/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin"
OUT=prebuilt/mapwand-m5stickc-plus-merged.bin
mkdir -p prebuilt
python3 "$HOME/.platformio/packages/tool-esptoolpy/esptool.py" --chip esp32 merge_bin \
  --flash_mode dio --flash_freq 40m --flash_size 4MB -o "$OUT" \
  0x1000 "$B/bootloader.bin" 0x8000 "$B/partitions.bin" 0xe000 "$BOOT_APP0" 0x10000 "$B/firmware.bin"
sha256sum "$OUT" | tee "$OUT.sha256"
