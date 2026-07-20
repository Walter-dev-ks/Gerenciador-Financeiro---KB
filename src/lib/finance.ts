import { supabase } from "@/integrations/supabase/client";

export type Person = {
  id: string;
  name: string;
  color_tag: string;
};

export type Account = {
  id: string;
  name: string;
  initial_balance: number;
  current_balance: number;
};

export type Category = {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
  budget_limit: number | null;
};

export type Transaction = {
  id: string;
  description: string;
  amount: number;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  person_id: string | null;
  account_id: string | null;
  category_id: string | null;
  date: string;
  is_paid: boolean;
  is_recurring: boolean;
  total_parcels: number;
  current_parcel: number;
  created_at: string;
};

export type Goal = {
  id: string;
  title: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
};

export const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

export async function fetchPersons(): Promise<Person[]> {
  const { data, error } = await supabase.from("persons").select("*").order("name");
  if (error) throw error;
  return data as Person[];
}
export async function fetchAccounts(): Promise<Account[]> {
  const { data, error } = await supabase.from("accounts").select("*").order("name");
  if (error) throw error;
  return (data as any[]).map((a) => ({
    ...a,
    initial_balance: Number(a.initial_balance),
    current_balance: Number(a.current_balance),
  }));
}
export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from("categories").select("*").order("name");
  if (error) throw error;
  return (data as any[]).map((c) => ({
    ...c,
    budget_limit: c.budget_limit != null ? Number(c.budget_limit) : null,
  }));
}
export async function fetchTransactions(): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as any[]).map((t) => ({ ...t, amount: Number(t.amount) }));
}
export async function fetchGoals(): Promise<Goal[]> {
  const { data, error } = await supabase.from("goals").select("*").order("created_at");
  if (error) throw error;
  return (data as any[]).map((g) => ({
    ...g,
    target_amount: Number(g.target_amount),
    current_amount: Number(g.current_amount),
  }));
}

export function personColorVar(color: string | null | undefined) {
  return color || "#6366f1";
}
