import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  admin: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  userStorage: vi.fn(),
  userUpload: vi.fn(),
  serviceStorage: vi.fn(),
  serviceUpload: vi.fn(),
  cleanup: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  authenticated: mocks.auth,
  adminClient: mocks.admin,
}));
vi.mock("@/lib/profiles", () => ({ rpc: mocks.rpc }));
import { POST } from "../src/app/api/photos/route";

const uid = "11111111-1111-4111-8111-111111111111";
const path = `${uid}/22222222-2222-4222-8222-222222222222.webp`;
const db = {
  from: mocks.from,
  rpc: mocks.cleanup,
  storage: { from: mocks.userStorage },
};
function upload(
  bytes: Uint8Array,
  type = "image/jpeg",
  origin: string | null = "https://app.test",
) {
  const form = new FormData();
  form.set(
    "file",
    new File([Uint8Array.from(bytes)], "portrait.jpg", { type }),
  );
  return new Request("https://app.test/api/photos", {
    method: "POST",
    headers: origin ? { origin } : {},
    body: form,
  });
}
async function jpeg() {
  return sharp({
    create: { width: 32, height: 24, channels: 3, background: "#aa5577" },
  })
    .jpeg()
    .toBuffer();
}
function expectNoWrite() {
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.serviceUpload).not.toHaveBeenCalled();
  expect(mocks.userUpload).not.toHaveBeenCalled();
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_URL", "https://app.test");
  mocks.auth.mockResolvedValue({ db, user: { id: uid } });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockResolvedValue({ data: [], error: null });
  mocks.rpc.mockResolvedValue({ path, bucket: "profile-photos" });
  mocks.admin.mockReturnValue({ storage: { from: mocks.serviceStorage } });
  mocks.serviceStorage.mockReturnValue({ upload: mocks.serviceUpload });
  mocks.serviceUpload.mockResolvedValue({ error: null });
  mocks.userStorage.mockReturnValue({ upload: mocks.userUpload });
  mocks.userUpload.mockRejectedValue(new Error("Client upload forbidden"));
  mocks.cleanup.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("photo upload trust boundary (mocked Supabase, actual Sharp)", () => {
  it("rejects unauthenticated requests before accessing storage or reserving a photo", async () => {
    mocks.auth.mockRejectedValue(new Error("Autenticação necessária."));
    expect((await POST(upload(await jpeg()))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
    expectNoWrite();
  });
  it.each(["https://attacker.test", null])(
    "rejects foreign or missing Origin (%s) before authentication",
    async (origin) => {
      expect(
        (await POST(upload(await jpeg(), "image/jpeg", origin))).status,
      ).toBe(403);
      expect(mocks.auth).not.toHaveBeenCalled();
      expectNoWrite();
    },
  );
  it("rejects a fake JPEG MIME type whose bytes are PNG", async () => {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    expect((await POST(upload(png, "image/jpeg"))).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
    expectNoWrite();
  });
  it("rejects a corrupt JPEG even when its magic bytes look valid", async () => {
    expect(
      (
        await POST(
          upload(Uint8Array.from([255, 216, 255, ...Array(40).fill(0)])),
        )
      ).status,
    ).toBe(400);
    expectNoWrite();
  });
  it("strips actual EXIF/GPS metadata, normalizes orientation, and publishes WebP through the service client only", async () => {
    const original = await sharp(await jpeg())
      .withExif({
        IFD0: { Orientation: "6", Artist: "Private photographer" },
        IFD3: {
          GPSLatitudeRef: "N",
          GPSLatitude: "38/1 43/1 12/1",
          GPSLongitudeRef: "W",
          GPSLongitude: "9/1 8/1 24/1",
        },
      })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const input = await sharp(original).metadata();
    expect(input.exif).toBeDefined();
    expect(input.orientation).toBe(6);
    // Ensure the fixture contains a GPS IFD pointer (tag 0x8825), not just an EXIF label.
    const exif = input.exif!;
    const littleEndian = exif.toString("ascii", 6, 8) === "II";
    expect(
      exif.includes(
        Buffer.from(
          littleEndian ? [0x25, 0x88, 0x04, 0x00] : [0x88, 0x25, 0x00, 0x04],
        ),
      ),
    ).toBe(true);
    const response = await POST(upload(original));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: "Fotografia adicionada.",
    });
    expect(mocks.eq).toHaveBeenCalledWith("user_id", uid);
    expect(mocks.rpc).toHaveBeenCalledWith(db, "reserve_photo", {
      p_slot: 1,
      p_extension: "webp",
    });
    expect(mocks.admin.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.rpc.mock.invocationCallOrder[0],
    );
    expect(mocks.serviceStorage).toHaveBeenCalledWith("profile-photos");
    expect(mocks.serviceUpload).toHaveBeenCalledExactlyOnceWith(
      path,
      expect.any(Buffer),
      { contentType: "image/webp", upsert: false },
    );
    const output = mocks.serviceUpload.mock.calls[0][1] as Buffer;
    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.exif).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.width).toBe(24);
    expect(metadata.height).toBe(32);
    expect(await sharp(output).raw().toBuffer()).toHaveLength(24 * 32 * 3);
    expect(mocks.userStorage).not.toHaveBeenCalled();
    expect(mocks.userUpload).not.toHaveBeenCalled();
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
  it("denies a tenth photo without invoking privileged storage", async () => {
    mocks.eq.mockResolvedValue({
      data: Array.from({ length: 9 }, (_, i) => ({ slot: i + 1 })),
      error: null,
    });
    const response = await POST(upload(await jpeg()));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/9 fotografias/);
    expectNoWrite();
  });
  it("does not report success when reservation authorization fails", async () => {
    mocks.rpc.mockRejectedValue(new Error("active_profile_required"));
    expect((await POST(upload(await jpeg()))).status).toBe(400);
    expect(mocks.admin).toHaveBeenCalledTimes(1);
    expect(mocks.serviceStorage).not.toHaveBeenCalled();
    expect(mocks.serviceUpload).not.toHaveBeenCalled();
  });
  it("does not reserve a slot when service client configuration fails", async () => {
    mocks.admin.mockImplementation(() => {
      throw new Error("Serviço administrativo ainda não configurado.");
    });
    expect((await POST(upload(await jpeg()))).status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.serviceStorage).not.toHaveBeenCalled();
    expect(mocks.userStorage).not.toHaveBeenCalled();
  });
  it("releases the reserved slot and returns failure when service upload fails", async () => {
    mocks.serviceUpload.mockResolvedValue({
      error: new Error("Storage unavailable"),
    });
    expect((await POST(upload(await jpeg()))).status).toBe(400);
    expect(mocks.cleanup).toHaveBeenCalledExactlyOnceWith("remove_photo", {
      p_slot: 1,
    });
    expect(mocks.userStorage).not.toHaveBeenCalled();
  });
});
