
CREATE TYPE public.fixed_expense_status AS ENUM ('PENDING', 'PAID');

CREATE TABLE public.fixed_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  person_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  due_day INTEGER NOT NULL DEFAULT 1 CHECK (due_day BETWEEN 1 AND 31),
  status public.fixed_expense_status NOT NULL DEFAULT 'PENDING',
  last_paid_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_expenses TO anon, authenticated;
GRANT ALL ON public.fixed_expenses TO service_role;

ALTER TABLE public.fixed_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public rw fixed_expenses" ON public.fixed_expenses FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.reset_fixed_expenses_monthly()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.fixed_expenses SET status = 'PENDING', updated_at = now() WHERE is_active = true AND status = 'PAID';
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'reset-fixed-expenses-monthly',
  '0 0 1 * *',
  $$ SELECT public.reset_fixed_expenses_monthly(); $$
);
