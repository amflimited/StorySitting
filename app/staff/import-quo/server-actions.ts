"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { safeString } from "@/lib/utils";

function contributionType(eventType: string) {
  if (eventType === "transcript") return "transcript";
  if (eventType === "summary") return "summary";
  if (eventType === "call_recording") return "audio";
  if (eventType === "ai_notes") return "note";
  return "note";
}

function artifactTypeFromMime(mime: string) {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";
  return "document";
}

export async function importQuo(formData: FormData) {
  const { supabase } = await requireStaff();

  const storyRoomId = safeString(formData.get("story_room_id"));
  const eventType = safeString(formData.get("event_type")) || "manual_import";
  const externalEventId = safeString(formData.get("external_event_id")) || crypto.randomUUID();
  const title = safeString(formData.get("title")) || `Quo ${eventType}`;
  const body = safeString(formData.get("body"));

  const { data: event, error: eventError } = await supabase
    .from("import_events")
    .insert({
      source: "quo",
      event_type: eventType,
      external_event_id: externalEventId,
      story_room_id: storyRoomId,
      status: "received",
      payload: { title, body }
    })
    .select("id")
    .single();

  if (eventError) throw new Error(eventError.message);

  const { data: contribution, error: contributionError } = await supabase
    .from("contributions")
    .insert({
      story_room_id: storyRoomId,
      source: "quo",
      source_external_id: externalEventId,
      contribution_type: contributionType(eventType),
      title,
      body,
      raw_payload: { import_event_id: event.id, event_type: eventType },
      review_status: "needs_review"
    })
    .select("id")
    .single();

  if (contributionError) throw new Error(contributionError.message);

  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const bucket = "quo-imports";
    const path = `${storyRoomId}/${contribution.id}/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
      contentType: file.type || "application/octet-stream"
    });

    if (uploadError) throw new Error(uploadError.message);

    await supabase.from("artifacts").insert({
      contribution_id: contribution.id,
      story_room_id: storyRoomId,
      storage_bucket: bucket,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type,
      file_size_bytes: file.size,
      artifact_type: artifactTypeFromMime(file.type || "")
    });
  }

  await supabase.from("import_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", event.id);

  redirect(`/staff/story-rooms/${storyRoomId}`);
}
