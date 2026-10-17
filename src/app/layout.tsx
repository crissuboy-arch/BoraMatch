import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/montserrat/500.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "BoraMatch — O amor não tem fronteiras.",
  description:
    "Conexões com intenção, de um lado e do outro do Atlântico. Uma experiência independente para Brasil e Portugal.",
  icons: { icon: "/favicon.svg", apple: "/icon-192.png" },
  applicationName: "BoraMatch",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
