import { signup } from "./server-actions";
import Link from "next/link";

export default function SignupPage() {
  return (
    <main className="shell">
      <div className="card" style={{ maxWidth: 560 }}>
        <p className="kicker">Family owner signup</p>
        <h2>Create your StorySitting account</h2>
        <form action={signup} className="stack">
          <label>Name<input name="full_name" required /></label>
          <label>Email<input name="email" type="email" required /></label>
          <label>Password<input name="password" type="password" minLength={8} required /></label>
          <button type="submit">Create account</button>
        </form>
        <p>Already have an account? <Link href="/login">Log in</Link>.</p>
      </div>
    </main>
  );
}
