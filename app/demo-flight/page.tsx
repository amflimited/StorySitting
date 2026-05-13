import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { launchDemoFlight } from "./actions";

export default async function DemoFlightPage() {
  await requireStaff();

  return (
    <main className="shell stack">
      <section className="card stack">
        <p className="kicker">Demo Flight 1</p>
        <h1>Prove the Signature Story Capsule path</h1>
        <p>
          This creates a complete controlled test project for Grandma’s Sunday Dinner. It proves the path from Story Room to contributions, Memory Cards, Story Map, Capsule draft, and family preview.
        </p>
        <div className="grid">
          <div className="mini-card">
            <strong>Test Capsule</strong>
            <p>Recipe & Tradition Capsule: Grandma’s Sunday Dinner.</p>
          </div>
          <div className="mini-card">
            <strong>What it creates</strong>
            <p>Story Room, three contributions, three selected Memory Cards, one Story Map, and one draft Story Capsule.</p>
          </div>
        </div>
        <form action={launchDemoFlight}>
          <button type="submit">Launch Demo Flight 1</button>
        </form>
      </section>

      <section className="card stack">
        <h2>What success looks like</h2>
        <ol className="action-list">
          <li>Staff room opens after launch.</li>
          <li>Required blockers should be cleared or clearly explained.</li>
          <li>Material Inbox should show used/structured contributions.</li>
          <li>Memory Cards should already exist and be selected.</li>
          <li>Story Map should already exist.</li>
          <li>Capsule count should be at least one.</li>
          <li>The Capsule should appear on the Story Capsules hub.</li>
        </ol>
        <div className="page-actions">
          <Link className="btn secondary" href="/staff">Back to Staff</Link>
          <Link className="btn secondary" href="/story-capsules">Story Capsules</Link>
        </div>
      </section>
    </main>
  );
}
