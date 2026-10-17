import Link from "next/link";
import type { ReactNode } from "react";

export default function InformationPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main
      style={{ maxWidth: 820, margin: "0 auto", padding: "48px 24px 80px" }}
    >
      <Link href="/" className="link-button">
        ← Voltar ao BoraMatch
      </Link>
      <p className="eyebrow" style={{ marginTop: 32 }}>
        INFORMAÇÃO DO PROJETO
      </p>
      <h1 style={{ fontSize: "clamp(30px, 6vw, 48px)" }}>{title}</h1>
      <p role="note">
        <strong>Versão em desenvolvimento.</strong> Este aviso descreve o estado
        técnico do protótipo. Não constitui uma política jurídica aprovada nem
        anúncio de um serviço em produção.
      </p>
      {children}
      <nav
        aria-label="Informações do projeto"
        style={{ display: "flex", flexWrap: "wrap", gap: 24, marginTop: 40 }}
      >
        <Link className="link-button" href="/privacidade">
          Privacidade
        </Link>
        <Link className="link-button" href="/termos">
          Termos
        </Link>
        <Link className="link-button" href="/seguranca">
          Segurança
        </Link>
      </nav>
    </main>
  );
}
