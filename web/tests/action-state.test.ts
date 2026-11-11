import { describe, expect, it } from "vitest";
import { UserError, runAction } from "@/lib/action-state";

describe("runAction", () => {
  it("成功したらエラーなし", async () => {
    expect(await runAction(async () => {})).toEqual({});
  });

  it("UserError は理由を戻り値で返す（本番でも画面に表示できるように）", async () => {
    const state = await runAction(async () => {
      throw new UserError("開始時刻を過ぎた日時は候補にできません");
    });
    expect(state).toEqual({ error: "開始時刻を過ぎた日時は候補にできません" });
  });

  it("それ以外のエラー（redirect など）はそのまま投げる", async () => {
    const redirectLike = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/home;307;" });
    await expect(runAction(async () => Promise.reject(redirectLike))).rejects.toBe(redirectLike);
  });
});
