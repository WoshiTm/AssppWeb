import { beforeEach, describe, expect, it, vi } from "vitest";
import { getVersionMetadata } from "../../src/apple/versionLookup";
import {
  cachedAppFacts,
  clearCachedAppFacts,
  recordAppFacts,
} from "../../src/apple/appFacts";
import { ensureAppFacts } from "../../src/apple/ensureAppFacts";
import { bareSoftwareById } from "../../src/utils/software";
import type { Account, Software } from "../../src/types";

vi.mock("../../src/apple/versionLookup", () => ({
  getVersionMetadata: vi.fn(),
}));

const account: Account = {
  email: "user@example.test",
  password: "",
  appleId: "user@example.test",
  store: "143441",
  firstName: "Test",
  lastName: "User",
  passwordToken: "test-token",
  directoryServicesIdentifier: "123456789",
  cookies: [],
  deviceIdentifier: "001122aabbcc",
};

function namedRecord(id: string): Software {
  const record = bareSoftwareById(id, "ios");
  record.name = "小推";
  record.artworkUrl = "https://example.com/icon.png";
  return record;
}

describe("apple/ensureAppFacts", () => {
  beforeEach(() => {
    clearCachedAppFacts();
    vi.mocked(getVersionMetadata).mockReset();
    // The real exchange records the facts itself; the mock does the same.
    vi.mocked(getVersionMetadata).mockImplementation(
      async (_account, app: Software) => {
        recordAppFacts(app.id, {
          name: "小推",
          artworkUrl: "https://example.com/icon.png",
          artistName: "Example Studio",
          bundleID: "com.example.xiaotui",
        });
        return {
          metadata: {
            displayVersion: "1.1.6",
            releaseDate: "2026-03-13T08:44:16.000Z",
          },
          updatedCookies: [],
        } as never;
      },
    );
  });

  it("runs one metadata-only exchange for a record with gaps", async () => {
    const app = bareSoftwareById("6503940951", "ios");

    await ensureAppFacts(account, app, "883341013");

    expect(getVersionMetadata).toHaveBeenCalledTimes(1);
    expect(getVersionMetadata).toHaveBeenCalledWith(
      account,
      app,
      "883341013",
    );
    expect(cachedAppFacts(6503940951)?.name).toBe("小推");
  });

  it("skips a record with no gaps", async () => {
    await ensureAppFacts(account, namedRecord("6503940952"), "883341013");

    expect(getVersionMetadata).not.toHaveBeenCalled();
  });

  it("skips when the session already knows the facts", async () => {
    recordAppFacts(6503940953, {
      name: "小推",
      artworkUrl: "https://example.com/icon.png",
    });

    await ensureAppFacts(
      account,
      bareSoftwareById("6503940953", "ios"),
      "883341013",
    );

    expect(getVersionMetadata).not.toHaveBeenCalled();
  });

  it("attempts a record at most once per session", async () => {
    const app = bareSoftwareById("6503940954", "ios");
    vi.mocked(getVersionMetadata).mockRejectedValue(new Error("no route"));

    await ensureAppFacts(account, app, "883341013");
    await ensureAppFacts(account, app, "883341013");

    expect(getVersionMetadata).toHaveBeenCalledTimes(1);
  });

  it("swallows an exchange failure", async () => {
    vi.mocked(getVersionMetadata).mockRejectedValue(new Error("no route"));

    await expect(
      ensureAppFacts(
        account,
        bareSoftwareById("6503940955", "ios"),
        "883341013",
      ),
    ).resolves.toBeUndefined();
  });

  it("skips without a version to pin", async () => {
    await ensureAppFacts(account, bareSoftwareById("6503940956", "ios"), "");

    expect(getVersionMetadata).not.toHaveBeenCalled();
  });
});
