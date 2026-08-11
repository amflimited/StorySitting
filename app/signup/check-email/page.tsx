import type { Metadata } from "next";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false, follow: false } };

export default async function CheckEmailPage({
  searchParams
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  return (
    <main className="start-success">
      <div className="success-seal">✉</div>
      <span className="overline"><i /> One secure step</span>
      <h1>Confirm the email that owns your Story Shelf.</h1>
      <p>We sent a private confirmation link{email ? <> to <strong>{email}</strong></> : null}. Paid Story Starts are attached only after that address is verified.</p>
      <div className="success-steps">
        <div><span>01</span><strong>Open the email</strong><small>Look for StorySitting or check spam.</small></div>
        <div><span>02</span><strong>Use the private link</strong><small>The link creates your secure session.</small></div>
        <div><span>03</span><strong>See your shelf</strong><small>Your paid Story Start appears automatically.</small></div>
      </div>
    </main>
  );
}
