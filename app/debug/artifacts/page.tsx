import { requireStaff } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function ArtifactDebugPage() {
  await requireStaff();
  const admin = createSupabaseAdminClient();

  const { data: artifacts, error } = await admin
    .from("artifacts")
    .select("id,story_room_id,contribution_id,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,artifact_type,created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main className="shell">
      <div className="card">
        <p className="kicker">Artifact debug</p>
        <h1>Recent uploaded files</h1>
        <p>This verifies whether uploads are creating Artifact records. It does not expose secret keys.</p>
        {error && <p className="status">{error.message}</p>}
        <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(artifacts ?? [], null, 2)}</pre>
      </div>
    </main>
  );
}
