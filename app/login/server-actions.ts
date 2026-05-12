"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeString } from "@/lib/utils";

export async function login(formData: FormData) {
  const email = safeString(formData.get("email"));
  const password = safeString(formData.get("password"));
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(error.message);
  }

  redirect("/dashboard");
}
