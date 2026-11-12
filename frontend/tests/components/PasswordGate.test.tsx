import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PasswordGate, {
  getAccessToken,
} from "../../src/components/Auth/PasswordGate";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function jsonResponse(data: unknown) {
  return Promise.resolve({ json: () => Promise.resolve(data) });
}

async function sha256hex(value: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function renderGate() {
  return render(
    <PasswordGate>
      <div>App content</div>
    </PasswordGate>,
  );
}

describe("PasswordGate storage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    localStorage.clear();
    sessionStorage.clear();
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/auth/status") return jsonResponse({ required: true });
      if (url === "/api/auth/verify") return jsonResponse({ ok: true });
      throw new Error(`unexpected fetch ${url}`);
    });
  });

  it("saves a verified login to localStorage", async () => {
    renderGate();

    const input = await screen.findByLabelText("auth.placeholder");
    fireEvent.change(input, { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "auth.submit" }));

    expect(await screen.findByText("App content")).toBeTruthy();
    expect(localStorage.getItem("auth-token")).toBe(
      await sha256hex("secret"),
    );
    expect(getAccessToken()).toBe(localStorage.getItem("auth-token"));
  });

  it("lets a stored localStorage login straight in", async () => {
    localStorage.setItem("auth-token", "stored-hash");
    renderGate();

    expect(await screen.findByText("App content")).toBeTruthy();
    expect(screen.queryByLabelText("auth.placeholder")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/verify",
      expect.objectContaining({
        body: JSON.stringify({ token: "stored-hash" }),
      }),
    );
  });

  it("ignores a token left in sessionStorage", async () => {
    sessionStorage.setItem("auth-token", "stale-hash");
    renderGate();

    expect(await screen.findByLabelText("auth.placeholder")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/auth/verify",
      expect.anything(),
    );
  });

  it("falls back to the form when the stored token is stale", async () => {
    localStorage.setItem("auth-token", "stale-hash");
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/auth/status") return jsonResponse({ required: true });
      if (url === "/api/auth/verify") return jsonResponse({ ok: false });
      throw new Error(`unexpected fetch ${url}`);
    });
    renderGate();

    expect(await screen.findByLabelText("auth.placeholder")).toBeTruthy();
    expect(localStorage.getItem("auth-token")).toBeNull();
  });
});
