import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { fetchAccounts, fetchCategories, fetchPersons, type Account, type Category, type Person } from "@/lib/finance";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Type = "EXPENSE" | "INCOME" | "TRANSFER";

export function TransactionForm({ trigger }: { trigger?: React.ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [persons, setPersons] = useState<Person[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [type, setType] = useState<Type>("EXPENSE");
  const [personId, setPersonId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isPaid, setIsPaid] = useState(true);
  const [parcels, setParcels] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([fetchPersons(), fetchAccounts(), fetchCategories()]).then(([p, a, c]) => {
      setPersons(p);
      setAccounts(a);
      setCategories(c);
      if (!personId && p[0]) setPersonId(p[0].id);
      if (!accountId && a[0]) setAccountId(a[0].id);
    });
  }, [open]);

  const filteredCategories = categories.filter((c) => (type === "INCOME" ? c.type === "INCOME" : c.type === "EXPENSE"));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(amount.replace(",", "."));
    if (!value || value <= 0) return toast.error("Informe um valor válido");
    if (!personId) return toast.error("Selecione quem realizou");
    if (!description.trim()) return toast.error("Informe a descrição");

    setSaving(true);
    try {
      const rows = [];
      const totalParcels = Math.max(1, parcels);
      for (let i = 0; i < totalParcels; i++) {
        const d = new Date(date);
        d.setMonth(d.getMonth() + i);
        rows.push({
          description: totalParcels > 1 ? `${description} (${i + 1}/${totalParcels})` : description,
          amount: value,
          type,
          person_id: personId,
          account_id: accountId || null,
          category_id: categoryId || null,
          date: d.toISOString().slice(0, 10),
          is_paid: i === 0 ? isPaid : false,
          is_recurring: false,
          total_parcels: totalParcels,
          current_parcel: i + 1,
        });
      }
      const { error } = await supabase.from("transactions").insert(rows);
      if (error) throw error;

      // Update account balance for paid ones
      if (accountId && isPaid && type !== "TRANSFER") {
        const acc = accounts.find((a) => a.id === accountId);
        if (acc) {
          const delta = type === "INCOME" ? value : -value;
          await supabase.from("accounts").update({ current_balance: acc.current_balance + delta }).eq("id", accountId);
        }
      }

      toast.success("Lançamento salvo!");
      qc.invalidateQueries();
      setOpen(false);
      setAmount("");
      setDescription("");
      setParcels(1);
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const typeButton = (t: Type, label: string) => (
    <button
      type="button"
      onClick={() => setType(t)}
      className={cn(
        "flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all",
        type === t
          ? t === "EXPENSE"
            ? "bg-expense text-expense-foreground"
            : t === "INCOME"
              ? "bg-income text-income-foreground"
              : "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="lg" className="gap-2">
            <Plus className="h-4 w-4" /> Novo
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo lançamento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2">
            {typeButton("EXPENSE", "Saída")}
            {typeButton("INCOME", "Entrada")}
            {typeButton("TRANSFER", "Transf.")}
          </div>

          <div>
            <Label className="mb-2 block text-sm font-semibold">Quem realizou</Label>
            <div className="grid grid-cols-3 gap-2">
              {persons.map((p) => (
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

          <div>
            <Label>Valor (R$)</Label>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" className="text-lg font-semibold" />
          </div>

          <div>
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Mercado" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {filteredCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Conta</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Parcelas</Label>
              <Input type="number" min={1} max={60} value={parcels} onChange={(e) => setParcels(parseInt(e.target.value) || 1)} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted p-3">
            <Label htmlFor="paid" className="!m-0">Status: {isPaid ? "Pago" : "Pendente"}</Label>
            <Switch id="paid" checked={isPaid} onCheckedChange={setIsPaid} />
          </div>

          <Button type="submit" disabled={saving} className="w-full" size="lg">
            {saving ? "Salvando..." : "Salvar lançamento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
