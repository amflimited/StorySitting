import Link from "next/link";
import { signup } from "./server-actions";

export default function SignupPage() {
  return (
    <main className="shell auth-page">
      <section className="card auth-card">
        <p className="kicker">Your private Story Shelf</p>
        <h1>Create your family account.</h1>
        <p>Follow permission, calls, Story Drops, corrections, and finished chapters in one place. The storyteller never needs this login.</p>
        <form action={signup} className="stack">
          <label>Name<input name="full_name" autoComplete="name" required /></label>
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
          <button type="submit">Create my Story Shelf</button>
        </form>
        <p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link>.</p>
      </section>
    </main>
  );
}
