import { describe, expect, it } from "vitest";
import { ensureSessionSecret, generateSessionSecret, sessionSecretProblem } from "@/lib/session-secret";

describe("sessionSecretProblem", () => {
  it("未設定・空・初期値は問題あり", () => {
    expect(sessionSecretProblem(undefined)).toMatch("設定されていません");
    expect(sessionSecretProblem("")).toMatch("設定されていません");
    expect(sessionSecretProblem("change-me")).toMatch("初期値");
  });

  it("それ以外の値は問題なし", () => {
    expect(sessionSecretProblem(generateSessionSecret())).toBeNull();
  });
});

describe("ensureSessionSecret", () => {
  const example = 'DATABASE_URL="file:./dev.db"\nSESSION_SECRET="change-me"\nAPP_URL="http://localhost:3000"\n';

  it("初期値をランダムな値に置き換え、ほかの行は変えない", () => {
    const { text, changed } = ensureSessionSecret(example, "abc123");
    expect(changed).toBe(true);
    expect(text).toBe('DATABASE_URL="file:./dev.db"\nSESSION_SECRET="abc123"\nAPP_URL="http://localhost:3000"\n');
  });

  it("空の値も置き換える", () => {
    expect(ensureSessionSecret('SESSION_SECRET=""\n', "abc").text).toBe('SESSION_SECRET="abc"\n');
    expect(ensureSessionSecret("SESSION_SECRET=\n", "abc").text).toBe('SESSION_SECRET="abc"\n');
  });

  it("設定済みの値は変更しない", () => {
    const env = "SESSION_SECRET='already-set'\nDEV_LOGIN=\"true\"\n";
    expect(ensureSessionSecret(env, "abc")).toEqual({ text: env, changed: false });
  });

  it("行がなければ末尾に追加する", () => {
    expect(ensureSessionSecret('DEV_LOGIN="true"', "abc").text).toBe('DEV_LOGIN="true"\nSESSION_SECRET="abc"\n');
  });

  it("生成する値は 64 文字の16進数で、毎回異なる", () => {
    const a = generateSessionSecret();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(generateSessionSecret()).not.toBe(a);
  });
});
