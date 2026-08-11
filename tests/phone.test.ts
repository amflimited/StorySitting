import { describe, expect, it } from "vitest";
import { maskPhone, normalizeUsPhone } from "../lib/phone";

describe("phone helpers", () => {
  it("normalizes common US formats", () => {
    expect(normalizeUsPhone("(317) 555-0123")).toBe("+13175550123");
    expect(normalizeUsPhone("1-317-555-0123")).toBe("+13175550123");
  });

  it("does not echo a private number into the interface", () => {
    expect(maskPhone("+13175550123")).toBe("••• ••• 0123");
  });
});
