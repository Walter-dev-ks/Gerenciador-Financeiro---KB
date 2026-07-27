import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, Plus, Settings, Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Cell, Pie, PieChart } from "recharts";

import { AppShell } from "@/components/AppShell";
import { TransactionForm } from "@/components/TransactionForm";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  brl,
  fetchAccounts,
  fetchCategories,
  fetchGoals,
  fetchPersons,
  fetchTransactions,
} from "@/lib/finance";

const CATEGORY_COLORS = [
  "oklch(0.72 0.17 265)",
  "oklch(0.68 0.17 155)",
  "oklch(0.7 0.19 55)",
  "oklch(0.65 0.22 25)",
  "oklch(0.62 0.18 305)",
  "oklch(0.66 0.14 210)",
  "oklch(0.76 0.16 95)",
  "oklch(0.64 0.2 345)",
];

type CategoryType = "INCOME" | "EXPENSE";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Finanças do Casal - Controle compartilhado" },
      {
        name: "description",
        content: "Controle financeiro compartilhado entre casal: entradas, saídas, saldos e metas.",
      },
    ],
  }),
  component: Dashboard,
});

function currentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

function Dashboard() {
  const qc = useQueryClient();
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const txQ = useQuery({ queryKey: ["transactions"], queryFn: fetchTransactions });
  const personsQ = useQuery({ queryKey: ["persons"], queryFn: fetchPersons });
  const goalsQ = useQuery({ queryKey: ["goals"], queryFn: fetchGoals });
  const categoriesQ = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });

  const [chartMonth, setChartMonth] = useState(currentMonthValue);
  const [categoryName, setCategoryName] = useState("");
  const [categoryType, setCategoryType] = useState<CategoryType>("EXPENSE");
  const [savingCategory, setSavingCategory] = useState(false);

  const totalBalance = (accountsQ.data ?? []).reduce((s, a) => s + a.current_balance, 0);

  const now = new Date();
  const monthTx = (txQ.data ?? []).filter((t) => {
    const d = new Date(t.date + "T00:00");
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const chartTx = (txQ.data ?? []).filter((t) => t.date.startsWith(chartMonth));
  const income = monthTx.filter((t) => t.type === "INCOME").reduce((s, t) => s + t.amount, 0);
  const expense = monthTx.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  const persons = personsQ.data ?? [];
  const byPerson = persons.map((p) => {
    const total = monthTx
      .filter((t) => t.type === "EXPENSE" && t.person_id === p.id)
      .reduce((s, t) => s + t.amount, 0);
    return { ...p, total };
  });
  const totalExp = byPerson.reduce((s, p) => s + p.total, 0);
  const personTotalBase = totalExp || 1;

  const categories = categoriesQ.data ?? [];
  const expensesByCategory = categories
    .filter((category) => category.type === "EXPENSE")
    .map((category, index) => {
      const total = chartTx
        .filter((t) => t.type === "EXPENSE" && t.category_id === category.id)
        .reduce((s, t) => s + t.amount, 0);
      return {
        id: category.id,
        name: category.name,
        total,
        fill: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      };
    })
    .filter((category) => category.total > 0)
    .sort((a, b) => b.total - a.total);
  const categoryTotal = expensesByCategory.reduce((sum, category) => sum + category.total, 0);

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    const name = categoryName.trim();
    if (!name) {
      toast.error("Informe o nome da categoria");
      return;
    }

    setSavingCategory(true);
    const { error } = await supabase.from("categories").insert({
      name,
      type: categoryType,
    });
    setSavingCategory(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Categoria criada");
    setCategoryName("");
    setCategoryType("EXPENSE");
    qc.invalidateQueries({ queryKey: ["categories"] });
  }

  async function handleDeleteCategory(id: string, name: string) {
    if (!confirm(`Remover a categoria "${name}"?`)) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Categoria removida");
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
  }

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
        <SummaryCard
          label="Entradas"
          value={income}
          tone="income"
          icon={<ArrowUpRight className="h-4 w-4" />}
        />
        <SummaryCard
          label="Saídas"
          value={expense}
          tone="expense"
          icon={<ArrowDownRight className="h-4 w-4" />}
        />
        <div className="col-span-2 rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Balanço do mês</p>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className={`mt-1 text-2xl font-bold ${balance >= 0 ? "text-income" : "text-expense"}`}>
            {balance >= 0 ? "Sobrou " : "Faltou "}
            {brl(Math.abs(balance))}
          </p>
        </div>
      </section>

      <section className="mt-6 px-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
          Comparativo de gastos
        </h2>
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
            {byPerson.map((p) => (
              <div
                key={p.id}
                style={{
                  width: `${(p.total / personTotalBase) * 100}%`,
                  backgroundColor: p.color_tag,
                }}
              />
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {byPerson.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: p.color_tag }}
                  />
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
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold">{g.title}</p>
                  <p className="text-sm tabular-nums text-muted-foreground">
                    {brl(g.current_amount)} / {brl(g.target_amount)}
                  </p>
                </div>
                <Progress value={pct} className="mt-2" />
                <p className="mt-1 text-xs text-muted-foreground">{pct}% concluído</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6 px-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
          Gastos por categoria
        </h2>

        <div className="rounded-2xl border bg-card p-4">
          <div className="mb-3">
            <Label htmlFor="category-chart-month" className="text-xs text-muted-foreground">
              Mês do gráfico
            </Label>
            <Input
              id="category-chart-month"
              type="month"
              value={chartMonth}
              onChange={(e) => setChartMonth(e.target.value || currentMonthValue())}
              className="mt-1"
            />
          </div>

          {expensesByCategory.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum gasto por categoria neste mês.
            </p>
          ) : (
            <>
              <ChartContainer config={{ total: { label: "Gastos" } }} className="mx-auto h-52">
                <PieChart>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        hideLabel
                        formatter={(value, _name, item) => {
                          const total = Number(value);
                          const percent = Math.round((total / categoryTotal) * 100);
                          return (
                            <div className="flex min-w-36 items-center justify-between gap-3">
                              <span className="text-muted-foreground">{item.payload.name}</span>
                              <span className="font-mono font-medium tabular-nums text-foreground">
                                {percent}% · {brl(total)}
                              </span>
                            </div>
                          );
                        }}
                      />
                    }
                  />
                  <Pie
                    data={expensesByCategory}
                    dataKey="total"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={82}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {expensesByCategory.map((entry) => (
                      <Cell key={entry.id} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>

              <div className="mt-3 space-y-2">
                {expensesByCategory.map((category) => (
                  <div
                    key={category.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: category.fill }}
                      />
                      <span className="truncate font-medium">{category.name}</span>
                    </div>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {Math.round((category.total / categoryTotal) * 100)}% · {brl(category.total)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <Dialog>
        <DialogTrigger asChild>
          <Button
            size="icon"
            aria-label="Configurar categorias"
            className="fixed bottom-24 right-5 z-40 h-12 w-12 rounded-full shadow-lg"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Categorias</DialogTitle>
            <DialogDescription>
              Adicione ou remova categorias usadas nos lançamentos.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateCategory} className="space-y-3 rounded-lg border p-3">
            <div>
              <Label htmlFor="category-name">Nome</Label>
              <Input
                id="category-name"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="Ex: Academia"
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select
                value={categoryType}
                onValueChange={(value) => setCategoryType(value as CategoryType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXPENSE">Saída</SelectItem>
                  <SelectItem value="INCOME">Entrada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={savingCategory}>
              <Plus className="h-4 w-4" />
              {savingCategory ? "Salvando..." : "Adicionar categoria"}
            </Button>
          </form>

          <div className="space-y-2">
            {categories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{category.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {category.type === "EXPENSE" ? "Saída" : "Entrada"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteCategory(category.id, category.name)}
                  aria-label={`Remover ${category.name}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "income" | "expense";
  icon: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        tone === "income" ? "border-income/20 bg-income/10" : "border-expense/20 bg-expense/10"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className={tone === "income" ? "text-income" : "text-expense"}>{icon}</span>
      </div>
      <p className={`mt-1 text-xl font-bold ${tone === "income" ? "text-income" : "text-expense"}`}>
        {brl(value)}
      </p>
    </div>
  );
}
