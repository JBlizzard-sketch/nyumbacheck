import { useEffect } from "react";

type MetaOptions = {
  title: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogType?: "website" | "article";
};

const BASE_TITLE = "NyumbaCheck";
const BASE_DESCRIPTION =
  "Protect yourself from Nairobi real estate fraud. AI-powered property fraud detection, agent reputation scores, and market intelligence — built for Kenya.";

function setMeta(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setOg(property: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function usePageMeta(opts: MetaOptions | null) {
  useEffect(() => {
    if (!opts) return;
    const { title, description, ogTitle, ogDescription, ogType } = opts;
    const fullTitle = title === BASE_TITLE ? BASE_TITLE : `${title} — ${BASE_TITLE}`;
    const desc = description ?? BASE_DESCRIPTION;
    document.title = fullTitle;
    setMeta("description", desc);
    setOg("og:title", ogTitle ?? fullTitle);
    setOg("og:description", ogDescription ?? desc);
    setOg("og:type", ogType ?? "website");
    setOg("og:site_name", BASE_TITLE);
    return () => {
      document.title = BASE_TITLE;
    };
  }, [opts?.title, opts?.description]);
}
