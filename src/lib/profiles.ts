import type { SupabaseClient } from "@supabase/supabase-js";
export type DbPhoto = { slot: number; path: string };
export type DbCard = {
  id: string;
  display_name: string;
  city_id: string;
  city_name?: string;
  age?: number;
  bio: string;
  interests: string[];
  gender?: string;
  plan?: string;
  photos?: DbPhoto[];
  looking_for?: string[];
  relationship_goal?: string;
  min_age?: number;
  max_age?: number;
  max_distance_km?: number;
  city_only?: boolean;
};
export async function presentCard(db: SupabaseClient, p: DbCard) {
  const photos = await Promise.all(
    (p.photos || []).map(async (photo) => {
      const { data } = await db.storage
        .from("profile-photos")
        .createSignedUrl(photo.path, 60);
      return { id: String(photo.slot), url: data?.signedUrl || "" };
    }),
  );
  return {
    id: p.id,
    name: p.display_name,
    city: p.city_name || p.city_id,
    age: p.age,
    bio: p.bio,
    interests: p.interests,
    gender: p.gender,
    preferences: p.looking_for,
    goal: p.relationship_goal,
    plan: p.plan,
    minAge: p.min_age,
    maxAge: p.max_age,
    maxDistance: p.max_distance_km,
    cityOnly: p.city_only,
    photos: photos.filter((p) => p.url),
  };
}
export async function rpc<T = unknown>(
  db: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
) {
  const { data, error } = await db.rpc(name, args);
  if (error)
    throw Object.assign(new Error(error.message), { code: error.code });
  return data as T;
}
