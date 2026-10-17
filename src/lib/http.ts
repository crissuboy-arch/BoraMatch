import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { safeOrigin } from "./validation";
export function checkOrigin(request: Request) {
  if (!safeOrigin(request)) throw new Error("Origem não autorizada.");
}
export function failure(error: unknown) {
  if (error instanceof ZodError)
    return NextResponse.json(
      { error: error.issues[0]?.message || "Dados inválidos." },
      { status: 400 },
    );
  const message =
    error instanceof Error
      ? error.message
      : "Não foi possível concluir o pedido.";
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  const messages: Record<string, string> = {
    authentication_required: "Autenticação necessária.",
    active_profile_required: "Complete o seu perfil para continuar.",
    account_deleting: "A conta está em processo de eliminação.",
    plus_required: "Esta funcionalidade requer um plano Plus ou Gold.",
    gold_required: "Esta funcionalidade requer um plano Gold.",
    daily_limit: "Atingiu o limite diário de likes.",
    message_rate_limit: "Aguarde antes de enviar mais mensagens.",
    report_limit: "Atingiu o limite diário de denúncias.",
    boost_limit: "Atingiu o limite de boosts deste mês.",
    target_unavailable: "Este perfil já não está disponível.",
    match_forbidden: "Não tem acesso a esta conversa.",
    photo_slot_occupied:
      "Este espaço de fotografia já está ocupado. Atualize o perfil.",
    nothing_to_rewind: "Não existe uma decisão para voltar atrás.",
    cannot_rewind_match: "Não é possível voltar atrás depois de um match.",
    boost_already_active: "O seu boost já está ativo.",
    admin_required: "Acesso administrativo não autorizado.",
    stripe_price_mapping_conflict:
      "Este preço Stripe já foi associado a outra configuração. Crie um novo preço Stripe.",
  };
  if (messages[message])
    return NextResponse.json(
      { error: messages[message] },
      {
        status:
          message === "authentication_required"
            ? 401
            : /limit/.test(message)
              ? 429
              : code === "42501"
                ? 403
                : 400,
      },
    );
  const known =
    /configurado|configurada|Autenticação|Origem|testes|necessário|inválid|limite|permitid|bloque|match|perfil|plano|consent|idade|email|fotograf|mensage|existe|requer|duplic|adult|unauthor|forbidden|limit|denied/i.test(
      message,
    );
  return NextResponse.json(
    { error: known ? message : "Não foi possível concluir o pedido." },
    {
      status: /Autenticação/.test(message)
        ? 401
        : /Origem/.test(message)
          ? 403
          : /configurad/.test(message)
            ? 503
            : 400,
    },
  );
}
