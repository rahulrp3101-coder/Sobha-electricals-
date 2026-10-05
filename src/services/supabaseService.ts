/**
 * Supabase Offline-First Synchronization & Cloud Database Service
 * Provides seamless 0ms local-first IndexedDB persistence with automatic
 * background syncing when network reconnects, two-way sync, and schema generation.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  Item, Party, Invoice, PaymentTransaction, Expense, SyncQueueItem, CompanyProfile 
} from '../types';
import { 
  getAllFromStore, putToStore, bulkPutToStore, clearStore, deleteFromStore, getDB 
} from '../db/indexedDB';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  autoSync: boolean;
  lastSyncedAt?: string;
  isConnected?: boolean;
}

const STORAGE_KEY = 'vyapar_supabase_config';

/**
 * Gets currently configured Supabase credentials from local storage or environment
 */
export function getSupabaseConfig(): SupabaseConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        url: parsed.url || (import.meta as any).env?.VITE_SUPABASE_URL || '',
        anonKey: parsed.anonKey || (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '',
        autoSync: parsed.autoSync !== false,
        lastSyncedAt: parsed.lastSyncedAt,
        isConnected: Boolean(parsed.url && parsed.anonKey),
      };
    }
  } catch {}

  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

  return {
    url: envUrl,
    anonKey: envKey,
    autoSync: true,
    isConnected: Boolean(envUrl && envKey),
  };
}

/**
 * Saves Supabase credentials locally
 */
export function saveSupabaseConfig(config: Partial<SupabaseConfig>): void {
  const current = getSupabaseConfig();
  const updated: SupabaseConfig = {
    ...current,
    ...config,
    isConnected: Boolean((config.url ?? current.url) && (config.anonKey ?? current.anonKey)),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  // Reset cached client instance
  cachedClient = null;
}

let cachedClient: SupabaseClient | null = null;

/**
 * Returns active Supabase client or null if not configured
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;

  const cfg = getSupabaseConfig();
  if (!cfg.url || !cfg.anonKey || !cfg.url.startsWith('http')) {
    return null;
  }

  try {
    cachedClient = createClient(cfg.url.trim(), cfg.anonKey.trim(), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    return cachedClient;
  } catch (err) {
    console.warn('Failed to initialize Supabase client:', err);
    return null;
  }
}

/**
 * Generates copy-paste SQL schema for Supabase SQL Editor
 */
export function generateSupabaseSQLSchema(): string {
  return `-- =========================================================
-- VYAPAR PRO CLOUD - SUPABASE TABLES SCHEMA (CA & Offline-First)
-- Run this in your Supabase Project -> SQL Editor -> Run
-- =========================================================

-- 1. ITEMS (Inventory Products)
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  barcode TEXT,
  sale_price NUMERIC(12, 2) DEFAULT 0,
  purchase_price NUMERIC(12, 2) DEFAULT 0,
  stock NUMERIC(12, 2) DEFAULT 0,
  gst_rate NUMERIC(5, 2) DEFAULT 0,
  data_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PARTIES (Customers & Suppliers)
CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'CUSTOMER' or 'SUPPLIER'
  phone TEXT,
  gstin TEXT,
  address TEXT,
  opening_balance NUMERIC(12, 2) DEFAULT 0,
  current_balance NUMERIC(12, 2) DEFAULT 0,
  data_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. INVOICES (Sales Invoices & Billing)
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL,
  date TEXT NOT NULL,
  party_id TEXT,
  items_json JSONB,
  total_amount NUMERIC(12, 2) DEFAULT 0,
  paid_amount NUMERIC(12, 2) DEFAULT 0,
  balance_amount NUMERIC(12, 2) DEFAULT 0,
  payment_mode TEXT,
  data_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PURCHASES (Vendor Purchase Bills)
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  bill_number TEXT NOT NULL,
  date TEXT NOT NULL,
  supplier_id TEXT,
  items_json JSONB,
  total_amount NUMERIC(12, 2) DEFAULT 0,
  paid_amount NUMERIC(12, 2) DEFAULT 0,
  balance_amount NUMERIC(12, 2) DEFAULT 0,
  data_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. EXPENSES (Shop & Business Expenses with ITC)
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  amount NUMERIC(12, 2) DEFAULT 0,
  payment_mode TEXT,
  date TEXT NOT NULL,
  notes TEXT,
  is_gst BOOLEAN DEFAULT FALSE,
  gst_amount NUMERIC(12, 2) DEFAULT 0,
  data_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. PAYMENTS (Payment In & Payment Out Transactions)
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  party_id TEXT,
  type TEXT NOT NULL, -- 'PAYMENT_IN' or 'PAYMENT_OUT'
  amount NUMERIC(12, 2) DEFAULT 0,
  payment_mode TEXT,
  date TEXT NOT NULL,
  notes TEXT,
  data_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) & Public access for API Keys
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Drop previous policies if re-running
DROP POLICY IF EXISTS "Allow anon read/write items" ON items;
DROP POLICY IF EXISTS "Allow anon read/write parties" ON parties;
DROP POLICY IF EXISTS "Allow anon read/write invoices" ON invoices;
DROP POLICY IF EXISTS "Allow anon read/write purchases" ON purchases;
DROP POLICY IF EXISTS "Allow anon read/write expenses" ON expenses;
DROP POLICY IF EXISTS "Allow anon read/write payments" ON payments;

CREATE POLICY "Allow anon read/write items" ON items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read/write parties" ON parties FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read/write invoices" ON invoices FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read/write purchases" ON purchases FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read/write expenses" ON expenses FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read/write payments" ON payments FOR ALL TO anon USING (true) WITH CHECK (true);

-- Enable Supabase Realtime for instant multi-device live sync
ALTER PUBLICATION supabase_realtime ADD TABLE items;
ALTER PUBLICATION supabase_realtime ADD TABLE parties;
ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE purchases;
ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
`;
}

/**
 * Tests connection to Supabase instance
 */
export async function testSupabaseConnection(): Promise<{ success: boolean; message: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      message: 'Supabase URL या Anon Key खाली है। कृपया दोनों फ़ील्ड भरें।',
    };
  }

  try {
    // Attempt a lightweight select from items or check auth
    const { error } = await client.from('items').select('id').limit(1);
    if (error) {
      if (error.message.includes('relation "items" does not exist') || error.code === '42P01') {
        return {
          success: true,
          message: 'Supabase से कनेक्ट हो गया! कृपया नीचे दिए गए "Generate SQL Schema" बटन से टेबल्स बनाएं।',
        };
      }
      return {
        success: false,
        message: `Supabase त्रुटि: ${error.message}`,
      };
    }

    return {
      success: true,
      message: '🟢 Supabase क्लाउड डेटाबेस सफलतापूर्वक कनेक्ट हो गया है!',
    };
  } catch (err: any) {
    return {
      success: false,
      message: `कनेक्शन विफल: ${err.message || 'नेटवर्क त्रुटि'}`,
    };
  }
}

