# StorySitting App v0.2 — Production Console Cleanup

## Why this exists

The v0.1 engine proved the core loop:

Story Room -> Invite -> Contribution -> Artifact -> Staff Review -> Memory Card -> Story Map -> Quo Import

v0.2 makes that loop more usable for actual production.

## Added / improved

### Staff dashboard

- Production summary cards
- Review queue filters
- Room list with status
- Links to Quo import and Artifact debug

### Staff room detail

- Production status controls
- Artifact count
- Image previews
- Audio player previews
- Signed URL access for private files
- Richer Story Map fields:
  - story focus
  - themes
  - open questions
  - interview plan
  - recommended output
- Cleaner Memory Card display
- Story Capsule delivery placeholder

## Still not included

- Stripe
- AI drafting
- automated Quo webhooks
- native phone call-in
- PDF generation
- full partner portal

## Next gate after v0.2

Create a full mock production run:

1. Create room
2. Add written memory
3. Add photo artifact
4. Add Quo transcript
5. Create three Memory Cards
6. Create Story Map with interview plan
7. Create capsule placeholder
8. Mark status as ready_for_interview or capsule_production
