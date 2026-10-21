import Link from "next/link";
import { APP_NAME } from "@/lib/site";

/** 全ページ共通のフッター。プライバシーポリシーへのリンクは Google の審査の要件 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted">
        <span>{APP_NAME}</span>
        <Link href="/privacy" className="underline hover:text-foreground">
          プライバシーポリシー
        </Link>
      </div>
    </footer>
  );
}
