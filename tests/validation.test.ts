import { describe, it, expect } from "vitest";
import {
  ageAt,
  registerSchema,
  safeOrigin,
  testStripeKey,
} from "../src/lib/validation";
describe("Adult-only registration", () => {
  it("handles birthday boundary", () => {
    const now = new Date("2026-10-17T12:00:00Z");
    expect(ageAt("2008-10-17", now)).toBe(18);
    expect(ageAt("2008-10-18", now)).toBe(17);
  });
  it("rejects invalid calendar dates and future birth dates", () => {
    expect(ageAt("2000-02-30")).toBe(-1);
    expect(
      registerSchema.safeParse({
        email: "a@example.com",
        password: "a-long-password",
        birthDate: "2099-01-01",
        consent: true,
      }).success,
    ).toBe(false);
  });
  it("requires explicit consent and long passwords", () => {
    const base = {
      email: "a@example.com",
      password: "a-long-password",
      birthDate: "1990-01-01",
      consent: true,
    };
    expect(registerSchema.safeParse(base).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, consent: false }).success).toBe(
      false,
    );
    expect(
      registerSchema.safeParse({ ...base, password: "short" }).success,
    ).toBe(false);
  });
});
describe("Request and payment boundary", () => {
  it("rejects cross-site and missing origin", () => {
    expect(
      safeOrigin(
        new Request("http://localhost:3000/api/action", {
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toBe(false);
    expect(safeOrigin(new Request("http://localhost:3000/api/action"))).toBe(
      false,
    );
    expect(
      safeOrigin(
        new Request("http://localhost:3000/api/action", {
          headers: { origin: "http://localhost:3000" },
        }),
      ),
    ).toBe(true);
  });
  it("disallows live payments", () => {
    expect(() => testStripeKey("sk_live_example")).toThrow();
    expect(() => testStripeKey(undefined)).toThrow();
    expect(testStripeKey("sk_test_example")).toBe("sk_test_example");
  });
});
