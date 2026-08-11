import type { Metadata } from "next";
import Image from "next/image";
import { StartGiftFlow } from "@/components/StartGiftFlow";
import { SponsorTimeline } from "@/components/SponsorTimeline";
import { StoryOfferLedger } from "@/components/StoryOfferLedger";

export const metadata: Metadata = {
  title: "Start their story for $5",
  description: "Choose a loved one, a trusted permission path, and the family stories you do not want to lose."
};

export default async function StartPage({
  searchParams
}: {
  searchParams: Promise<{ returning?: string; seed?: string }>;
}) {
  const { returning, seed } = await searchParams;
  const returningStoryteller = typeof returning === "string" ? returning.trim().slice(0, 100) : "";
  const returningQuestion = typeof seed === "string" ? seed.trim().slice(0, 300) : "";

  return (
    <main className="start-page">
      <header className="start-intro">
        <span className="overline"><i /> One sitting, one deliberate decision at a time</span>
        <h1>{returningStoryteller ? <>Ask {returningStoryteller} the next good question.</> : <>Start with one person and one question.</>}</h1>
        <p>{returningStoryteller ? `This is a new Story Start for ${returningStoryteller}. Nothing calls, records, or charges itself just because your family has sat with us before.` : "You open the door for $5. They decide whether to walk through it. We do the work, then you hear a private preview before deciding whether the result is worth keeping."}</p>
      </header>

      <StoryOfferLedger compact />

      <div className="start-shell">
        <div className="start-main">
          <StartGiftFlow returningStoryteller={returningStoryteller} returningQuestion={returningQuestion} />
        </div>
        <aside className="start-aside">
          <div className="aside-card">
            <div className="aside-image">
              <Image src="/images/story-call-hero.webp" alt="An older storyteller speaking comfortably by telephone" fill sizes="360px" priority />
              <span>They only need a telephone</span>
            </div>
            <div className="aside-body">
              <SponsorTimeline status="awaiting_checkout" heading="What happens after $5" />
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
