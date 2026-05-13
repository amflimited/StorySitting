export type StoryCapsuleCategoryKey =
  | "parent-grandparent"
  | "recipe-tradition"
  | "family-home"
  | "milestone-birthday"
  | "anniversary"
  | "remembrance"
  | "retirement-life-work"
  | "family-reunion"
  | "holiday-tradition"
  | "family-business-chapter"
  | "custom";

export type StoryCapsuleCategory = {
  key: StoryCapsuleCategoryKey;
  label: string;
  plainLanguage: string;
  bestFor: string;
  expectedInputs: string[];
  defaultSections: string[];
  nextQuestion: string;
};

export const STORY_CAPSULE_CATEGORIES: StoryCapsuleCategory[] = [
  {
    key: "parent-grandparent",
    label: "Life Stories",
    plainLanguage: "Capture a loved one’s voice, memories, photos, lessons, and stories before the family loses easy access to them.",
    bestFor: "A parent, grandparent, elder, or important family member whose stories should not stay scattered in memory.",
    expectedInputs: ["voice notes", "old photos", "family questions", "timeline memories", "favorite sayings"],
    defaultSections: ["Who they are", "Early life", "Family memories", "Lessons and sayings", "What the family should remember"],
    nextQuestion: "What do you wish the family had asked this person sooner?"
  },
  {
    key: "recipe-tradition",
    label: "Favorite Meals & Traditions",
    plainLanguage: "Preserve the story behind a favorite recipe, holiday meal, kitchen ritual, or family tradition.",
    bestFor: "Recipes, holiday foods, Sunday dinners, handwritten cards, cooking memories, and traditions that live in one person’s head.",
    expectedInputs: ["recipe cards", "photos of food or objects", "voice explanation", "holiday memories", "who taught whom"],
    defaultSections: ["The recipe", "Who made it", "When the family gathered", "The details not written down", "How to carry it forward"],
    nextQuestion: "What would be lost if nobody wrote down the story behind this tradition?"
  },
  {
    key: "family-home",
    label: "Home & Place Stories",
    plainLanguage: "Preserve the memories connected to a meaningful house, room, object, move, or family place.",
    bestFor: "Moves, downsizing, cleaning out a home, or remembering the place where family life happened.",
    expectedInputs: ["room photos", "object photos", "family memories", "move context", "questions for relatives"],
    defaultSections: ["The place", "Rooms and objects", "Family moments", "What changed", "What comes with us"],
    nextQuestion: "What would your family want remembered about this place after the boxes are gone?"
  },
  {
    key: "milestone-birthday",
    label: "Milestones & Birthdays",
    plainLanguage: "Turn an important birthday or milestone into a family story project instead of only a party or card.",
    bestFor: "70th, 80th, 90th birthdays or any milestone where relatives want to gather memories and gratitude.",
    expectedInputs: ["family memories", "birthday messages", "old photos", "voice notes", "questions"],
    defaultSections: ["The person we are celebrating", "Favorite memories", "Family voices", "Milestones", "Messages for the future"],
    nextQuestion: "What should this person hear from the family while they can still receive it?"
  },
  {
    key: "anniversary",
    label: "Love Stories & Anniversaries",
    plainLanguage: "Preserve a couple’s story, family origin, photographs, advice, and memories from the people who know them.",
    bestFor: "Major anniversaries, vow renewals, family celebrations, and long marriages.",
    expectedInputs: ["old couple photos", "how-they-met stories", "family reflections", "letters", "advice"],
    defaultSections: ["How it began", "Building a life", "Family memories", "Lessons from the years", "What remains"],
    nextQuestion: "What part of this relationship does the family not want reduced to dates and photos?"
  },
  {
    key: "remembrance",
    label: "Remembrance",
    plainLanguage: "Gather memories from many people after a loss or during a season when the family wants to remember well.",
    bestFor: "Memorial-adjacent projects, remembrance gifts, and families collecting stories from relatives and friends.",
    expectedInputs: ["memories from multiple people", "photos", "voice notes", "quotes", "favorite stories"],
    defaultSections: ["Who they were", "Stories people keep telling", "Family voices", "Small details", "What we carry forward"],
    nextQuestion: "What stories should not disappear just because the service or gathering is over?"
  },
  {
    key: "retirement-life-work",
    label: "Work, Craft & Calling",
    plainLanguage: "Capture a person’s work, service, craft, career, calling, and the meaning behind what they built or gave.",
    bestFor: "Retirements, business exits, long careers, community service, trades, ministries, and family knowledge being passed down.",
    expectedInputs: ["career stories", "work photos", "customer/community memories", "lessons", "objects/tools"],
    defaultSections: ["The work", "What they built", "People impacted", "Lessons learned", "What should be passed on"],
    nextQuestion: "What did this person know, build, or give that should not vanish when they stop doing the work?"
  },
  {
    key: "family-reunion",
    label: "Family Gathering",
    plainLanguage: "Use a gathering as the moment to collect many voices and turn them into something finished after everyone goes home.",
    bestFor: "Reunions, holiday gatherings, extended family weekends, and multi-branch family projects.",
    expectedInputs: ["short memories", "family branch notes", "group photos", "voice clips", "questions"],
    defaultSections: ["The family gathered", "Branches and memories", "Stories from the room", "Names and connections", "What continues"],
    nextQuestion: "What should be captured while everyone is already paying attention?"
  },
  {
    key: "holiday-tradition",
    label: "Holidays & Rituals",
    plainLanguage: "Preserve the rituals, recipes, decorations, places, voices, and repeated moments that define family holidays.",
    bestFor: "Thanksgiving, Christmas, Easter, summer trips, annual gatherings, and rituals that make the family feel like itself.",
    expectedInputs: ["holiday photos", "recipes", "ritual descriptions", "voice memories", "old traditions"],
    defaultSections: ["The tradition", "How it started", "What everyone remembers", "Objects and recipes", "How to keep it going"],
    nextQuestion: "What holiday detail would feel wrong if nobody remembered how or why it started?"
  },
  {
    key: "family-business-chapter",
    label: "Family Chapters",
    plainLanguage: "Capture a family business, chapter, move, role, community story, or season before it changes.",
    bestFor: "Restaurants, shops, trades, family businesses, community roles, and chapters ending or changing hands.",
    expectedInputs: ["business photos", "customer memories", "family work stories", "objects/tools", "transition context"],
    defaultSections: ["What was built", "The people behind it", "Work and sacrifice", "Community memories", "What comes next"],
    nextQuestion: "What part of this chapter deserves to be remembered beyond the transaction or closing date?"
  },
  {
    key: "custom",
    label: "Things We Don’t Want Forgotten",
    plainLanguage: "A flexible Capsule for a person, place, milestone, question, tradition, object, or family chapter that does not fit neatly elsewhere.",
    bestFor: "Unusual projects, mixed family chapters, or early founding projects where the shape emerges during intake.",
    expectedInputs: ["memories", "photos", "voice notes", "questions", "documents"],
    defaultSections: ["The focus", "What came in", "Strongest memories", "Open questions", "What the family should keep"],
    nextQuestion: "What is the one thing the family will regret not capturing?"
  }
];

export function getStoryCapsuleCategory(key?: string | null) {
  return STORY_CAPSULE_CATEGORIES.find((category) => category.key === key) ?? STORY_CAPSULE_CATEGORIES[0];
}

export function categoryOptions() {
  return STORY_CAPSULE_CATEGORIES.map((category) => ({ value: category.key, label: category.label }));
}
