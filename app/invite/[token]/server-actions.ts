"use server";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { safeString } from "@/lib/utils";

function artifactTypeFromMime(mime: string) {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";
  return "document";
}

export async function submitContribution(formData: FormData) {
  const supabase = createSupabaseAdminClient();

  const token = safeString(formData.get("invite_token"));
  const displayName = safeString(formData.get("display_name"));
  const email = safeString(formData.get("email"));
  const contributionType = safeString(formData.get("contribution_type")) || "memory";
  const title = safeString(formData.get("title"));
  const body = safeString(formData.get("body"));
  const permission = formData.get("permission");

  if (!permission) throw new Error("Permission confirmation is required.");

  const { data: invite, error: inviteError } = await supabase
    .from("invites")
    .select("id,story_room_id,status")
    .eq("invite_token", token)
    .maybeSingle();

  if (inviteError || !invite || invite.status === "expired") {
    throw new Error("Invite is not available.");
  }

  const { data: member, error: memberError } = await supabase
    .from("story_room_members")
    .insert({
      story_room_id: invite.story_room_id,
      display_name: displayName,
      email,
      role: "contributor",
      status: "active"
    })
    .select("id")
    .single();

  if (memberError) throw new Error(memberError.message);

  const { data: contribution, error: contributionError } = await supabase
    .from("contributions")
    .insert({
      story_room_id: invite.story_room_id,
      contributor_member_id: member.id,
      source: "web",
      contribution_type: contributionType,
      title,
      body,
      raw_payload: { submitted_by: displayName, email, permission_confirmed: true },
      review_status: "needs_review"
    })
    .select("id")
    .single();

  if (contributionError) throw new Error(contributionError.message);

  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const maxBytes = 50 * 1024 * 1024;
    if (file.size > maxBytes) throw new Error("File is too large for MVP upload limit.");

    const path = `${invite.story_room_id}/${contribution.id}/${Date.now()}-${file.name}`;
    const bucket = file.type.startsWith("audio/")
      ? "story-room-audio"
      : file.type.startsWith("image/")
        ? "story-room-photos"
        : "story-room-documents";

    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
      contentType: file.type || "application/octet-stream"
    });

    if (uploadError) throw new Error(uploadError.message);

    await supabase.from("artifacts").insert({
      contribution_id: contribution.id,
      story_room_id: invite.story_room_id,
      storage_bucket: bucket,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type,
      file_size_bytes: file.size,
      artifact_type: artifactTypeFromMime(file.type || "")
    });
  }

  await supabase.from("invites").update({ status: "used" }).eq("id", invite.id);

  redirect("/invite/thanks");
}
