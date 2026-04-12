-- Add VAT rate to purchase order positions
ALTER TABLE wh_purchase_order_positions
  ADD COLUMN vat_rate double precision NOT NULL DEFAULT 19.0;

-- Add total VAT to purchase orders
ALTER TABLE wh_purchase_orders
  ADD COLUMN total_vat double precision NOT NULL DEFAULT 0;

-- Backfill: set each position's vat_rate from its linked article
UPDATE wh_purchase_order_positions p
SET vat_rate = a.vat_rate
FROM wh_articles a
WHERE p.article_id = a.id;

-- Backfill: recalculate total_vat and total_gross for all orders
WITH order_vat AS (
  SELECT
    purchase_order_id,
    ROUND(CAST(SUM(COALESCE(total_price, 0) * vat_rate / 100) AS numeric), 2) AS total_vat
  FROM wh_purchase_order_positions
  GROUP BY purchase_order_id
)
UPDATE wh_purchase_orders o
SET
  total_vat = COALESCE(ov.total_vat, 0),
  total_gross = ROUND(CAST(o.subtotal_net + COALESCE(ov.total_vat, 0) AS numeric), 2)
FROM order_vat ov
WHERE o.id = ov.purchase_order_id;
