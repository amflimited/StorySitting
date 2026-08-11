import Link from "next/link";
import { login } from "./server-actions";

export default function LoginPage() {
  return (
    <main className="shell auth-page">
      <section className="card auth-card">
        <p className="kicker">Welcome back</p>
        <h1>Open your Story Shelf.</h1>
        <p>See the latest permission update, listen to a Story Drop, or add the next family question.</p>
        <form action={login} className="stack">
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          <button type="submit">Sign in</button>
        </form>
        <p className="auth-switch">No account yet? <Link href="/signup">Create your shelf</Link>.</p>
      </section>
    </main>
  );
}
