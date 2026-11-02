import { useEffect, useState } from "react";

// Hash routes so GitHub Pages never needs server rewrites: "#/" is the board, "#/season" the season.
export type Page = "home" | "season";

export function parseRoute(hash: string): Page {
  return /^#\/?season\b/.test(hash) ? "season" : "home";
}

export const pageHref = (page: Page) => (page === "season" ? "#/season" : "#/");

export function useRoute(): Page {
  const [page, setPage] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const on = () => {
      setPage(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return page;
}
