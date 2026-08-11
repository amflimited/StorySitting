import Link from "next/link";

export const metadata = { title: "Your choice is recorded", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PermissionThanksPage({
  searchParams
}: {
  searchParams: Promise<{ decision?: string }>;
}) {
  const { decision } = await searchParams;
  const granted = decision === "granted";

  return (
    <main className="start-success">
      <div className="success-seal">{granted ? "✓" : "—"}</div>
      <span className="overline"><i /> Your choice is on record</span>
      <h1>{granted ? "Thank you. We will take it slowly." : "Thank you. The call stops here."}</h1>
      <p>
        {granted
          ? "Nothing has been scheduled yet. A human StorySitter must first speak with you—or receive your call—and independently verify this choice. Only then can one AI-assisted interview be scheduled, and recording still requires a separate spoken yes."
          : "StorySitting will not schedule the interview. Your family member cannot override this decision."}
      </p>
      <div className="hero-actions" style={{ justifyContent: "center" }}>
        <Link className="button button-secondary" href="/">Read about StorySitting</Link>
      </div>
    </main>
  );
}
