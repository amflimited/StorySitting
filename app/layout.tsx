import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://app.storysitting.com"),
  title: {
    default: "StorySitting — They answer the phone. You keep the story.",
    template: "%s · StorySitting"
  },
  description:
    "Sponsor a patient, consent-first phone interview for a parent or grandparent. StorySitting turns their real voice into a finished family chapter.",
  applicationName: "StorySitting",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "StorySitting"
  },
  openGraph: {
    title: "They answer the phone. You keep the story.",
    description: "$5 to start. Preview the finished result, then pay $79 only if your family wants to keep it. No subscription.",
    type: "website",
    images: [{ url: "/images/story-call-hero.webp", width: 1537, height: 1023 }]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#e9e6dd"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-nav">
          <div className="nav-wrap">
            <Link href="/" className="brand-link" aria-label="StorySitting home">
              <BrandMark />
            </Link>
            <nav className="primary-nav" aria-label="Primary navigation">
              <Link href="/#how">How it works</Link>
              <Link href="/#proof">A real example</Link>
              <Link href="/#pricing">Price</Link>
              <Link href="/demo">App preview</Link>
            </nav>
            <div className="nav-actions">
              <Link className="nav-login" href="/login">Sign in</Link>
              <Link className="nav-start" href="/start">Start for $5</Link>
            </div>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="footer-inner">
            <div>
              <BrandMark />
              <p>A consent-first family oral-history service operated by AMF LLC in Wilkinson, Indiana.</p>
            </div>
            <div className="footer-links">
              <strong>StorySitting</strong>
              <Link href="/#how">How it works</Link>
              <Link href="/demo">App preview</Link>
              <Link href="/start">Start a story</Link>
            </div>
            <div className="footer-links">
              <strong>Your account</strong>
              <Link href="/login">Sign in</Link>
              <Link href="/signup">Create account</Link>
              <Link href="/dashboard">Story Shelf</Link>
            </div>
            <div className="footer-links">
              <strong>Trust</strong>
              <a href="https://storysitting.com/privacy">Privacy</a>
              <a href="https://storysitting.com/terms">Terms</a>
              <a href="mailto:adam@onesmallprompt.com">Contact Adam</a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2026 StorySitting</span>
            <span>The storyteller—not the payer—controls the story.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
