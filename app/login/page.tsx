import { login } from "./server-actions";
import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="shell">
      <div className="card" style={{ maxWidth: 520 }}>
        <p className="kicker">Login</p>
        <h2>Access StorySitting</h2>
        <form action={login} className="stack">
          <label>Email<input name="email" type="email" required /></label>
          <label>Password<input name="password" type="password" required /></label>
          <button type="submit">Log in</button>
        </form>
        <p>Need an account? <Link href="/signup">Sign up</Link>.</p>
      </div>
    </main>
  );
}
