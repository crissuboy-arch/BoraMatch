import type { Metadata } from "next";
import InformationPage from "@/components/InformationPage";
export const metadata: Metadata = { title: "Privacidade — BoraMatch" };

export default function PrivacyPage() {
  return (
    <InformationPage title="Privacidade">
      <h2>Dados e finalidade</h2>
      <p>
        O projeto prevê email e credenciais de acesso, data de nascimento para
        elegibilidade de maiores de 18 anos, perfil, preferências, fotografias,
        decisões de descoberta e conversas. A descoberta utiliza cidades e
        distâncias aproximadas entre cidades; não necessita de coordenadas
        exatas do dispositivo.
      </p>
      <h2>Limites da demonstração</h2>
      <p>
        Os personagens da demonstração são sintéticos. As ações nesse modo não
        representam contas, matches, pagamentos ou mensagens reais guardados.
        Não introduza dados pessoais sensíveis para avaliar a demonstração.
      </p>
      <h2>Acesso e controlo</h2>
      <p>
        Os fluxos de contas reais dependem de uma configuração Supabase. O
        projeto inclui controlos de exportação e pedido de eliminação; a
        execução completa da eliminação depende também de tarefas de limpeza de
        fotografias e contas de autenticação. A validação desse processo num
        ambiente alojado permanece necessária.
      </p>
      <h2>Antes de aceitar registos públicos</h2>
      <p>
        O responsável pelo serviço deve identificar a entidade operadora, o
        contacto de privacidade, os fundamentos de tratamento, os fornecedores,
        os prazos de conservação e os procedimentos para exercer direitos. Estes
        elementos ainda exigem definição e revisão. Este texto não substitui
        essa política.
      </p>
    </InformationPage>
  );
}
