import type { Metadata } from "next";
import "@copilotkit/react-ui/styles.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_TITLE ?? "Realtime Voice + CopilotKit",
  description:
    "OpenAI Realtime voice session bridged with CopilotKit visual chat and tool rendering",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