// =========================================================
// DELETED RECORDS TOMBSTONE TRACKER (Prevents Ghost Reappearance)
// =========================================================
interface Tombstone {
  id: string;
  table: string; // 'items', 'parties', 'invoices', 'purchases', 'expenses', 'payments'
  deletedAt: number;
}

const TOMBSTONE_STORAGE_KEY = 'vyapar_deleted_records_tombstones';
const TOMBSTONE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days retention

export function recordDeletedTombstone(table: string, id: string): void {
  if (!id) return;
  try {
    const raw = localStorage.getItem(TOMBSTONE_STORAGE_KEY);
    const list: Tombstone[] = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    const cleanTable = table.toLowerCase();
    const filtered = list.filter(t => (now - t.deletedAt) < TOMBSTONE_TTL_MS && t.id !== id);
    filtered.push({ id, table: cleanTable, deletedAt: now });
    localStorage.setItem(TOMBSTONE_STORAGE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn('Failed to record tombstone:', err);
  }
}

export function getDeletedTombstoneIds(table?: string): Set<string> {
  const ids = new Set<string>();
  try {
    const raw = localStorage.getItem(TOMBSTONE_STORAGE_KEY);
    if (!raw) return ids;
    const list: Tombstone[] = JSON.parse(raw);
    const now = Date.now();
    const cleanTable = table ? table.toLowerCase() : null;
    for (const t of list) {
      if ((now - t.deletedAt) < TOMBSTONE_TTL_MS) {
        if (!cleanTable || t.table === cleanTable || (cleanTable === 'invoices' && t.table === 'purchases')) {
          ids.add(t.id);
        }
      }
    }
  } catch {}
  return ids;
}

export function clearTombstone(id: string): void {
  try {
    const raw = localStorage.getItem(TOMBSTONE_STORAGE_KEY);
    if (!raw) return;
    const list: Tombstone[] = JSON.parse(raw);
    const remaining = list.filter(t => t.id !== id);
    localStorage.setItem(TOMBSTONE_STORAGE_KEY, JSON.stringify(remaining));
  } catch {}
}

export function mapEntityToTable(entity: string): 'items' | 'parties' | 'invoices' | 'purchases' | 'expenses' | 'payments' {
  const norm = (entity || '').toUpperCase();
  if (norm === 'ITEM' || norm === 'ITEMS') return 'items';
  if (norm === 'PARTY' || norm === 'PARTIES') return 'parties';
  if (norm === 'PURCHASE' || norm === 'PURCHASES') return 'purchases';
  if (norm === 'EXPENSE' || norm === 'EXPENSES') return 'expenses';
  if (norm === 'PAYMENT' || norm === 'PAYMENTS') return 'payments';
  return 'invoices';
}

/**
 * Pushes pending local changes from IndexedDB to Supabase
 * OPTIMIZED: Incremental Delta sync, bulk array upserts, and parallel Promise.all (Sub-second execution)
 */
export async function pushPendingToSupabase(): Promise<{ success: boolean; pushedCount: number; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, pushedCount: 0, error: 'Supabase not configured' };
  }

  try {
    // 1. Fetch stores in parallel
    const [items, parties, invoices, payments, expenses, queueItems] = await Promise.all([
      getAllFromStore<Item>('items'),
      getAllFromStore<Party>('parties'),
      getAllFromStore<Invoice>('invoices'),
      getAllFromStore<PaymentTransaction>('payments'),
      getAllFromStore<Expense>('expenses'),
      getAllFromStore<SyncQueueItem>('sync_queue').catch(() => []),
    ]);

    // 2. Incremental Delta Filtering: Only records that are not synced yet
    const pendingItems = items.filter(i => (i as any).is_synced === false || (i as any).isSynced === false);
    const pendingParties = parties.filter(p => (p as any).is_synced === false || (p as any).isSynced === false);
    const pendingInvoices = invoices.filter(inv => 
      ((inv as any).is_synced === false || (inv as any).isSynced === false) && 
      (inv.documentType === 'SALES_INVOICE' || !inv.documentType || inv.documentType === 'ESTIMATE' || inv.documentType === 'QUOTATION')
    );
    const pendingPurchases = invoices.filter(p => 
      ((p as any).is_synced === false || (p as any).isSynced === false) && 
      p.documentType === 'PURCHASE_BILL'
    );
    const pendingExpenses = expenses.filter(e => (e as any).is_synced === false || (e as any).isSynced === false);
    const pendingPayments = payments.filter(p => (p as any).is_synced === false || (p as any).isSynced === false);
    const pendingDeletes = (queueItems || []).filter(q => q.action === 'DELETE' || q.sync_action === 'DELETE');

    const totalPendingCount = 
      pendingItems.length + pendingParties.length + pendingInvoices.length + 
      pendingPurchases.length + pendingExpenses.length + pendingPayments.length +
      pendingDeletes.length;

    // Fast-path: If nothing has changed, finish immediately in ~1ms
    if (totalPendingCount === 0) {
      const nowTimeStr = new Date().toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' });
      saveSupabaseConfig({ lastSyncedAt: `${new Date().toLocaleDateString('hi-IN')} ${nowTimeStr}` });
      return { success: true, pushedCount: 0 };
    }

    // 3. Prepare Batch Arrays for Bulk Upsert
    const itemRows = pendingItems.map(i => ({
      id: i.id,
      name: i.name,
      barcode: i.barcode || null,
      sale_price: i.retailPrice || 0,
      purchase_price: i.purchasePrice || 0,
      stock: i.currentStock || 0,
      gst_rate: i.taxRate || 0,
      data_json: i,
      updated_at: i.updatedAt || new Date().toISOString(),
    }));

    const partyRows = pendingParties.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      phone: p.phone || null,
      gstin: p.gstin || null,
      address: p.address || null,
      opening_balance: p.openingBalance || 0,
      current_balance: p.currentBalance || 0,
      data_json: p,
      updated_at: p.updatedAt || new Date().toISOString(),
    }));

    const invoiceRows = pendingInvoices.map(inv => ({
      id: inv.id,
      invoice_number: inv.invoiceNumber,
      date: inv.date,
      party_id: inv.partyId || null,
      items_json: inv.items || [],
      total_amount: inv.grandTotal || 0,
      paid_amount: inv.receivedAmount || 0,
      balance_amount: inv.balanceAmount || 0,
      payment_mode: inv.paymentMode || 'CASH',
      data_json: inv,
      updated_at: inv.updatedAt || inv.createdAt || new Date().toISOString(),
    }));

    const purchaseRows = pendingPurchases.map(p => ({
      id: p.id,
      bill_number: p.invoiceNumber,
      date: p.date,
      supplier_id: p.partyId || null,
      items_json: p.items || [],
      total_amount: p.grandTotal || 0,
      paid_amount: p.receivedAmount || 0,
      balance_amount: p.balanceAmount || 0,
      data_json: p,
      updated_at: p.updatedAt || p.createdAt || new Date().toISOString(),
    }));

    const expenseRows = pendingExpenses.map(e => ({
      id: e.id,
      category: e.category,
      amount: e.amount || 0,
      payment_mode: e.paymentMode || 'CASH',
      date: e.date,
      notes: e.notes || e.title || null,
      is_gst: Boolean(e.isGstApplicable),
      gst_amount: e.taxAmount || 0,
      data_json: e,
      updated_at: e.createdAt || new Date().toISOString(),
    }));

    const paymentRows = pendingPayments.map(p => ({
      id: p.id,
      party_id: p.partyId || null,
      type: p.type,
      amount: p.amount || 0,
      payment_mode: p.paymentMode || 'CASH',
      date: p.date,
      notes: p.notes || null,
      data_json: p,
      updated_at: p.createdAt || new Date().toISOString(),
    }));

    // 4. Parallel Bulk Upsert & Deletes to Supabase via Promise.all
    // Rule 1: Include pendingExpenses in upload tasks to Supabase 'expenses' table
    // Rule 2: Handle queue deletions from Supabase tables
    // Rule 4: Strict error checking for upsert responses
    const [
      itemRes,
      partyRes,
      invoiceRes,
      purchaseRes,
      expenseRes,
      paymentRes,
      ...deleteResults
    ] = await Promise.all([
      itemRows.length > 0 
        ? client.from('items').upsert(itemRows, { onConflict: 'id' }) 
        : Promise.resolve({ error: null }),
      partyRows.length > 0 
        ? client.from('parties').upsert(partyRows, { onConflict: 'id' }) 
        : Promise.resolve({ error: null }),
      invoiceRows.length > 0 
        ? client.from('invoices').upsert(invoiceRows, { onConflict: 'id' }) 
        : Promise.resolve({ error: null }),
      purchaseRows.length > 0 
        ? client.from('purchases').upsert(purchaseRows, { onConflict: 'id' }) 
        : Promise.resolve({ error: null }),
      expenseRows.length > 0 
        ? client.from('expenses').upsert(expenseRows, { onConflict: 'id' }) 
        : Promise.resolve({ error: null }),
      paymentRows.length > 0 
        ? client.from('payments').upsert(paymentRows, { onConflict: 'id' }) 
        : Promise.resolve({ error: null }),
      // Rule 2: Process sync_queue DELETE actions
      ...pendingDeletes.map(dq => {
        const table = mapEntityToTable(dq.entity);
        const targetId = dq.payload?.id || dq.payload?.itemId || dq.payload?.partyId || dq.id.replace(/^sync-del-(inv|itm|pty|exp|pay|items|parties|invoices|purchases|expenses|payments)-/, '');
        if (targetId) {
          recordDeletedTombstone(table, targetId);
          return client.from(table).delete().eq('id', targetId);
        }
        return Promise.resolve({ error: null });
      }),
    ]);

    // Check errors
    if (itemRes.error) console.error('Supabase items upsert error:', itemRes.error);
    if (partyRes.error) console.error('Supabase parties upsert error:', partyRes.error);
    if (invoiceRes.error) console.error('Supabase invoices upsert error:', invoiceRes.error);
    if (purchaseRes.error) console.error('Supabase purchases upsert error:', purchaseRes.error);
    if (expenseRes.error) console.error('Supabase expenses upsert error:', expenseRes.error);
    if (paymentRes.error) console.error('Supabase payments upsert error:', paymentRes.error);

    let successfullyPushedCount = 0;
    const dbUpdateTasks: Promise<any>[] = [];

    // Rule 4: STRICT ERROR CHECKING - ONLY mark local records as is_synced: true if cloud upsert succeeded (no error)!
    if (!itemRes.error && pendingItems.length > 0) {
      dbUpdateTasks.push(bulkPutToStore('items', pendingItems.map(i => ({ ...i, is_synced: true, isSynced: true }))));
      successfullyPushedCount += pendingItems.length;
    }
    if (!partyRes.error && pendingParties.length > 0) {
      dbUpdateTasks.push(bulkPutToStore('parties', pendingParties.map(p => ({ ...p, is_synced: true, isSynced: true }))));
      successfullyPushedCount += pendingParties.length;
    }
    if (!invoiceRes.error && pendingInvoices.length > 0) {
      dbUpdateTasks.push(bulkPutToStore('invoices', pendingInvoices.map(inv => ({ ...inv, is_synced: true, isSynced: true }))));
      successfullyPushedCount += pendingInvoices.length;
    }
    if (!purchaseRes.error && pendingPurchases.length > 0) {
      dbUpdateTasks.push(bulkPutToStore('invoices', pendingPurchases.map(p => ({ ...p, is_synced: true, isSynced: true }))));
      successfullyPushedCount += pendingPurchases.length;
    }
    if (!expenseRes.error && pendingExpenses.length > 0) {
      dbUpdateTasks.push(bulkPutToStore('expenses', pendingExpenses.map(e => ({ ...e, is_synced: true, isSynced: true }))));
      successfullyPushedCount += pendingExpenses.length;
    }
    if (!paymentRes.error && pendingPayments.length > 0) {
      dbUpdateTasks.push(bulkPutToStore('payments', pendingPayments.map(p => ({ ...p, is_synced: true, isSynced: true }))));
      successfullyPushedCount += pendingPayments.length;
    }

    // Rule 2 & 4: Only remove delete actions from sync_queue that succeeded on Supabase
    pendingDeletes.forEach((dq, index) => {
      const delRes = deleteResults[index];
      if (!delRes?.error) {
        dbUpdateTasks.push(deleteFromStore('sync_queue', dq.id).catch(() => {}));
        successfullyPushedCount += 1;
      } else {
        console.error(`Supabase delete error for queue item ${dq.id}:`, delRes.error);
      }
    });

    await Promise.all(dbUpdateTasks);

    // Update last sync time
    const nowTimeStr = new Date().toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' });
    const nowDateStr = new Date().toLocaleDateString('hi-IN');
    saveSupabaseConfig({ lastSyncedAt: `${nowDateStr} ${nowTimeStr}` });

    return { success: true, pushedCount: successfullyPushedCount };
  } catch (err: any) {
    console.error('Supabase batch push error:', err);
    return { success: false, pushedCount: 0, error: err.message };
  }
}

