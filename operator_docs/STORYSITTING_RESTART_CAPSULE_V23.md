# StorySitting Restart Capsule — v23

## Current status

StorySitting is a guided family story preservation business. The current working offer is direct-to-family and no-call by default.

Core doctrine:

> Start with one memory. Preserve the real voice. Shape the story. Deliver a finished private keepsake.

Current plain-English product explanation:

> StorySitting helps a family start with one memory, voice, recipe, photo, place, object, or question. We turn that starting point into a free Story Map. If they continue, we help gather the real voice, photos, details, and source materials, then shape them into a private Story Capsule their family can hear, read, share, and keep.

Current primary customer-facing promise:

> Save one family story without taking on the whole family archive.

Current tiny-start idea:

> Tell us the one story you do not want to lose.

Current first CTA:

> Start in 60 seconds

Secondary clarity CTA:

> What you get

## Current stage

Stage: Pre-launch controlled live test.

The site and backend are built enough to test. The next business gate is not more abstract planning. The next gate is real submissions and real Story Map loops.

Immediate mission:

1. Upload / deploy v23 if not already live.
2. Test the Start Request form.
3. Submit one fake lead.
4. Confirm the lead appears in /ops/.
5. Send a small warm test message to 3–5 people.
6. Generate 3 real free Story Maps.
7. Learn whether people understand the offer and want the next step.

Do not jump to complex CRM, paid ads, advanced automation, photographer partnerships, or heavy pricing architecture until at least a few real Story Map loops happen.

## Current package

Latest cumulative checkpoint package:

storysitting_public_site_v23_public_clarity_image_finalization.zip

This package is cumulative through v23 and includes:

- Public copy cleanup
- New image integration
- Product clarity page
- Start Request tiny-start flow
- Sample Story Map
- Sample Story Capsule
- Privacy / family materials page
- What Happens Next pages
- Ops Machine Room improvements
- Consent handling
- Duplicate lead detection
- Follow-up tracking fields
- Outcome tags
- Lead priority lanes

## Deployment rules going forward

New rule from Adam:

> Going forward, do not automatically produce full public_html packages for every revision. Default to only giving the files that need to be updated.

Patch delivery doctrine:

1. For small revisions, provide only changed files in a patch ZIP.
2. For GitHub-safe changes, update GitHub directly when possible.
3. For changes involving live server-only secrets, never commit them to GitHub.
4. For large structural changes, migrations, image replacements across many pages, or anything where upload order matters, provide a full cumulative upload package.
5. Always say clearly whether the output is a patch package or a full package.
6. Do not include live private config, passwords, generated leads, uploads, or API keys in public packages.

GitHub repo:

- Repo: amflimited/StorySitting
- Visibility: public
- Because it is public, do not commit live secrets, passwords, private lead data, or server-only runtime data.

Server-side private files that must remain private:

- storysitting_private/config/ops-password.txt
- any future DB/API/password config files
- generated lead data
- uploaded family materials

## Current backend / ops system

The backend is a lightweight PHP/file-based machine room.

Key public files:

- public_html/index.html
- public_html/start-request.html
- public_html/submit-lead.php
- public_html/ops/index.php
- public_html/what-you-get.html
- public_html/sample/story-map-example.html
- public_html/sample/grandmas-sunday-dinner.html
- public_html/privacy-and-family-material.html
- public_html/what-happens-after-you-submit.html
- public_html/what-to-gather-first.html
- public_html/family-invite-note.html
- public_html/next-step-after-story-map.html

Key backend behaviors:

- Start Request captures a tiny starting point.
- Consent is required.
- Leads are saved as CSV and JSON.
- Machine fields classify lead priority, missing piece, friction, reply strategy, follow-up date, and outcome tag.
- Ops dashboard shows lead details and copyable drafts/prompts.

Ops dashboard depends on this private file existing on the live server:

storysitting_private/config/ops-password.txt

Do not put that password into GitHub.

## Public copy rule

Hard rule:

> Public pages must never sound like internal machine instructions, backend doctrine, ChatGPT prompts, lead scoring, or operator planning.

Customer-facing tone:

- Warm
- Clear
- Calm
- Plainspoken
- Capable
- Slightly elegant
- Slightly urgent about not waiting, without grief exploitation

Avoid overusing:

- legacy
- archive
- preservation goals
- comprehensive family history
- machine
- backend
- operator
- prompt
- lead intelligence
- conversion
- minimum viable
- friction
- AI / GPT language

Preferred language:

- one memory
- one detail
- one voice
- one story you do not want to lose
- free Story Map
- private Story Capsule
- hear, read, share, and keep
- no organized archive needed
- no package choice required
- no sales call to begin
- nothing is published

## Product explanation to keep using

Short answer:

> StorySitting helps families save one meaningful story before it slips away. You send one memory, voice, recipe, photo, place, object, or question. We send back a free Story Map. If you continue, we help turn the real voice, details, and family materials into a private Story Capsule your family can hear, read, share, and keep.

What they get first:

> A free Story Map: a short, thoughtful guide showing what story is there, what to gather first, the strongest thread, and the next best question.

What the paid product is:

> A private Story Capsule: edited audio, written story sections, source notes, family materials, a Voice Portrait, and a First Listen guide shaped into a finished family keepsake.

What it is not:

> It is not a public archive, not a genealogy database, not a giant family-history homework project, and not a sales call disguised as a form.

## Image system status

A large set of new StorySitting images has been generated. v23 integrated the best available image set into the site and preserved source/generated assets under operator_docs/generated_images_v23.

Final visual direction:

- Elegant
- Warm natural light
- Premium heirloom tabletop
- Oat, cream, espresso, aged paper, muted plum
- Real voice shown through phone waveform
- Old photos, recipe cards, letters, source materials, private boxes
- Less generic stock family photo where possible
- Strong emotional idea: one small thing now prevents regret later

Visual story ladder:

1. One memory
2. Free Story Map
3. Private Story Capsule
4. Voice preserved
5. Family listens
6. Nothing is public

Do not overuse collage/contact-sheet graphics as public hero images. Use clean standalone images for pages. Contact sheets are planning/reference assets only unless intentionally used in operator docs.

## Current biggest business risk

The biggest risk is not lack of ideas. It is overbuilding before live proof.

The site was previously drifting into public-facing internal instructions and unclear product language. That must stay fixed.

Before more major buildout, run real tests:

- Does a visitor understand what StorySitting offers?
- Do they know what they get first?
- Does the Start Request form feel easy?
- Can Adam explain the offer in one sentence without embarrassment?
- Does the free Story Map create enough confidence to continue?

## Suggested next task in new chat

Start with this:

> Load the StorySitting restart capsule. We are on v23. Going forward, use patch ZIPs for only changed files unless a full package is truly necessary. First, audit the v23 public copy for customer clarity and remove any remaining internal/operator language. Then give me either GitHub changes or a patch ZIP only.

## Founder preference / working mode

Adam is building this with himself + GPT doing nearly everything. Keep work practical, step-by-step, and upload-ready. Avoid unnecessary clarification loops. Do the work directly where possible. Be honest when a change should happen through GitHub, cPanel, or a full upload package.
