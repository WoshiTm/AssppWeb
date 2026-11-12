import { cachedAppFacts } from "./appFacts";
import { getVersionMetadata } from "./versionLookup";
import { isPlaceholderAppName } from "../utils/software";
import type { Account, Software } from "../types";

/** App ids already given one facts exchange this page session. */
const attempted = new Set<number>();

/**
 * Names a record the version flow never exchanged for. When every version's
 * metadata came from the backend's shared cache, the silent fill has nothing
 * to ask Apple — so no exchange ran this session and nothing recorded the
 * app's display facts. One metadata-only exchange fills the name/icon gap;
 * the exchange records the facts itself and subscribers refresh the record.
 * Best-effort and silent: a failure leaves the record as it was, and a record
 * is attempted at most once per page session.
 */
export async function ensureAppFacts(
  account: Account,
  app: Software,
  versionId: string,
): Promise<void> {
  if (versionId === "") return;
  if (attempted.has(app.id)) return;
  const gaps =
    app.name === "" ||
    isPlaceholderAppName(app.name) ||
    app.artworkUrl === "";
  if (!gaps) return;
  const known = cachedAppFacts(app.id);
  if (known?.name !== undefined && known?.artworkUrl !== undefined) return;
  attempted.add(app.id);
  try {
    await getVersionMetadata(account, app, versionId);
  } catch {
    // Best-effort: the record stays bare.
  }
}
