import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), presentCard: vi.fn(), db: { from: vi.fn() } }));
vi.mock("@/lib/supabase/server", () => ({ authenticated: async () => ({ db: mocks.db }), serverClient: async () => mocks.db }));
vi.mock("@/lib/profiles", () => ({ rpc: mocks.rpc, presentCard: mocks.presentCard }));
import { GET } from "@/app/api/data/route";
const card = { id: "peer", age: 28, city_id: "sao-paulo", city_name: "São Paulo", interests: [] };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.from.mockReturnValue({ select: () => ({ eq: async () => ({ data: [{ id: "sao-paulo", name: "São Paulo" }] }) }) });
  mocks.presentCard.mockImplementation(async (_db, p) => p);
  mocks.rpc.mockResolvedValue([card]);
});
describe("F03 city representations", () => {
  for (const city of ["sao-paulo", "São Paulo", "sÃO pAULO"]) it(city, async () => {
    const r = await GET(new Request(`http://localhost/api/data?resource=discover&city=${encodeURIComponent(city)}`));
    expect((await r.json()).data).toEqual([card]);
    expect(mocks.rpc.mock.calls[0][2].p_filters.city).toBe("sao-paulo");
  });
  it("likes accepts city ID without changing Gold RPC", async () => {
    const r = await GET(new Request("http://localhost/api/data?resource=likes&city=sao-paulo"));
    expect((await r.json()).data).toEqual([card]);
    expect(mocks.rpc).toHaveBeenCalledWith(mocks.db, "who_liked_me", {});
  });
});
describe("F04 timestamp cursor", () => {
  it("forwards composite cursor", async () => {
    mocks.rpc.mockResolvedValue([]);
    const before = "2026-10-18T12:00:00.123456Z", beforeId = "00000000-0000-4000-8000-000000000001";
    const r = await GET(new Request(`http://localhost/api/data?resource=messages&matchId=m&before=${before}&beforeId=${beforeId}`));
    expect(r.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(mocks.db, "get_messages_page", { p_match: "m", p_before: before, p_before_id: beforeId });
  });
  for (const query of ["beforeId=", "beforeId=bad", "beforeId=00000000-0000-4000-8000-000000000001", "before=2026-10-18T12:00:00Z&beforeId=bad"]) it(`rejects invalid composite ${query}`, async () => {
    const r = await GET(new Request(`http://localhost/api/data?resource=messages&matchId=m&${query}`));
    expect(r.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("forwards lossless PostgreSQL timestamp precision", async () => {
    mocks.rpc.mockResolvedValue([]);
    const before = "2026-10-18T12:00:00.123456+00:00";
    const r = await GET(new Request(`http://localhost/api/data?resource=messages&matchId=m&before=${encodeURIComponent(before)}`));
    expect(r.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(mocks.db, "get_messages_page", { p_match: "m", p_before: before });
  });
  for (const before of ["garbage", "", "2026-02-30T00:00:00Z", "infinity", "2026-10-18"]) it(`rejects ${JSON.stringify(before)} before RPC`, async () => {
    const r = await GET(new Request(`http://localhost/api/data?resource=messages&matchId=m&before=${encodeURIComponent(before)}`));
    expect(r.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
