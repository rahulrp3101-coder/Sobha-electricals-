-- ============================================================================
-- VYAPAR PRO CLOUD - SUPABASE POSTGRESQL TABLES SCHEMA
-- File: supabase_schema.sql
-- Instructions: Copy and run this script in your Supabase SQL Editor.
-- Dashboard -> SQL Editor -> New query -> Paste and click 'Run'.
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. ITEMS (Inventory & Stock Products)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  barcode TEXT,
  sale_price NUMERIC(12, 2) DEFAULT 0,
  purchase_price NUMERIC(12, 2) DEFAULT 0,
  stock NUMERIC(12, 2) DEFAULT 0,
  gst_rate NUMERIC(5, 2) DEFAULT 0,
  data_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for barcode scanning & name search
CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);

-- ----------------------------------------------------------------------------
-- 2. PARTIES (Customers & Suppliers Khata)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'CUSTOMER', -- 'CUSTOMER' or 'SUPPLIER'
  phone TEXT,
  gstin TEXT,
  address TEXT,
  opening_balance NUMERIC(12, 2) DEFAULT 0,
  current_balance NUMERIC(12, 2) DEFAULT 0,
  data_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parties_phone ON parties(phone);
CREATE INDEX IF NOT EXISTS idx_parties_type ON parties(type);

-- ----------------------------------------------------------------------------
-- 3. INVOICES (Sales Invoices & Billing Register)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  invoice_number TEXT NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW(),
  party_id TEXT,
  items_json JSONB,
  total_amount NUMERIC(12, 2) DEFAULT 0,
  paid_amount NUMERIC(12, 2) DEFAULT 0,
  balance_amount NUMERIC(12, 2) DEFAULT 0,
  payment_mode TEXT DEFAULT 'CASH',
  data_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_party ON invoices(party_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date);

-- ----------------------------------------------------------------------------
-- 4. PURCHASES (Vendor Purchase Bills & Inward Supplies)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  bill_number TEXT NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW(),
  supplier_id TEXT,
  items_json JSONB,
  total_amount NUMERIC(12, 2) DEFAULT 0,
  paid_amount NUMERIC(12, 2) DEFAULT 0,
  balance_amount NUMERIC(12, 2) DEFAULT 0,
  data_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchases_bill_number ON purchases(bill_number);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);

-- ----------------------------------------------------------------------------
-- 5. EXPENSES (Shop & Business Expenses with ITC)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  category TEXT NOT NULL, -- Rent, Electricity, Salary, Freight, Office, Maintenance, Other
  amount NUMERIC(12, 2) DEFAULT 0,
  payment_mode TEXT DEFAULT 'CASH',
  date TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  is_gst BOOLEAN DEFAULT FALSE,
  gst_amount NUMERIC(12, 2) DEFAULT 0,
  data_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);

-- ----------------------------------------------------------------------------
-- 6. PAYMENTS (Khata Transactions: Payment In & Payment Out)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  party_id TEXT,
  type TEXT NOT NULL, -- 'PAYMENT_IN' or 'PAYMENT_OUT'
  amount NUMERIC(12, 2) DEFAULT 0,
  payment_mode TEXT DEFAULT 'CASH',
  date TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  data_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_party ON payments(party_id);
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(type);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) & PUBLIC ANON ACCESS POLICIES
-- ============================================================================

-- Enable RLS on all 6 tables
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Drop previous policies if re-running to avoid duplicate error
DROP POLICY IF EXISTS "Allow anon read/write items" ON items;
DROP POLICY IF EXISTS "Allow anon read/write parties" ON parties;
DROP POLICY IF EXISTS "Allow anon read/write invoices" ON invoices;
DROP POLICY IF EXISTS "Allow anon read/write purchases" ON purchases;
DROP POLICY IF EXISTS "Allow anon read/write expenses" ON expenses;
DROP POLICY IF EXISTS "Allow anon read/write payments" ON payments;

-- Create open RLS policies for anon access (API key authentication)
CREATE POLICY "Allow anon read/write items" ON items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read/write parties" ON parties FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read/write invoices" ON invoices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read/write purchases" ON purchases FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read/write expenses" ON expenses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read/write payments" ON payments FOR ALL USING (true) WITH CHECK (true);

-- Enable Supabase Realtime for instant multi-device live sync
ALTER PUBLICATION supabase_realtime ADD TABLE items;
ALTER PUBLICATION supabase_realtime ADD TABLE parties;
ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE purchases;
ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE payments;

-- ----------------------------------------------------------------------------
-- OPTIONAL: Add extra columns for Universal Customer Search & Estimates
-- (NOTE: The app works 100% fine even without running this, because all extra
-- fields are automatically stored in the 'data_json' JSONB column!)
-- ----------------------------------------------------------------------------
ALTER TABLE parties ADD COLUMN IF NOT EXISTS shop_name TEXT;
ALTER TABLE parties ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE parties ADD COLUMN IF NOT EXISTS village TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT 'SALES_INVOICE';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deduct_stock BOOLEAN DEFAULT FALSE;

