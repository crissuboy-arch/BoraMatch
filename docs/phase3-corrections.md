# BoraMatch — correções locais autorizadas, Fase 3

## Escopo

Branch `feat/boramatch-mvp`, base `50cb988d064146427618d2fb4e236d36e34be189`. Evolução incremental, sem reconstrução, redesign ou mudança de regras premium. Sem push, deploy, merge ou alteração no Supabase hospedado.

## Correções

1. **Privacidade:** logout/entrada em demo/troca de identidade limpam perfil, matches, chat, dados administrativos e filtros. Epoch síncrono invalida respostas de identidade anterior; o callback Auth agenda a releitura fora do lock do SDK.
2. **Chat:** selecionar conversa limpa o corpo e o rascunho anteriores; respostas de leitura/envio/polling/histórico são associadas à identidade e à seleção vigentes. Respostas tardias de A não alteram B.
3. **Cidade:** ID e nome de exibição são resolvidos/aceitos consistentemente no pós-filtro, sem alterar gates de plano.
4. **Histórico:** API valida e transmite cursor; UI permite carregar antigas, mantém ordem/dedup e permite retry. Novo cursor composto timestamp+UUID evita perda na fronteira de páginas com timestamps iguais. Atualização recente sem sobreposição reabre o histórico a partir da nova janela, permitindo recuperar lacunas; histórico em voo não sobrescreve o cursor de recuperação.

## Migração incremental e compatibilidade

`supabase/migrations/20261019060000_message_composite_cursor.sql` adiciona `get_messages_page(p_match, p_before, p_before_id)` e sua implementação privada, preservando o RPC `get_messages` e a migration original. Wrapper público SECURITY INVOKER; execução autenticada; implementação SECURITY DEFINER com `search_path` vazio, `private.actor()` e `private.can_chat()`.

**Ordem obrigatória da futura integração:** aplicar a migration base e a incremental no Supabase de TESTE autorizado, verificar permissões/RPC e só então disponibilizar a API nova nesse ambiente. A API atual depende de `get_messages_page`; banco com somente a migration antiga não é compatível com esse handler.

`before` conserva a string original com microssegundos. `beforeId` exige timestamp e UUID válido. Cursor somente timestamp permanece aceito por compatibilidade, com a limitação de empates do contrato antigo; a UI usa sempre timestamp+UUID.

## Verificação local da Athena

Execução em sandbox bubblewrap sem rede externa, ambiente limpo, dados sintéticos e dependências/navegador reaproveitados em montagem somente leitura:

- Lint: PASS.
- TypeScript: PASS.
- Build Next: PASS, não é deploy.
- Vitest: 71/71 PASS, incluindo 16 testes novos de handler/merge e 55 existentes.
- SQL real em PGlite: 23 cenários PASS, 24 resultados TAP incluindo contêiner. Todas as migrations locais aplicadas à fixture descartável. Paginação de 225 mensagens no mesmo instante em páginas 100/100/25, sem perdas/duplicatas; negação a terceiro/anon também exercitada.
- Playwright: 40/40 PASS desktop/mobile (22 execuções existentes + 18 de regressão). UI compilada real com HTTP sintético nos cenários privados.
- Regressões foram observadas em RED antes das correções; logs de tentativas intermediárias foram preservados fora do Git, em `BORAMATCH/qa/phase3`.

Reprodução normal após instalar dependências do lock com Node 22 compatível: `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, `npm run test:e2e`. A ordem build antes de E2E é necessária. Harness isolado e logs desta execução estão fora do repositório, na pasta operacional do projeto.

## Limites e pendências

- Supabase hospedado ainda não integrado: cadastro/login/email/refresh/logout real, duas identidades reais, Storage HTTP/URLs assinadas, Realtime, reconexão e múltiplas abas ainda requerem testes integrados autorizados.
- SQL PGlite usa Auth/Storage sintéticos e não valida JWT/email/Storage HTTP do provedor. Mock billing não comprova pagamento/HMAC.
- Controle Sair preexistente fica oculto na viewport mobile; os dois cenários de logout redimensionam apenas para acionar o mesmo controle real. Isso valida limpeza de estado, não usabilidade nativa do logout mobile. Nenhuma alteração visual feita para esse problema.
- Regras premium divergentes entre UI/SQL permanecem intocadas e dependem de decisão de produto.
- Operação de retenção/exclusão externa, scheduler e filas ainda precisa de validação integrada. Stripe permanece fora desta fase.
- Não foram feitos testes de carga ou concorrência real entre conexões, nem testes em aparelho físico.
- O aplicativo continua em desenvolvimento, não aprovado para produção.

## Próxima fase proposta — Supabase TESTE

Exige autorização específica, sem reutilizar segredos de outros sistemas:

1. Provisionar/identificar projeto de teste; configurar segredos na infraestrutura autorizada, nunca no prompt/Git.
2. Revisar e aplicar migrations ordenadas; verificar RLS, grants, RPCs e tipos gerados contra o schema real.
3. Configurar Auth, URLs/callbacks, confirmação/recuperação de email e hook de idade já versionado.
4. Validar bucket privado, políticas de Storage, URLs assinadas e Realtime/publicação para mensagens.
5. Testar duas contas reais: descoberta/cidade, likes/match, chat/paginação, resposta atrasada, logout/demo e troca de conta; incluir testes negativos de terceiro, bloqueio e exportação.
6. Validar worker/filas/retenção sem executar exclusões reais fora do ambiente de teste. Decidir regras premium separadamente antes de alterá-las.
7. Só após aceitação, avaliar publicação em autorização separada. Nenhum deploy foi autorizado nesta fase.
