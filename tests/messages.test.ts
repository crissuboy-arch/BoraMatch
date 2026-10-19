import { describe, it, expect } from "vitest";
import { mergeMessages } from "@/lib/messages";
describe("F04 lossless merge", () => {
  it("orders microseconds, offsets and equal timestamp UUID ties; deduplicates", () => {
    const a = { id: "a", createdAt: "2026-10-18T12:00:00.123456Z" };
    const b = { id: "b", createdAt: "2026-10-18T14:00:00.123456+02:00" };
    const c = { id: "c", createdAt: "2026-10-18T12:00:00.123455Z" };
    const d = { id: "d", createdAt: "2026-10-18T12:00:00.124000Z" };
    expect(mergeMessages([d, b, a], [c, a]).map(m => m.id)).toEqual(["c", "a", "b", "d"]);
    const updated = { ...a, body: "updated" };
    expect(mergeMessages([a], [updated])).toEqual([updated]);
  });
});
