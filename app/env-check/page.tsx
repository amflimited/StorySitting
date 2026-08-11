import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "Environment check", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function present(value: string | undefined) {
  return value && value.length > 0 ? "present" : "missing";
}

export default async function EnvCheckPage() {
  await requireStaff();
  const rows = [
    ["NEXT_PUBLIC_SUPABASE_URL", present(process.env.NEXT_PUBLIC_SUPABASE_URL)],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", present(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)],
    ["SUPABASE_SERVICE_ROLE_KEY", present(process.env.SUPABASE_SERVICE_ROLE_KEY)],
    ["NEXT_PUBLIC_APP_URL", present(process.env.NEXT_PUBLIC_APP_URL)],
    ["STRIPE_SECRET_KEY", present(process.env.STRIPE_SECRET_KEY)],
    ["STRIPE_WEBHOOK_SECRET", present(process.env.STRIPE_WEBHOOK_SECRET)],
    ["RETELL_API_KEY", present(process.env.RETELL_API_KEY)],
    ["RETELL_FROM_NUMBER", present(process.env.RETELL_FROM_NUMBER)],
    ["CONSENT_EVIDENCE_SECRET", present(process.env.CONSENT_EVIDENCE_SECRET)],
    ["CRON_SECRET", present(process.env.CRON_SECRET)],
    ["STORY_PREVIEW_BUCKET", present(process.env.STORY_PREVIEW_BUCKET)],
    ["STORY_DELIVERY_BUCKET", present(process.env.STORY_DELIVERY_BUCKET)]
  ];

  return (
    <main className="shell">
      <div className="card">
        <p className="kicker">Environment check</p>
        <h1>Vercel variable status</h1>
        <p>This page does not print secret values. It only shows whether the required values exist at runtime.</p>
        <table>
          <thead><tr><th>Variable</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map(([name, status]) => (
              <tr key={name}>
                <td>{name}</td>
                <td className="status">{status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
