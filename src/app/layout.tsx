import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Models Platform",
  description: "Create, monetize and interact with AI-powered models",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
