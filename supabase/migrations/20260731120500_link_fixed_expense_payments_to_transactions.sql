ALTER TABLE public.fixed_expense_payments
  ADD COLUMN transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

CREATE INDEX fixed_expense_payments_transaction_id_idx
  ON public.fixed_expense_payments (transaction_id);
