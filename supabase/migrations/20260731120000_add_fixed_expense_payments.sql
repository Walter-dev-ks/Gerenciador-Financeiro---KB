CREATE TABLE public.fixed_expense_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixed_expense_id uuid NOT NULL REFERENCES public.fixed_expenses(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  description text,
  paid_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX fixed_expense_payments_expense_paid_at_idx
  ON public.fixed_expense_payments (fixed_expense_id, paid_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_expense_payments TO anon, authenticated;
GRANT ALL ON public.fixed_expense_payments TO service_role;

ALTER TABLE public.fixed_expense_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public rw fixed_expense_payments"
  ON public.fixed_expense_payments
  FOR ALL
  USING (true)
  WITH CHECK (true);
