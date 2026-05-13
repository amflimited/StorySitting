export const PANEL_DISTILLED_ADVICE = [
  {
    source: "Tony Robbins lens",
    advice: "Make the customer feel the regret before they feel the process.",
    productMove: "Lead with the story they would regret not saving."
  },
  {
    source: "Doug Stanhope lens",
    advice: "Do not sell homework. Sell help getting this done.",
    productMove: "Promise guided assembly from messy family material into a finished Capsule."
  },
  {
    source: "Alex Jones trust lens",
    advice: "Trust will be the objection. Answer privacy and control before they ask.",
    productMove: "Make privacy, permission, and family control visible in the funnel."
  },
  {
    source: "Bill Hicks lens",
    advice: "Keep it honest. If it smells fake, the whole thing dies.",
    productMove: "Use plain, specific, human examples instead of grief-marketing language."
  },
  {
    source: "George Carlin lens",
    advice: "Use plain words. Tell people what they get.",
    productMove: "Every page must answer what it is, who it is for, what they receive, and what to do first."
  },
  {
    source: "Sam Walton lens",
    advice: "Get close to real customers. Start local. Learn fast.",
    productMove: "Run a founding-family pilot before returning to partner-heavy outreach."
  },
  {
    source: "Jeff Bezos lens",
    advice: "Work backward from the customer anxiety and remove friction.",
    productMove: "Create a no-call start path with sample, offer, trust, intake, progress, and review."
  },
  {
    source: "Tesla direct-sales lens",
    advice: "Show the product, make the configuration obvious, and let the customer start without a salesperson.",
    productMove: "Build public Capsule type pages and a start-online CTA instead of requiring calls or partner handoffs."
  }
];

export const ACQUISITION_NEXT_PASS = [
  "Add Stripe/deposit-ready package cards once pricing is selected.",
  "Create a no-call intake request record instead of only linking into the logged-in app.",
  "Add referral prompts after contribution and after delivery.",
  "Add local founding-family content blocks for Indiana communities.",
  "Create sample-safe before/after memory transformations.",
  "Add lightweight telemetry for sample page views, start clicks, and completed intake.",
  "Add a partner-proof page later after the first direct-family proof exists.",
  "Convert the Grandma’s Sunday Dinner sample into a more polished sales Roadster."
];

export type PublicCapsuleOffer = {
  slug: string;
  label: string;
  headline: string;
  subhead: string;
  regretPrompt: string;
  bestFor: string[];
  whatYouGet: string[];
  sampleSections: string[];
  firstStep: string;
};

export const PUBLIC_CAPSULE_OFFERS: PublicCapsuleOffer[] = [
  {
    slug: "favorite-meals",
    label: "Favorite Meals & Traditions",
    headline: "Save the recipe, the ritual, and the story behind it.",
    subhead: "For families who keep saying nobody makes it quite like they did.",
    regretPrompt: "What recipe, holiday meal, or kitchen tradition would your family regret not asking about?",
    bestFor: ["family recipes", "holiday foods", "Sunday dinners", "handwritten recipe cards", "kitchen memories", "traditions that live in one person’s head"],
    whatYouGet: ["guided recipe and memory prompts", "family contribution page", "Story Map", "draft Capsule preview", "edited story sections", "pull quotes and caption prompts"],
    sampleSections: ["The recipe", "Who made it", "When the family gathered", "The details not written down", "How to carry it forward"],
    firstStep: "Start with one recipe, one memory, or one photo of the card, kitchen, dish, or person who made it."
  },
  {
    slug: "life-stories",
    label: "Life Stories",
    headline: "Ask the stories your family keeps meaning to ask.",
    subhead: "For parents, grandparents, elders, and family members whose voice and memories should not stay scattered.",
    regretPrompt: "What do you wish someone had asked sooner?",
    bestFor: ["grandparent stories", "parent reflections", "childhood memories", "family sayings", "life lessons", "old photos"],
    whatYouGet: ["guided life-story prompts", "family question gathering", "Memory Cards", "Story Map", "interview prep", "private Capsule preview"],
    sampleSections: ["Who they are", "Early life", "Family memories", "Lessons and sayings", "What the family should remember"],
    firstStep: "Start with one person and one story the family would miss if nobody captured it."
  },
  {
    slug: "milestones",
    label: "Milestones & Birthdays",
    headline: "Turn the milestone into something the family can keep.",
    subhead: "For birthdays, anniversaries, retirements, and major family moments where memories are already gathering.",
    regretPrompt: "What should this person hear from the family while they can still receive it?",
    bestFor: ["70th, 80th, or 90th birthdays", "anniversaries", "retirements", "family celebrations", "tribute gifts"],
    whatYouGet: ["contributor prompts", "message gathering", "favorite memories", "Story Map", "draft keepsake structure", "review-ready Capsule"],
    sampleSections: ["The person we are celebrating", "Favorite memories", "Family voices", "Milestones", "Messages for the future"],
    firstStep: "Start with the occasion, the person, and a few relatives who should contribute."
  },
  {
    slug: "remembrance",
    label: "Remembrance",
    headline: "Gather the stories people keep telling before they scatter.",
    subhead: "For families collecting memories during or after loss, transition, or a season of remembering.",
    regretPrompt: "What stories should not disappear just because the service, gathering, or season is over?",
    bestFor: ["memorial-adjacent projects", "remembrance gifts", "family memory gathering", "multi-person story collection"],
    whatYouGet: ["private contribution path", "memory organization", "selected quotes", "Story Map", "draft remembrance Capsule", "family review"],
    sampleSections: ["Who they were", "Stories people keep telling", "Family voices", "Small details", "What we carry forward"],
    firstStep: "Start with one memory people keep repeating and one person who can add more detail."
  },
  {
    slug: "home-and-place",
    label: "Home & Place Stories",
    headline: "Keep the stories connected to a house, room, object, or place.",
    subhead: "For moves, cleanouts, downsizing, family homes, rooms, objects, and places that hold family memory.",
    regretPrompt: "What would your family want remembered after the boxes are gone?",
    bestFor: ["family homes", "moves", "downsizing", "rooms", "objects", "places with family meaning"],
    whatYouGet: ["place-based prompts", "room/object memory gathering", "Story Map", "photo caption prompts", "draft Capsule preview", "delivery checklist"],
    sampleSections: ["The place", "Rooms and objects", "Family moments", "What changed", "What comes with us"],
    firstStep: "Start with one place, one room, one object, or one moment that should not be forgotten."
  }
];

export function getPublicCapsuleOffer(slug: string) {
  return PUBLIC_CAPSULE_OFFERS.find((offer) => offer.slug === slug);
}
