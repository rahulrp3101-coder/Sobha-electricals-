/**
 * Offline-First IndexedDB Storage Engine for Vyapar Pro
 * Provides seamless 0ms local-first persistence, zero-latency billing,
 * and a robust offline synchronization queue for Supabase cloud sync.
 */

import { CompanyProfile, Item, Party, Invoice, PaymentTransaction, Expense, SyncQueueItem } from '../types';
import { DEFAULT_COMPANY, INITIAL_ITEMS, INITIAL_PARTIES, INITIAL_INVOICES, INITIAL_PAYMENTS, INITIAL_EXPENSES } from './defaultData';

const DB_NAME = 'VyaparPro_OfflineDB_v2';
const DB_VERSION = 3;

let dbInstance: IDBDatabase | null = null;

export async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Items Store
      if (!db.objectStoreNames.contains('items')) {
        const itemStore = db.createObjectStore('items', { keyPath: 'id' });
        itemStore.createIndex('barcode', 'barcode', { unique: false });
        itemStore.createIndex('category', 'category', { unique: false });
        itemStore.createIndex('is_synced', 'is_synced', { unique: false });
      }

      // 2. Parties Store (Customers & Suppliers)
      if (!db.objectStoreNames.contains('parties')) {
        const partyStore = db.createObjectStore('parties', { keyPath: 'id' });
        partyStore.createIndex('phone', 'phone', { unique: false });
        partyStore.createIndex('type', 'type', { unique: false });
        partyStore.createIndex('is_synced', 'is_synced', { unique: false });
      }

      // 3. Invoices Store (Sales & Purchases)
      if (!db.objectStoreNames.contains('invoices')) {
        const invStore = db.createObjectStore('invoices', { keyPath: 'id' });
        invStore.createIndex('invoiceNumber', 'invoiceNumber', { unique: false });
        invStore.createIndex('partyId', 'partyId', { unique: false });
        invStore.createIndex('date', 'date', { unique: false });
        invStore.createIndex('is_synced', 'is_synced', { unique: false });
      }

      // 4. Purchases Store (Vendor Purchases)
      if (!db.objectStoreNames.contains('purchases')) {
        const purStore = db.createObjectStore('purchases', { keyPath: 'id' });
        purStore.createIndex('bill_number', 'bill_number', { unique: false });
        purStore.createIndex('supplier_id', 'supplier_id', { unique: false });
        purStore.createIndex('date', 'date', { unique: false });
        purStore.createIndex('is_synced', 'is_synced', { unique: false });
      }

      // 5. Payments Store
      if (!db.objectStoreNames.contains('payments')) {
        const payStore = db.createObjectStore('payments', { keyPath: 'id' });
        payStore.createIndex('partyId', 'partyId', { unique: false });
        payStore.createIndex('type', 'type', { unique: false });
        payStore.createIndex('is_synced', 'is_synced', { unique: false });
      }

      // 6. Expenses Store
      if (!db.objectStoreNames.contains('expenses')) {
        const expStore = db.createObjectStore('expenses', { keyPath: 'id' });
        expStore.createIndex('category', 'category', { unique: false });
        expStore.createIndex('date', 'date', { unique: false });
        expStore.createIndex('is_synced', 'is_synced', { unique: false });
      }

      // 7. Company & Settings Profile Stores (Requirement 2: 'settings' or 'business_profile')
      if (!db.objectStoreNames.contains('company')) {
        db.createObjectStore('company', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('business_profile')) {
        db.createObjectStore('business_profile', { keyPath: 'id' });
      }

      // 8. Offline Sync Queue Store
      if (!db.objectStoreNames.contains('sync_queue')) {
        const queueStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
        queueStore.createIndex('timestamp', 'timestamp', { unique: false });
        queueStore.createIndex('entity', 'entity', { unique: false });
        queueStore.createIndex('is_synced', 'is_synced', { unique: false });
      }
    };

    request.onsuccess = async (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      await seedInitialDataIfEmpty(dbInstance);
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
    };
  });
}

/**
 * Seeds initial demo items on very first launch.
 * Requirement 1: Disable Re-seeding. Once user saves custom settings or initializes the database,
 * DEFAULT_COMPANY is never re-seeded and never overwrites user's real business data.
 */
