import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { brl, fetchGoals } from "@/lib/finance";

export const Route = createFileRoute("/metas")({
  head: () => ({ meta: [{ title: "Metas - Finanças do Casal" }] }),
  component: GoalsPage,
});

function parseMoney(value: string) {
  return parseFloat(value.replace(",", ".")) || 0;
}

function GoalsPage() {
  const qc = useQueryClient();
  const { data: goals = [] } = useQuery({ queryKey: ["goals"], queryFn: fetchGoals });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [date, setDate] = useState("");
  const [contributionGoal, setContributionGoal] = useState<(typeof goals)[number] | null>(null);
  const [contribution, setContribution] = useState("");
  const [isContributing, setIsContributing] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("goals").insert({
      title,
      target_amount: parseMoney(target),
      current_amount: parseMoney(current),
      target_date: date || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Meta criada");
    setTitle("");
    setTarget("");
    setCurrent("");
    setDate("");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["goals"] });
  }

  function openContribution(goal: (typeof goals)[number]) {
    setContributionGoal(goal);
    setContribution("");
  }

  async function handleContribution(e: React.FormEvent) {
    e.preventDefault();
    if (!contributionGoal) return;

    const amount = parseMoney(contribution);
    if (amount <= 0) {
      toast.error("Informe um valor de aporte válido");
      return;
    }

    setIsContributing(true);
    const { error } = await supabase
      .from("goals")
      .update({ current_amount: contributionGoal.current_amount + amount })
      .eq("id", contributionGoal.id);
    setIsContributing(false);

    if (error) return toast.error(error.message);
    toast.success("Aporte registrado");
    setContributionGoal(null);
    setContribution("");
    qc.invalidateQueries({ queryKey: ["goals"] });
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir meta?")) return;
    await supabase.from("goals").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["goals"] });
  }

  return (
    <AppShell>
      <header className="flex items-center justify-between px-5 pt-6">
        <h1 className="text-2xl font-bold">Metas</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" /> Nova
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nova meta</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <Label>Título</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Viagem"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valor alvo</Label>
                  <Input
                    inputMode="decimal"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label>Já juntado</Label>
                  <Input
                    inputMode="decimal"
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Data alvo</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <Button type="submit" className="w-full">
                Criar meta
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <ul className="mt-4 space-y-3 px-5">
        {goals.map((g) => {
          const pct = Math.min(100, Math.round((g.current_amount / g.target_amount) * 100));
          return (
            <li key={g.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold">{g.title}</p>
                <p className="text-sm tabular-nums text-muted-foreground">
                  {brl(g.current_amount)} / {brl(g.target_amount)}
                </p>
              </div>
              <Progress value={pct} className="mt-2" />
              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {pct}% concluído
                  {g.target_date &&
                    ` · até ${new Date(g.target_date + "T00:00").toLocaleDateString("pt-BR")}`}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openContribution(g)}>
                    + Aportar
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(g.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
        {goals.length === 0 && (
          <li className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Crie sua primeira meta.
          </li>
        )}
      </ul>

      <Dialog
        open={Boolean(contributionGoal)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setContributionGoal(null);
            setContribution("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aportar na meta</DialogTitle>
            <DialogDescription>{contributionGoal?.title}</DialogDescription>
          </DialogHeader>

          {contributionGoal && (
            <form onSubmit={handleContribution} className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">Valor atual</span>
                  <span className="font-medium tabular-nums">
                    {brl(contributionGoal.current_amount)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">Meta</span>
                  <span className="font-medium tabular-nums">
                    {brl(contributionGoal.target_amount)}
                  </span>
                </div>
                <Progress
                  value={Math.min(
                    100,
                    Math.round(
                      (contributionGoal.current_amount / contributionGoal.target_amount) * 100,
                    ),
                  )}
                  className="mt-3"
                />
              </div>

              <div>
                <Label htmlFor="goal-contribution">Valor do aporte</Label>
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    R$
                  </span>
                  <Input
                    id="goal-contribution"
                    inputMode="decimal"
                    value={contribution}
                    onChange={(e) => setContribution(e.target.value)}
                    placeholder="0,00"
                    className="pl-9 text-lg font-semibold tabular-nums"
                    autoFocus
                  />
                </div>
              </div>

              <DialogFooter className="gap-2 sm:space-x-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setContributionGoal(null);
                    setContribution("");
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isContributing}>
                  {isContributing ? "Salvando..." : "Salvar aporte"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
