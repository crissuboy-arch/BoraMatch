import { NextResponse } from "next/server";
import { z } from "zod";
import { serverClient } from "@/lib/supabase/server";
import { registerSchema } from "@/lib/validation";
import { checkOrigin, failure } from "@/lib/http";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const body = await request.json();
    const db = await serverClient();
    let message = "Sessão terminada.";
    if (body.action === "register") {
      const input = registerSchema.parse(body);
      const { error } = await db.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          emailRedirectTo: `${process.env.APP_URL || new URL(request.url).origin}/auth/callback`,
          data: {
            dob: input.birthDate,
            consent: true,
            consent_version: "2026-10-17",
          },
        },
      });
      if (error) throw error;
      message =
        "Verifique o seu email para confirmar o registo. O acesso requer confirmação.";
    } else if (body.action === "login") {
      const input = z
        .object({ email: z.email(), password: z.string().min(1).max(128) })
        .parse(body);
      const { error } = await db.auth.signInWithPassword(input);
      if (error)
        throw new Error(
          "Email ou palavra-passe inválidos, ou email por confirmar.",
        );
      message = "Sessão iniciada.";
    } else if (body.action === "logout") {
      const { error } = await db.auth.signOut();
      if (error) throw error;
    } else if (body.action === "reset") {
      const email = z.email().parse(body.email);
      const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.APP_URL || new URL(request.url).origin}/auth/callback?next=/recuperar`,
      });
      if (error) throw error;
      message = "Se a conta existir, receberá as instruções por email.";
    } else if (body.action === "password") {
      const password = z.string().min(12).max(128).parse(body.password);
      const { data } = await db.auth.getUser();
      if (!data.user) throw new Error("Autenticação necessária.");
      const { error } = await db.auth.updateUser({ password });
      if (error) throw error;
      message = "Palavra-passe atualizada.";
    } else throw new Error("Ação inválida.");
    return NextResponse.json({ message });
  } catch (error) {
    return failure(error);
  }
}