/**
 * Pulls changes from Supabase cloud into local IndexedDB (Safe Sync Pull - Requirement 2 & 3)
 * Prevents 'Ghost Reappearance' by checking tombstone registry and sync_queue deleted records.
 * Rule 3: Do NOT overwrite local records in IndexedDB that have 'is_synced === false'
 * Reconciles IndexedDB so only genuinely active records remain.
 */
export async function pullFromSupabaseToIndexedDB(): Promise<{ success: boolean; pulledCount: number; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, pulledCount: 0, error: 'Supabase not configured' };
  }

  try {
    // 1. Gather all deleted IDs from sync_queue AND tombstones to prevent ghost reappearance
    const queueItems = await getAllFromStore<SyncQueueItem>('sync_queue').catch(() => []);
    const queueDeletes = queueItems.filter(q => q.action === 'DELETE' || q.sync_action === 'DELETE');

    const deletedItemIds = getDeletedTombstoneIds('items');
    const deletedPartyIds = getDeletedTombstoneIds('parties');
    const deletedInvoiceIds = getDeletedTombstoneIds('invoices');
    const deletedPurchaseIds = getDeletedTombstoneIds('purchases');
    const deletedExpenseIds = getDeletedTombstoneIds('expenses');
    const deletedPaymentIds = getDeletedTombstoneIds('payments');

    for (const dq of queueDeletes) {
      const targetId = dq.payload?.id || dq.payload?.itemId || dq.payload?.partyId || dq.id.replace(/^sync-del-(inv|itm|pty|exp|pay|items|parties|invoices|purchases|expenses|payments)-/, '');
      if (!targetId) continue;
      const table = mapEntityToTable(dq.entity);
      if (table === 'items') deletedItemIds.add(targetId);
      else if (table === 'parties') deletedPartyIds.add(targetId);
      else if (table === 'invoices') deletedInvoiceIds.add(targetId);
      else if (table === 'purchases') { deletedPurchaseIds.add(targetId); deletedInvoiceIds.add(targetId); }
      else if (table === 'expenses') deletedExpenseIds.add(targetId);
      else if (table === 'payments') deletedPaymentIds.add(targetId);
    }

    // 2. Fetch all 6 tables simultaneously in parallel
    const [remItems, remParties, remInvoices, remPurchases, remExpenses, remPayments] = await Promise.all([
      client.from('items').select('*'),
      client.from('parties').select('*'),
      client.from('invoices').select('*'),
      client.from('purchases').select('*'),
      client.from('expenses').select('*'),
      client.from('payments').select('*'),
    ]);

    // 3. Extract JSON payloads and STRICTLY filter out any recently deleted records
    const rawItems: Item[] = (remItems.data || []).map(r => r.data_json).filter(Boolean);
    const rawParties: Party[] = (remParties.data || []).map(r => r.data_json).filter(Boolean);
    const rawInvoices: Invoice[] = [
      ...(remInvoices.data || []).map(r => r.data_json).filter(Boolean),
      ...(remPurchases.data || []).map(r => r.data_json).filter(Boolean),
    ];
    const rawExpenses: Expense[] = (remExpenses.data || []).map(r => r.data_json).filter(Boolean);
    const rawPayments: PaymentTransaction[] = (remPayments.data || []).map(r => r.data_json).filter(Boolean);

    // Active Cloud Cleanup: If Supabase returned a record that was deleted locally, clean it up from Supabase immediately!
    for (const r of (remItems.data || [])) {
      if (deletedItemIds.has(r.id)) {
        Promise.resolve(client.from('items').delete().eq('id', r.id)).catch(() => {});
      }
    }
    for (const r of (remParties.data || [])) {
      if (deletedPartyIds.has(r.id)) {
        Promise.resolve(client.from('parties').delete().eq('id', r.id)).catch(() => {});
      }
    }
    for (const r of (remInvoices.data || [])) {
      if (deletedInvoiceIds.has(r.id)) {
        Promise.resolve(client.from('invoices').delete().eq('id', r.id)).catch(() => {});
      }
    }
    for (const r of (remPurchases.data || [])) {
      if (deletedPurchaseIds.has(r.id) || deletedInvoiceIds.has(r.id)) {
        Promise.resolve(client.from('purchases').delete().eq('id', r.id)).catch(() => {});
      }
    }
    for (const r of (remExpenses.data || [])) {
      if (deletedExpenseIds.has(r.id)) {
        Promise.resolve(client.from('expenses').delete().eq('id', r.id)).catch(() => {});
      }
    }
    for (const r of (remPayments.data || [])) {
      if (deletedPaymentIds.has(r.id)) {
        Promise.resolve(client.from('payments').delete().eq('id', r.id)).catch(() => {});
      }
    }

    // Filter to only genuinely non-deleted records
    const safeItems = rawItems.filter(i => i && i.id && !deletedItemIds.has(i.id));
    const safeParties = rawParties.filter(p => p && p.id && !deletedPartyIds.has(p.id));
    const safeInvoices = rawInvoices.filter(inv => inv && inv.id && !deletedInvoiceIds.has(inv.id));
    const safeExpenses = rawExpenses.filter(e => e && e.id && !deletedExpenseIds.has(e.id));
    const safePayments = rawPayments.filter(p => p && p.id && !deletedPaymentIds.has(p.id));

    // 4. Safe Reconciliation with IndexedDB:
    // Only genuinely active records stay in IndexedDB.
    // - Remove local records that are in deleted lists or tombstones.
    // - Remove local records that were previously synced (is_synced !== false) but no longer exist on cloud (deleted remotely).
    // - Rule 3: DO NOT overwrite local records that have 'is_synced === false' or 'isSynced === false'.

    if (!remItems.error) {
      const localItems = await getAllFromStore<Item>('items').catch(() => []);
      const unsyncedItemIds = new Set(
        localItems
          .filter(loc => (loc as any).is_synced === false || (loc as any).isSynced === false)
          .map(loc => loc.id)
      );
      const remoteItemIds = new Set(safeItems.map(i => i.id));
      for (const loc of localItems) {
        if (deletedItemIds.has(loc.id)) {
          await deleteFromStore('items', loc.id).catch(() => {});
        } else if (!remoteItemIds.has(loc.id) && !unsyncedItemIds.has(loc.id)) {
          // Record was deleted on cloud/another device! Remove from local DB
          await deleteFromStore('items', loc.id).catch(() => {});
        }
      }
      // Rule 3: Conflict Prevention - Do NOT overwrite local items that have is_synced === false
      const itemsToWrite = safeItems.filter(i => !unsyncedItemIds.has(i.id));
      if (itemsToWrite.length > 0) {
        await bulkPutToStore('items', itemsToWrite.map(i => ({ ...i, is_synced: true, isSynced: true })));
      }
    }

    if (!remParties.error) {
      const localParties = await getAllFromStore<Party>('parties').catch(() => []);
      const unsyncedPartyIds = new Set(
        localParties
          .filter(loc => (loc as any).is_synced === false || (loc as any).isSynced === false)
          .map(loc => loc.id)
      );
      const remotePartyIds = new Set(safeParties.map(p => p.id));
      for (const loc of localParties) {
        if (deletedPartyIds.has(loc.id)) {
          await deleteFromStore('parties', loc.id).catch(() => {});
        } else if (!remotePartyIds.has(loc.id) && !unsyncedPartyIds.has(loc.id)) {
          await deleteFromStore('parties', loc.id).catch(() => {});
        }
      }
      // Rule 3: Conflict Prevention - Do NOT overwrite local parties that have is_synced === false
      const partiesToWrite = safeParties.filter(p => !unsyncedPartyIds.has(p.id));
      if (partiesToWrite.length > 0) {
        await bulkPutToStore('parties', partiesToWrite.map(p => ({ ...p, is_synced: true, isSynced: true })));
      }
    }

    if (!remInvoices.error && !remPurchases.error) {
      const localInvoices = await getAllFromStore<Invoice>('invoices').catch(() => []);
      const unsyncedInvoiceIds = new Set(
        localInvoices
          .filter(loc => (loc as any).is_synced === false || (loc as any).isSynced === false)
          .map(loc => loc.id)
      );
      const remoteInvoiceIds = new Set(safeInvoices.map(inv => inv.id));
      for (const loc of localInvoices) {
        if (deletedInvoiceIds.has(loc.id)) {
          await deleteFromStore('invoices', loc.id).catch(() => {});
        } else if (!remoteInvoiceIds.has(loc.id) && !unsyncedInvoiceIds.has(loc.id)) {
          await deleteFromStore('invoices', loc.id).catch(() => {});
        }
      }
      // Rule 3: Conflict Prevention - Do NOT overwrite local invoices that have is_synced === false
      const invoicesToWrite = safeInvoices.filter(inv => !unsyncedInvoiceIds.has(inv.id));
      if (invoicesToWrite.length > 0) {
        await bulkPutToStore('invoices', invoicesToWrite.map(inv => ({ ...inv, is_synced: true, isSynced: true })));
      }
    }

    if (!remExpenses.error) {
      const localExpenses = await getAllFromStore<Expense>('expenses').catch(() => []);
      const unsyncedExpenseIds = new Set(
        localExpenses
          .filter(loc => (loc as any).is_synced === false || (loc as any).isSynced === false)
          .map(loc => loc.id)
      );
      const remoteExpenseIds = new Set(safeExpenses.map(e => e.id));
      for (const loc of localExpenses) {
        if (deletedExpenseIds.has(loc.id)) {
          await deleteFromStore('expenses', loc.id).catch(() => {});
        } else if (!remoteExpenseIds.has(loc.id) && !unsyncedExpenseIds.has(loc.id)) {
          await deleteFromStore('expenses', loc.id).catch(() => {});
        }
      }
      // Rule 3: Conflict Prevention - Do NOT overwrite local expenses that have is_synced === false
      const expensesToWrite = safeExpenses.filter(e => !unsyncedExpenseIds.has(e.id));
      if (expensesToWrite.length > 0) {
        await bulkPutToStore('expenses', expensesToWrite.map(e => ({ ...e, is_synced: true, isSynced: true })));
      }
    }

    if (!remPayments.error) {
      const localPayments = await getAllFromStore<PaymentTransaction>('payments').catch(() => []);
      const unsyncedPaymentIds = new Set(
        localPayments
          .filter(loc => (loc as any).is_synced === false || (loc as any).isSynced === false)
          .map(loc => loc.id)
      );
      const remotePaymentIds = new Set(safePayments.map(p => p.id));
      for (const loc of localPayments) {
        if (deletedPaymentIds.has(loc.id)) {
          await deleteFromStore('payments', loc.id).catch(() => {});
        } else if (!remotePaymentIds.has(loc.id) && !unsyncedPaymentIds.has(loc.id)) {
          await deleteFromStore('payments', loc.id).catch(() => {});
        }
      }
      // Rule 3: Conflict Prevention - Do NOT overwrite local payments that have is_synced === false
      const paymentsToWrite = safePayments.filter(p => !unsyncedPaymentIds.has(p.id));
      if (paymentsToWrite.length > 0) {
        await bulkPutToStore('payments', paymentsToWrite.map(p => ({ ...p, is_synced: true, isSynced: true })));
      }
    }

    const totalPulled = safeItems.length + safeParties.length + safeInvoices.length + safeExpenses.length + safePayments.length;
    return { success: true, pulledCount: totalPulled };
  } catch (err: any) {
    console.error('Supabase batch pull error:', err);
    return { success: false, pulledCount: 0, error: err.message };
  }
}

