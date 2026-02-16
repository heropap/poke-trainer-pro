"use client";

import { ReactNode } from "react";
import { DeckProvider } from "@/components/deck/DeckContext";

export default function Providers({ children }: { children: ReactNode }) {
  return <DeckProvider>{children}</DeckProvider>;
}
