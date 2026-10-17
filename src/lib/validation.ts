import { z } from "zod";
export function ageAt(birthDate: string, now = new Date()): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return -1;
  const date = new Date(`${birthDate}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== birthDate
  )
    return -1;
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  if (
    now.getUTCMonth() < date.getUTCMonth() ||
    (now.getUTCMonth() === date.getUTCMonth() &&
      now.getUTCDate() < date.getUTCDate())
  )
    age--;
  return age;
}
export const adultDate = z
  .string()
  .refine(
    (v) => ageAt(v) >= 18 && ageAt(v) <= 120,
    "É necessário ter entre 18 e 120 anos.",
  );
export const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(12).max(128),
  birthDate: adultDate,
  consent: z.literal(true),
});
export function safeOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_URL || new URL(request.url).origin;
  return !!origin && origin === new URL(expected).origin;
}
export function testStripeKey(key: string | undefined) {
  if (!key?.startsWith("sk_test_"))
    throw new Error(
      "Pagamentos disponíveis apenas com chave Stripe de testes.",
    );
  return key;
}
