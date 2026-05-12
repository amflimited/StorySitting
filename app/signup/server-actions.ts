"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeString } from "@/lib/utils";

export async function signup(formData: FormData) {
  const email = safeString(formData.get("email"));
  const password = safeString(formData.get("password"));
  const fullName = safeString(formData.get("full_name"));
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data.user) {
    await supabase.from("profiles").upsert({
      id: data.user.id,
      full_name: fullName,
      role: "family_owner"
    });
  }

  redirect("/dashboard");
}
