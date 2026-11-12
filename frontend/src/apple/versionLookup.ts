import type { DownloadStageObserver } from "./sap/client";
import type { Account, Software, VersionMetadata } from "../types";
import {
  FAILURE_LICENSE_NOT_FOUND,
  FAILURE_PASSWORD_TOKEN_EXPIRED,
  FAILURE_SIGN_IN_REQUIRED,
} from "./config";
import {
  DownloadError,
  createDownloadSession,
  customerMessageOf,
  failureTypeOf,
  itemsOf,
  requestDownloadProduct,
  type DownloadReply,
} from "./downloadProduct";
import {
  appFactsFromItem,
  recordAppFacts,
  type AppFacts,
} from "./appFacts";
import i18n from "../i18n";

/** Reads the display version and release date of one version, mirroring ipatool's `GetVersionMetadata`:
 * the same download-product exchange, pinned to the requested version. ipatool reads the IPA's Info.plist
 * (Apple's reply can carry stale values), so the reply's metadata is used instead — fetching the assets in
 * the browser would widen the Wisp host allowlist. The `releaseDate` dates the *app*, not the pinned build,
 * so callers must not present it as that build's date (see `utils/versionLabels`).
 */
export async function getVersionMetadata(
  account: Account,
  app: Software,
  versionId: string,
  onStage?: DownloadStageObserver,
): Promise<{
  metadata: VersionMetadata;
  updatedCookies: typeof account.cookies;
  appFacts?: AppFacts;
}> {
  const session = createDownloadSession(account, app);

  const reply = await requestDownloadProduct(session, versionId, { onStage });

  assertVersionMetadataReply(reply);

  const item = itemsOf(reply)[0];

  // The reply also names the app itself (see `appFacts`): remember its display
  // facts for the session so a bare record can show them. This runs before the
  // metadata checks below: the facts need neither a display version nor a
  // release date, and a reply without them must not take the name and icon
  // down with it.
  const facts = appFactsFromItem(item);
  const hasFacts = Object.keys(facts).length > 0;
  if (hasFacts) recordAppFacts(app.id, facts);

  const itemMetadata = item.metadata as Record<string, any> | undefined;
  if (!itemMetadata) {
    throw new DownloadError(i18n.t("errors.versions.missingMetadata"));
  }

  const displayVersion = itemMetadata.bundleShortVersionString as string;
  if (!displayVersion) {
    throw new DownloadError(i18n.t("errors.versions.missingMetadata"));
  }

  const rawReleaseDate = itemMetadata.releaseDate;
  if (!rawReleaseDate) {
    throw new DownloadError(i18n.t("errors.versions.missingMetadata"));
  }

  const releaseDate =
    rawReleaseDate instanceof Date
      ? rawReleaseDate.toISOString()
      : String(rawReleaseDate);

  return {
    metadata: { displayVersion, releaseDate },
    updatedCookies: session.cookies,
    appFacts: hasFacts ? facts : undefined,
  };
}

/** Failure mapping of ipatool's `GetVersionMetadata`. */
function assertVersionMetadataReply(reply: DownloadReply): void {
  const failureType = failureTypeOf(reply);
  const customerMessage = customerMessageOf(reply);
  const items = itemsOf(reply);

  if (
    failureType === FAILURE_PASSWORD_TOKEN_EXPIRED ||
    failureType === FAILURE_SIGN_IN_REQUIRED
  ) {
    throw new DownloadError(i18n.t("errors.versions.passwordExpired"), failureType);
  }

  if (failureType === FAILURE_LICENSE_NOT_FOUND) {
    throw new DownloadError(i18n.t("errors.versions.licenseRequired"), failureType);
  }

  if (customerMessage !== "" && (failureType !== "" || items.length === 0)) {
    throw new DownloadError(customerMessage, failureType || undefined);
  }

  if (failureType !== "") {
    throw new DownloadError(
      i18n.t("errors.versions.failed", { failureType }),
      failureType,
    );
  }

  if (items.length === 0) {
    throw new DownloadError(i18n.t("errors.versions.missingMetadata"));
  }
}
