import type { Software } from "../types";
import { isPlaceholderAppName } from "../utils/software";

/**
 * Display facts about an app, read off an Apple exchange reply. A bare App ID
 * record starts life as nothing but the number (see `bareSoftwareById`), but
 * the reply that lists its versions also names it: the item metadata carries
 * the same keys the backend reads out of the injected `iTunesMetadata.plist`
 * (`bundleDisplayName`/`itemName`, `artistName`/`sellerName`,
 * `softwareIcon57x57URL`/`artworkURL` — see `sinfInjector`), and the item
 * itself may carry `artwork-urls`. These facts fill only the gaps a record
 * has: a storefront name or a package-read icon is never overwritten.
 *
 * The facts live in a page-session cache keyed by App ID, filled by every
 * successful version exchange (`listVersions`, `getDownloadInfo`,
 * `getVersionMetadata`) and read wherever a bare record is shown or created —
 * so a record keeps its name and icon across searches in the session without
 * another exchange. A reload starts empty. Components subscribe
 * (`subscribeAppFacts`) so a visible record refreshes the moment new facts
 * land, instead of waiting for the fill that fetched them to finish.
 */

export interface AppFacts {
  name?: string;
  artistName?: string;
  artworkUrl?: string;
  bundleID?: string;
}

/** The first non-empty string under any of the given keys, or undefined. */
function firstString(
  source: Record<string, any> | undefined,
  keys: string[],
): string | undefined {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return undefined;
}

/**
 * mzstatic thumbnails encode their size in the path (`…/114x114bb.jpg`); the
 * CDN renders any size, so ask for a larger one. Mirrors the backend's
 * `sharperIconURL` (`sinfInjector`). URLs that don't match are left alone.
 */
const THUMBNAIL_SIZE_RE = /\/(\d+)x(\d+)(bb\.(?:png|jpe?g))$/i;
const PREFERRED_ICON_SIZE = 512;

function sharperIconURL(url: string): string {
  const match = THUMBNAIL_SIZE_RE.exec(url);
  if (!match || Number(match[1]) >= PREFERRED_ICON_SIZE) return url;
  const size = `${PREFERRED_ICON_SIZE}x${PREFERRED_ICON_SIZE}${match[3]}`;
  return `${url.slice(0, match.index + 1)}${size}`;
}

/** Only an https artwork URL is ever rendered. */
function cleanArtworkURL(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const sharpened = sharperIconURL(url);
  return sharpened.startsWith("https://") ? sharpened : undefined;
}

/** The artwork URL nested under an item's `artwork-urls` dict, if it has one. */
function artworkUrlsFallback(item: Record<string, any>): string | undefined {
  const urls = item["artwork-urls"];
  if (!urls || typeof urls !== "object" || Array.isArray(urls)) {
    return undefined;
  }
  const pick = (value: unknown): string | undefined => {
    if (typeof value === "string" && value !== "") return value;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const url = (value as Record<string, unknown>).url;
      if (typeof url === "string" && url !== "") return url;
    }
    return undefined;
  };
  const dict = urls as Record<string, unknown>;
  return (
    pick(dict.default) ??
    Object.values(dict)
      .map(pick)
      .find((url) => url !== undefined)
  );
}

/** Display facts from one exchange reply item (`songList[0]`), if it names any. */
export function appFactsFromItem(
  item: Record<string, any> | undefined,
): AppFacts {
  if (!item) return {};
  const metadata = item.metadata as Record<string, any> | undefined;
  const facts: AppFacts = {};
  const name = firstString(metadata, ["bundleDisplayName", "itemName"]);
  if (name) facts.name = name;
  const artistName = firstString(metadata, ["artistName", "sellerName"]);
  if (artistName) facts.artistName = artistName;
  const artworkUrl = cleanArtworkURL(
    firstString(metadata, ["softwareIcon57x57URL", "artworkURL"]) ??
      artworkUrlsFallback(item),
  );
  if (artworkUrl) facts.artworkUrl = artworkUrl;
  const bundleID = firstString(metadata, ["softwareVersionBundleId"]);
  if (bundleID) facts.bundleID = bundleID;
  return facts;
}

/** Session facts per App ID; a later exchange only fills fields still unknown. */
const factsCache = new Map<number, AppFacts>();

/** Listeners notified when the session cache gains new facts. */
const factsListeners = new Set<() => void>();

/**
 * Subscribes to new display facts. The callback runs the moment an exchange
 * names an app — before the version-detail fill that triggered it finishes —
 * so a visible record refreshes without waiting for the fill or another
 * search. Returns an unsubscribe function.
 */
export function subscribeAppFacts(listener: () => void): () => void {
  factsListeners.add(listener);
  return () => {
    factsListeners.delete(listener);
  };
}

function notifyAppFacts(): void {
  for (const listener of factsListeners) listener();
}

export function recordAppFacts(appId: number, facts: AppFacts): void {
  const existing = factsCache.get(appId);
  if (!existing) {
    factsCache.set(appId, { ...facts });
    if (Object.keys(facts).length > 0) notifyAppFacts();
    return;
  }
  let changed = false;
  for (const [key, value] of Object.entries(facts)) {
    if (value !== undefined && existing[key as keyof AppFacts] === undefined) {
      (existing as Record<string, string>)[key] = value;
      changed = true;
    }
  }
  if (changed) notifyAppFacts();
}

export function cachedAppFacts(appId: number): AppFacts | undefined {
  return factsCache.get(appId);
}

/** Clears the session cache (tests; a reload does the same). */
export function clearCachedAppFacts(): void {
  factsCache.clear();
}

/**
 * The fields of `facts` that fill gaps in `app` — nothing more. A record keeps
 * its own name unless it still carries the `App <id>` placeholder, and keeps
 * its own icon, artist and bundle id unless they are empty.
 */
export function appFactsPatch(
  app: Software,
  facts: AppFacts,
): Partial<Software> {
  const patch: Partial<Software> = {};
  if (
    facts.name !== undefined &&
    (app.name === "" || isPlaceholderAppName(app.name))
  ) {
    patch.name = facts.name;
  }
  if (facts.artistName !== undefined && app.artistName === "") {
    patch.artistName = facts.artistName;
  }
  if (facts.artworkUrl !== undefined && app.artworkUrl === "") {
    patch.artworkUrl = facts.artworkUrl;
  }
  if (facts.bundleID !== undefined && app.bundleID === "") {
    patch.bundleID = facts.bundleID;
  }
  return patch;
}

/**
 * `app` with the session's cached facts (or the given ones) merged into its
 * gaps, or `app` itself when there is nothing to fill — the same reference,
 * so callers can tell a no-op from a change without comparing fields.
 */
export function withAppFacts(app: Software, facts?: AppFacts): Software {
  const patch = appFactsPatch(app, facts ?? cachedAppFacts(app.id) ?? {});
  return Object.keys(patch).length === 0 ? app : { ...app, ...patch };
}
