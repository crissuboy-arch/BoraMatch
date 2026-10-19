import { NextResponse } from "next/server";
import { serverClient, authenticated } from "@/lib/supabase/server";
import { presentCard, rpc, type DbCard } from "@/lib/profiles";
import { failure } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams,
      resource = params.get("resource");
    if (resource === "session") {
      if (
        !process.env.NEXT_PUBLIC_SUPABASE_URL ||
        !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      )
        return NextResponse.json({
          data: { configured: false, user: null, isAdmin: false },
        });
      const db = await serverClient();
      const {
        data: { user },
      } = await db.auth.getUser();
      let isAdmin = false;
      if (user?.email_confirmed_at) {
        const { data: role } = await db.rpc("is_admin");
        isAdmin = role?.is_admin === true;
      }
      return NextResponse.json({
        data: {
          configured: true,
          user: user?.email_confirmed_at
            ? { id: user.id, email: user.email }
            : null,
          isAdmin,
        },
      });
    }
    if (resource === "plans" || resource === "cities") {
      const db = await serverClient();
      const { data, error } = await db
        .from(resource)
        .select("*")
        .eq("active", true);
      if (error) throw error;
      return NextResponse.json({ data });
    }
    const { db } = await authenticated();
    let data: unknown;
    if (resource === "profile") {
      const p = await rpc<DbCard | null>(db, "my_profile");
      data = p ? await presentCard(db, p) : null;
    } else if (resource === "discover" || resource === "likes") {
      let cityFilter = params.get("city")?.trim() || null;
      if (cityFilter) {
        const { data: cities } = await db
          .from("cities")
          .select("id,name")
          .eq("active", true);
        cityFilter =
          cities?.find(
            (c) =>
              c.id === cityFilter ||
              c.name.toLocaleLowerCase() === cityFilter?.toLocaleLowerCase(),
          )?.id || cityFilter;
      }
      const optionalNumber = (name: string) =>
        params.get(name) ? Number(params.get(name)) : null;
      const cards = await rpc<DbCard[]>(
        db,
        resource === "likes" ? "who_liked_me" : "discover",
        resource === "discover"
          ? {
              p_limit: 50,
              p_filters: {
                city: cityFilter,
                min_age: optionalNumber("minAge"),
                max_age: optionalNumber("maxAge"),
                interest: params.get("interest") || null,
                max_distance: optionalNumber("maxDistance"),
                gender: params.get("gender") || null,
              },
            }
          : {},
      );
      const min = Number(params.get("minAge") || 18),
        max = Number(params.get("maxAge") || 120),
        city = params.get("city")?.trim().toLocaleLowerCase(),
        interest = params.get("interest"),
        gender = params.get("gender"),
        distance = Number(params.get("maxDistance") || 20000);
      const selected = cards.filter(
        (p) =>
          (p.age || 18) >= min &&
          (p.age || 18) <= max &&
          (!city ||
            p.city_id === cityFilter ||
            p.city_id.toLocaleLowerCase() === city ||
            (p.city_name || "").toLocaleLowerCase() === city) &&
          (!interest || p.interests.includes(interest)) &&
          (!gender || p.gender === gender) &&
          (!("distance_km" in p) || Number(p.distance_km) <= distance),
      );
      data = await Promise.all(selected.map((p) => presentCard(db, p)));
    } else if (resource === "matches") {
      const matches = await rpc<
        {
          id: string;
          peer: DbCard;
          last_message?: { body: string };
          unread_count: number;
        }[]
      >(db, "list_matches");
      data = await Promise.all(
        matches.map(async (m) => ({
          id: m.id,
          profile: await presentCard(db, m.peer),
          lastMessage: m.last_message?.body,
          unread: m.unread_count,
        })),
      );
    } else if (resource === "messages") {
      const before = params.get("before");
      const beforeId = params.get("beforeId");
      if (beforeId !== null && (before === null || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(beforeId)))
        throw new Error("Cursor de mensagens inválido.");
      // Keep the original string: Date.toISOString would truncate SQL microseconds.
      if (before !== null) {
        const iso = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
        const day = before.slice(0, 10);
        if (!iso.test(before) || !Number.isFinite(Date.parse(before)) ||
          new Date(day + "T00:00:00Z").toISOString().slice(0, 10) !== day)
          throw new Error("Cursor de mensagens inválido.");
      }
      const rows = await rpc<
        { id: string; sender_id: string; body: string; created_at: string }[]
      >(db, "get_messages_page", {
        p_match: params.get("matchId"),
        ...(before !== null ? { p_before: before } : {}),
        ...(beforeId !== null ? { p_before_id: beforeId } : {}),
      });
      data = rows.map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        body: m.body,
        createdAt: m.created_at,
      }));
    } else if (resource === "admin") {
      const role = await rpc<{ is_admin: boolean; role: string }>(
        db,
        "is_admin",
      );
      const metrics =
        role.role === "admin" ? await rpc(db, "admin_metrics") : {};
      const rows = await rpc<
        { id: string; reason: string; status: string; target_id: string }[]
      >(db, "admin_reports");
      data = {
        metrics,
        reports: rows.map((r) => ({ ...r, targetId: r.target_id })),
      };
    } else throw new Error("Recurso inválido.");
    return NextResponse.json({ data });
  } catch (error) {
    return failure(error);
  }
}
