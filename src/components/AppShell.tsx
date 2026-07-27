import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <div className="mx-auto max-w-md overflow-x-hidden pb-28">{children}</div>
      <BottomNav />
    </div>
  );
}