/**
 * Executes complete two-way synchronization:
 * CRITICAL: Pushes local pending records and DELETES FIRST to avoid race condition resurrection,
 * then pulls the freshly reconciled cloud records.
 */
export async function performFullTwoWaySync(): Promise<{
  success: boolean;
  pushedCount: number;
  pulledCount: number;
  error?: string;
}> {
  // 1. Push all pending local changes & deletes to cloud first
  const pushRes = await pushPendingToSupabase();
  
  // 2. Pull the latest cloud records into local IndexedDB
  const pullRes = await pullFromSupabaseToIndexedDB();

  return {
    success: (pushRes.success || pullRes.success),
    pushedCount: pushRes.pushedCount,
    pulledCount: pullRes.pulledCount,
    error: pushRes.error || pullRes.error,
  };
}

/**
 * Initializes auto-sync on network reconnect ('window.online') and periodic background trigger
 */
export function initAutoSyncOnNetworkChange(onSyncComplete?: (res: any) => void): () => void {
  const handleOnline = async () => {
    const cfg = getSupabaseConfig();
    if (!cfg.autoSync || !cfg.isConnected) return;

    try {
      const res = await performFullTwoWaySync();
      if (onSyncComplete) onSyncComplete(res);
    } catch (err) {
      console.warn('Auto-sync on reconnect error:', err);
    }
  };

  window.addEventListener('online', handleOnline);

  // Periodic background check every 60 seconds when online
  const interval = setInterval(() => {
    if (navigator.onLine) {
      handleOnline();
    }
  }, 60000);

  return () => {
    window.removeEventListener('online', handleOnline);
    clearInterval(interval);
  };
}

