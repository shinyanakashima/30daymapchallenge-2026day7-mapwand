// AUTO-GENERATED from protocol/mapwand.json by protocol/generate.mjs. Do not edit.
export const PROTOCOL_VERSION = 2 as const;
export const DEVICE_NAME = "MapWand";
export const UUIDS = {
  "service": "84cff35f-c3ea-4542-bc50-29b53501e42a",
  "input": "dde87509-d227-40ae-944c-06743fffba6b",
  "state": "073f0c86-ae4e-4130-bd76-9f56941e8e8e"
} as const;
export const INPUT_SIZE = 12;
export const STATE_SIZE = 16;
export const InputType = {"ROTARY":1,"BUTTON":2,"SNAPSHOT":3} as const;
export const Button = {"NONE":0,"A":1,"B":2,"DIAL":3} as const;
export const Action = {"NONE":0,"SHORT":1,"LONG":2} as const;
export const StateType = {"STATE":1} as const;
export const StateFlag = {"PREVIEW":1,"TIMER_RUNNING":2,"OVERTIME":4,"SAVED":8} as const;
export const DeviceFlag = {"ENCODER_OK":1} as const;
export const LONG_PRESS_MS = 800;
export const ITEMS = [
  {
    "key": "data",
    "label": "データ",
    "short": "DATA",
    "led": "#ff50b4",
    "candidates": [
      {
        "label": "人口密度",
        "short": "DENSITY"
      },
      {
        "label": "人口増減率",
        "short": "GROWTH"
      },
      {
        "label": "平均世帯人員",
        "short": "HOUSEHOLD"
      },
      {
        "label": "人口性比",
        "short": "SEX RATIO"
      },
      {
        "label": "高齢化率",
        "short": "AGING"
      }
    ]
  },
  {
    "key": "style",
    "label": "スタイル",
    "short": "STYLE",
    "led": "#c040ff",
    "candidates": [
      {
        "label": "白地",
        "short": "SHIRO"
      },
      {
        "label": "和紙",
        "short": "WASHI"
      },
      {
        "label": "夜",
        "short": "YORU"
      },
      {
        "label": "雪",
        "short": "YUKI"
      },
      {
        "label": "新聞",
        "short": "SHINBUN"
      },
      {
        "label": "若草",
        "short": "WAKAKUSA"
      }
    ]
  },
  {
    "key": "base",
    "label": "ベースマップ",
    "short": "BASE",
    "led": "#b07a3a",
    "candidates": [
      {
        "label": "なし",
        "short": "NONE"
      },
      {
        "label": "淡色地図",
        "short": "PALE"
      },
      {
        "label": "標準地図",
        "short": "STANDARD"
      },
      {
        "label": "白地図",
        "short": "BLANK"
      },
      {
        "label": "陰影起伏図",
        "short": "HILLSHADE"
      },
      {
        "label": "写真",
        "short": "PHOTO"
      }
    ]
  },
  {
    "key": "color",
    "label": "配色",
    "short": "COLOR",
    "led": "#ff7a00",
    "candidates": [
      {
        "label": "柿",
        "short": "KAKI"
      },
      {
        "label": "藍",
        "short": "AI"
      },
      {
        "label": "夕焼",
        "short": "YUYAKE"
      },
      {
        "label": "若葉",
        "short": "WAKABA"
      },
      {
        "label": "紫",
        "short": "MURASAKI"
      },
      {
        "label": "墨",
        "short": "SUMI"
      }
    ]
  },
  {
    "key": "classes",
    "label": "階級",
    "short": "CLASS",
    "led": "#20d040",
    "candidates": [
      {
        "label": "3階級",
        "short": "3 CLASS"
      },
      {
        "label": "4階級",
        "short": "4 CLASS"
      },
      {
        "label": "5階級",
        "short": "5 CLASS"
      },
      {
        "label": "6階級",
        "short": "6 CLASS"
      },
      {
        "label": "7階級",
        "short": "7 CLASS"
      }
    ]
  },
  {
    "key": "line",
    "label": "境界線",
    "short": "LINE",
    "led": "#00c8d8",
    "candidates": [
      {
        "label": "極細",
        "short": "XFINE"
      },
      {
        "label": "細",
        "short": "FINE"
      },
      {
        "label": "標準",
        "short": "NORMAL"
      },
      {
        "label": "太",
        "short": "BOLD"
      },
      {
        "label": "極太",
        "short": "XBOLD"
      }
    ]
  },
  {
    "key": "label",
    "label": "地名",
    "short": "LABEL",
    "led": "#ffd000",
    "candidates": [
      {
        "label": "地名なし",
        "short": "NONE"
      },
      {
        "label": "主要地名",
        "short": "MAJOR"
      },
      {
        "label": "全都道府県名",
        "short": "ALL 47"
      }
    ]
  },
  {
    "key": "layer",
    "label": "レイヤー",
    "short": "LAYER",
    "led": "#a8ff3c",
    "candidates": [
      {
        "label": "なし",
        "short": "NONE"
      },
      {
        "label": "県庁所在地",
        "short": "CAPITALS"
      },
      {
        "label": "主要都市の人口",
        "short": "CITIES"
      },
      {
        "label": "鉄道",
        "short": "RAILWAYS"
      },
      {
        "label": "人口集中地区",
        "short": "DID"
      },
      {
        "label": "鉄道＋県庁所在地",
        "short": "RAIL+CAP"
      },
      {
        "label": "人口集中地区＋鉄道",
        "short": "DID+RAIL"
      },
      {
        "label": "すべて",
        "short": "ALL"
      }
    ]
  },
  {
    "key": "frame",
    "label": "構図",
    "short": "FRAME",
    "led": "#3060ff",
    "candidates": [
      {
        "label": "全景",
        "short": "FULL"
      },
      {
        "label": "余白広め",
        "short": "WIDE"
      },
      {
        "label": "寄り",
        "short": "CLOSE"
      }
    ]
  },
  {
    "key": "title",
    "label": "タイトル",
    "short": "TITLE",
    "led": "#ffffff",
    "candidates": [
      {
        "label": "都道府県別 {指標}",
        "short": "BY PREF"
      },
      {
        "label": "{指標}でみる日本",
        "short": "JAPAN BY"
      },
      {
        "label": "47都道府県の{指標}",
        "short": "47 PREFS"
      },
      {
        "label": "日本の{指標} 2020",
        "short": "JP 2020"
      }
    ]
  },
  {
    "key": "finish",
    "label": "仕上げ",
    "short": "FINISH",
    "led": "#ff2040",
    "candidates": [
      {
        "label": "保存する",
        "short": "SAVE"
      },
      {
        "label": "編集へ戻る",
        "short": "BACK"
      }
    ]
  }
] as const;
export type ItemKey = (typeof ITEMS)[number]['key'];
