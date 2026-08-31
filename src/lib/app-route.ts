export function appRoute(pathname: string) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (normalized === "/") return "home" as const;
  if (normalized === "/album") return "album" as const;
  if (normalized === "/album/admin") return "admin" as const;
  return "not-found" as const;
}
