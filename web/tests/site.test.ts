import { describe, expect, it } from "vitest";
import { operator } from "@/lib/site";

describe("operator", () => {
  it("環境変数から運営者名と問い合わせ先を読む（前後の空白は除く）", () => {
    expect(operator({ OPERATOR_NAME: " 調整しよう運営 ", SUPPORT_EMAIL: "support@example.com" })).toEqual({
      name: "調整しよう運営",
      email: "support@example.com",
    });
  });

  it("未設定や空文字は null（プライバシーポリシーに未設定の警告を出す）", () => {
    expect(operator({})).toEqual({ name: null, email: null });
    expect(operator({ OPERATOR_NAME: "", SUPPORT_EMAIL: "  " })).toEqual({ name: null, email: null });
  });
});
