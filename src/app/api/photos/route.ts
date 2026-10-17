import { NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import { authenticated, adminClient } from "@/lib/supabase/server";
import { rpc } from "@/lib/profiles";
import { checkOrigin, failure } from "@/lib/http";
function validImage(bytes: Uint8Array, type: string) {
  return type === "image/jpeg"
    ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : type === "image/png"
      ? bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10"
      : type === "image/webp"
        ? new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
          new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
        : false;
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { db, user } = await authenticated();
    if (Number(request.headers.get("content-length")) > 9 * 1024 * 1024)
      throw new Error("Fotografia excede o limite de 8 MB.");
    const form = await request.formData(),
      file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size > 8 * 1024 * 1024 ||
      file.size < 12
    )
      throw new Error("Fotografia inválida. Limite de 8 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validImage(bytes, file.type))
      throw new Error("Fotografia inválida. Use JPEG, PNG ou WebP.");
    const { data: photos, error } = await db
      .from("photos")
      .select("slot")
      .eq("user_id", user.id);
    if (error) throw error;
    const slot = Array.from({ length: 9 }, (_, i) => i + 1).find(
      (i) => !photos?.some((p) => p.slot === i),
    );
    if (!slot) throw new Error("Limite de 9 fotografias atingido.");
    // Re-encode to strip GPS/EXIF metadata, cap decoded pixels, and normalize orientation.
    const sanitized = await sharp(bytes, {
      limitInputPixels: 25000000,
      animated: false,
    })
      .rotate()
      .resize({
        width: 1600,
        height: 2000,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
    const storageAdmin = adminClient();
    const extension = "webp";
    const reserved = await rpc<{ path: string; bucket: string }>(
      db,
      "reserve_photo",
      { p_slot: slot, p_extension: extension },
    );
    // Published bucket denies client INSERT; only this authenticated, sanitized path uses service upload.
    const { error: uploadError } = await storageAdmin.storage
      .from(reserved.bucket)
      .upload(reserved.path, sanitized, {
        contentType: "image/webp",
        upsert: false,
      });
    if (uploadError) {
      await db.rpc("remove_photo", { p_slot: slot });
      throw uploadError;
    }
    return NextResponse.json({ message: "Fotografia adicionada." });
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const { db, user } = await authenticated();
    const { id } = await request.json();
    const slot = z.coerce.number().int().min(1).max(9).parse(id);
    const { data, error } = await db
      .from("photos")
      .select("path")
      .eq("user_id", user.id)
      .eq("slot", slot)
      .single();
    if (error) throw error;
    const { error: storageError } = await db.storage
      .from("profile-photos")
      .remove([data.path]);
    if (storageError) throw storageError;
    await rpc(db, "remove_photo", { p_slot: slot });
    return NextResponse.json({ message: "Fotografia removida." });
  } catch (error) {
    return failure(error);
  }
}
