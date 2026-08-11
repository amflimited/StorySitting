"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeString } from "@/lib/utils";
import { attachPaidStoryStartsToUser } from "@/lib/story-checkout-fulfillment";

export async function login(formData: FormData) {
  const email = safeString(formData.get("email"));
  const password = safeString(formData.get("password"));
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(error.message);
  }

  if (data.user.email_confirmed_at && data.user.email) {
    await attachPaidStoryStartsToUser(data.user.id, data.user.email);
  }

  redirect("/dashboard");
}
