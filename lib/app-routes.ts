export const appRoutes = {
  home: "/",
  dashboard: "/dashboard",
  homeplace: "/homeplace",
  newStoryRoom: "/story-rooms/new",
  storyRoom: (id: string) => `/story-rooms/${id}`,
  staff: "/staff",
  staffRoom: (id: string) => `/staff/story-rooms/${id}`,
  staffImportQuo: "/staff/import-quo",
  storyCapsules: "/story-capsules",
  storyCapsule: (slug: string) => `/story-capsules/${slug}`,
  signup: "/signup",
  login: "/login"
} as const;

export const publicRoutes = {
  marketingHome: "https://storysitting.com",
  marketingHomeplace: "https://storysitting.com/homeplace.html"
} as const;

export function safeRouteLabel(route: string) {
  return route
    .replace(/^\//, "")
    .replaceAll("/", " → ")
    .replaceAll("-", " ") || "home";
}
