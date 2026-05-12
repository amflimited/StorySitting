"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { safeString } from "@/lib/utils";

export async function signup(formData: FormData) {
  const email = safeString(formData.get("email"));
  const password = safeString(formData.get("password"));
  const fullName = safeString(formData.get("full_name"));

  if (!email || !password || !fullName) {
    throw new Error("Name, email, and password are required.");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });

  if (error) {
    throw new Error(error.message);
  }

  // Hotfix v0.1.2:
  // The first version tried to insert into profiles with the normal browser/server user client.
  // On many Supabase projects, signUp does not immediately establish a usable auth.uid()
  // because email confirmation can be enabled. That makes the RLS policy reject the profile insert
  // and Vercel shows a generic server error during signup.
  //
  // Use the server-only Supabase secret/service role key to create the profile safely.
  if (data.user?.id) {
    const admin = createSupabaseAdminClient();
    const { error: profileError } = await admin.from("profiles").upsert({
      id: data.user.id,
      full_name: fullName,
      role: "family_owner"
    });

    if (profileError) {
      throw new Error(`Profile creation failed: ${profileError.message}`);
    }
  }

  redirect("/dashboard");
}
