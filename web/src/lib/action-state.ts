/**
 * フォームの送信（Server Actions）の結果。
 * 本番では、サーバーで投げたエラーの文章は画面に届かない（Next.js が共通のメッセージに置き換える）。
 * 入力の誤りなど利用者に理由を見せたいエラーは UserError で投げ、runAction で戻り値に変えて ActionForm に表示する。
 */
export type ActionState = { error?: string };

/** 利用者に理由を見せるエラー（入力の誤り、操作の間に状態が変わった場合など） */
export class UserError extends Error {}

/**
 * fn を実行し、UserError を { error } に変える。
 * redirect() などそれ以外のエラーはそのまま投げる（redirect は例外で遷移するため、握りつぶさない）
 */
export async function runAction(fn: () => Promise<void>): Promise<ActionState> {
  try {
    await fn();
    return {};
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    throw e;
  }
}