async function seedInitialDataIfEmpty(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    // 1. If user already saved their shop profile or seeding has occurred, strictly skip
    if (typeof localStorage !== 'undefined') {
      const isProfileSaved = localStorage.getItem('vyapar_company_profile_saved') === 'true';
      const isSeedDone = localStorage.getItem('vyapar_initial_seed_done') === 'true';
      if (isProfileSaved || isSeedDone) {
        resolve();
        return;
      }
    }

    const tx = db.transaction(['items', 'parties', 'invoices', 'payments', 'expenses', 'company'], 'readonly');
    const compStore = tx.objectStore('company');
    const compReq = compStore.get('primary');

    compReq.onsuccess = () => {
      // If company record already exists, NEVER seed default company!
      const hasExistingCompany = Boolean(compReq.result && compReq.result.name);

      const itemStore = tx.objectStore('items');
      const countReq = itemStore.count();

      countReq.onsuccess = () => {
        if (countReq.result === 0 && !hasExistingCompany) {
          // Strictly only seed once on fresh install when neither company nor items exist
          const writeTx = db.transaction(['items', 'parties', 'invoices', 'payments', 'expenses', 'company'], 'readwrite');
          
          INITIAL_ITEMS.forEach(i => writeTx.objectStore('items').put({ ...i, is_synced: true, isSynced: true }));
          INITIAL_PARTIES.forEach(p => writeTx.objectStore('parties').put({ ...p, is_synced: true, isSynced: true }));
          INITIAL_INVOICES.forEach(inv => writeTx.objectStore('invoices').put({ ...inv, is_synced: true, isSynced: true }));
          INITIAL_PAYMENTS.forEach(pay => writeTx.objectStore('payments').put({ ...pay, is_synced: true, isSynced: true }));
          INITIAL_EXPENSES.forEach(e => writeTx.objectStore('expenses').put({ ...e, is_synced: true, isSynced: true }));
          
          // Seed default company only on virgin install
          writeTx.objectStore('company').put({ id: 'primary', ...DEFAULT_COMPANY, is_synced: true, isSynced: true });
          
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('vyapar_initial_seed_done', 'true');
          }

          writeTx.oncomplete = () => resolve();
          writeTx.onerror = () => resolve();
        } else {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('vyapar_initial_seed_done', 'true');
          }
          resolve();
        }
      };

      countReq.onerror = () => resolve();
    };

    compReq.onerror = () => resolve();
  });
}

/**
 * Permanently saves the Shop / Business profile to IndexedDB ('settings', 'company', 'business_profile')
 * and queues it for Supabase cloud synchronization. (Requirement 2)
 */
export async function saveCompanyProfile(profile: CompanyProfile): Promise<CompanyProfile> {
  const db = await getDB();
  const cleanProfile: CompanyProfile = {
    ...profile,
    updatedAt: new Date().toISOString(),
  };

  // 1. Immediately cache in localStorage for instant 0ms reload
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('vyapar_company_profile', JSON.stringify(cleanProfile));
      localStorage.setItem('vyapar_company_profile_saved', 'true');
      localStorage.setItem('vyapar_initial_seed_done', 'true');
      if (cleanProfile.geminiApiKey) {
        localStorage.setItem('gemini_user_api_key', cleanProfile.geminiApiKey);
      }
    } catch (e) {
      console.warn('localStorage cache failed:', e);
    }
  }

  // 2. Persist in IndexedDB stores ('company', 'settings', 'business_profile', 'sync_queue')
  return new Promise((resolve, reject) => {
    const storeNames = ['company', 'sync_queue'];
    if (db.objectStoreNames.contains('settings')) storeNames.push('settings');
    if (db.objectStoreNames.contains('business_profile')) storeNames.push('business_profile');

    const tx = db.transaction(storeNames, 'readwrite');
    
    // Store in 'company'
    const compStore = tx.objectStore('company');
    compStore.put({ id: 'primary', ...cleanProfile, is_synced: false, isSynced: false, sync_action: 'UPDATE' });

    // Store in 'settings' (Requirement 2)
    if (db.objectStoreNames.contains('settings')) {
      const setStore = tx.objectStore('settings');
      setStore.put({ id: 'primary', ...cleanProfile, is_synced: false, isSynced: false, sync_action: 'UPDATE' });
    }

    // Store in 'business_profile' (Requirement 2)
    if (db.objectStoreNames.contains('business_profile')) {
      const bpStore = tx.objectStore('business_profile');
      bpStore.put({ id: 'primary', ...cleanProfile, is_synced: false, isSynced: false, sync_action: 'UPDATE' });
    }

    // Register in sync_queue for cloud persistence
    const queueStore = tx.objectStore('sync_queue');
    const queueItem: SyncQueueItem = {
      id: 'sync-settings-' + Date.now(),
      entity: 'SETTINGS',
      action: 'UPDATE',
      payload: cleanProfile,
      timestamp: Date.now(),
      attempts: 0,
      is_synced: false,
      sync_action: 'UPDATE',
    };
    queueStore.put(queueItem);

    tx.oncomplete = () => {
      // 3. Trigger immediate cloud push to Supabase if online
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        import('../services/supabaseService')
          .then(({ syncShopSettingsToSupabase }) => syncShopSettingsToSupabase(cleanProfile))
          .catch(() => {});
      }
      resolve(cleanProfile);
    };

    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Loads the saved Shop / Business profile from IndexedDB or localStorage cache. (Requirement 3)
 * Returns the user's authentic saved data first, avoiding dummy fallback data.
 */
export async function getSavedCompanyProfile(): Promise<CompanyProfile | null> {
  // 1. Check localStorage first for instant synchronous data
  let localCached: CompanyProfile | null = null;
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('vyapar_company_profile');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.name) {
          localCached = parsed;
        }
      }
    } catch {}
  }

  try {
    const db = await getDB();
    const storesToCheck = ['settings', 'company', 'business_profile'];
    for (const storeName of storesToCheck) {
      if (db.objectStoreNames.contains(storeName)) {
        const result = await new Promise<any>((resolve) => {
          const tx = db.transaction(storeName, 'readonly');
          const store = tx.objectStore(storeName);
          const req = store.get('primary');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });

        if (result && result.name) {
          const { id, is_synced, isSynced, sync_action, ...profileData } = result;
          if (typeof localStorage !== 'undefined') {
            try {
              localStorage.setItem('vyapar_company_profile', JSON.stringify(profileData));
              localStorage.setItem('vyapar_company_profile_saved', 'true');
            } catch {}
          }
          return profileData as CompanyProfile;
        }
      }
    }
  } catch (err) {
    console.warn('Error reading company profile from IndexedDB:', err);
  }

  return localCached;
}

