import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { TransactionForm } from "@/components/TransactionForm";
import { brl, fetchAccounts, fetchCategories, fetchPersons, fetchTransactions } from "@/lib/finance";
import { useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/transacoes")({
  head: () => ({ meta: [{ title: "Extrato — Finanças do Casal" }] }),
  component: Transactions,
});

function Transactions() {
  const qc = useQueryClient();
  const txQ = useQuery({ queryKey: ["transactions"], queryFn: fetchTransactions });
  const personsQ = useQuery({ queryKey: ["persons"], queryFn: fetchPersons });
  const catQ = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const accQ = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });

  const [personFilter, setPersonFilter] = useState<string>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>(() => new Date().toISOString().slice(0, 7));

  const persons = personsQ.data ?? [];
  const cats = catQ.data ?? [];

  const list = useMemo(() => {
    return (txQ.data ?? []).filter((t) => {
      if (personFilter !== "all" && t.person_id !== personFilter) return false;
      if (catFilter !== "all" && t.category_id !== catFilter) return false;
      if (monthFilter && !t.date.startsWith(monthFilter)) return false;
      return true;
    });
  }, [txQ.data, personFilter, catFilter, monthFilter]);

  async function handleDelete(id: string, accountId: string | null, amount: number, type: string, isPaid: boolean) {
    if (!confirm("Excluir este lançamento?")) return;
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (accountId && isPaid && type !== "TRANSFER") {
      const acc = (accQ.data ?? []).find((a) => a.id === accountId);
      if (acc) {
        const delta = type === "INCOME" ? -amount : amount;
        await supabase.from("accounts").update({ current_balance: acc.current_balance + delta }).eq("id", accountId);
      }
    }
    toast.success("Lançamento excluído");
    qc.invalidateQueries();
  }

  return (
    <AppShell>
      <header className="flex items-center justify-between px-5 pt-6">
        <h1 className="text-2xl font-bold">Extrato</h1>
        <TransactionForm />
      </header>

      <div className="mt-4 grid grid-cols-3 gap-2 px-5">
        <input
          type="month"
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="rounded-lg border bg-card px-2 py-2 text-sm"
        />
        <Select value={personFilter} onValueChange={setPersonFilter}>
          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {persons.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Categorias</SelectItem>
            {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <ul className="mt-4 divide-y divide-border">
        {list.length === 0 && (
          <li className="px-5 py-12 text-center text-sm text-muted-foreground">Nenhum lançamento no filtro selecionado.</li>
        )}
        {list.map((t) => {
          const person = persons.find((p) => p.id === t.person_id);
          const cat = cats.find((c) => c.id === t.category_id);
          const isNegative = t.type === "EXPENSE";
          return (
            <li key={t.id} className="flex items-center gap-3 px-5 py-3">
              <span
                className="h-10 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: person?.color_tag ?? "var(--color-muted)" }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{t.description}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {person?.name ?? "—"} · {cat?.name ?? "Sem categoria"} · {new Date(t.date + "T00:00").toLocaleDateString("pt-BR")}
                  {!t.is_paid && <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">pendente</span>}
                </p>
              </div>
              <p className={`shrink-0 tabular-nums font-semibold ${isNegative ? "text-expense" : t.type === "INCOME" ? "text-income" : ""}`}>
                {isNegative ? "-" : t.type === "INCOME" ? "+" : ""}{brl(t.amount)}
              </p>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(t.id, t.account_id, t.amount, t.type, t.is_paid)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          );
        })}
      </ul>
    </AppShell>
  );
}
