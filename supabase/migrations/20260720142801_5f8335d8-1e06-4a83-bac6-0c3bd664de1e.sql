-- Enums
CREATE TYPE public.transaction_type AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');
CREATE TYPE public.category_type AS ENUM ('INCOME', 'EXPENSE');

-- Persons
CREATE TABLE public.persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color_tag text NOT NULL DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.persons TO anon, authenticated;
GRANT ALL ON public.persons TO service_role;
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public rw persons" ON public.persons FOR ALL USING (true) WITH CHECK (true);

-- Accounts
CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  initial_balance numeric(14,2) NOT NULL DEFAULT 0,
  current_balance numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO anon, authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public rw accounts" ON public.accounts FOR ALL USING (true) WITH CHECK (true);

-- Categories
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type public.category_type NOT NULL,
  budget_limit numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public rw categories" ON public.categories FOR ALL USING (true) WITH CHECK (true);

-- Transactions
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  amount numeric(14,2) NOT NULL,
  type public.transaction_type NOT NULL,
  person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  is_paid boolean NOT NULL DEFAULT true,
  is_recurring boolean NOT NULL DEFAULT false,
  total_parcels integer NOT NULL DEFAULT 1,
  current_parcel integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_transactions_date ON public.transactions(date DESC);
CREATE INDEX idx_transactions_person ON public.transactions(person_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO anon, authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public rw transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);

-- Goals
CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  target_amount numeric(14,2) NOT NULL,
  current_amount numeric(14,2) NOT NULL DEFAULT 0,
  target_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO anon, authenticated;
GRANT ALL ON public.goals TO service_role;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public rw goals" ON public.goals FOR ALL USING (true) WITH CHECK (true);

-- Seed persons
INSERT INTO public.persons (name, color_tag) VALUES
  ('Bianca', '#f97316'),
  ('Kiel', '#a855f7'),
  ('Casal', '#3b82f6');

-- Seed categories
INSERT INTO public.categories (name, type) VALUES
  ('Salário', 'INCOME'),
  ('Freelance', 'INCOME'),
  ('Investimentos', 'INCOME'),
  ('Alimentação', 'EXPENSE'),
  ('Moradia', 'EXPENSE'),
  ('Transporte', 'EXPENSE'),
  ('Lazer', 'EXPENSE'),
  ('Saúde', 'EXPENSE'),
  ('Educação', 'EXPENSE'),
  ('Compras', 'EXPENSE'),
  ('Contas', 'EXPENSE'),
  ('Outros', 'EXPENSE');

-- Seed a default account
INSERT INTO public.accounts (name, initial_balance, current_balance) VALUES
  ('Conta Conjunta', 0, 0);