/* ----------------- Generic Helper Operations ----------------- */

export async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function getByIdFromStore<T>(storeName: string, id: string): Promise<T | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function putToStore<T>(storeName: string, item: T): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Ultra-fast batch upsert in a single IndexedDB transaction
 */
export async function bulkPutToStore<T>(storeName: string, items: T[]): Promise<void> {
  if (!items || items.length === 0) return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const item of items) {
      store.put(item);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteFromStore(storeName: string, id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearStore(storeName: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* ----------------- Business Logic: Invoicing & Inventory Transactions ----------------- */

/**
 * Creates an invoice, decrements stock in real-time, updates customer balance,
 * marks record with is_synced: false, and registers into offline sync_queue.
 */
export async function createInvoiceTransaction(invoice: Invoice, isOnline: boolean = true): Promise<Invoice> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['invoices', 'items', 'parties', 'sync_queue'], 'readwrite');
    const invStore = tx.objectStore('invoices');
    const itemStore = tx.objectStore('items');
    const partyStore = tx.objectStore('parties');
    const queueStore = tx.objectStore('sync_queue');

    // 1. Mark with offline-first sync flags
    (invoice as any).is_synced = false;
    (invoice as any).isSynced = false;
    (invoice as any).sync_action = 'INSERT';
    invoice.updatedAt = new Date().toISOString();
    invStore.put(invoice);

    // 2. Adjust inventory stock
    const isSales = invoice.documentType === 'SALES_INVOICE' || invoice.documentType === 'DELIVERY_CHALLAN';
    const isPurchase = invoice.documentType === 'PURCHASE_BILL';
    const isCreditNote = invoice.documentType === 'CREDIT_NOTE'; // Return sales -> stock increment
    const isDebitNote = invoice.documentType === 'DEBIT_NOTE'; // Return purchase -> stock decrement
    const isEstimate = invoice.documentType === 'QUOTATION' || invoice.documentType === 'ESTIMATE';
    const shouldDeductStock = isSales || isDebitNote || (isEstimate && Boolean(invoice.deductStock));

    // Rule 2: Consolidate line items by itemId to prevent duplicate item race conditions
    const itemQuantityMap = new Map<string, number>();
    for (const line of invoice.items) {
      if (!line.itemId) continue;
      const currentTotal = itemQuantityMap.get(line.itemId) || 0;
      itemQuantityMap.set(line.itemId, currentTotal + (Number(line.quantity) || 0));
    }

    for (const [itemId, totalQty] of itemQuantityMap.entries()) {
      const itemReq = itemStore.get(itemId);
      itemReq.onsuccess = () => {
        const item = itemReq.result as Item;
        if (item) {
          if (shouldDeductStock) {
            // Rule 1: Allow negative stock by direct mathematical subtraction (no Math.max)
            item.currentStock -= totalQty;
          } else if (isPurchase || isCreditNote) {
            item.currentStock += totalQty;
          }
          item.updatedAt = new Date().toISOString();
          (item as any).is_synced = false;
          (item as any).isSynced = false;
          (item as any).sync_action = 'UPDATE';
          itemStore.put(item);
        }
      };
    }

    // 3. Update party khata balance
    if (invoice.partyId) {
      const partyReq = partyStore.get(invoice.partyId);
      partyReq.onsuccess = () => {
        const party = partyReq.result as Party;
        if (party) {
          if (isSales && invoice.balanceAmount > 0) {
            party.currentBalance += invoice.balanceAmount;
          } else if (isPurchase && invoice.balanceAmount > 0) {
            party.currentBalance -= invoice.balanceAmount;
          } else if (isCreditNote) {
            // Rule 3: Allow negative balance (advance payment/credit protection, no Math.max)
            party.currentBalance -= invoice.grandTotal;
          } else if (isDebitNote) {
            party.currentBalance += invoice.grandTotal;
          }
          party.updatedAt = new Date().toISOString();
          (party as any).is_synced = false;
          (party as any).isSynced = false;
          (party as any).sync_action = 'UPDATE';
          partyStore.put(party);
        }
      };
    }

    // 4. Register in sync_queue
    const queueItem: SyncQueueItem = {
      id: 'sync-inv-' + invoice.id,
      entity: invoice.documentType === 'PURCHASE_BILL' ? 'PURCHASE' : 'INVOICE',
      action: 'INSERT',
      payload: invoice,
      timestamp: Date.now(),
      attempts: 0,
      is_synced: false,
      sync_action: 'INSERT',
    };
    queueStore.put(queueItem);

    tx.oncomplete = () => {
      // Trigger background sync to Supabase if online
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        import('../services/supabaseService')
          .then(({ pushPendingToSupabase }) => pushPendingToSupabase())
          .catch(() => {});
      }
      resolve(invoice);
    };

    tx.onerror = () => {
      reject(tx.error);
    };
  });
}

