"use client";

import { createContext, startTransition, useActionState } from "react";
import type { ActionState } from "@/lib/action-state";

/** ActionForm の送信中かどうか。SubmitButton が「処理中…」の表示に使う */
export const ActionPendingContext = createContext(false);

/**
 * Server Action の結果のエラー（UserError の文章）をフォームの下に表示するフォーム。
 * <form action> に渡すと React は処理のあとに入力欄を空に戻すため、エラーのときも入力が消えてしまう。
 * それを避けるため、送信は onSubmit で受けて自分で action を呼ぶ
 */
export function ActionForm({
  action,
  children,
  ...rest
}: Omit<React.FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit"> & {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      {...rest}
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        const form = new FormData(e.currentTarget, submitter);
        startTransition(() => formAction(form));
      }}
    >
      <ActionPendingContext value={pending}>{children}</ActionPendingContext>
      {state.error && (
        <p role="alert" className="notice-error w-full">
          {state.error}
        </p>
      )}
    </form>
  );
}
