function present(value: string | undefined) {
  return value && value.length > 0 ? "present" : "missing";
}

export default function EnvCheckPage() {
  const rows = [
    ["NEXT_PUBLIC_SUPABASE_URL", present(process.env.NEXT_PUBLIC_SUPABASE_URL)],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", present(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)],
    ["SUPABASE_SERVICE_ROLE_KEY", present(process.env.SUPABASE_SERVICE_ROLE_KEY)],
    ["NEXT_PUBLIC_APP_URL", present(process.env.NEXT_PUBLIC_APP_URL)]
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
