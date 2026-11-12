import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appFactsFromItem,
  appFactsPatch,
  cachedAppFacts,
  clearCachedAppFacts,
  recordAppFacts,
  subscribeAppFacts,
  withAppFacts,
} from "../../src/apple/appFacts";
import { bareSoftwareById } from "../../src/utils/software";

describe("apple/appFacts", () => {
  beforeEach(() => {
    clearCachedAppFacts();
  });

  describe("appFactsFromItem", () => {
    it("reads the name, artist, icon and bundle id off the item metadata", () => {
      const facts = appFactsFromItem({
        metadata: {
          bundleDisplayName: "小推",
          artistName: "Example Studio",
          softwareIcon57x57URL:
            "https://is1-ssl.mzstatic.com/image/thumb/Purple/57x57bb.jpg",
          softwareVersionBundleId: "com.example.xiaotui",
        },
      });

      expect(facts).toEqual({
        name: "小推",
        artistName: "Example Studio",
        artworkUrl:
          "https://is1-ssl.mzstatic.com/image/thumb/Purple/512x512bb.jpg",
        bundleID: "com.example.xiaotui",
      });
    });

    it("falls back through the metadata key spellings", () => {
      const facts = appFactsFromItem({
        metadata: {
          itemName: "Fallback Name",
          sellerName: "Fallback Seller",
          artworkURL: "https://example.com/icon.png",
        },
      });

      expect(facts.name).toBe("Fallback Name");
      expect(facts.artistName).toBe("Fallback Seller");
      expect(facts.artworkUrl).toBe("https://example.com/icon.png");
    });

    it("prefers the display name over the item name", () => {
      const facts = appFactsFromItem({
        metadata: { bundleDisplayName: "Display", itemName: "Item" },
      });

      expect(facts.name).toBe("Display");
    });

    it("reads artwork-urls when the metadata names no icon", () => {
      const facts = appFactsFromItem({
        metadata: {},
        "artwork-urls": {
          default: { url: "https://is1-ssl.mzstatic.com/image/100x100bb.png" },
        },
      });

      expect(facts.artworkUrl).toBe(
        "https://is1-ssl.mzstatic.com/image/512x512bb.png",
      );
    });

    it("leaves a large or non-thumbnail icon URL alone", () => {
      const facts = appFactsFromItem({
        metadata: {
          artworkURL: "https://is1-ssl.mzstatic.com/image/1024x1024bb.jpg",
        },
      });
      expect(facts.artworkUrl).toBe(
        "https://is1-ssl.mzstatic.com/image/1024x1024bb.jpg",
      );

      const plain = appFactsFromItem({
        metadata: { artworkURL: "https://example.com/icon.png" },
      });
      expect(plain.artworkUrl).toBe("https://example.com/icon.png");
    });

    it("rejects a non-https artwork URL", () => {
      const facts = appFactsFromItem({
        metadata: { artworkURL: "http://example.com/icon.png" },
      });

      expect(facts.artworkUrl).toBeUndefined();
    });

    it("returns no facts for an empty item or empty metadata", () => {
      expect(appFactsFromItem(undefined)).toEqual({});
      expect(appFactsFromItem({})).toEqual({});
      expect(appFactsFromItem({ metadata: {} })).toEqual({});
      expect(
        appFactsFromItem({ metadata: { itemName: "   ", artworkURL: "" } }),
      ).toEqual({});
    });
  });

  describe("session cache", () => {
    it("records facts and only fills fields still unknown", () => {
      recordAppFacts(1, { name: "First" });
      recordAppFacts(1, { name: "Second", artworkUrl: "https://x/icon.png" });

      expect(cachedAppFacts(1)).toEqual({
        name: "First",
        artworkUrl: "https://x/icon.png",
      });
      expect(cachedAppFacts(2)).toBeUndefined();
    });
  });

  describe("subscribeAppFacts", () => {
    it("notifies when new facts are recorded, until unsubscribed", () => {
      const listener = vi.fn();
      const unsubscribe = subscribeAppFacts(listener);

      recordAppFacts(1, { name: "First" });
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      recordAppFacts(1, { artworkUrl: "https://x/icon.png" });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("stays silent when nothing new is learned", () => {
      recordAppFacts(1, { name: "First" });
      const listener = vi.fn();
      const unsubscribe = subscribeAppFacts(listener);

      recordAppFacts(1, { name: "Second" });
      recordAppFacts(1, {});
      recordAppFacts(2, {});
      expect(listener).not.toHaveBeenCalled();

      unsubscribe();
    });

    it("notifies when a later exchange fills a remaining gap", () => {
      recordAppFacts(1, { name: "First" });
      const listener = vi.fn();
      const unsubscribe = subscribeAppFacts(listener);

      recordAppFacts(1, { name: "Second", artworkUrl: "https://x/icon.png" });
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
    });
  });

  describe("appFactsPatch / withAppFacts", () => {
    it("fills a bare record's gaps and keeps its own values otherwise", () => {
      const bare = bareSoftwareById("923344062", "ios");
      const facts = {
        name: "小推",
        artistName: "Studio",
        artworkUrl: "https://x/icon.png",
        bundleID: "com.example.xiaotui",
      };

      const enriched = withAppFacts(bare, facts);
      expect(enriched.name).toBe("小推");
      expect(enriched.artistName).toBe("Studio");
      expect(enriched.artworkUrl).toBe("https://x/icon.png");
      expect(enriched.bundleID).toBe("com.example.xiaotui");
      expect(enriched.metadataSource).toBe("bare");

      const complete = {
        ...bare,
        name: "Real Name",
        artistName: "Real Studio",
        artworkUrl: "https://x/real.png",
        bundleID: "com.example.real",
      };
      expect(withAppFacts(complete, facts)).toBe(complete);
    });

    it("returns the same record when there is nothing to fill", () => {
      const bare = bareSoftwareById("1", "ios");
      expect(withAppFacts(bare, {})).toBe(bare);
      expect(appFactsPatch(bare, {})).toEqual({});
    });

    it("reads the session cache when no facts are given", () => {
      recordAppFacts(923344062, { name: "小推" });
      const bare = bareSoftwareById("923344062", "ios");

      expect(withAppFacts(bare).name).toBe("小推");
    });
  });
});
