import { Link } from "@tanstack/react-router";
import { Home, List, Wallet, Target, Repeat } from "lucide-react";

const items = [
  { to: "/", label: "Início", icon: Home },
  { to: "/transacoes", label: "Extrato", icon: List },
  { to: "/fixos", label: "Fixos", icon: Repeat },
  { to: "/contas", label: "Contas", icon: Wallet },
  { to: "/metas", label: "Metas", icon: Target },
] as const;

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur-md">
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <Link
              to={to}
              className="flex flex-col items-center gap-1 py-2.5 text-xs text-muted-foreground transition-colors data-[status=active]:text-primary"
              activeProps={{ className: "text-primary font-semibold" }}
              activeOptions={{ exact: to === "/" }}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
