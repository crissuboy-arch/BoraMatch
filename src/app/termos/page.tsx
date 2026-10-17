import type { Metadata } from "next";
import InformationPage from "@/components/InformationPage";
export const metadata: Metadata = { title: "Termos — BoraMatch" };

export default function TermsPage() {
  return (
    <InformationPage title="Termos">
      <h2>Estado do projeto</h2>
      <p>
        BoraMatch é um projeto independente em desenvolvimento para explorar
        conexões entre Brasil e Portugal. Esta página é um aviso de avaliação do
        protótipo; não apresenta condições contratuais aprovadas para um serviço
        público.
      </p>
      <h2>Elegibilidade e respeito</h2>
      <p>
        O fluxo de registo foi concebido para pessoas com pelo menos 18 anos. Os
        controlos de denúncia e bloqueio fazem parte do projeto. Regras de
        comunidade, capacidade de moderação e procedimentos de recurso precisam
        de revisão antes de uma abertura pública.
      </p>
      <h2>Demonstração e pagamentos</h2>
      <p>
        Os perfis demonstrativos são fictícios. A integração de pagamentos está
        limitada ao modo de testes Stripe. Não há aprovação de cobrança real.
        Planos, preços, renovação, cancelamento, reembolso e informação ao
        consumidor devem ser definidos e revistos antes de qualquer venda.
      </p>
      <h2>Próxima revisão</h2>
      <p>
        A entidade operadora, os contactos de apoio, a política de privacidade e
        as condições aplicáveis devem estar identificados e aprovados antes da
        disponibilização pública. Não utilize este protótipo como serviço de
        encontros em produção.
      </p>
    </InformationPage>
  );
}
