import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { brl, fetchAccounts, fetchCategories, fetchPersons, type Account } from "@/lib/finance";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check, Undo2, ReceiptText } from "lucide-react";
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

type FixedExpensePayment = {
  id: string;
  fixed_expense_id: string;
  amount: number;
  description: string | null;
  paid_at: string;
  transaction_id: string | null;
  created_at: string;
};

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function todayValue() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

function parseMoney(value: string) {
  return Number(value.replace(/\./g, "").replace(",", "."));
}

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Erro inesperado";
}

function monthBounds(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const start = `${month}-01`;
  const next = new Date(year, monthIndex, 1);
  const end = new Date(next.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { start, end };
}

async function fetchFixedExpenses(): Promise<FixedExpense[]> {
  const { data, error } = await supabase
    .from("fixed_expenses")
    .select("*")
    .order("due_day", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) }));
}

async function fetchFixedExpensePayments(month: string): Promise<FixedExpensePayment[]> {
  const { start, end } = monthBounds(month);
  const { data, error } = await supabase
    .from("fixed_expense_payments")
    .select("*")
    .gte("paid_at", start)
    .lte("paid_at", end)
    .order("paid_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) }));
}

function FixedExpensesPage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(currentMonthValue());
  const q = useQuery({ queryKey: ["fixed_expenses"], queryFn: fetchFixedExpenses });
  const paymentsQ = useQuery({
    queryKey: ["fixed_expense_payments", month],
    queryFn: () => fetchFixedExpensePayments(month),
  });
  const personsQ = useQuery({ queryKey: ["persons"], queryFn: fetchPersons });
  const catsQ = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const accQ = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });

  const [editing, setEditing] = useState<FixedExpense | null>(null);
  const [registering, setRegistering] = useState<FixedExpense | null>(null);
  const [open, setOpen] = useState(false);

  const list = useMemo(() => q.data ?? [], [q.data]);
  const payments = useMemo(() => paymentsQ.data ?? [], [paymentsQ.data]);
  const active = useMemo(() => list.filter((f) => f.is_active), [list]);
  const paymentsByExpense = useMemo(() => {
    return payments.reduce<Record<string, FixedExpensePayment[]>>((acc, payment) => {
      acc[payment.fixed_expense_id] = [...(acc[payment.fixed_expense_id] ?? []), payment];
      return acc;
    }, {});
  }, [payments]);
  const usedByExpense = useMemo(() => {
    return payments.reduce<Record<string, number>>((acc, payment) => {
      acc[payment.fixed_expense_id] = (acc[payment.fixed_expense_id] ?? 0) + payment.amount;
      return acc;
    }, {});
  }, [payments]);
  const totals = useMemo(() => {
    const total = active.reduce((s, f) => s + f.amount, 0);
    const used = active.reduce((s, f) => s + (usedByExpense[f.id] ?? 0), 0);
    return { total, used, pending: Math.max(0, total - used) };
  }, [active, usedByExpense]);

  async function togglePaid(f: FixedExpense) {
    if (!f.account_id) {
      toast.error("Selecione uma conta padrao neste gasto fixo antes de quitar o saldo");
      setEditing(f);
      setOpen(true);
      return;
    }

    if (f.status === "PENDING") {
      const alreadyUsed = usedByExpense[f.id] ?? 0;
      const remaining = Math.max(0, f.amount - alreadyUsed);
      if (remaining <= 0) {
        const { error } = await supabase
          .from("fixed_expenses")
          .update({ status: "PAID", last_paid_at: new Date().toISOString() })
          .eq("id", f.id);
        if (error) return toast.error(error.message);
        toast.success("Marcado como pago");
        qc.invalidateQueries();
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      const { data: tx, error: txErr } = await supabase
        .from("transactions")
        .insert({
          description: f.description,
          amount: remaining,
          type: "EXPENSE",
          person_id: f.person_id,
          account_id: f.account_id,
          category_id: f.category_id,
          date: today,
          is_paid: true,
          is_recurring: true,
        })
        .select("id")
        .single();
      if (txErr) return toast.error(txErr.message);

      if (f.account_id) {
        const acc = (accQ.data ?? []).find((a) => a.id === f.account_id);
        if (acc) {
          const { error: accErr } = await supabase
            .from("accounts")
            .update({ current_balance: acc.current_balance - remaining })
            .eq("id", f.account_id);
          if (accErr) return toast.error(accErr.message);
        }
      }

      const { error: paymentErr } = await supabase.from("fixed_expense_payments").insert({
        fixed_expense_id: f.id,
        amount: remaining,
        description: "Quitacao do saldo restante",
        paid_at: today,
        transaction_id: tx?.id ?? null,
      });
      if (paymentErr) return toast.error(paymentErr.message);

      const { error } = await supabase
        .from("fixed_expenses")
        .update({ status: "PAID", last_paid_at: new Date().toISOString() })
        .eq("id", f.id);
      if (error) return toast.error(error.message);
      toast.success("Marcado como pago");
    } else {
      const { error } = await supabase
        .from("fixed_expenses")
        .update({ status: "PENDING", last_paid_at: null })
        .eq("id", f.id);
      if (error) return toast.error(error.message);
      toast.success("Desfeito");
    }
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["fixed_expense_payments"] });
    qc.invalidateQueries({ queryKey: ["fixed_expenses"] });
  }

  async function removePayment(payment: FixedExpensePayment, fixedExpense: FixedExpense) {
    if (!confirm("Excluir este uso do gasto fixo?")) return;

    const { error } = await supabase.from("fixed_expense_payments").delete().eq("id", payment.id);
    if (error) return toast.error(error.message);

    if (payment.transaction_id) {
      await supabase.from("transactions").delete().eq("id", payment.transaction_id);
    }

    if (fixedExpense.account_id) {
      const acc = (accQ.data ?? []).find((a) => a.id === fixedExpense.account_id);
      if (acc) {
        await supabase
          .from("accounts")
          .update({ current_balance: acc.current_balance + payment.amount })
          .eq("id", fixedExpense.account_id);
      }
    }

    await supabase
      .from("fixed_expenses")
      .update({ status: "PENDING", last_paid_at: null })
      .eq("id", fixedExpense.id);

    toast.success("Uso removido");
    qc.invalidateQueries();
  }

  async function remove(id: string) {
    if (!confirm("Excluir este gasto fixo?")) return;
    const { error } = await supabase.from("fixed_expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    qc.invalidateQueries();
  }

  async function toggleActive(f: FixedExpense) {
    const { error } = await supabase
      .from("fixed_expenses")
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

      <div className="mt-4 px-5">
        <Label className="text-xs text-muted-foreground">Mês de controle</Label>
        <Input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="mt-1"
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 px-5">
        <div className="rounded-xl bg-card p-3 shadow-sm">
          <p className="text-[10px] uppercase text-muted-foreground">Total</p>
          <p className="text-sm font-bold tabular-nums">{brl(totals.total)}</p>
        </div>
        <div className="rounded-xl bg-income/10 p-3">
          <p className="text-[10px] uppercase text-income">Usado</p>
          <p className="text-sm font-bold tabular-nums text-income">{brl(totals.used)}</p>
        </div>
        <div className="rounded-xl bg-expense/10 p-3">
          <p className="text-[10px] uppercase text-expense">Restante</p>
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
          const itemPayments = paymentsByExpense[f.id] ?? [];
          const used = usedByExpense[f.id] ?? 0;
          const remaining = Math.max(0, f.amount - used);
          const progress = Math.min(100, Math.round((used / f.amount) * 100));
          const isPaid = f.status === "PAID";
          const isComplete = used >= f.amount || isPaid;
          const inactive = !f.is_active;
          return (
            <li
              key={f.id}
              className={cn(
                "rounded-xl border-2 p-3 transition-all duration-300",
                inactive
                  ? "border-border bg-muted/40 opacity-60"
                  : isComplete
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
                        isComplete
                          ? "bg-income text-income-foreground"
                          : "bg-expense text-expense-foreground",
                      )}
                    >
                      {isComplete ? "Usado" : "Aberto"}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    Vence dia {f.due_day} · {cat?.name ?? "Sem categoria"} · {person?.name ?? "—"}
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Reservado</p>
                      <p className="font-bold tabular-nums">{brl(f.amount)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Usado</p>
                      <p className="font-bold tabular-nums text-income">{brl(used)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Saldo</p>
                      <p className="font-bold tabular-nums text-expense">{brl(remaining)}</p>
                    </div>
                  </div>
                  <Progress value={progress} className="mt-2" />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  className="gap-1"
                  onClick={() => setRegistering(f)}
                  disabled={inactive}
                >
                  <ReceiptText className="h-3.5 w-3.5" /> Registrar uso
                </Button>
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
                  {isPaid ? (
                    <>
                      <Undo2 className="h-3.5 w-3.5" /> Desfazer
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" /> Quitar saldo
                    </>
                  )}
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
                  <Switch
                    id={`act-${f.id}`}
                    checked={f.is_active}
                    onCheckedChange={() => toggleActive(f)}
                  />
                </div>
              </div>

              {itemPayments.length > 0 && (
                <div className="mt-3 rounded-lg border bg-background/60 p-2">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">Usos do mês</p>
                  <div className="space-y-1">
                    {itemPayments.map((payment) => (
                      <div key={payment.id} className="flex items-center gap-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {payment.description || "Uso registrado"}
                          </p>
                          <p className="text-muted-foreground">
                            {new Date(`${payment.paid_at}T00:00:00`).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                        <span className="font-bold tabular-nums">{brl(payment.amount)}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => removePayment(payment, f)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
      <FixedExpenseUseDialog
        open={!!registering}
        onOpenChange={(value) => !value && setRegistering(null)}
        fixedExpense={registering}
        used={registering ? (usedByExpense[registering.id] ?? 0) : 0}
        accounts={accQ.data ?? []}
        onSaved={() => qc.invalidateQueries()}
      />
    </AppShell>
  );
}

function FixedExpenseUseDialog({
  open,
  onOpenChange,
  fixedExpense,
  used,
  accounts,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fixedExpense: FixedExpense | null;
  used: number;
  accounts: Account[];
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [paidAt, setPaidAt] = useState(todayValue());
  const [accountId, setAccountId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !fixedExpense) return;
    setAmount("");
    setDescription(fixedExpense.description);
    setPaidAt(todayValue());
    setAccountId(fixedExpense.account_id ?? accounts[0]?.id ?? "");
  }, [open, fixedExpense, accounts]);

  if (!fixedExpense) return null;

  const remaining = Math.max(0, fixedExpense.amount - used);
  const value = parseMoney(amount);
  const futureUsed = used + (Number.isFinite(value) ? value : 0);
  const futureRemaining = fixedExpense.amount - futureUsed;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedAmount = parseMoney(amount);
    if (!parsedAmount || parsedAmount <= 0) return toast.error("Informe um valor valido");
    if (!paidAt) return toast.error("Informe a data");
    if (!accountId) return toast.error("Selecione uma conta para debitar do saldo total");

    setSaving(true);
    let transactionId: string | null = null;
    let balanceUpdated = false;
    try {
      const { data: tx, error: txErr } = await supabase
        .from("transactions")
        .insert({
          description: description.trim() || fixedExpense.description,
          amount: parsedAmount,
          type: "EXPENSE",
          person_id: fixedExpense.person_id,
          account_id: accountId,
          category_id: fixedExpense.category_id,
          date: paidAt,
          is_paid: true,
          is_recurring: false,
        })
        .select("id")
        .single();
      if (txErr) throw txErr;
      transactionId = tx.id;

      const acc = accounts.find((a) => a.id === accountId);
      if (acc) {
        const { error: accErr } = await supabase
          .from("accounts")
          .update({ current_balance: acc.current_balance - parsedAmount })
          .eq("id", accountId);
        if (accErr) throw accErr;
        balanceUpdated = true;
      }

      const { error: paymentErr } = await supabase.from("fixed_expense_payments").insert({
        fixed_expense_id: fixedExpense.id,
        amount: parsedAmount,
        description: description.trim() || null,
        paid_at: paidAt,
        transaction_id: transactionId,
      });
      if (paymentErr) throw paymentErr;

      if (!fixedExpense.account_id || fixedExpense.account_id !== accountId) {
        const { error: accountLinkErr } = await supabase
          .from("fixed_expenses")
          .update({ account_id: accountId })
          .eq("id", fixedExpense.id);
        if (accountLinkErr) throw accountLinkErr;
      }

      const nextStatus = used + parsedAmount >= fixedExpense.amount ? "PAID" : "PENDING";
      const { error: fixedErr } = await supabase
        .from("fixed_expenses")
        .update({
          status: nextStatus,
          last_paid_at: nextStatus === "PAID" ? new Date().toISOString() : null,
        })
        .eq("id", fixedExpense.id);
      if (fixedErr) throw fixedErr;

      toast.success("Uso registrado");
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      if (transactionId) await supabase.from("transactions").delete().eq("id", transactionId);
      if (balanceUpdated) {
        const acc = accounts.find((a) => a.id === accountId);
        if (acc) {
          await supabase
            .from("accounts")
            .update({ current_balance: acc.current_balance })
            .eq("id", accountId);
        }
      }
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar uso</DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border bg-card p-3">
          <p className="text-sm font-semibold">{fixedExpense.description}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">Reservado</p>
              <p className="font-bold tabular-nums">{brl(fixedExpense.amount)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Usado</p>
              <p className="font-bold tabular-nums text-income">{brl(used)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Saldo</p>
              <p className="font-bold tabular-nums text-expense">{brl(remaining)}</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Valor usado (R$)</Label>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className="text-lg font-semibold"
            />
          </div>

          <div>
            <Label>Descricao</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Abastecimento"
            />
          </div>

          <div>
            <Label>Data</Label>
            <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>

          <div>
            <Label>Conta para debitar</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma conta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {amount && Number.isFinite(value) && value > 0 && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="text-muted-foreground">Depois deste uso</p>
              <p
                className={cn(
                  "font-bold tabular-nums",
                  futureRemaining < 0 ? "text-expense" : "text-income",
                )}
              >
                {futureRemaining < 0
                  ? `Ultrapassa em ${brl(Math.abs(futureRemaining))}`
                  : `Restam ${brl(futureRemaining)}`}
              </p>
            </div>
          )}

          <Button type="submit" disabled={saving} className="w-full" size="lg">
            {saving ? "Registrando..." : "Registrar uso"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
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
    if (!accountId) return toast.error("Selecione a conta padrao");

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
        const { error } = await supabase
          .from("fixed_expenses")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("fixed_expenses").insert(payload);
        if (error) throw error;
      }
      toast.success(editing ? "Atualizado" : "Gasto fixo criado");
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
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
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Aluguel, Netflix"
            />
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
                    personId === p.id
                      ? "border-transparent text-white"
                      : "border-border bg-card text-foreground",
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
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Conta padrão</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(accQ.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
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
