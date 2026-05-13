export const PUBLIC_MEDIA_BUCKET = "public-site-assets";

export type MediaSlot = {
  id: string;
  label: string;
  description: string;
  recommendedUse: string;
};

export const MEDIA_SLOTS: MediaSlot[] = [
  { id: "homepage.hero", label: "Homepage hero", description: "Main public homepage image.", recommendedUse: "Warm family/story image." },
  { id: "sample.grandmas-sunday-dinner.hero", label: "Grandma’s Sunday Dinner hero", description: "Main sample Capsule image.", recommendedUse: "Kitchen, recipe, family table, or tradition image." },
  { id: "sample.grandmas-sunday-dinner.recipe", label: "Grandma’s Sunday Dinner recipe/object", description: "Supporting sample image.", recommendedUse: "Recipe card, spoon, table setting, handwritten note, or kitchen object." },
  { id: "capsules.favorite-meals.hero", label: "Favorite Meals page hero", description: "Hero image for recipe and family tradition offer page.", recommendedUse: "Food, kitchen, recipe, table, or family meal." },
  { id: "capsules.life-stories.hero", label: "Life Stories page hero", description: "Hero image for parent/grandparent life story offer page.", recommendedUse: "Portrait, old photos, conversation, or memory object." },
  { id: "capsules.milestones.hero", label: "Milestones page hero", description: "Hero image for birthday, anniversary, and celebration Capsules.", recommendedUse: "Celebration, family gathering, cards, cake, or anniversary objects." },
  { id: "capsules.remembrance.hero", label: "Remembrance page hero", description: "Hero image for remembrance Capsules.", recommendedUse: "Photos, letters, keepsake objects, or quiet family setting." },
  { id: "capsules.home-and-place.hero", label: "Home & Place page hero", description: "Hero image for home, object, and place story Capsules.", recommendedUse: "House, room, porch, object, table, yard, or meaningful place." },
  { id: "founding-families.hero", label: "Founding Families hero", description: "Image for founding-family pilot offer.", recommendedUse: "Trust-building family or keepsake image." },
  { id: "trust.privacy.hero", label: "Privacy and family material hero", description: "Image for privacy/trust page.", recommendedUse: "Album, box of photos, hands with keepsakes, or safe archive visual." }
];

export function getMediaSlot(id: string) {
  return MEDIA_SLOTS.find((slot) => slot.id === id);
}

export function slotFolder(slotId: string) {
  return `slots/${slotId.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
}

export function cleanUploadName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "upload";
}

export function isAllowedImageType(type: string) {
  return ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type);
}
