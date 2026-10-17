import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticated } from "@/lib/supabase/server";
import { rpc, type DbCard } from "@/lib/profiles";
import { checkOrigin, failure } from "@/lib/http";
const uuid = z.uuid();
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const body = await request.json();
    const { db, user } = await authenticated();
    let data: unknown;
    if (body.action === "onboarding") {
      const input = z
        .object({
          name: z.string().min(2).max(60),
          city: z.string().min(2).max(100),
          bio: z.string().max(500).default(""),
          gender: z
            .enum(["", "man", "woman", "nonbinary", "unspecified"])
            .default(""),
          preferences: z
            .enum(["everyone", "man", "woman", "nonbinary", "unspecified"])
            .default("everyone"),
          interests: z.array(z.string().max(40)).max(20),
          goal: z.string().max(80).optional(),
          consent: z.literal(true),
          minAge: z.coerce.number().int().min(18).max(99).optional(),
          maxAge: z.coerce.number().int().min(18).max(120).optional(),
          maxDistance: z.coerce.number().int().min(1).max(20000).optional(),
          cityOnly: z.boolean().optional(),
        })
        .refine((v) => !(v.minAge && v.maxAge) || v.minAge! <= v.maxAge!, {
          message: "Intervalo de idade inválido.",
        })
        .parse(body);
      const { data: cities, error } = await db
        .from("cities")
        .select("id,name")
        .eq("active", true);
      if (error) throw error;
      const city = cities?.find(
        (c) =>
          c.id === input.city ||
          c.name.toLocaleLowerCase() ===
            input.city.split(",")[0].trim().toLocaleLowerCase(),
      );
      if (!city)
        throw new Error("Cidade inválida. Escolha uma cidade disponível.");
      const p = {
        display_name: input.name,
        city_id: city.id,
        bio: input.bio,
        gender: input.gender || "unspecified",
        looking_for:
          input.preferences === "everyone"
            ? ["man", "woman", "nonbinary", "unspecified"]
            : [input.preferences],
        interests: input.interests,
        relationship_goal: input.goal || "undecided",
        ...(input.minAge === undefined ? {} : { min_age: input.minAge }),
        ...(input.maxAge === undefined ? {} : { max_age: input.maxAge }),
        ...(input.maxDistance === undefined
          ? {}
          : { max_distance_km: input.maxDistance }),
        ...(input.cityOnly === undefined ? {} : { city_only: input.cityOnly }),
      };
      const existing = await rpc<DbCard | null>(db, "my_profile");
      data = await rpc(
        db,
        existing ? "update_profile" : "complete_onboarding",
        {
          p_profile: existing
            ? p
            : { ...p, dob: user.user_metadata.dob, consent: input.consent },
        },
      );
    } else if (body.action === "like" || body.action === "pass")
      data = await rpc(db, "decide", {
        p_target: uuid.parse(body.targetId),
        p_action: body.action,
      });
    else if (body.action === "rewind" || body.action === "boost")
      data = await rpc(db, body.action);
    else if (body.action === "message")
      data = await rpc(db, "send_message", {
        p_match: uuid.parse(body.matchId),
        p_body: z.string().trim().min(1).max(2000).parse(body.body),
      });
    else if (body.action === "read")
      data = await rpc(db, "mark_read", { p_match: uuid.parse(body.matchId) });
    else if (body.action === "block")
      data = await rpc(db, "block_user", {
        p_target: uuid.parse(body.targetId),
      });
    else if (body.action === "unmatch")
      data = await rpc(db, "unmatch", { p_match: uuid.parse(body.matchId) });
    else if (body.action === "report")
      data = await rpc(db, "report_user", {
        p_target: uuid.parse(body.targetId),
        p_reason: body.category || "other",
        p_details: z.string().min(3).max(2000).parse(body.reason),
      });
    else if (body.action === "delete") {
      data = await rpc(db, "request_deletion");
      await db.auth.signOut({ scope: "global" });
      return NextResponse.json({
        data,
        message:
          "Perfil desativado. A eliminação dos dados segue o prazo de retenção indicado.",
      });
    } else if (body.action === "adminModerate") {
      let target = body.targetId;
      if (!target && body.reportId) {
        const rows = await rpc<{ id: string; target_id: string }[]>(
          db,
          "admin_reports",
        );
        target = rows.find((r) => r.id === body.reportId)?.target_id;
      }
      data = await rpc(db, "admin_moderate", {
        p_target: uuid.parse(target),
        p_action: body.moderationAction || "dismiss_reports",
        p_reason: body.reason || "Análise administrativa da denúncia",
      });
    } else if (body.action === "adminPlan") {
      const { data: plans, error } = await db
        .from("plans")
        .select("*")
        .eq("id", body.plan)
        .single();
      if (error) throw error;
      data = await rpc(db, "admin_save_plan", {
        p_plan: {
          ...plans,
          ...body.settings,
          active: body.enabled ?? plans.active,
        },
      });
    } else if (body.action === "adminCity") {
      const input = z
        .object({
          name: z.string().min(2).max(100),
          country: z.enum(["BR", "PT"]),
          latitude: z.coerce.number().min(-90).max(90),
          longitude: z.coerce.number().min(-180).max(180),
        })
        .parse(body);
      const id = body.id
        ? z
            .string()
            .regex(/^[a-z0-9-]{2,60}$/)
            .parse(body.id)
        : input.name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
      data = await rpc(db, "admin_save_city", {
        p_city: { id, ...input, active: true },
      });
    } else throw new Error("Ação inválida.");
    return NextResponse.json({ data, message: "Operação concluída." });
  } catch (error) {
    return failure(error);
  }
}
