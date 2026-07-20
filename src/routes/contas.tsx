import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { brl, fetchAccounts } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/contas")({
  head: () => ({ meta: [{ title: "Contas — Finanças do Casal" }] }),
  component: AccountsPage,
});

function AccountsPage() {
  const qc = useQueryClient();
  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const v = parseFloat(balance.replace(",", ".")) || 0;
    const { error } = await supabase.from("accounts").insert({ name, initial_balance: v, current_balance: v });
    if (error) return toast.error(error.message);
    toast.success("Conta criada");
    setName(""); setBalance(""); setOpen(false);
    qc.invalidateQueries({ queryKey: ["accounts"] });
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta conta?")) return;
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["accounts"] });
  }

  return (
    <AppShell>
      <header className="flex items-center justify-between px-5 pt-6">
        <h1 className="text-2xl font-bold">Contas</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" /> Nova</Button></DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Nova conta</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Nubank" required /></div>
              <div><Label>Saldo inicial (R$)</Label><Input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0,00" /></div>
              <Button type="submit" className="w-full">Criar conta</Button>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <ul className="mt-4 space-y-3 px-5">
        {accounts.map((a) => (
          <li key={a.id} className="flex items-center justify-between rounded-2xl border bg-card p-4">
            <div>
              <p className="font-semibold">{a.name}</p>
              <p className="text-xs text-muted-foreground">Inicial: {brl(a.initial_balance)}</p>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-lg font-bold tabular-nums">{brl(a.current_balance)}</p>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(a.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </li>
        ))}
        {accounts.length === 0 && (
          <li className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Crie sua primeira conta.</li>
        )}
      </ul>
    </AppShell>
  );
}
