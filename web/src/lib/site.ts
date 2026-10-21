export const APP_NAME = "調整しよう";

// プライバシーポリシーの制定日・改定日。Google のデータの扱いを変えたら、ページと一緒に更新する
export const PRIVACY_UPDATED_AT = "2026年10月21日";

export const API_SERVICES_USER_DATA_POLICY_URL = "https://developers.google.com/terms/api-services-user-data-policy";
export const GOOGLE_CONNECTIONS_URL = "https://myaccount.google.com/connections";

export type Operator = { name: string | null; email: string | null };

/**
 * 運営者の情報（プライバシーポリシーと問い合わせ先に表示）。
 * 個人名やメールアドレスをリポジトリに書かないよう、環境変数で設定する
 */
export function operator(env: Record<string, string | undefined> = process.env): Operator {
  return {
    name: env.OPERATOR_NAME?.trim() || null,
    email: env.SUPPORT_EMAIL?.trim() || null,
  };
}
