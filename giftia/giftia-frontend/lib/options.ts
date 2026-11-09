// lib/options.ts — 贈る相手とシーンの選択肢
// API（backend/main.py の RECIPIENTS・SCENES）と同じ値にする
export const RECIPIENT_OPTIONS = [
  { value: "", label: "指定なし" },
  { value: "mother", label: "母（義母を含む）" },
] as const;
export const SCENE_OPTIONS = ["誕生日", "送別", "お礼", "母の日", "お歳暮", "お中元", "結婚祝い", "父の日", "出産祝い"] as const;
