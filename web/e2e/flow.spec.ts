import { expect, test, type Browser, type Page } from "@playwright/test";

// グループ作成 → 招待リンクで参加（カレンダー連携／〇×手入力）→ 今すぐ判定 → 枠の選択 → 確定 → あとから参加、までを通しで確認する

async function newUser(
  browser: Browser,
  contextOptions: Parameters<Browser["newContext"]>[0],
  name: string,
  opts: { calendar?: boolean; busy?: [string, string]; allDay?: string } = {},
): Promise<Page> {
  const page = await (await browser.newContext(contextOptions)).newPage();
  await page.goto("/login");
  await page.getByPlaceholder("名前（例：たろう）").fill(name);
  await page.getByRole("button", { name: "開発用ユーザーでログイン" }).click();
  await page.waitForURL(/\/onboarding/);
  if (opts.calendar) {
    await page.getByRole("button", { name: "モックカレンダーを連携" }).click();
    await expect(page.getByText("連携済み（モック）")).toBeVisible();
  }
  await page.getByPlaceholder("住所（例：東京都渋谷区…）").fill("渋谷駅");
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await expect(page.getByText("標準", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "設定を完了する" }).click();
  await page.waitForURL(/\/home/);
  if (opts.busy) {
    await page.goto("/settings");
    await page.getByPlaceholder("予定名").fill("バイト");
    await page.locator('input[name="start"]').fill(opts.busy[0]);
    await page.locator('input[name="end"]').fill(opts.busy[1]);
    await page.locator("form", { has: page.locator('input[name="start"]') }).getByRole("button", { name: "追加" }).click();
    await expect(page.getByText("バイト")).toBeVisible();
  }
  if (opts.allDay) {
    await page.goto("/settings");
    const form = page.getByRole("form", { name: "終日の予定を追加" });
    await form.getByPlaceholder("終日の予定名").fill("旅行");
    await form.locator('input[name="startDate"]').fill(opts.allDay);
    await form.getByRole("button", { name: "終日の予定を追加" }).click();
    await expect(page.getByText("旅行")).toBeVisible();
  }
  return page;
}

async function fillSlot(page: Page, index: number, date: string, start: string, end: string) {
  const [y, m, d] = date.split("-");
  const year = page.getByRole("textbox", { name: "年" }).nth(index);
  await year.click();
  // 年4桁・月2桁で次の欄へ自動で移るので、欄を選び直さずに続けて打つだけで入力できる。
  // 2つ目の候補は「候補を追加」で前の日付がコピーされているが、そのまま打てば上書きされる
  await page.keyboard.type(`${y}${m}${d}`);
  await expect(page.getByRole("textbox", { name: "日" }).nth(index)).toBeFocused();
  await expect(page.locator('input[name="slot_date"]').nth(index)).toHaveValue(date);
  await page.locator('input[name="slot_start"]').nth(index).fill(start);
  await page.locator('input[name="slot_end"]').nth(index).fill(end);
}

