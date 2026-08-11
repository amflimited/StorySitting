"use server";

import { createHash, createHmac } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { safeString } from "@/lib/utils";

const TOKEN_PATTERN = /^[a-f0-9]{48}$/;

function evidenceFingerprint(value: string) {
  const secret = process.env.CONSENT_EVIDENCE_SECRET;
  if (!secret || !value) return null;
  return createHmac("sha256", secret).update(value).digest("hex");
}

export async function respondToPermission(formData: FormData) {
  const token = safeString(formData.get("permission_token")).toLowerCase();
  const familyCode = safeString(formData.get("family_code"));
  const storytellerName = safeString(formData.get("storyteller_name"));
  const decision = safeString(formData.get("decision"));
  const adultConfirmation = formData.get("adult_confirmation") === "on";
  const aiPermission = formData.get("ai_permission") === "on";
  const doNotCall = formData.get("do_not_call") === "on";

  if (!TOKEN_PATTERN.test(token) || !/^\d{4}$/.test(familyCode)) {
    throw new Error("The Family Pass or four-digit family code is not valid.");
  }
  if (storytellerName.length < 2 || !adultConfirmation) {
    throw new Error("Confirm that you are the adult named in this Family Pass.");
  }
  if (!['granted', 'declined'].includes(decision)) {
    throw new Error("Choose whether StorySitting may contact you.");
  }
  if (decision === "granted" && !aiPermission) {
    throw new Error("Permission for an AI-assisted StorySitting call must be explicit.");
  }

  const requestHeaders = await headers();
  const networkValue = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const userAgent = requestHeaders.get("user-agent") ?? "";
  const networkFingerprint = evidenceFingerprint(networkValue);
  if (!networkFingerprint) {
    throw new Error("The permission service is not configured. Nothing was recorded.");
  }

  const supabase = createSupabaseAdminClient();
  const { data: permissionRequest } = await supabase
    .from("storyteller_permission_requests")
    .select("id")
    .eq("public_token", token)
    .maybeSingle();
  if (!permissionRequest) {
    throw new Error("This Family Pass is unavailable, expired, or has already been answered.");
  }

  const tokenFingerprint = createHash("sha256").update(token).digest("hex");
  const { data: attemptId, error: attemptError } = await supabase.rpc("claim_permission_response_attempt", {
    p_permission_request_id: permissionRequest.id,
    p_token_fingerprint: tokenFingerprint,
    p_network_fingerprint: networkFingerprint
  });
  if (attemptError) {
    throw new Error("The permission service is temporarily unavailable. Nothing was recorded.");
  }
  if (!attemptId) {
    throw new Error("Too many attempts. Wait 15 minutes or contact StorySitting for a human check.");
  }

  const evidence = {
    statement_version: "family_pass_2026_08_11",
    ai_permission_checked: aiPermission,
    adult_confirmation_checked: adultConfirmation,
    recording_reconfirmation_disclosed: true,
    network_fingerprint: networkFingerprint,
    user_agent_fingerprint: evidenceFingerprint(userAgent)
  };

  const { error } = await supabase.rpc("respond_to_storyteller_permission", {
    p_public_token: token,
    p_family_code: familyCode,
    p_storyteller_name: storytellerName,
    p_decision: decision,
    p_do_not_call: decision === "declined" && doNotCall,
    p_evidence: evidence
  });

  if (error) {
    throw new Error("This Family Pass is unavailable, expired, or has already been answered.");
  }

  await supabase
    .from("permission_response_attempts")
    .update({ successful: true })
    .eq("id", attemptId);

  redirect(`/permission/${token}/thanks?decision=${decision}`);
}
