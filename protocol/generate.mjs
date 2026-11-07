// protocol/mapwand.json から Web(TypeScript) と Firmware(C++) の定義を生成する。
//   node protocol/generate.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const def = JSON.parse(fs.readFileSync(path.join(root, 'protocol/mapwand.json'), 'utf8'));
const banner = 'AUTO-GENERATED from protocol/mapwand.json by protocol/generate.mjs. Do not edit.';

for (const it of def.items) {
  if (!it.en) throw new Error(`item needs an English label: ${it.key}`);
  for (const c of it.candidates) {
    if (!c.en) throw new Error(`candidate needs an English label: ${it.key}/${c.label}`);
    if (!/^[\x20-\x7e]{1,10}$/.test(c.short)) throw new Error(`short name must be ASCII <=10: ${c.short}`);
  }
}

// ---- TypeScript ----
const ts = `// ${banner}
export const PROTOCOL_VERSION = ${def.protocolVersion} as const;
export const DEVICE_NAME = ${JSON.stringify(def.deviceName)};
export const UUIDS = ${JSON.stringify(def.uuids, null, 2)} as const;
export const INPUT_SIZE = ${def.packet.inputSize};
export const STATE_SIZE = ${def.packet.stateSize};
export const InputType = ${JSON.stringify(def.inputType)} as const;
export const Button = ${JSON.stringify(def.button)} as const;
export const Action = ${JSON.stringify(def.action)} as const;
export const StateType = ${JSON.stringify(def.stateType)} as const;
export const StateFlag = ${JSON.stringify(def.stateFlag)} as const;
export const DeviceFlag = ${JSON.stringify(def.deviceFlag)} as const;
export const LONG_PRESS_MS = ${def.longPressMs};
export const ITEMS = ${JSON.stringify(def.items, null, 2)} as const;
export type ItemKey = (typeof ITEMS)[number]['key'];
`;
const tsPath = path.join(root, 'web/src/protocol/generated.ts');
fs.mkdirSync(path.dirname(tsPath), { recursive: true });
fs.writeFileSync(tsPath, ts);

// ---- C++ ----
const hex = (h) => '0x' + h.replace('#', '').toUpperCase();
const enumBlock = (name, obj) =>
  `enum ${name} : uint8_t {\n${Object.entries(obj).map(([k, v]) => `  ${name.toUpperCase()}_${k} = ${v},`).join('\n')}\n};`;
const items = def.items
  .map((it, i) => {
    const arr = it.candidates.map((c) => JSON.stringify(c.short)).join(', ');
    return `static const char* const ITEM${i}_CANDIDATES[] = {${arr}};`;
  })
  .join('\n');
const table = def.items
  .map((it, i) => `  {${JSON.stringify(it.short)}, ${hex(it.led)}, ${it.candidates.length}, ITEM${i}_CANDIDATES},`)
  .join('\n');
const h = `// ${banner}
#pragma once
#include <stdint.h>

namespace mapwand {

static const uint8_t PROTOCOL_VERSION = ${def.protocolVersion};
static const char* const DEVICE_NAME = ${JSON.stringify(def.deviceName)};
static const char* const SERVICE_UUID = ${JSON.stringify(def.uuids.service)};
static const char* const INPUT_UUID = ${JSON.stringify(def.uuids.input)};
static const char* const STATE_UUID = ${JSON.stringify(def.uuids.state)};
static const uint8_t INPUT_SIZE = ${def.packet.inputSize};
static const uint8_t STATE_SIZE = ${def.packet.stateSize};
static const uint32_t LONG_PRESS_MS = ${def.longPressMs};

${enumBlock('InputType', def.inputType)}
${enumBlock('Button', def.button)}
${enumBlock('Action', def.action)}
${enumBlock('StateType', def.stateType)}
${enumBlock('StateFlag', def.stateFlag)}
${enumBlock('DeviceFlag', def.deviceFlag)}

struct ItemDef {
  const char* name;
  uint32_t led;  // RGB888
  uint8_t count;
  const char* const* candidates;
};

${items}

static const uint8_t ITEM_COUNT = ${def.items.length};
static const ItemDef ITEMS[ITEM_COUNT] = {
${table}
};

}  // namespace mapwand
`;
const hPath = path.join(root, 'firmware/src/protocol_gen.h');
fs.mkdirSync(path.dirname(hPath), { recursive: true });
fs.writeFileSync(hPath, h);
console.log('generated', path.relative(root, tsPath), path.relative(root, hPath));
