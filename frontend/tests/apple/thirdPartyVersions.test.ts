import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchThirdPartyVersionList,
  parseThirdPartyHistory,
} from "../../src/apple/thirdPartyVersions";

describe("apple/thirdPartyVersions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("parseThirdPartyHistory", () => {
    it("parses versions newest first, as the archive lists them", () => {
      const result = parseThirdPartyHistory({
        code: 200,
        msg: "success",
        total: 2,
        data: [
          {
            bundle_version: "3.8.35",
            external_identifier: 850285746,
            size: null,
            created_at: "2024-09-01 07:26:23",
          },
          {
            bundle_version: "3.8.16",
            external_identifier: 839771927,
            size: null,
            created_at: "2021-02-01 00:27:34",
          },
        ],
      });

      expect(result.versions).toEqual(["850285746", "839771927"]);
      expect(result.latestDisplayVersion).toBe("3.8.35");
      expect(result.entries).toEqual([
        {
          versionId: "850285746",
          displayVersion: "3.8.35",
          releaseDate: "2024-09-01 07:26:23",
        },
        {
          versionId: "839771927",
          displayVersion: "3.8.16",
          releaseDate: "2021-02-01 00:27:34",
        },
      ]);
    });

    it("deduplicates a version id listed twice, keeping the first", () => {
      const result = parseThirdPartyHistory({
        code: 200,
        data: [
          { bundle_version: "3.1.3", external_identifier: 820694509 },
          { bundle_version: "3.2.1", external_identifier: 820694509 },
        ],
      });

      expect(result.versions).toEqual(["820694509"]);
      expect(result.entries[0].displayVersion).toBe("3.1.3");
    });

    it("keeps the id when the archive does not name the version", () => {
      const result = parseThirdPartyHistory({
        code: 200,
        data: [
          { bundle_version: "未知", external_identifier: 1 },
          { external_identifier: 2 },
        ],
      });

      expect(result.versions).toEqual(["1", "2"]);
      expect(result.entries[0].displayVersion).toBe("");
      expect(result.entries[1].displayVersion).toBe("");
      expect(result.latestDisplayVersion).toBeUndefined();
    });

    it("skips entries without a version id", () => {
      const result = parseThirdPartyHistory({
        code: 200,
        data: [
          { bundle_version: "1.0" },
          { bundle_version: "2.0", external_identifier: 9 },
        ],
      });

      expect(result.versions).toEqual(["9"]);
    });

    it("returns empty for a non-200 code, a missing list, or a bad body", () => {
      expect(
        parseThirdPartyHistory({ code: 404, data: [{ external_identifier: 1 }] }),
      ).toEqual({ versions: [], entries: [], latestDisplayVersion: undefined });
      expect(parseThirdPartyHistory({ code: 200 })).toEqual({
        versions: [],
        entries: [],
        latestDisplayVersion: undefined,
      });
      expect(parseThirdPartyHistory({ code: 200, data: "nope" })).toEqual({
        versions: [],
        entries: [],
        latestDisplayVersion: undefined,
      });
      expect(parseThirdPartyHistory(null)).toEqual({
        versions: [],
        entries: [],
        latestDisplayVersion: undefined,
      });
      expect(parseThirdPartyHistory("garbage")).toEqual({
        versions: [],
        entries: [],
        latestDisplayVersion: undefined,
      });
    });
  });

  describe("fetchThirdPartyVersionList", () => {
    it("asks the archive for the App ID and parses the answer", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 200,
          data: [{ bundle_version: "1.0", external_identifier: 42 }],
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await fetchThirdPartyVersionList(923344062);

      expect(fetchMock).toHaveBeenCalledWith(
        "https://apis.bilin.eu.org/history/923344062",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(result.versions).toEqual(["42"]);
    });

    it("returns empty when the archive answers an error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
      );

      await expect(fetchThirdPartyVersionList(1)).resolves.toEqual({
        versions: [],
        entries: [],
        latestDisplayVersion: undefined,
      });
    });

    it("returns empty when the request fails or the body is not JSON", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
      await expect(fetchThirdPartyVersionList(1)).resolves.toEqual({
        versions: [],
        entries: [],
        latestDisplayVersion: undefined,
      });

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => {
            throw new Error("not json");
          },
        }),
      );
      await expect(fetchThirdPartyVersionList(1)).resolves.toEqual({
        versions: [],
        entries: [],
        latestDisplayVersion: undefined,
      });
    });
  });
});
