import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { attachPaidStoryStartsToUser } from "@/lib/story-checkout-fulfillment";

function safeNext(value: string | null) {
  return value === "/dashboard" ? value : "/dashboard";
}

function trustedAppOrigin() {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").origin;
  } catch {
    return "http://localhost:3000";
  }
}

function privateRedirect(path: string) {
  const response = NextResponse.redirect(new URL(path, trustedAppOrigin()));
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const supabase = await createSupabaseServerClient();

  let error: Error | null = null;
  if (tokenHash && type) {
    const result = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    error = result.error;
  } else if (code) {
    const result = await supabase.auth.exchangeCodeForSession(code);
    error = result.error;
  } else {
    error = new Error("Missing confirmation token.");
  }

  if (error) {
    return privateRedirect("/login?confirmation=invalid");
  }

  const { data } = await supabase.auth.getUser();
  if (data.user?.email_confirmed_at && data.user.email) {
    await attachPaidStoryStartsToUser(data.user.id, data.user.email);
  }

  return privateRedirect(next);
}