/**
 * Direct mutation sync for immediate push to Supabase (Requirement 1 & 2)
 */
export async function syncMutation(
  table: 'items' | 'parties' | 'invoices' | 'purchases' | 'expenses' | 'payments',
  data: any,
  action: 'UPSERT' | 'DELETE' = 'UPSERT'
): Promise<boolean> {
  const targetId = typeof data === 'object' ? (data?.id || data?.itemId || data?.partyId) : data;

  if (action === 'DELETE') {
    if (!targetId) return false;

    // 1. Record tombstone immediately to prevent any pull from resurrecting this record
    recordDeletedTombstone(table, targetId);

    // Also remove from local IndexedDB if still present
    try {
      await deleteFromStore(table === 'purchases' ? 'invoices' : table, targetId);
    } catch {}

    const client = getSupabaseClient();
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    if (client && isOnline) {
      try {
        const { error } = await client.from(table).delete().eq('id', targetId);
        if (!error) {
          // Successfully deleted from Supabase cloud!
          await deleteFromStore('sync_queue', `sync-del-${table}-${targetId}`).catch(() => {});
          await deleteFromStore('sync_queue', `sync-del-itm-${targetId}`).catch(() => {});
          await deleteFromStore('sync_queue', `sync-del-pty-${targetId}`).catch(() => {});
          await deleteFromStore('sync_queue', `sync-del-inv-${targetId}`).catch(() => {});
          return true;
        } else {
          console.warn(`Direct Supabase delete error on ${table}:`, error);
        }
      } catch (err) {
        console.warn(`Direct delete failed for ${table}:`, err);
      }
    }

    // 2. If offline or delete request failed, register into sync_queue (Requirement 1)
    const entity = table === 'items' ? 'ITEMS'
                 : table === 'parties' ? 'PARTIES'
                 : table === 'purchases' ? 'PURCHASES'
                 : table === 'expenses' ? 'EXPENSES'
                 : table === 'payments' ? 'PAYMENTS'
                 : 'INVOICES';

    try {
      await putToStore('sync_queue', {
        id: `sync-del-${table}-${targetId}`,
        entity,
        action: 'DELETE',
        payload: { id: targetId },
        timestamp: Date.now(),
        attempts: 0,
        is_synced: false,
        sync_action: 'DELETE',
      });
    } catch (qErr) {
      console.warn('Failed to enqueue delete into sync_queue:', qErr);
    }
    return false;
  }

  const client = getSupabaseClient();
  if (!client || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return false;
  }

  try {

    let row: any = null;
    if (table === 'items') {
      row = {
        id: data.id,
        name: data.name,
        barcode: data.barcode || null,
        sale_price: data.retailPrice || 0,
        purchase_price: data.purchasePrice || 0,
        stock: data.currentStock || 0,
        gst_rate: data.taxRate || 0,
        data_json: data,
        updated_at: data.updatedAt || new Date().toISOString(),
      };
    } else if (table === 'parties') {
      row = {
        id: data.id,
        name: data.name,
        type: data.type,
        phone: data.phone || null,
        gstin: data.gstin || null,
        address: data.address || null,
        opening_balance: data.openingBalance || 0,
        current_balance: data.currentBalance || 0,
        data_json: data,
        updated_at: data.updatedAt || new Date().toISOString(),
      };
    } else if (table === 'invoices') {
      row = {
        id: data.id,
        invoice_number: data.invoiceNumber,
        date: data.date,
        party_id: data.partyId || null,
        items_json: data.items || [],
        total_amount: data.grandTotal || 0,
        paid_amount: data.receivedAmount || 0,
        balance_amount: data.balanceAmount || 0,
        payment_mode: data.paymentMode || 'CASH',
        data_json: data,
        updated_at: data.updatedAt || data.createdAt || new Date().toISOString(),
      };
    } else if (table === 'purchases') {
      row = {
        id: data.id,
        bill_number: data.invoiceNumber,
        date: data.date,
        supplier_id: data.partyId || null,
        items_json: data.items || [],
        total_amount: data.grandTotal || 0,
        paid_amount: data.receivedAmount || 0,
        balance_amount: data.balanceAmount || 0,
        data_json: data,
        updated_at: data.updatedAt || data.createdAt || new Date().toISOString(),
      };
    } else if (table === 'expenses') {
      row = {
        id: data.id,
        category: data.category,
        amount: data.amount || 0,
        payment_mode: data.paymentMode || 'CASH',
        date: data.date,
        notes: data.notes || data.title || null,
        is_gst: Boolean(data.isGstApplicable),
        gst_amount: data.taxAmount || 0,
        data_json: data,
        updated_at: data.createdAt || new Date().toISOString(),
      };
    } else if (table === 'payments') {
      row = {
        id: data.id,
        party_id: data.partyId || null,
        type: data.type,
        amount: data.amount || 0,
        payment_mode: data.paymentMode || 'CASH',
        date: data.date,
        notes: data.notes || null,
        data_json: data,
        updated_at: data.createdAt || new Date().toISOString(),
      };
    }

    if (row) {
      const { error } = await client.from(table).upsert(row, { onConflict: 'id' });
      if (!error) {
        // Mark local record as synced in IndexedDB
        await putToStore(table === 'purchases' ? 'invoices' : table, {
          ...data,
          is_synced: true,
          isSynced: true,
        });
        return true;
      }
    }
    return false;
  } catch (err) {
    console.warn(`Direct syncMutation failed for ${table}:`, err);
    return false;
  }
}

/**
 * Subscribes to Supabase Realtime changes across tables to sync mobile <-> PC live
 */
export function subscribeToRealtimeSync(onDataChange: () => void): () => void {
  const client = getSupabaseClient();
  if (!client) return () => {};

  try {
    const channel = client
      .channel('vyapar-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        pullFromSupabaseToIndexedDB()
          .then(() => onDataChange())
          .catch(() => {});
      })
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  } catch (err) {
    console.warn('Realtime subscription error:', err);
    return () => {};
  }
}
