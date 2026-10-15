import { completeOnboarding } from "@/app/actions";
import { CalendarLink } from "@/components/CalendarLink";
import { OriginList } from "@/components/OriginList";
import { SubmitButton } from "@/components/SubmitButton";
import { TravelModeSelect } from "@/components/TravelModeSelect";
import { prisma } from "@/lib/db";
import { requireUser, safeNext } from "@/lib/session";

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  const user = await requireUser("/onboarding");
  const origins = await prisma.origin.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  const self = `/onboarding?next=${encodeURIComponent(next)}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">はじめに設定しましょう</h1>
        <p className="mt-1 text-sm text-muted">あとから「設定」でいつでも変更できます。</p>
      </div>

      {sp.calendar === "denied" && (
        <p className="notice-warn">カレンダーの権限が許可されませんでした。〇×の手入力で参加できます。</p>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold">1. Googleカレンダー連携</h2>
        <CalendarLink user={user} returnTo={self} />
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">2. 出発地点</h2>
        <p className="text-sm text-muted">集合場所までの移動時間の計算に使います。他のメンバーには表示されません。</p>
        <OriginList origins={origins} path={self} />
      </section>

      <form action={completeOnboarding} className="card space-y-3">
        <h2 className="font-semibold">3. 移動手段</h2>
        <TravelModeSelect value={user.travelMode} />
        <input type="hidden" name="next" value={next} />
        <div className="pt-2">
          <SubmitButton>設定を完了する</SubmitButton>
        </div>
      </form>
    </div>
  );
}
