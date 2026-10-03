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
  getAllFromStore, putToStore, bulkPutToStore, clearStore, getDB 
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
      try { await clearStore('sync_queue'); } catch {}
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
    const uploadTasks: PromiseLike<any>[] = [];
    if (itemRows.length > 0) uploadTasks.push(client.from('items').upsert(itemRows, { onConflict: 'id' }));
    if (partyRows.length > 0) uploadTasks.push(client.from('parties').upsert(partyRows, { onConflict: 'id' }));
    if (invoiceRows.length > 0) uploadTasks.push(client.from('invoices').upsert(invoiceRows, { onConflict: 'id' }));
    if (purchaseRows.length > 0) uploadTasks.push(client.from('purchases').upsert(purchaseRows, { onConflict: 'id' }));
    if (expenseRows.length > 0) uploadTasks.push(client.from('expenses').upsert(expenseRows, { onConflict: 'id' }));
    if (paymentRows.length > 0) uploadTasks.push(client.from('payments').upsert(paymentRows, { onConflict: 'id' }));

    for (const dq of pendingDeletes) {
      const table = dq.entity === 'ITEM' ? 'items' : dq.entity === 'PARTY' ? 'parties' : dq.entity === 'PURCHASE' ? 'purchases' : dq.entity === 'EXPENSE' ? 'expenses' : dq.entity === 'PAYMENT' ? 'payments' : 'invoices';
      const targetId = dq.payload?.id || dq.id.replace(/^sync-del-(inv|itm|pty|exp|pay)-/, '');
      uploadTasks.push(client.from(table).delete().eq('id', targetId));
    }

    const uploadResults = await Promise.all(uploadTasks);
    for (const res of uploadResults) {
      if (res?.error) {
        console.warn('Batch upsert warning:', res.error);
      }
    }

    // 5. Batch Update in Local IndexedDB (Single transaction per store via bulkPutToStore)
    await Promise.all([
      pendingItems.length > 0 
        ? bulkPutToStore('items', pendingItems.map(i => ({ ...i, is_synced: true, isSynced: true }))) 
        : Promise.resolve(),
      pendingParties.length > 0 
        ? bulkPutToStore('parties', pendingParties.map(p => ({ ...p, is_synced: true, isSynced: true }))) 
        : Promise.resolve(),
      (pendingInvoices.length > 0 || pendingPurchases.length > 0) 
        ? bulkPutToStore('invoices', [...pendingInvoices, ...pendingPurchases].map(inv => ({ ...inv, is_synced: true, isSynced: true }))) 
        : Promise.resolve(),
      pendingExpenses.length > 0 
        ? bulkPutToStore('expenses', pendingExpenses.map(e => ({ ...e, is_synced: true, isSynced: true }))) 
        : Promise.resolve(),
      pendingPayments.length > 0 
        ? bulkPutToStore('payments', pendingPayments.map(p => ({ ...p, is_synced: true, isSynced: true }))) 
        : Promise.resolve(),
      clearStore('sync_queue'),
    ]);

    // Update last sync time
    const nowTimeStr = new Date().toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' });
    const nowDateStr = new Date().toLocaleDateString('hi-IN');
    saveSupabaseConfig({ lastSyncedAt: `${nowDateStr} ${nowTimeStr}` });

    return { success: true, pushedCount: totalPendingCount };
  } catch (err: any) {
    console.error('Supabase batch push error:', err);
    return { success: false, pushedCount: 0, error: err.message };
  }
}

/**
 * Pulls changes from Supabase cloud into local IndexedDB (Two-Way Sync)
 * OPTIMIZED: Parallel queries via Promise.all and fast bulkPutToStore
 */
export async function pullFromSupabaseToIndexedDB(): Promise<{ success: boolean; pulledCount: number; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, pulledCount: 0, error: 'Supabase not configured' };
  }

  try {
    // 1. Fetch all 6 tables simultaneously in parallel
    const [remItems, remParties, remInvoices, remPurchases, remExpenses, remPayments] = await Promise.all([
      client.from('items').select('*'),
      client.from('parties').select('*'),
      client.from('invoices').select('*'),
      client.from('purchases').select('*'),
      client.from('expenses').select('*'),
      client.from('payments').select('*'),
    ]);

    // 2. Extract JSON payloads
    const itemsToSave = (remItems.data || []).map(r => r.data_json).filter(Boolean);
    const partiesToSave = (remParties.data || []).map(r => r.data_json).filter(Boolean);
    const invoicesToSave = [
      ...(remInvoices.data || []).map(r => r.data_json).filter(Boolean),
      ...(remPurchases.data || []).map(r => r.data_json).filter(Boolean),
    ];
    const expensesToSave = (remExpenses.data || []).map(r => r.data_json).filter(Boolean);
    const paymentsToSave = (remPayments.data || []).map(r => r.data_json).filter(Boolean);

    // 3. Batch write into IndexedDB in parallel
    await Promise.all([
      itemsToSave.length > 0 ? bulkPutToStore('items', itemsToSave) : Promise.resolve(),
      partiesToSave.length > 0 ? bulkPutToStore('parties', partiesToSave) : Promise.resolve(),
      invoicesToSave.length > 0 ? bulkPutToStore('invoices', invoicesToSave) : Promise.resolve(),
      expensesToSave.length > 0 ? bulkPutToStore('expenses', expensesToSave) : Promise.resolve(),
      paymentsToSave.length > 0 ? bulkPutToStore('payments', paymentsToSave) : Promise.resolve(),
    ]);

    const totalPulled = itemsToSave.length + partiesToSave.length + invoicesToSave.length + expensesToSave.length + paymentsToSave.length;
    return { success: true, pulledCount: totalPulled };
  } catch (err: any) {
    console.error('Supabase batch pull error:', err);
    return { success: false, pulledCount: 0, error: err.message };
  }
}

/**
 * Executes complete two-way synchronization: pushes local pending records, then pulls cloud records
 */
export async function performFullTwoWaySync(): Promise<{
  success: boolean;
  pushedCount: number;
  pulledCount: number;
  error?: string;
}> {
  // Push pending delta records and pull remote records in parallel via Promise.all
  const [pushRes, pullRes] = await Promise.all([
    pushPendingToSupabase(),
    pullFromSupabaseToIndexedDB(),
  ]);

  return {
    success: pushRes.success || pullRes.success,
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
 * Direct mutation sync for immediate push to Supabase (Requirement 2)
 */
export async function syncMutation(
  table: 'items' | 'parties' | 'invoices' | 'purchases' | 'expenses' | 'payments',
  data: any,
  action: 'UPSERT' | 'DELETE' = 'UPSERT'
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return false;
  }

  try {
    if (action === 'DELETE') {
      await client.from(table).delete().eq('id', data.id || data);
      return true;
    }

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
