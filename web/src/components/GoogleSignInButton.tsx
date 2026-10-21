import { Google_Sans } from "next/font/google";

const googleSans = Google_Sans({ weight: "500", subsets: ["latin"], display: "swap" });

/**
 * Google のブランドガイドラインに沿った「Google でログイン」ボタン。
 * G のロゴは公式素材（public/google-g.svg）をそのまま使い、色・余白はガイドラインの値（globals.css の btn-google）
 */
export function GoogleSignInButton({ href, label = "Google でログイン" }: { href: string; label?: string }) {
  return (
    <a href={href} className={`btn-google ${googleSans.className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 公式素材の SVG を加工せずに表示する */}
      <img src="/google-g.svg" alt="" width={20} height={20} />
      <span>{label}</span>
    </a>
  );
}
