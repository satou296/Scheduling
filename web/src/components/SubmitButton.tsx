"use client";

import { useContext } from "react";
import { useFormStatus } from "react-dom";
import { ActionPendingContext } from "@/components/ActionForm";

export function SubmitButton({
  children,
  className = "btn-primary",
  pendingText = "処理中…",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  // <form action> のときは useFormStatus、ActionForm のときはその送信状態を使う
  const status = useFormStatus();
  const actionPending = useContext(ActionPendingContext);
  const pending = status.pending || actionPending;
  return (
    <button type="submit" className={className} disabled={pending || rest.disabled} {...rest}>
      {pending ? pendingText : children}
    </button>
  );
}
