import { submitContribution } from "./server-actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createSupabaseAdminClient();

  const { data: invite } = await supabase
    .from("invites")
    .select("id,story_room_id,status,story_rooms(title,subject_name)")
    .eq("invite_token", token)
    .maybeSingle();

  if (!invite || invite.status === "expired") {
    return <main className="shell"><div className="card">This invite is not available.</div></main>;
  }

  const room: any = invite.story_rooms;

  return (
    <main className="shell">
      <div className="card">
        <p className="kicker">Contribute to a Story Room</p>
        <h1>{room?.title ?? "Story Room"}</h1>
        <p>Submit one useful memory, question, photo, document, or audio file. It does not have to be polished. StorySitting will review and organize it.</p>
        <form action={submitContribution} className="stack">
          <input type="hidden" name="invite_token" value={token} />
          <label>Your name<input name="display_name" required /></label>
          <label>Your email<input name="email" type="email" /></label>
          <label>Contribution type
            <select name="contribution_type">
              <option value="memory">Memory</option>
              <option value="question">Question</option>
              <option value="recipe">Recipe</option>
              <option value="note">Legacy note</option>
              <option value="photo">Photo description</option>
              <option value="audio">Audio note description</option>
              <option value="document">Document description</option>
            </select>
          </label>
          <label>Title<input name="title" placeholder="The kitchen table, Grandpa's truck, Sunday noodles..." /></label>
          <label>Memory or note<textarea name="body" required /></label>
          <label>Optional file<input name="file" type="file" /></label>
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
