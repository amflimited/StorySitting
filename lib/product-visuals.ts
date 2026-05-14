export type ProductVisual = {
  key: string;
  title: string;
  description: string;
  src: string;
  bestUse: string;
};

const PUBLIC_IMAGE_BASE = "https://storysitting.com/assets/images/product";

export const STORYSITTING_PRODUCT_VISUALS: ProductVisual[] = [
  {
    key: "signature-capsule-lineup",
    title: "Signature Story Capsule",
    description: "The flagship product lineup: Story Book, Voice Capsule, quote cards, archive, photos, and private player.",
    src: `${PUBLIC_IMAGE_BASE}/signature-capsule-lineup.jpg`,
    bestUse: "Dashboard hero, capsule completion screen, public proof, delivery overview"
  },
  {
    key: "first-listen-family",
    title: "First Listen",
    description: "A family experiencing the finished Story Capsule together.",
    src: `${PUBLIC_IMAGE_BASE}/first-listen-family.jpg`,
    bestUse: "Family progress, delivery, thank-you, final review"
  },
  {
    key: "voice-portrait",
    title: "Voice Portrait",
    description: "Named story clips, listening cards, and the real recorded voice.",
    src: `${PUBLIC_IMAGE_BASE}/voice-portrait-preserve-voice.jpg`,
    bestUse: "Voice clip builder, audio section, privacy/trust, remembrance"
  },
  {
    key: "scattered-to-finished",
    title: "Scattered to Finished",
    description: "The transformation from messy materials into a finished Capsule.",
    src: `${PUBLIC_IMAGE_BASE}/scattered-to-finished-capsule.jpg`,
    bestUse: "Story Map, onboarding, how-it-works"
  },
  {
    key: "recipe-inheritance",
    title: "Recipe Inheritance Kit",
    description: "A recipe story, voice, photo, and archive components.",
    src: `${PUBLIC_IMAGE_BASE}/recipe-inheritance-kit.jpg`,
    bestUse: "Favorite Meals, recipe contributions, sample Capsule"
  },
  {
    key: "life-story-book",
    title: "Life Story Book",
    description: "A life story preserved as book, quote, audio, and archive.",
    src: `${PUBLIC_IMAGE_BASE}/life-story-book.jpg`,
    bestUse: "Life Stories, story book preview, final capsule"
  },
  {
    key: "start-with-one-memory",
    title: "Start With One Memory",
    description: "The simplest start path: one memory, one Story Map, one private beginning.",
    src: `${PUBLIC_IMAGE_BASE}/start-with-one-memory.jpg`,
    bestUse: "New Story Room, start request, onboarding"
  },
  {
    key: "heirloom-box",
    title: "Heirloom Experience Box",
    description: "The premium physical delivery package.",
    src: `${PUBLIC_IMAGE_BASE}/heirloom-experience-box.jpg`,
    bestUse: "Pricing, delivery, founding families"
  },
  {
    key: "home-place",
    title: "Home & Place Capsule",
    description: "Home, place, notes, photos, voice, and story book.",
    src: `${PUBLIC_IMAGE_BASE}/home-place-voice-capsule.jpg`,
    bestUse: "Home/place story type, object/place contributions"
  },
  {
    key: "private-capsule-mobile",
    title: "Private Capsule Mobile",
    description: "The private digital Capsule experience on a phone.",
    src: `${PUBLIC_IMAGE_BASE}/private-capsule-mobile.jpg`,
    bestUse: "App dashboard, capsule preview, family view"
  }
];

export function getProductVisual(key: string) {
  return STORYSITTING_PRODUCT_VISUALS.find((visual) => visual.key === key);
}

export function productVisualsFor(keys: string[]) {
  return keys.map(getProductVisual).filter((visual): visual is ProductVisual => Boolean(visual));
}
