import "./globals.css";
import type { Metadata } from "next";
import { Bakbak_One, Belgrano, Cantata_One, Inter } from "next/font/google";
import { ToastHub } from "../components/ToastHub";

const cantataOne = Cantata_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-cantata-one",
});

const bakbakOne = Bakbak_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bakbak-one",
});

const belgrano = Belgrano({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-belgrano",
});

const inter = Inter({
  weight: "700",
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Hamster Spin",
  description: "Hamster Spin live draw experience",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${cantataOne.variable} ${bakbakOne.variable} ${belgrano.variable} ${inter.variable}`}>
        <ToastHub />
        {children}
      </body>
    </html>
  );
}
