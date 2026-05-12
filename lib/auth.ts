import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function getProfileRole(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  return data?.role ?? "family_owner";
}

export async function requireStaff() {
  const { supabase, user } = await requireUser();
  const role = await getProfileRole(user.id);
  if (role !== "staff" && role !== "admin") redirect("/dashboard");
  return { supabase, user, role };
}
