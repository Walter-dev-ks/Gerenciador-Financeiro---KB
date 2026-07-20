CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO anon, authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public insert push_subscriptions"
ON public.push_subscriptions
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "public update own push_subscriptions"
ON public.push_subscriptions
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "public select push_subscriptions"
ON public.push_subscriptions
FOR SELECT
TO anon, authenticated
USING (true);

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_transaction_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://oxsbueflizmomkvviiep.supabase.co/functions/v1/send-transaction-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-finance-push-secret', '64lZnKLiH0ifMtYiD2gWDp5Ep3dBBFGvm2puwG6RPlI'
    ),
    body := jsonb_build_object('transaction_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_transaction_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS transactions_send_push_notification ON public.transactions;

CREATE TRIGGER transactions_send_push_notification
AFTER INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.notify_transaction_push();
