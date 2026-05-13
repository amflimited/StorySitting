import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "StorySitting App",
  description: "Private Story Rooms, contributions, staff review, and Story Capsules."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <div className="nav-inner">
            <Link href="/" style={{ fontWeight: 900, textDecoration: "none" }}>StorySitting App</Link>
            <div className="nav-links">
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/story-rooms/new">New Story Room</Link>
              <Link href="/staff">Staff</Link>
              <Link href="/launch-manifest">Launch Manifest</Link>
              <Link href="/story-capsules">Capsules</Link>
              <Link href="/staff/import-quo">Import Quo</Link>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
