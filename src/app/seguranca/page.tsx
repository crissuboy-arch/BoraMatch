import type { Metadata } from "next";
import InformationPage from "@/components/InformationPage";
export const metadata: Metadata = { title: "Segurança — BoraMatch" };

export default function SafetyPage() {
  return (
    <InformationPage title="Segurança">
      <h2>Controlos do projeto</h2>
      <p>
        O projeto inclui denúncia, bloqueio e fim de match. Na demonstração,
        estas ações não são guardadas nem enviadas a uma equipa de moderação.
        Num ambiente configurado, confirme sempre a resposta da operação; uma
        interface visível não prova que a ação foi concluída.
      </p>
      <h2>Proteja o seu acesso</h2>
      <p>
        Utilize uma palavra-passe única e não partilhe códigos de acesso. O
        registo exige confirmação do email. Não envie dinheiro, documentos,
        palavras-passe ou dados bancários através de conversas com outros
        utilizadores.
      </p>
      <h2>Ao conhecer alguém</h2>
      <p>
        Avance ao seu ritmo, preserve a sua morada e escolha um local público
        para um primeiro encontro. Combine uma forma de informar alguém de
        confiança. Bloqueie contactos que insistam em ultrapassar os seus
        limites.
      </p>
      <h2>Limitações</h2>
      <p>
        Não existe promessa de verificação de identidade, resposta permanente de
        moderação ou proteção absoluta. Os canais operacionais de apoio e
        reporte de vulnerabilidades devem ser definidos pelo responsável antes
        de qualquer lançamento público.
      </p>
    </InformationPage>
  );
}
