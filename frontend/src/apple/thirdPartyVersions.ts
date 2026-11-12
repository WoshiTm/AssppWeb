/**
 * Version history from a third-party archive, used only as a fallback when
 * Apple's own version exchange names nothing for an app — the delisted-app
 * case, where the storefront has no entry and the exchange answers empty even
 * though the account owns the app and can still download it.
 *
 * The archive is a public, unauthenticated JSON API (CORS-open, so the browser
 * calls it directly; no account data is sent — only the numeric App ID). It
 * records only version ids, display versions, sizes and dates: no names, no
 * artwork. Those come from Apple's exchange reply instead (see `appFacts`).
 *
 * This module never decides *whether* to fall back — the caller does (a
 * session or license failure must never be masked by third-party data). It
 * only answers "what versions does the archive know", returning an empty list
 * for every failure: unreachable, slow, malformed, or simply unknown.
 */

export interface ThirdPartyVersionEntry {
  /** Apple's external version identifier, as a string. */
  versionId: string;
  /** Display version (`bundle_version`); "" when the archive does not name one. */
  displayVersion: string;
  /** The history's `created_at`, verbatim; "" when absent. */
  releaseDate: string;
}

export interface ThirdPartyVersionList {
  /** External version identifiers, newest first, as the archive lists them. */
  versions: string[];
  /** One entry per version id, in the same order. */
  entries: ThirdPartyVersionEntry[];
  /** Display version of the newest entry, when the archive names it. */
  latestDisplayVersion?: string;
}

const HISTORY_ENDPOINT = "https://apis.bilin.eu.org/history";
/** The archive is a best-effort fallback: never hold the picker longer than this. */
const HISTORY_TIMEOUT_MS = 10_000;

export async function fetchThirdPartyVersionList(
  appId: string | number,
): Promise<ThirdPartyVersionList> {
  const empty: ThirdPartyVersionList = { versions: [], entries: [] };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HISTORY_TIMEOUT_MS);
  try {
    const res = await fetch(`${HISTORY_ENDPOINT}/${appId}`, {
      signal: controller.signal,
    });
    if (!res.ok) return empty;
    return parseThirdPartyHistory((await res.json()) as unknown);
  } catch {
    return empty;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parses the archive's `{ code, data: [...] }` shape. Entries are deduplicated
 * by version id, keeping the first (newest) occurrence — the archive can list
 * one id twice under different display versions — and an entry the archive
 * dates but does not name keeps its id with an empty display version.
 */
export function parseThirdPartyHistory(body: unknown): ThirdPartyVersionList {
  const empty: ThirdPartyVersionList = { versions: [], entries: [] };
  if (typeof body !== "object" || body === null) return empty;
  const record = body as Record<string, unknown>;
  if (typeof record.code === "number" && record.code !== 200) return empty;
  const data = record.data;
  if (!Array.isArray(data)) return empty;

  const seen = new Set<string>();
  const entries: ThirdPartyVersionEntry[] = [];
  for (const raw of data) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as Record<string, unknown>;
    const id = entry.external_identifier;
    if (id === undefined || id === null || String(id).trim() === "") continue;
    const versionId = String(id);
    if (seen.has(versionId)) continue;
    seen.add(versionId);
    const display = entry.bundle_version;
    const displayVersion =
      typeof display === "string" && display !== "" && display !== "未知"
        ? display
        : "";
    const created = entry.created_at;
    entries.push({
      versionId,
      displayVersion,
      releaseDate: typeof created === "string" ? created : "",
    });
  }

  const versions = entries.map((entry) => entry.versionId);
  const latestDisplayVersion = entries[0]?.displayVersion || undefined;
  return { versions, entries, latestDisplayVersion };
}
