"use client";

import Link from "next/link";
import { useState } from "react";

export function FamilyPassHandoff({
  storytellerName,
  familyCode,
  permissionHref,
  permissionUrl
}: {
  storytellerName: string;
  familyCode: string;
  permissionHref: string;
  permissionUrl: string;
}) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  async function copy(value: string, kind: "link" | "code") {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 2200);
  }

  return (
    <section className="family-pass-handoff" aria-labelledby="family-pass-title">
      <header>
        <span>Your next action</span>
        <h2 id="family-pass-title">Send {storytellerName} two separate messages.</h2>
        <p>A familiar message from you comes first. StorySitting still verifies identity and permission independently before scheduling any AI interview.</p>
      </header>
      <div className="handoff-steps">
        <article>
          <span>Message 1</span>
          <strong>Private Family Pass link</strong>
          <code>{permissionUrl}</code>
          <button type="button" onClick={() => copy(permissionUrl, "link")}>{copied === "link" ? "Link copied ✓" : "Copy private link"}</button>
        </article>
        <article>
          <span>Message 2</span>
          <strong>Four-digit family code</strong>
          <b>{familyCode}</b>
          <button type="button" onClick={() => copy(familyCode, "code")}>{copied === "code" ? "Code copied ✓" : "Copy family code"}</button>
        </article>
      </div>
      <footer>
        <Link className="button button-secondary" href={permissionHref}>Preview what they will see</Link>
        <p><strong>Then wait.</strong> Their yes is not assumed from your payment, link, or family code.</p>
      </footer>
    </section>
  );
}