test("調整の作成から確定、あとから参加まで", async ({ browser }, testInfo) => {
  const ctx = testInfo.project.use;
  // 再試行時も DB は共有なので、試行ごとに別のユーザー名にする
  const suffix = `${testInfo.project.name}-${testInfo.retry}`;

  // 主催者：新しいグループで調整を作成
  const org = await newUser(browser, ctx, `主催-${suffix}`, { calendar: true });
  await org.goto("/events/new");
  await org.locator('select[name="groupId"]').selectOption("");
  await org.getByPlaceholder("例：大学の友達").fill(`友達-${suffix}`);
  await org.getByPlaceholder("例：週末ボウリング").fill("週末ボウリング");
  await org.getByPlaceholder("例：渋谷駅 ハチ公前").fill("渋谷駅");
  await fillSlot(org, 0, "2099-11-07", "13:00", "16:00");
  await org.getByRole("button", { name: "＋ 候補を追加" }).click();
  await fillSlot(org, 1, "2099-11-08", "13:00", "16:00");
  await org.getByRole("button", { name: "作成する" }).click();
  await org.waitForURL(/\/events\/.+created=1/);
  const invite = await org.locator("input[readonly]").inputValue();
  const invitePath = new URL(invite).pathname;
  const eventUrl = new URL(org.url()).pathname;

  // カレンダー未連携のメンバー：〇×を入力してグループに参加
  const manual = await newUser(browser, ctx, `手入力-${suffix}`);
  await manual.goto(invitePath);
  await expect(manual.getByText("候補ごとに〇×を入力してください")).toBeVisible();
  const yes = manual.locator('input[value="yes"]');
  for (let i = 0; i < (await yes.count()); i++) await yes.nth(i).check();
  await manual.getByRole("button", { name: "このグループに参加する" }).click();
  await manual.waitForURL(/\/groups\//);

  // カレンダー連携済みのメンバー
  const linked = await newUser(browser, ctx, `連携-${suffix}`, { calendar: true });
  await linked.goto(invitePath);
  await linked.getByRole("button", { name: "このグループに参加する" }).click();
  await linked.waitForURL(/\/groups\//);

  // 主催者：今すぐ判定 → 全員OKが2枠 → 2つ目を選んで確定
  await org.goto(eventUrl);
  await expect(org.getByText("メンバー（3人）")).toBeVisible();
  await org.getByRole("button", { name: "今すぐ判定" }).click();
  await org.getByRole("link", { name: "枠を選ぶ" }).click();
  await org.waitForURL(/\/choose/);
  await org.locator('input[name="slotId"]').nth(1).check();
  await org.getByRole("button", { name: "この枠で確定する" }).click();
  await expect(org.getByText("予定が確定しました")).toBeVisible();
  await expect(org.getByText("あなたのGoogleカレンダーに登録済みです。")).toBeVisible();

  // 未連携のメンバー：カレンダーに追加するリンクと .ics
  await manual.goto(eventUrl);
  await expect(manual.getByRole("link", { name: "Googleカレンダーに追加" })).toHaveAttribute(
    "href",
    /calendar\.google\.com\/calendar\/render\?action=TEMPLATE/,
  );
  const ics = await manual.request.get(`${eventUrl}/ics`);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  expect(await ics.text()).toContain("BEGIN:VEVENT");

  // あとから参加：確定枠の日に終日の予定があるので不参加
  const late = await newUser(browser, ctx, `後から-${suffix}`, { calendar: true, allDay: "2099-11-08" });
  await late.goto(invitePath);
  await late.getByRole("button", { name: "このグループに参加する" }).click();
  await late.waitForURL(/\/groups\//);
  await late.goto(eventUrl);
  await expect(late.locator("li.badge", { hasText: `後から-${suffix}` })).toContainText("不参加");

  // 同じグループで2回目の調整：グループのメンバー全員が参加者になる
  await org.goto("/home");
  await org.getByRole("link", { name: `友達-${suffix}` }).click();
  await org.getByRole("link", { name: "＋ このグループで調整を作成" }).click();
  await org.getByPlaceholder("例：週末ボウリング").fill("カラオケ");
  await org.getByPlaceholder("例：渋谷駅 ハチ公前").fill("渋谷駅");
  await fillSlot(org, 0, "2099-12-01", "18:00", "20:00");
  await org.getByRole("button", { name: "作成する" }).click();
  await org.waitForURL(/\/events\/.+created=1/);
  await expect(org.getByText("メンバー（4人）")).toBeVisible();

  // 横スクロールが発生していない（スマホ表示）。失敗時ははみ出している要素を表示する
  const { overflow, offenders } = await org.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return {
      overflow: document.documentElement.scrollWidth - width,
      offenders: [...document.querySelectorAll("body *")]
        .filter((el) => el.getBoundingClientRect().right > width + 0.5)
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}.${el.className} (right=${Math.round(el.getBoundingClientRect().right)})`),
    };
  });
  expect(overflow, `画面幅からはみ出している要素: ${offenders.join(" / ")}`).toBeLessThanOrEqual(0);
});
