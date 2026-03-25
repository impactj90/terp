-- WH_09: Add delivery_note_stock_mode to system_settings
-- and add DELIVERY_NOTE to wh_stock_movement_type enum

-- 1. Add deliveryNoteStockMode column to system_settings
ALTER TABLE system_settings
  ADD COLUMN delivery_note_stock_mode VARCHAR(10) NOT NULL DEFAULT 'MANUAL';

-- 2. Add DELIVERY_NOTE to wh_stock_movement_type enum
ALTER TYPE wh_stock_movement_type ADD VALUE IF NOT EXISTS 'DELIVERY_NOTE';
