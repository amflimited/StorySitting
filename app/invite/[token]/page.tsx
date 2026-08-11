import type { Metadata } from "next";
import { submitContribution } from "./server-actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Private Family Relay",
  robots: { index: false, follow: false, nocache: true }
};
export const dynamic = "force-dynamic";
export const revalidate = 0;

type StoryRoomSummary = {
  title: string | null;
  subject_name: string | null;
};

function isExpired(expiresAt: string | null) {
  return Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now());
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createSupabaseAdminClient();

  const { data: invite } = await supabase
    .from("invites")
    .select("id,story_room_id,status,expires_at,story_rooms(title,subject_name)")
    .eq("invite_token", token)
    .maybeSingle();

  const expired = isExpired(invite?.expires_at ?? null);
  if (!invite || invite.status !== "pending" || expired) {
    return <main className="shell"><div className="card">This invite is not available.</div></main>;
  }

  const room = invite.story_rooms as unknown as StoryRoomSummary | null;

  return (
    <main className="shell">
      <div className="card">
        <p className="kicker">Family Relay</p>
        <h1>{room?.title ?? "Story Room"}</h1>
        <p>Add one question, photograph, remembered detail, recipe, or voice note that could make the next sitting more personal. It does not need to be polished.</p>
        <form action={submitContribution} className="stack">
          <input type="hidden" name="invite_token" value={token} />
          <label>Your name<input name="display_name" required /></label>
          <label>Your email<input name="email" type="email" /></label>
          <label>Contribution type
            <select name="contribution_type">
              <option value="memory">Memory</option>
              <option value="question">Question</option>
              <option value="recipe">Recipe</option>
              <option value="note">Family note</option>
              <option value="photo">Photo description</option>
              <option value="audio">Audio note description</option>
              <option value="document">Document description</option>
            </select>
          </label>
          <label>Title<input name="title" placeholder="The kitchen table, Grandpa's truck, Sunday noodles..." /></label>
          <label>Memory or note<textarea name="body" required /></label>
          <label>Optional file (20 MB max)<input name="file" type="file" accept="image/jpeg,image/png,image/webp,image/heic,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/webm,application/pdf,text/plain,.docx" /></label>
          <label style={{ display: "flex", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "start" }}>
            <input name="permission" type="checkbox" required style={{ width: "auto", marginTop: 4 }} />
            <span>By submitting this material, I confirm that I have permission to share it with StorySitting for this private family story project.</span>
          </label>
          <button type="submit">Submit contribution</button>
        </form>
      </div>
    </main>
  );
}
