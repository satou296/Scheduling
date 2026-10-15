export const STATUS_LABEL: Record<string, string> = {
  COLLECTING: "募集中",
  JUDGING: "判定中",
  AWAITING_CHOICE: "主催者の選択待ち",
  AWAITING_FALLBACK: "主催者の対応待ち",
  CONFIRMED: "確定",
  CANCELLED: "中止",
};

export const STATUS_CLASS: Record<string, string> = {
  COLLECTING: "bg-background text-foreground border border-border",
  JUDGING: "bg-background text-foreground border border-border",
  AWAITING_CHOICE: "bg-warn-bg text-warn",
  AWAITING_FALLBACK: "bg-warn-bg text-warn",
  CONFIRMED: "bg-ok-bg text-ok",
  CANCELLED: "bg-ng-bg text-ng",
};
