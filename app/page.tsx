import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell">
      <p className="kicker">StorySitting production app</p>
      <h1>Private Story Rooms. Normalized Contributions. Finished Story Capsules.</h1>
      <p>
        This is the MVP app foundation. The first gate is simple: owner creates a Story Room,
        invites a contributor, contributor submits material, and staff reviews it.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
        <Link className="btn" href="/signup">Sign up</Link>
        <Link className="btn secondary" href="/login">Log in</Link>
        <Link className="btn secondary" href="/staff">Staff console</Link>
      </div>
    </main>
  );
}