/**
 * Updates an existing invoice / purchase bill with inventory stock and party khata balance adjustments.
 * Accurately diffs old vs new line items and balances, applies changes in IndexedDB, and queues/syncs to Supabase.
 */
export async function updateInvoiceTransaction(
  updatedInvoice: Invoice,
  oldInvoice: Invoice
): Promise<Invoice> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['invoices', 'items', 'parties', 'sync_queue'], 'readwrite');
    const invStore = tx.objectStore('invoices');
    const itemStore = tx.objectStore('items');
    const partyStore = tx.objectStore('parties');
    const queueStore = tx.objectStore('sync_queue');

    const isOldSales = oldInvoice.documentType === 'SALES_INVOICE' || oldInvoice.documentType === 'DELIVERY_CHALLAN' || !oldInvoice.documentType;
    const isNewSales = updatedInvoice.documentType === 'SALES_INVOICE' || updatedInvoice.documentType === 'DELIVERY_CHALLAN' || !updatedInvoice.documentType;
    const isOldPurchase = oldInvoice.documentType === 'PURCHASE_BILL';
    const isNewPurchase = updatedInvoice.documentType === 'PURCHASE_BILL';
    const isOldCreditNote = oldInvoice.documentType === 'CREDIT_NOTE';
    const isNewCreditNote = updatedInvoice.documentType === 'CREDIT_NOTE';
    const isOldDebitNote = oldInvoice.documentType === 'DEBIT_NOTE';
    const isNewDebitNote = updatedInvoice.documentType === 'DEBIT_NOTE';
    const isOldEstimateDeduct = (oldInvoice.documentType === 'ESTIMATE' || oldInvoice.documentType === 'QUOTATION') && Boolean(oldInvoice.deductStock);
    const isNewEstimateDeduct = (updatedInvoice.documentType === 'ESTIMATE' || updatedInvoice.documentType === 'QUOTATION') && Boolean(updatedInvoice.deductStock);

    // 1. Calculate stock deltas for items (Rule 4: Handle PURCHASE_BILL and sales bill editing):
    // For purchase bill: old added stock (+), so rollback is (-oldQty); new adds stock (+newQty).
    // For sales invoice: old deducted stock (-), so rollback is (+oldQty); new deducts stock (-newQty).
    const stockDeltas = new Map<string, number>();

    // Rollback old invoice items
    if (oldInvoice.items && Array.isArray(oldInvoice.items)) {
      for (const line of oldInvoice.items) {
        if (!line.itemId) continue;
        const qty = Number(line.quantity) || 0;
        if (isOldPurchase || isOldCreditNote) {
          stockDeltas.set(line.itemId, (stockDeltas.get(line.itemId) || 0) - qty);
        } else if (isOldSales || isOldDebitNote || isOldEstimateDeduct) {
          stockDeltas.set(line.itemId, (stockDeltas.get(line.itemId) || 0) + qty);
        }
      }
    }

    // Apply new invoice items
    if (updatedInvoice.items && Array.isArray(updatedInvoice.items)) {
      for (const line of updatedInvoice.items) {
        if (!line.itemId) continue;
        const qty = Number(line.quantity) || 0;
        if (isNewPurchase || isNewCreditNote) {
          stockDeltas.set(line.itemId, (stockDeltas.get(line.itemId) || 0) + qty);
        } else if (isNewSales || isNewDebitNote || isNewEstimateDeduct) {
          stockDeltas.set(line.itemId, (stockDeltas.get(line.itemId) || 0) - qty);
        }
      }
    }

    // Apply stock deltas to itemStore (Rule 1: Direct addition/subtraction allowing negative stock)
    for (const [itemId, delta] of stockDeltas.entries()) {
      if (delta === 0) continue;
      const itemReq = itemStore.get(itemId);
      itemReq.onsuccess = () => {
        const item = itemReq.result as Item;
        if (item) {
          // Rule 1: Allow negative stock by direct mathematical addition/subtraction (no Math.max)
          item.currentStock += delta;
          item.updatedAt = new Date().toISOString();
          (item as any).is_synced = false;
          (item as any).isSynced = false;
          (item as any).sync_action = 'UPDATE';
          itemStore.put(item);

          queueStore.put({
            id: 'sync-item-' + item.id + '-' + Date.now(),
            entity: 'ITEM',
            action: 'UPDATE',
            payload: item,
            timestamp: Date.now(),
            attempts: 0,
            is_synced: false,
            sync_action: 'UPDATE',
          });
        }
      };
    }

    // 2. Adjust party khata balance
    const oldPartyId = oldInvoice.partyId;
    const newPartyId = updatedInvoice.partyId;
    const oldBal = oldInvoice.balanceAmount || 0;
    const newBal = updatedInvoice.balanceAmount || 0;

    if (isOldPurchase || isNewPurchase) {
      // In purchase bills: balanceAmount represents debt payable to supplier (negative in currentBalance)
      if (oldPartyId === newPartyId && oldPartyId) {
        const deltaBal = newBal - oldBal;
        if (deltaBal !== 0) {
          const pReq = partyStore.get(oldPartyId);
          pReq.onsuccess = () => {
            const party = pReq.result as Party;
            if (party) {
              party.currentBalance -= deltaBal; // Higher debt -> more negative
              party.updatedAt = new Date().toISOString();
              (party as any).is_synced = false;
              (party as any).isSynced = false;
              (party as any).sync_action = 'UPDATE';
              partyStore.put(party);

              queueStore.put({
                id: 'sync-party-' + party.id + '-' + Date.now(),
                entity: 'PARTY',
                action: 'UPDATE',
                payload: party,
                timestamp: Date.now(),
                attempts: 0,
                is_synced: false,
                sync_action: 'UPDATE',
              });
            }
          };
        }
      } else {
        // Party changed: rollback old supplier, apply new supplier
        if (oldPartyId && oldBal > 0) {
          const oldPReq = partyStore.get(oldPartyId);
          oldPReq.onsuccess = () => {
            const party = oldPReq.result as Party;
            if (party) {
              party.currentBalance += oldBal;
              party.updatedAt = new Date().toISOString();
              (party as any).is_synced = false;
              (party as any).isSynced = false;
              (party as any).sync_action = 'UPDATE';
              partyStore.put(party);

              queueStore.put({
                id: 'sync-party-' + party.id + '-' + Date.now(),
                entity: 'PARTY',
                action: 'UPDATE',
                payload: party,
                timestamp: Date.now(),
                attempts: 0,
                is_synced: false,
                sync_action: 'UPDATE',
              });
            }
          };
        }
        if (newPartyId && newBal > 0) {
          const newPReq = partyStore.get(newPartyId);
          newPReq.onsuccess = () => {
            const party = newPReq.result as Party;
            if (party) {
              party.currentBalance -= newBal;
              party.updatedAt = new Date().toISOString();
              (party as any).is_synced = false;
              (party as any).isSynced = false;
              (party as any).sync_action = 'UPDATE';
              partyStore.put(party);

              queueStore.put({
                id: 'sync-party-' + party.id + '-' + Date.now(),
                entity: 'PARTY',
                action: 'UPDATE',
                payload: party,
                timestamp: Date.now(),
                attempts: 0,
                is_synced: false,
                sync_action: 'UPDATE',
              });
            }
          };
        }
      }
    } else if (isOldSales || isNewSales) {
      if (oldPartyId === newPartyId && oldPartyId) {
        const deltaBal = newBal - oldBal;
        if (deltaBal !== 0) {
          const pReq = partyStore.get(oldPartyId);
          pReq.onsuccess = () => {
            const party = pReq.result as Party;
            if (party) {
              party.currentBalance += deltaBal;
              party.updatedAt = new Date().toISOString();
              (party as any).is_synced = false;
              (party as any).isSynced = false;
              (party as any).sync_action = 'UPDATE';
              partyStore.put(party);

              queueStore.put({
                id: 'sync-party-' + party.id + '-' + Date.now(),
                entity: 'PARTY',
                action: 'UPDATE',
                payload: party,
                timestamp: Date.now(),
                attempts: 0,
                is_synced: false,
                sync_action: 'UPDATE',
              });
            }
          };
        }
      } else {
        // Rule 4: Party changed on sales invoice:
        // Subtract old balance from old party (party.currentBalance -= oldBal)
        // Add new balance to new party (party.currentBalance += newBal)
        if (oldPartyId && oldBal > 0) {
          const oldPReq = partyStore.get(oldPartyId);
          oldPReq.onsuccess = () => {
            const party = oldPReq.result as Party;
            if (party) {
              party.currentBalance -= oldBal; // Rule 3: No Math.max(0, ...) so advance balance is preserved!
              party.updatedAt = new Date().toISOString();
              (party as any).is_synced = false;
              (party as any).isSynced = false;
              (party as any).sync_action = 'UPDATE';
              partyStore.put(party);

              queueStore.put({
                id: 'sync-party-' + party.id + '-' + Date.now(),
                entity: 'PARTY',
                action: 'UPDATE',
                payload: party,
                timestamp: Date.now(),
                attempts: 0,
                is_synced: false,
                sync_action: 'UPDATE',
              });
            }
          };
        }
        if (newPartyId && newBal > 0) {
          const newPReq = partyStore.get(newPartyId);
          newPReq.onsuccess = () => {
            const party = newPReq.result as Party;
            if (party) {
              party.currentBalance += newBal;
              party.updatedAt = new Date().toISOString();
              (party as any).is_synced = false;
              (party as any).isSynced = false;
              (party as any).sync_action = 'UPDATE';
              partyStore.put(party);

              queueStore.put({
                id: 'sync-party-' + party.id + '-' + Date.now(),
                entity: 'PARTY',
                action: 'UPDATE',
                payload: party,
                timestamp: Date.now(),
                attempts: 0,
                is_synced: false,
                sync_action: 'UPDATE',
              });
            }
          };
        }
      }
    }

    // 3. Save updated invoice record
    (updatedInvoice as any).is_synced = false;
    (updatedInvoice as any).isSynced = false;
    (updatedInvoice as any).sync_action = 'UPDATE';
    updatedInvoice.updatedAt = new Date().toISOString();
    invStore.put(updatedInvoice);

    // 4. Register in sync_queue
    const queueItem: SyncQueueItem = {
      id: 'sync-inv-' + updatedInvoice.id + '-' + Date.now(),
      entity: updatedInvoice.documentType === 'PURCHASE_BILL' ? 'PURCHASE' : 'INVOICE',
      action: 'UPDATE',
      payload: updatedInvoice,
      timestamp: Date.now(),
      attempts: 0,
      is_synced: false,
      sync_action: 'UPDATE',
    };
    queueStore.put(queueItem);

    tx.oncomplete = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        import('../services/supabaseService')
          .then(({ syncMutation, pushPendingToSupabase }) => {
            syncMutation(
              updatedInvoice.documentType === 'PURCHASE_BILL' ? 'purchases' : 'invoices',
              updatedInvoice,
              'UPSERT'
            ).catch(() => {});
            pushPendingToSupabase().catch(() => {});
          })
          .catch(() => {});
      }
      resolve(updatedInvoice);
    };

    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Record a khata payment (Payment In from customer or Payment Out to supplier)
 */
