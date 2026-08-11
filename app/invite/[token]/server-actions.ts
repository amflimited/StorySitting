"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { safeString } from "@/lib/utils";

const CONTRIBUTION_TYPES = new Set(["memory", "photo", "document", "audio", "question", "recipe", "note"]);
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic",
  "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/webm",
  "application/pdf", "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

function artifactTypeFromMime(mime: string) {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  return "document";
}

export async function submitContribution(formData: FormData) {
  const supabase = createSupabaseAdminClient();
  const token = safeString(formData.get("invite_token"));
  const displayName = safeString(formData.get("display_name"));
  const email = safeString(formData.get("email")).toLowerCase();
  const contributionType = safeString(formData.get("contribution_type"));
  const title = safeString(formData.get("title"));
  const body = safeString(formData.get("body"));
  const permission = formData.get("permission") === "on";

  if (!/^[a-f0-9]{32}$/i.test(token)) throw new Error("Invite is not available.");
  if (!permission) throw new Error("Permission confirmation is required.");
  if (displayName.length < 2 || displayName.length > 100) throw new Error("Add your name.");
  if (email && (!email.includes("@") || email.length > 254)) throw new Error("Enter a valid email or leave it blank.");
  if (!CONTRIBUTION_TYPES.has(contributionType)) throw new Error("Choose a valid contribution type.");
  if (title.length > 200) throw new Error("Keep the title under 200 characters.");
  if (body.length < 2 || body.length > 20_000) throw new Error("Add a memory or note under 20,000 characters.");

  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const maxBytes = 20 * 1024 * 1024;
    if (file.size > maxBytes) throw new Error("File is too large for the 20 MB upload limit.");
    if (!file.type || !ALLOWED_MIME_TYPES.has(file.type)) throw new Error("This file type is not supported.");
    if (file.name.length > 240) throw new Error("The file name is too long.");
  }

  const { data: invite, error: inviteError } = await supabase
    .from("invites")
    .select("id,story_room_id,status,expires_at")
    .eq("invite_token", token)
    .maybeSingle();
  const expired = invite?.expires_at && new Date(invite.expires_at).getTime() <= Date.now();
  if (inviteError || !invite || invite.status !== "pending" || expired) throw new Error("Invite is not available.");

  let stagedBucket: string | null = null;
  let stagedPath: string | null = null;
  let artifactType: string | null = null;

  if (file instanceof File && file.size > 0) {
    const extension = file.name.includes(".")
      ? file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)
      : "bin";
    stagedPath = `${invite.story_room_id}/staged/${invite.id}/${randomUUID()}.${extension || "bin"}`;
    stagedBucket = file.type.startsWith("audio/")
      ? "story-room-audio"
      : file.type.startsWith("image/")
        ? "story-room-photos"
        : "story-room-documents";
    artifactType = artifactTypeFromMime(file.type);

    const { error: uploadError } = await supabase.storage.from(stagedBucket).upload(stagedPath, file, {
      contentType: file.type,
      upsert: false
    });
    if (uploadError) throw new Error(uploadError.message);
  }

  const { error: finalizeError } = await supabase.rpc("finalize_invite_contribution", {
    p_invite_token: token,
    p_display_name: displayName,
    p_email: email,
    p_contribution_type: contributionType,
    p_title: title,
    p_body: body,
    p_storage_bucket: stagedBucket,
    p_storage_path: stagedPath,
    p_file_name: file instanceof File && file.size > 0 ? file.name : null,
    p_mime_type: file instanceof File && file.size > 0 ? file.type : null,
    p_file_size_bytes: file instanceof File && file.size > 0 ? file.size : null,
    p_artifact_type: artifactType
  });

  if (finalizeError) {
    if (stagedBucket && stagedPath) await supabase.storage.from(stagedBucket).remove([stagedPath]);
    throw new Error("Your contribution was not submitted. The invite remains safe to retry.");
  }

  redirect("/invite/thanks");
}
