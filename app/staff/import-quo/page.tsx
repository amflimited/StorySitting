import { importQuo } from "./server-actions";
import { requireStaff } from "@/lib/auth";

export default async function ImportQuoPage() {
  const { supabase } = await requireStaff();

  const { data: rooms } = await supabase
    .from("story_rooms")
    .select("id,title,subject_name")
    .order("created_at", { ascending: false });

  return (
    <main className="shell">
      <div className="card">
        <p className="kicker">Manual Quo import</p>
        <h1>Normalize Quo material into Contributions</h1>
        <p>Upload a transcript, summary, call recording, SMS export, or downloaded AI note. It creates an ImportEvent and a Contribution.</p>
        <form action={importQuo} className="stack">
          <label>Story Room
            <select name="story_room_id" required>
              {(rooms ?? []).map((room) => (
                <option key={room.id} value={room.id}>{room.title} — {room.subject_name}</option>
              ))}
            </select>
          </label>
          <label>Import type
            <select name="event_type">
              <option value="transcript">Transcript</option>
              <option value="summary">Summary</option>
              <option value="call_recording">Call recording</option>
              <option value="sms_export">SMS/MMS export</option>
              <option value="ai_notes">Downloaded AI notes</option>
            </select>
          </label>
          <label>External ID<input name="external_event_id" placeholder="Quo call ID, filename, timestamp, or manual ID" /></label>
          <label>Title<input name="title" /></label>
          <label>Text body / notes<textarea name="body" /></label>
          <label>Optional file<input name="file" type="file" /></label>
          <button type="submit">Import to review queue</button>
        </form>
      </div>
    </main>
  );
}
