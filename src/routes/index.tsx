import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { TransactionForm } from "@/components/TransactionForm";
import { brl, fetchAccounts, fetchGoals, fetchPersons, fetchTransactions } from "@/lib/finance";
import { Progress } from "@/components/ui/progress";
import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Finanças do Casal — Controle compartilhado" },
      { name: "description", content: "Controle financeiro compartilhado entre casal: entradas, saídas, saldos e metas." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const txQ = useQuery({ queryKey: ["transactions"], queryFn: fetchTransactions });
  const personsQ = useQuery({ queryKey: ["persons"], queryFn: fetchPersons });
  const goalsQ = useQuery({ queryKey: ["goals"], queryFn: fetchGoals });

  const totalBalance = (accountsQ.data ?? []).reduce((s, a) => s + a.current_balance, 0);

  const now = new Date();
  const monthTx = (txQ.data ?? []).filter((t) => {
    const d = new Date(t.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const income = monthTx.filter((t) => t.type === "INCOME").reduce((s, t) => s + t.amount, 0);
  const expense = monthTx.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  // per-person expense split
  const persons = personsQ.data ?? [];
  const byPerson = persons.map((p) => {
    const total = monthTx.filter((t) => t.type === "EXPENSE" && t.person_id === p.id).reduce((s, t) => s + t.amount, 0);
    return { ...p, total };
  });
  const totalExp = byPerson.reduce((s, p) => s + p.total, 0) || 1;

  return (
    <AppShell>
      <header className="px-5 pb-4 pt-6">
        <p className="text-sm text-muted-foreground">Saldo total disponível</p>
        <div className="mt-1 flex items-end justify-between gap-4">
          <h1 className="text-4xl font-bold tracking-tight">{brl(totalBalance)}</h1>
          <TransactionForm />
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 px-5">
        <SummaryCard label="Entradas" value={income} tone="income" icon={<ArrowUpRight className="h-4 w-4" />} />
        <SummaryCard label="Saídas" value={expense} tone="expense" icon={<ArrowDownRight className="h-4 w-4" />} />
        <div className="col-span-2 rounded-2xl bg-card border p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Balanço do mês</p>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className={`mt-1 text-2xl font-bold ${balance >= 0 ? "text-income" : "text-expense"}`}>
            {balance >= 0 ? "Sobrou " : "Faltou "}{brl(Math.abs(balance))}
          </p>
        </div>
      </section>

      <section className="mt-6 px-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Comparativo de gastos</h2>
        <div className="rounded-2xl bg-card border p-4">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
            {byPerson.map((p) => (
              <div key={p.id} style={{ width: `${(p.total / totalExp) * 100}%`, backgroundColor: p.color_tag }} />
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {byPerson.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color_tag }} />
                  <span className="font-medium">{p.name}</span>
                  <span className="text-muted-foreground">
                    {totalExp > 0 ? Math.round((p.total / totalExp) * 100) : 0}%
                  </span>
                </div>
                <span className="tabular-nums">{brl(p.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 px-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Metas</h2>
        <div className="space-y-3">
          {(goalsQ.data ?? []).length === 0 && (
            <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhuma meta ainda. Crie a primeira em <b>Metas</b>.
            </p>
          )}
          {(goalsQ.data ?? []).map((g) => {
            const pct = Math.min(100, Math.round((g.current_amount / g.target_amount) * 100));
            return (
              <div key={g.id} className="rounded-2xl border bg-card p-4">
                <div className="flex items-baseline justify-between">
                  <p className="font-semibold">{g.title}</p>
                  <p className="text-sm tabular-nums text-muted-foreground">{brl(g.current_amount)} / {brl(g.target_amount)}</p>
                </div>
                <Progress value={pct} className="mt-2" />
                <p className="mt-1 text-xs text-muted-foreground">{pct}% concluído</p>
              </div>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}

function SummaryCard({ label, value, tone, icon }: { label: string; value: number; tone: "income" | "expense"; icon: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone === "income" ? "bg-income/10 border-income/20" : "bg-expense/10 border-expense/20"}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className={tone === "income" ? "text-income" : "text-expense"}>{icon}</span>
      </div>
      <p className={`mt-1 text-xl font-bold ${tone === "income" ? "text-income" : "text-expense"}`}>{brl(value)}</p>
    </div>
  );
}
