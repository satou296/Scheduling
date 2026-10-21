import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { getCurrentUser } from "@/lib/session";
import { APP_NAME } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
  description: "候補を入れるだけで、みんなの予定を自動で決めるアプリ",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3">
            <Link href={user ? "/home" : "/"} className="font-bold whitespace-nowrap">
              {APP_NAME}
            </Link>
            {user && (
              <nav className="flex items-center gap-0.5 text-xs whitespace-nowrap sm:gap-3 sm:text-sm">
                <Link href="/home" className="rounded px-1.5 py-1 hover:bg-background">
                  ホーム
                </Link>
                <Link href="/events/new" className="rounded px-1.5 py-1 hover:bg-background">
                  調整を作成
                </Link>
                <Link href="/settings" className="rounded px-1.5 py-1 hover:bg-background">
                  設定
                </Link>
                <form action="/api/auth/logout" method="post">
                  <button className="rounded px-1.5 py-1 text-muted hover:bg-background">ログアウト</button>
                </form>
              </nav>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