export async function recordPaymentTransaction(payment: PaymentTransaction): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['payments', 'parties', 'sync_queue'], 'readwrite');
    const payStore = tx.objectStore('payments');
    const partyStore = tx.objectStore('parties');
    const queueStore = tx.objectStore('sync_queue');

    // Mark sync flags
    (payment as any).is_synced = false;
    (payment as any).isSynced = false;
    (payment as any).sync_action = 'INSERT';
    payStore.put(payment);

    // Update Party Balance
    const partyReq = partyStore.get(payment.partyId);
    partyReq.onsuccess = () => {
      const party = partyReq.result as Party;
      if (party) {
        if (payment.type === 'PAYMENT_IN') {
          party.currentBalance -= payment.amount;
        } else {
          party.currentBalance += payment.amount;
        }
        party.updatedAt = new Date().toISOString();
        (party as any).is_synced = false;
        (party as any).isSynced = false;
        (party as any).sync_action = 'UPDATE';
        partyStore.put(party);
      }
    };

    // Add to sync queue
    const queueItem: SyncQueueItem = {
      id: 'sync-pay-' + payment.id,
      entity: 'PAYMENT',
      action: 'INSERT',
      payload: payment,
      timestamp: Date.now(),
      attempts: 0,
      is_synced: false,
      sync_action: 'INSERT',
    };
    queueStore.put(queueItem);

    tx.oncomplete = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        import('../services/supabaseService')
          .then(({ pushPendingToSupabase }) => pushPendingToSupabase())
          .catch(() => {});
      }
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Saves or updates an item with offline sync flags
 */
