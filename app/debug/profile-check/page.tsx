import { requireUser } from "@/lib/auth";

export default async function ProfileCheckPage() {
  const { supabase, user } = await requireUser();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id,full_name,role,created_at")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <main className="shell">
      <div className="card">
        <p className="kicker">Profile check</p>
        <h1>Current user profile</h1>
        <p>User ID: {user.id}</p>
        <p>Email: {user.email}</p>
        {error && <p className="status">Profile query error: {error.message}</p>}
        <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(profile, null, 2)}</pre>
      </div>
    </main>
  );
}
