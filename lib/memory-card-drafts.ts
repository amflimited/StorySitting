type ContributionDraftInput = {
  title?: string | null;
  body?: string | null;
  contribution_type?: string | null;
  source?: string | null;
};

export type MemoryCardDraft = {
  title: string;
  summary: string;
  quote: string;
  themes: string[];
  people: string[];
  places: string[];
  estimated_date: string;
  life_era: string;
  confidence: number;
};

const THEME_RULES: Array<[string, string[]]> = [
  ["home", ["house", "home", "porch", "room", "kitchen", "yard", "barn", "farm"]],
  ["recipes", ["recipe", "cook", "bake", "meal", "dinner", "kitchen", "table", "supper"]],
  ["work", ["job", "work", "factory", "business", "farm", "shop", "truck", "tools"]],
  ["childhood", ["child", "kid", "school", "young", "grew up", "birthday"]],
  ["family", ["mom", "dad", "grandma", "grandpa", "mother", "father", "sister", "brother", "family"]],
  ["traditions", ["holiday", "christmas", "thanksgiving", "church", "reunion", "tradition"]],
  ["place", ["town", "street", "county", "indiana", "farm", "field", "homeplace", "barn"]],
  ["transition", ["sold", "move", "moving", "downsizing", "retirement", "goodbye", "last time"]]
];

function compactText(value?: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function sentenceSummary(text: string) {
  if (!text) return "";
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text];
  const joined = sentences.slice(0, 2).join(" ").trim();
  return joined.length > 420 ? `${joined.slice(0, 417).trim()}...` : joined;
}

function extractQuote(text: string) {
  const explicit = text.match(/[“\"]([^”\"]{12,180})[”\"]/);
  if (explicit?.[1]) return explicit[1].trim();

  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  const candidate = sentences.find((sentence) => {
    const clean = sentence.trim();
    return clean.length >= 28 && clean.length <= 180;
  });
  return candidate ? candidate.trim().replace(/[.!?]$/, "") : "";
}

function inferThemes(text: string, contributionType?: string | null) {
  const lower = text.toLowerCase();
  const themes = new Set<string>();

  if (contributionType) themes.add(contributionType.replaceAll("_", " "));
  for (const [theme, words] of THEME_RULES) {
    if (words.some((word) => lower.includes(word))) themes.add(theme);
  }

  return Array.from(themes).slice(0, 7);
}

function inferLifeEra(text: string) {
  const lower = text.toLowerCase();
  if (/child|kid|school|young|grew up/.test(lower)) return "Childhood / early life";
  if (/married|wedding|first house|baby|children/.test(lower)) return "Marriage / young family";
  if (/work|job|business|farm|factory|career/.test(lower)) return "Work / responsibility years";
  if (/retire|retirement|grandchildren|grandkids/.test(lower)) return "Later life / legacy";
  if (/sold|move|moving|downsizing|goodbye/.test(lower)) return "Transition moment";
  return "Unsorted life era";
}

function inferDate(text: string) {
  const year = text.match(/\b(19[2-9]\d|20[0-3]\d)\b/);
  if (year?.[1]) return year[1];
  const decade = text.match(/\b(19[2-9]0s|20[0-2]0s|twenties|thirties|forties|fifties|sixties|seventies|eighties|nineties)\b/i);
  return decade?.[1] ?? "";
}

function inferPlaces(text: string) {
  const places = new Set<string>();
  const known = ["Indiana", "farm", "kitchen", "home", "barn", "church", "school", "porch", "field"];
  for (const place of known) {
    if (text.toLowerCase().includes(place.toLowerCase())) places.add(place);
  }
  return Array.from(places).slice(0, 5);
}

function inferPeople(text: string) {
  const people = new Set<string>();
  const known = ["Mom", "Dad", "Grandma", "Grandpa", "Mother", "Father", "Aunt", "Uncle", "Sister", "Brother"];
  for (const person of known) {
    if (text.toLowerCase().includes(person.toLowerCase())) people.add(person);
  }
  return Array.from(people).slice(0, 5);
}

export function buildMemoryCardDraft(contribution: ContributionDraftInput): MemoryCardDraft {
  const title = compactText(contribution.title) || `${contribution.contribution_type ?? "Story"} contribution`;
  const body = compactText(contribution.body);
  const combined = `${title}. ${body}`.trim();
  const summary = sentenceSummary(body) || "Draft summary needed from staff review.";
  const themes = inferThemes(combined, contribution.contribution_type);
  const quote = extractQuote(body);
  const people = inferPeople(combined);
  const places = inferPlaces(combined);
  const estimated_date = inferDate(combined);
  const life_era = inferLifeEra(combined);

  let confidence = 0.45;
  if (body.length > 120) confidence += 0.15;
  if (quote) confidence += 0.1;
  if (themes.length >= 3) confidence += 0.1;
  if (people.length || places.length) confidence += 0.1;
  if (estimated_date) confidence += 0.05;

  return {
    title,
    summary,
    quote,
    themes,
    people,
    places,
    estimated_date,
    life_era,
    confidence: Math.min(0.95, Number(confidence.toFixed(2)))
  };
}

export function listToCsv(items: string[]) {
  return items.join(", ");
}