export async function saveItemTransaction(item: Item): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['items', 'sync_queue'], 'readwrite');
    const itemStore = tx.objectStore('items');
    const queueStore = tx.objectStore('sync_queue');

    (item as any).is_synced = false;
    (item as any).isSynced = false;
    (item as any).sync_action = 'UPDATE';
    item.updatedAt = new Date().toISOString();
    itemStore.put(item);

    const queueItem: SyncQueueItem = {
      id: 'sync-item-' + item.id,
      entity: 'ITEM',
      action: 'UPDATE',
      payload: item,
      timestamp: Date.now(),
      attempts: 0,
      is_synced: false,
      sync_action: 'UPDATE',
    };
    queueStore.put(queueItem);

    tx.oncomplete = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        import('../services/supabaseService')
          .then(({ pushPendingToSupabase }) => pushPendingToSupabase())
          .catch(() => {});
      }
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Saves or updates a party with offline sync flags
 */
export async function savePartyTransaction(party: Party): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['parties', 'sync_queue'], 'readwrite');
    const partyStore = tx.objectStore('parties');
    const queueStore = tx.objectStore('sync_queue');

    (party as any).is_synced = false;
    (party as any).isSynced = false;
    (party as any).sync_action = 'UPDATE';
    party.updatedAt = new Date().toISOString();
    partyStore.put(party);

    const queueItem: SyncQueueItem = {
      id: 'sync-party-' + party.id,
      entity: 'PARTY',
      action: 'UPDATE',
      payload: party,
      timestamp: Date.now(),
      attempts: 0,
      is_synced: false,
      sync_action: 'UPDATE',
    };
    queueStore.put(queueItem);

    tx.oncomplete = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        import('../services/supabaseService')
          .then(({ pushPendingToSupabase }) => pushPendingToSupabase())
          .catch(() => {});
      }
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Saves or updates an expense with offline sync flags
 */
export async function saveExpenseTransaction(expense: Expense): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['expenses', 'sync_queue'], 'readwrite');
    const expStore = tx.objectStore('expenses');
    const queueStore = tx.objectStore('sync_queue');

    (expense as any).is_synced = false;
    (expense as any).isSynced = false;
    (expense as any).sync_action = 'INSERT';
    expense.createdAt = expense.createdAt || new Date().toISOString();
    expStore.put(expense);

    const queueItem: SyncQueueItem = {
      id: 'sync-exp-' + expense.id,
      entity: 'EXPENSE',
      action: 'INSERT',
      payload: expense,
      timestamp: Date.now(),
      attempts: 0,
      is_synced: false,
      sync_action: 'INSERT',
    };
    queueStore.put(queueItem);

    tx.oncomplete = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        import('../services/supabaseService')
          .then(({ pushPendingToSupabase }) => pushPendingToSupabase())
          .catch(() => {});
      }
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Deletes an invoice with full rollback:
 * - Restores product quantities back to stock in inventory.
 * - Reverses customer/supplier balance effect.
 * - Deletes the invoice record from local IndexedDB and syncs deletion to Supabase.
 */
