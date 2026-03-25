-- EK_02: Freie Bestellpositionen (FREETEXT + TEXT position types)

-- 1. Create enum
CREATE TYPE wh_purchase_order_position_type AS ENUM (
  'ARTICLE',
  'FREETEXT',
  'TEXT'
);

-- 2. Add position_type column (default ARTICLE for existing rows)
ALTER TABLE wh_purchase_order_positions
  ADD COLUMN position_type wh_purchase_order_position_type NOT NULL DEFAULT 'ARTICLE';

-- 3. Add free_text column
ALTER TABLE wh_purchase_order_positions
  ADD COLUMN free_text TEXT;

-- 4. Make article_id nullable (existing rows keep their value)
ALTER TABLE wh_purchase_order_positions
  ALTER COLUMN article_id DROP NOT NULL;

-- 5. Make quantity nullable (TEXT positions have no quantity)
ALTER TABLE wh_purchase_order_positions
  ALTER COLUMN quantity DROP NOT NULL;
