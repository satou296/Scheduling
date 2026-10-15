import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { devLoginEnabled } from "@/lib/session";
import { formatDateTime } from "@/lib/time";

// 開発用：送信（またはSMTP未設定で記録のみ）されたメールの一覧
export default async function DevMailsPage() {
  if (!devLoginEnabled()) notFound();
  const mails = await prisma.mailLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">送信メール（開発用）</h1>
      {mails.length === 0 && <p className="card text-sm text-muted">まだありません。</p>}
      {mails.map((m) => (
        <article key={m.id} className="card space-y-1">
          <p className="text-xs text-muted">
            {formatDateTime(m.createdAt)} ・ {m.to} ・ {m.sent ? "送信済み" : "未送信（記録のみ）"}
          </p>
          <p className="font-semibold">{m.subject}</p>
          <pre className="text-sm whitespace-pre-wrap">{m.body}</pre>
        </article>
      ))}
    </div>
  );
}
