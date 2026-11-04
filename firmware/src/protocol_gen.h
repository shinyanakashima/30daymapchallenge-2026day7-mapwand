// AUTO-GENERATED from protocol/mapwand.json by protocol/generate.mjs. Do not edit.
#pragma once
#include <stdint.h>

namespace mapwand {

static const uint8_t PROTOCOL_VERSION = 2;
static const char* const DEVICE_NAME = "MapWand";
static const char* const SERVICE_UUID = "84cff35f-c3ea-4542-bc50-29b53501e42a";
static const char* const INPUT_UUID = "dde87509-d227-40ae-944c-06743fffba6b";
static const char* const STATE_UUID = "073f0c86-ae4e-4130-bd76-9f56941e8e8e";
static const uint8_t INPUT_SIZE = 12;
static const uint8_t STATE_SIZE = 16;
static const uint32_t LONG_PRESS_MS = 800;

enum InputType : uint8_t {
  INPUTTYPE_ROTARY = 1,
  INPUTTYPE_BUTTON = 2,
  INPUTTYPE_SNAPSHOT = 3,
};
enum Button : uint8_t {
  BUTTON_NONE = 0,
  BUTTON_A = 1,
  BUTTON_B = 2,
  BUTTON_DIAL = 3,
};
enum Action : uint8_t {
  ACTION_NONE = 0,
  ACTION_SHORT = 1,
  ACTION_LONG = 2,
};
enum StateType : uint8_t {
  STATETYPE_STATE = 1,
};
enum StateFlag : uint8_t {
  STATEFLAG_PREVIEW = 1,
  STATEFLAG_TIMER_RUNNING = 2,
  STATEFLAG_OVERTIME = 4,
  STATEFLAG_SAVED = 8,
};
enum DeviceFlag : uint8_t {
  DEVICEFLAG_ENCODER_OK = 1,
};

struct ItemDef {
  const char* name;
  uint32_t led;  // RGB888
  uint8_t count;
  const char* const* candidates;
};

static const char* const ITEM0_CANDIDATES[] = {"DENSITY", "GROWTH", "HOUSEHOLD", "SEX RATIO", "AGING"};
static const char* const ITEM1_CANDIDATES[] = {"SHIRO", "WASHI", "YORU", "YUKI", "SHINBUN", "WAKAKUSA"};
static const char* const ITEM2_CANDIDATES[] = {"NONE", "PALE", "STANDARD", "BLANK", "HILLSHADE", "PHOTO"};
static const char* const ITEM3_CANDIDATES[] = {"KAKI", "AI", "YUYAKE", "WAKABA", "MURASAKI", "SUMI"};
static const char* const ITEM4_CANDIDATES[] = {"3 CLASS", "4 CLASS", "5 CLASS", "6 CLASS", "7 CLASS"};
static const char* const ITEM5_CANDIDATES[] = {"XFINE", "FINE", "NORMAL", "BOLD", "XBOLD"};
static const char* const ITEM6_CANDIDATES[] = {"NONE", "MAJOR", "ALL 47"};
static const char* const ITEM7_CANDIDATES[] = {"NONE", "CAPITALS", "CITIES", "RAILWAYS", "DID", "RAIL+CAP", "DID+RAIL", "ALL"};
static const char* const ITEM8_CANDIDATES[] = {"FULL", "WIDE", "CLOSE"};
static const char* const ITEM9_CANDIDATES[] = {"BY PREF", "JAPAN BY", "47 PREFS", "JP 2020"};
static const char* const ITEM10_CANDIDATES[] = {"SAVE", "BACK"};

static const uint8_t ITEM_COUNT = 11;
static const ItemDef ITEMS[ITEM_COUNT] = {
  {"DATA", 0xFF50B4, 5, ITEM0_CANDIDATES},
  {"STYLE", 0xC040FF, 6, ITEM1_CANDIDATES},
  {"BASE", 0xB07A3A, 6, ITEM2_CANDIDATES},
  {"COLOR", 0xFF7A00, 6, ITEM3_CANDIDATES},
  {"CLASS", 0x20D040, 5, ITEM4_CANDIDATES},
  {"LINE", 0x00C8D8, 5, ITEM5_CANDIDATES},
  {"LABEL", 0xFFD000, 3, ITEM6_CANDIDATES},
  {"LAYER", 0xA8FF3C, 8, ITEM7_CANDIDATES},
  {"FRAME", 0x3060FF, 3, ITEM8_CANDIDATES},
  {"TITLE", 0xFFFFFF, 4, ITEM9_CANDIDATES},
  {"FINISH", 0xFF2040, 2, ITEM10_CANDIDATES},
};

}  // namespace mapwand
