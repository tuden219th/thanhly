ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 0;

UPDATE public.products
SET stock_quantity = 0
WHERE stock_quantity IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_stock_quantity
  ON public.products (stock_quantity);
