import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { brl, fetchAccounts, fetchCategories, fetchPersons } from "@/lib/finance";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/fixos")({
  head: () => ({ meta: [{ title: "Gastos Fixos — Finanças do Casal" }] }),
  component: FixedExpensesPage,
});

type FixedExpense = {
  id: string;
  description: string;
  amount: number;
  category_id: string | null;
  account_id: string | null;
  person_id: string | null;
  due_day: number;
  status: "PENDING" | "PAID";
  last_paid_at: string | null;
  is_active: boolean;
};

async function fetchFixedExpenses(): Promise<FixedExpense[]> {
  const { data, error } = await supabase
    .from("fixed_expenses" as any)
    .select("*")
    .order("due_day", { ascending: true });
  if (error) throw error;
  return (data as any[]).map((r) => ({ ...r, amount: Number(r.amount) }));
}

function FixedExpensesPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["fixed_expenses"], queryFn: fetchFixedExpenses });
  const personsQ = useQuery({ queryKey: ["persons"], queryFn: fetchPersons });
  const catsQ = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const accQ = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });

  const [editing, setEditing] = useState<FixedExpense | null>(null);
  const [open, setOpen] = useState(false);

  const list = q.data ?? [];
  const active = list.filter((f) => f.is_active);
  const totals = useMemo(() => {
    const total = active.reduce((s, f) => s + f.amount, 0);
    const paid = active.filter((f) => f.status === "PAID").reduce((s, f) => s + f.amount, 0);
    return { total, paid, pending: total - paid };
  }, [active]);

  async function togglePaid(f: FixedExpense) {
    if (f.status === "PENDING") {
      // Mark as paid: create transaction and update
      const today = new Date().toISOString().slice(0, 10);
      const { error: txErr } = await supabase.from("transactions").insert({
        description: f.description,
        amount: f.amount,
        type: "EXPENSE",
        person_id: f.person_id,
        account_id: f.account_id,
        category_id: f.category_id,
        date: today,
        is_paid: true,
        is_recurring: true,
      });
      if (txErr) return toast.error(txErr.message);

      if (f.account_id) {
        const acc = (accQ.data ?? []).find((a) => a.id === f.account_id);
        if (acc) {
          await supabase
            .from("accounts")
            .update({ current_balance: acc.current_balance - f.amount })
            .eq("id", f.account_id);
        }
      }

      const { error } = await supabase
        .from("fixed_expenses" as any)
        .update({ status: "PAID", last_paid_at: new Date().toISOString() })
        .eq("id", f.id);
      if (error) return toast.error(error.message);
      toast.success("Marcado como pago");
    } else {
      const { error } = await supabase
        .from("fixed_expenses" as any)
        .update({ status: "PENDING", last_paid_at: null })
        .eq("id", f.id);
      if (error) return toast.error(error.message);
      toast.success("Desfeito");
    }
    qc.invalidateQueries();
  }

  async function remove(id: string) {
    if (!confirm("Excluir este gasto fixo?")) return;
    const { error } = await supabase.from("fixed_expenses" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    qc.invalidateQueries();
  }

  async function toggleActive(f: FixedExpense) {
    const { error } = await supabase
      .from("fixed_expenses" as any)
      .update({ is_active: !f.is_active })
      .eq("id", f.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries();
  }

  return (
    <AppShell>
      <header className="flex items-center justify-between px-5 pt-6">
        <div>
          <h1 className="text-2xl font-bold">Gastos Fixos</h1>
          <p className="text-xs text-muted-foreground">Reseta automaticamente todo dia 1º</p>
        </div>
        <Button
          size="lg"
          className="gap-2"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Novo
        </Button>
      </header>

      <div className="mt-4 grid grid-cols-3 gap-2 px-5">
        <div className="rounded-xl bg-card p-3 shadow-sm">
          <p className="text-[10px] uppercase text-muted-foreground">Total</p>
          <p className="text-sm font-bold tabular-nums">{brl(totals.total)}</p>
        </div>
        <div className="rounded-xl bg-income/10 p-3">
          <p className="text-[10px] uppercase text-income">Pago</p>
          <p className="text-sm font-bold tabular-nums text-income">{brl(totals.paid)}</p>
        </div>
        <div className="rounded-xl bg-expense/10 p-3">
          <p className="text-[10px] uppercase text-expense">Pendente</p>
          <p className="text-sm font-bold tabular-nums text-expense">{brl(totals.pending)}</p>
        </div>
      </div>

      <ul className="mt-4 space-y-2 px-5">
        {list.length === 0 && (
          <li className="py-12 text-center text-sm text-muted-foreground">
            Nenhum gasto fixo cadastrado.
          </li>
        )}
        {list.map((f) => {
          const person = (personsQ.data ?? []).find((p) => p.id === f.person_id);
          const cat = (catsQ.data ?? []).find((c) => c.id === f.category_id);
          const isPaid = f.status === "PAID";
          const inactive = !f.is_active;
          return (
            <li
              key={f.id}
              className={cn(
                "rounded-xl border-2 p-3 transition-all duration-300",
                inactive
                  ? "border-border bg-muted/40 opacity-60"
                  : isPaid
                    ? "border-income/40 bg-income/5"
                    : "border-expense/50 bg-expense/5",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className="mt-1 h-8 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: person?.color_tag ?? "var(--color-muted)" }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{f.description}</p>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                        isPaid ? "bg-income text-income-foreground" : "bg-expense text-expense-foreground",
                      )}
                    >
                      {isPaid ? "Pago" : "Pendente"}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    Vence dia {f.due_day} · {cat?.name ?? "Sem categoria"} · {person?.name ?? "—"}
                  </p>
                  <p className="mt-1 text-lg font-bold tabular-nums">{brl(f.amount)}</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={isPaid ? "outline" : "default"}
                  className={cn(
                    "gap-1",
                    !isPaid && "bg-income text-income-foreground hover:bg-income/90",
                  )}
                  onClick={() => togglePaid(f)}
                  disabled={inactive}
                >
                  {isPaid ? <><Undo2 className="h-3.5 w-3.5" /> Desfazer</> : <><Check className="h-3.5 w-3.5" /> Marcar como Pago</>}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(f);
                    setOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(f.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                <div className="ml-auto flex items-center gap-2">
                  <Label htmlFor={`act-${f.id}`} className="text-xs text-muted-foreground">
                    Ativo
                  </Label>
                  <Switch id={`act-${f.id}`} checked={f.is_active} onCheckedChange={() => toggleActive(f)} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <FixedExpenseDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSaved={() => qc.invalidateQueries()}
      />
    </AppShell>
  );
}

function FixedExpenseDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: FixedExpense | null;
  onSaved: () => void;
}) {
  const personsQ = useQuery({ queryKey: ["persons"], queryFn: fetchPersons });
  const catsQ = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const accQ = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDay, setDueDay] = useState(1);
  const [personId, setPersonId] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDescription(editing.description);
      setAmount(String(editing.amount).replace(".", ","));
      setDueDay(editing.due_day);
      setPersonId(editing.person_id ?? "");
      setAccountId(editing.account_id ?? "");
      setCategoryId(editing.category_id ?? "");
    } else {
      setDescription("");
      setAmount("");
      setDueDay(1);
      setPersonId(personsQ.data?.[0]?.id ?? "");
      setAccountId(accQ.data?.[0]?.id ?? "");
      setCategoryId("");
    }
  }, [open, editing, personsQ.data, accQ.data]);

  const expenseCategories = (catsQ.data ?? []).filter((c) => c.type === "EXPENSE");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(amount.replace(",", "."));
    if (!value || value <= 0) return toast.error("Informe um valor válido");
    if (!description.trim()) return toast.error("Informe a descrição");
    if (!personId) return toast.error("Selecione quem paga");

    setSaving(true);
    try {
      const payload = {
        description,
        amount: value,
        due_day: Math.min(31, Math.max(1, dueDay)),
        person_id: personId,
        account_id: accountId || null,
        category_id: categoryId || null,
      };
      if (editing) {
        const { error } = await supabase.from("fixed_expenses" as any).update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("fixed_expenses" as any).insert(payload);
        if (error) throw error;
      }
      toast.success(editing ? "Atualizado" : "Gasto fixo criado");
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar gasto fixo" : "Novo gasto fixo"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Aluguel, Netflix" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor (R$)</Label>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="text-lg font-semibold"
              />
            </div>
            <div>
              <Label>Dia do vencimento</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={dueDay}
                onChange={(e) => setDueDay(parseInt(e.target.value) || 1)}
              />
            </div>
          </div>

          <div>
            <Label className="mb-2 block text-sm font-semibold">Quem costuma pagar</Label>
            <div className="grid grid-cols-3 gap-2">
              {(personsQ.data ?? []).map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setPersonId(p.id)}
                  className={cn(
                    "rounded-lg border-2 px-2 py-3 text-sm font-medium transition-all",
                    personId === p.id ? "border-transparent text-white" : "border-border bg-card text-foreground",
                  )}
                  style={personId === p.id ? { backgroundColor: p.color_tag } : {}}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Conta padrão</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(accQ.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button type="submit" disabled={saving} className="w-full" size="lg">
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
