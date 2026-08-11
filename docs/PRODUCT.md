# StorySitting product definition

This file is the short operating reference. The detailed product contract is [PRODUCT_V2_SPONSORED_CALL.md](PRODUCT_V2_SPONSORED_CALL.md).

## Product sentence

StorySitting is a managed, consent-first oral-history service: a family sponsor starts the work, the storyteller independently authorizes a phone sitting, and StorySitting delivers a source-faithful story the family can hear, read, and keep.

## Commercial model

| Moment | Price | What it buys |
| --- | ---: | --- |
| Story Start | $5 once | Permission setup and first outreach work |
| Private preview | Included | A representative listening/reading passage before another purchase |
| Voice Edition | $39 | Full original recording, readable transcript, permission record, and portable downloads |
| Story Edition | $79 | Everything in Voice, plus a source-linked finished chapter, complete archive, and one correction round |
| Heirloom Edition | $149 | Everything in Story, plus a print-ready PDF, layout for up to 12 artifacts, and two correction rounds total |
| Edition upgrade | Exact difference | Voice→Story $40; Voice→Heirloom $110; Story→Heirloom $70 |
| Next sitting | $5 to begin | Another deliberately requested permission process, sitting, preview, and edition choice; never automatic |
| Storyteller declines | $0 additional | Outreach stops; the sitting is not charged |

There is no subscription and no automatic next call. A bound Heirloom starts at $89 plus shipping after the digital PDF is approved. Family Collections for three or more storytellers are scoped and quoted rather than sold as an unimplemented instant bundle.

## Roles and rights

### Sponsor

Usually an adult child or grandchild. Starts and pays for the project, provides an introduction and story seeds, follows progress, adds questions, and receives only material the storyteller approves for sharing.

### Storyteller

The person whose memories and voice are captured. Needs only an ordinary phone. Independently controls contact, AI interviewing, recording, transcription, editing, and family sharing. Can pause, skip, revoke, restrict, or decline.

### StorySitting

Owns permission operations, scheduling, interview quality, transcription, source linkage, editing, human QA, delivery, corrections, portability, and the next-question loop.

## Canonical lifecycle and states

```text
draft
→ awaiting $5 checkout
→ Story Start paid
→ permission path active
→ storyteller authorized | storyteller declined | needs human review
→ scheduled
→ calling
→ processing
→ private result preview ready
→ sponsor chooses Voice $39 | Story $79 | Heirloom $149 | pass
→ edition-specific files and correction allowance
→ optional difference-only upgrade
→ delivered
→ next question queued
```

Decline, revocation, do-not-call, confusion, safety review, payment failure, and provider failure are first-class states—not generic errors.

## Permission model

A sponsor’s request is not the storyteller’s consent. Supported first-contact paths are:

- **Family Pass:** the sponsor sends the introduction and family code from their own phone.
- **Human hello:** a live Story Sitter explains the project and captures contact preference.
- **They call us:** the storyteller initiates contact with the verified StorySitting line.

Before any automated or AI-voiced outbound interview, StorySitting must hold prior permission from the person being called. Every sitting starts with fresh AI disclosure and recording confirmation. Consent evidence is stored by scope and can be revoked.

## Edition definition of done

A result is not ready to sell merely because a call connected or an AI draft exists. No edition is offered until the authorized sitting has produced a private preview. Every paid edition requires verified permission, usable source audio, a readable transcript, and portable delivery. Additional layers require:

1. **Voice:** full recording, transcript, permission record, and downloads;
2. **Story:** Voice plus a source-linked chapter, checked names/dates/uncertainty, complete archive, and one correction round;
3. **Heirloom:** Story plus a reviewed print-ready PDF, layout for up to 12 submitted artifacts, and a second correction round;
4. storyteller sharing preference applied to every visible layer; and
5. refunds or disputes immediately reduce access to the highest edition still covered by settled payments.

## Surface responsibilities

| Surface | Primary job |
| --- | --- |
| `storysitting.com` | Show emotional and product proof; explain trust and price; start the $5 checkout |
| Sponsor web app | Onboarding, progress, Story Drops, review, questions, invitations, export, and operational fallback |
| iPhone app | The most delightful Story Shelf, listening, notifications, approvals, questions, and repeat purchase |
| Storyteller phone | Permission and conversation without an app install |
| Staff console | Consent evidence, call failures, QA exceptions, corrections, refunds, retention, and delivery |

## Defensible product promises

- **Permission you can see.** The storyteller’s choices are explicit and auditable.
- **Every polished line has a source.** Audio, transcript, and chapter remain connected.
- **We finish the work.** The family receives a produced artifact, not more homework.
- **One story reveals the next.** People, places, objects, eras, and loose ends become Story Threads and better follow-up questions.

## Product rule

Every screen and operation should move an authorized story toward a finished, reviewable, portable result without taking control away from the storyteller.
