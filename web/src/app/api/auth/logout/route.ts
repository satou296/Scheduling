import { NextResponse } from "next/server";
import { clearSession } from "@/lib/session";

export async function POST() {
  await clearSession();
  return NextResponse.redirect(`${process.env.APP_URL}/login`, 303);
}