export async function deleteInvoiceTransaction(invoiceId: string): Promise<{ success: boolean; invoiceNumber?: string }> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['invoices', 'items', 'parties', 'sync_queue'], 'readwrite');
    const invStore = tx.objectStore('invoices');
    const itemStore = tx.objectStore('items');
    const partyStore = tx.objectStore('parties');
    const queueStore = tx.objectStore('sync_queue');

    const invReq = invStore.get(invoiceId);

    invReq.onsuccess = () => {
      const invoice = invReq.result as Invoice;
      if (!invoice) {
        resolve({ success: false });
        return;
      }

      const isSales = invoice.documentType === 'SALES_INVOICE' || invoice.documentType === 'DELIVERY_CHALLAN' || !invoice.documentType;
      const isPurchase = invoice.documentType === 'PURCHASE_BILL';
      const isCreditNote = invoice.documentType === 'CREDIT_NOTE';
      const isDebitNote = invoice.documentType === 'DEBIT_NOTE';
      const isEstimate = invoice.documentType === 'QUOTATION' || invoice.documentType === 'ESTIMATE';
      const wasStockDeducted = isSales || isDebitNote || (isEstimate && Boolean(invoice.deductStock));

      // 1. Rollback Stock (Consolidated by itemId to handle duplicate items safely - Rule 2)
      if (invoice.items && Array.isArray(invoice.items)) {
        const itemQtyMap = new Map<string, number>();
        for (const line of invoice.items) {
          if (!line.itemId) continue;
          itemQtyMap.set(line.itemId, (itemQtyMap.get(line.itemId) || 0) + (Number(line.quantity) || 0));
        }

        for (const [itemId, totalQty] of itemQtyMap.entries()) {
          const itemReq = itemStore.get(itemId);
          itemReq.onsuccess = () => {
            const item = itemReq.result as Item;
            if (item) {
              if (wasStockDeducted) {
                // Stock was decremented, so increment it back
                item.currentStock += totalQty;
              } else if (isPurchase || isCreditNote) {
                // Stock was incremented on purchase, so decrement it back (Rule 1: Direct subtraction, allow negative stock)
                item.currentStock -= totalQty;
              }
              item.updatedAt = new Date().toISOString();
              (item as any).is_synced = false;
              (item as any).isSynced = false;
              (item as any).sync_action = 'UPDATE';
              itemStore.put(item);

              queueStore.put({
                id: 'sync-item-' + item.id + '-' + Date.now(),
                entity: 'ITEM',
                action: 'UPDATE',
                payload: item,
                timestamp: Date.now(),
                attempts: 0,
                is_synced: false,
                sync_action: 'UPDATE',
              });
            }
          };
        }
      }

      // 2. Rollback Party Khata Balance (Rule 3: No Math.max to preserve customer advance/negative balance)
      if (invoice.partyId) {
        const partyReq = partyStore.get(invoice.partyId);
        partyReq.onsuccess = () => {
          const party = partyReq.result as Party;
          if (party) {
            if (isSales && invoice.balanceAmount > 0) {
              // Unpaid balance was added to customer, so subtract it back (preserve negative advance balance)
              party.currentBalance -= invoice.balanceAmount;
            } else if (isPurchase && invoice.balanceAmount > 0) {
              // Unpaid purchase balance was deducted from supplier, so add it back
              party.currentBalance += invoice.balanceAmount;
            } else if (isCreditNote) {
              party.currentBalance += invoice.grandTotal;
            } else if (isDebitNote) {
              party.currentBalance -= invoice.grandTotal;
            }
            party.updatedAt = new Date().toISOString();
            (party as any).is_synced = false;
            (party as any).isSynced = false;
            (party as any).sync_action = 'UPDATE';
            partyStore.put(party);

            queueStore.put({
              id: 'sync-party-' + party.id + '-' + Date.now(),
              entity: 'PARTY',
              action: 'UPDATE',
              payload: party,
              timestamp: Date.now(),
              attempts: 0,
              is_synced: false,
              sync_action: 'UPDATE',
            });
          }
        };
      }

      // 3. Delete invoice from store
      invStore.delete(invoiceId);

      // 4. Register delete in sync_queue (Requirement 1)
      queueStore.put({
        id: 'sync-del-inv-' + invoiceId,
        entity: isPurchase ? 'PURCHASES' : 'INVOICES',
        action: 'DELETE',
        payload: { id: invoiceId },
        timestamp: Date.now(),
        attempts: 0,
        is_synced: false,
        sync_action: 'DELETE',
      });

      tx.oncomplete = () => {
        // Direct mutation sync to Supabase & tombstone
        import('../services/supabaseService')
          .then(({ syncMutation, recordDeletedTombstone, pushPendingToSupabase }) => {
            if (recordDeletedTombstone) recordDeletedTombstone(isPurchase ? 'purchases' : 'invoices', invoiceId);
            syncMutation(isPurchase ? 'purchases' : 'invoices', { id: invoiceId }, 'DELETE').catch(() => {});
            pushPendingToSupabase().catch(() => {});
          })
          .catch(() => {});
        resolve({ success: true, invoiceNumber: invoice.invoiceNumber });
      };
    };

    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Deletes an item from local IndexedDB and registers deletion to Supabase
 */
export async function deleteItemTransaction(itemId: string): Promise<boolean> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['items', 'sync_queue'], 'readwrite');
    const itemStore = tx.objectStore('items');
    const queueStore = tx.objectStore('sync_queue');

    itemStore.delete(itemId);

    queueStore.put({
      id: 'sync-del-itm-' + itemId,
      entity: 'ITEMS',
      action: 'DELETE',
      payload: { id: itemId },
      timestamp: Date.now(),
      attempts: 0,
      is_synced: false,
      sync_action: 'DELETE',
    });

    tx.oncomplete = () => {
      import('../services/supabaseService')
        .then(({ syncMutation, recordDeletedTombstone }) => {
          if (recordDeletedTombstone) recordDeletedTombstone('items', itemId);
          syncMutation('items', { id: itemId }, 'DELETE').catch(() => {});
        })
        .catch(() => {});
      resolve(true);
    };

    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Deletes a party from local IndexedDB and registers deletion to Supabase
 */
export async function deletePartyTransaction(partyId: string): Promise<boolean> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['parties', 'sync_queue'], 'readwrite');
    const partyStore = tx.objectStore('parties');
    const queueStore = tx.objectStore('sync_queue');

    partyStore.delete(partyId);

    queueStore.put({
      id: 'sync-del-pty-' + partyId,
      entity: 'PARTIES',
      action: 'DELETE',
      payload: { id: partyId },
      timestamp: Date.now(),
      attempts: 0,
      is_synced: false,
      sync_action: 'DELETE',
    });

    tx.oncomplete = () => {
      import('../services/supabaseService')
        .then(({ syncMutation, recordDeletedTombstone }) => {
          if (recordDeletedTombstone) recordDeletedTombstone('parties', partyId);
          syncMutation('parties', { id: partyId }, 'DELETE').catch(() => {});
        })
        .catch(() => {});
      resolve(true);
    };

    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Toggles party blacklist / inactive state and syncs to Supabase
 */
export async function togglePartyBlacklistTransaction(
  partyId: string, 
  isBlacklisted: boolean, 
  reason?: string
): Promise<Party | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['parties', 'sync_queue'], 'readwrite');
    const partyStore = tx.objectStore('parties');
    const queueStore = tx.objectStore('sync_queue');

    const req = partyStore.get(partyId);
    req.onsuccess = () => {
      const party = req.result as Party;
      if (!party) {
        resolve(null);
        return;
      }

      party.isBlacklisted = isBlacklisted;
      party.blacklistReason = reason || (isBlacklisted ? 'Blacklisted by Admin (लेन-देन बंद)' : undefined);
      party.updatedAt = new Date().toISOString();
      (party as any).is_synced = false;
      (party as any).isSynced = false;
      (party as any).sync_action = 'UPDATE';

      partyStore.put(party);

      queueStore.put({
        id: 'sync-pty-' + partyId,
        entity: 'PARTY',
        action: 'UPDATE',
        payload: party,
        timestamp: Date.now(),
        attempts: 0,
        is_synced: false,
        sync_action: 'UPDATE',
      });

      tx.oncomplete = () => {
        import('../services/supabaseService')
          .then(({ syncMutation }) => {
            syncMutation('parties', party).catch(() => {});
          })
          .catch(() => {});
        resolve(party);
      };
    };

    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get accurate count of all unsynced items in IndexedDB
 */
export async function getPendingSyncCount(): Promise<number> {
  try {
    const queueItems = await getAllFromStore<SyncQueueItem>('sync_queue');
    if (queueItems.length > 0) return queueItems.length;

    // Check stores directly for any unflagged records
    const [invoices, expenses, payments, items, parties] = await Promise.all([
      getAllFromStore<any>('invoices'),
      getAllFromStore<any>('expenses'),
      getAllFromStore<any>('payments'),
      getAllFromStore<any>('items'),
      getAllFromStore<any>('parties'),
    ]);

    const unsyncedCount = 
      invoices.filter(i => i.is_synced === false || i.isSynced === false).length +
      expenses.filter(e => e.is_synced === false || e.isSynced === false).length +
      payments.filter(p => p.is_synced === false || p.isSynced === false).length +
      items.filter(it => it.is_synced === false || it.isSynced === false).length +
      parties.filter(pa => pa.is_synced === false || pa.isSynced === false).length;

    return unsyncedCount;
  } catch {
    return 0;
  }
}

/**
 * Background cloud synchronization via Supabase Client
 */
export async function processSyncQueue(): Promise<{ syncedCount: number }> {
  try {
    const { performFullTwoWaySync } = await import('../services/supabaseService');
    const res = await performFullTwoWaySync();
    return { syncedCount: res.pushedCount + res.pulledCount };
  } catch (err) {
    console.warn('Sync push to Supabase failed, will retry on network reconnect:', err);
    return { syncedCount: 0 };
  }
}
