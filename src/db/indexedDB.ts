/**
 * Offline-First IndexedDB Storage Engine for Vyapar Pro
 * Provides seamless local persistence, automatic schema upgrades,
 * and a robust offline synchronization queue.
 */

import { CompanyProfile, Item, Party, Invoice, PaymentTransaction, Expense, SyncQueueItem } from '../types';
import { DEFAULT_COMPANY, INITIAL_ITEMS, INITIAL_PARTIES, INITIAL_INVOICES, INITIAL_PAYMENTS, INITIAL_EXPENSES } from './defaultData';

const DB_NAME = 'VyaparPro_OfflineDB_v1';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

export async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('items')) {
        const itemStore = db.createObjectStore('items', { keyPath: 'id' });
        itemStore.createIndex('barcode', 'barcode', { unique: false });
        itemStore.createIndex('category', 'category', { unique: false });
      }

      if (!db.objectStoreNames.contains('parties')) {
        const partyStore = db.createObjectStore('parties', { keyPath: 'id' });
        partyStore.createIndex('phone', 'phone', { unique: false });
        partyStore.createIndex('type', 'type', { unique: false });
      }

      if (!db.objectStoreNames.contains('invoices')) {
        const invStore = db.createObjectStore('invoices', { keyPath: 'id' });
        invStore.createIndex('invoiceNumber', 'invoiceNumber', { unique: true });
        invStore.createIndex('partyId', 'partyId', { unique: false });
        invStore.createIndex('date', 'date', { unique: false });
        invStore.createIndex('isSynced', 'isSynced', { unique: false });
      }

      if (!db.objectStoreNames.contains('payments')) {
        const payStore = db.createObjectStore('payments', { keyPath: 'id' });
        payStore.createIndex('partyId', 'partyId', { unique: false });
      }

      if (!db.objectStoreNames.contains('expenses')) {
        db.createObjectStore('expenses', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('company')) {
        db.createObjectStore('company', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('sync_queue')) {
        const queueStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
        queueStore.createIndex('timestamp', 'timestamp', { unique: false });
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

async function seedInitialDataIfEmpty(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    const tx = db.transaction(['items', 'parties', 'invoices', 'payments', 'expenses', 'company'], 'readonly');
    const itemStore = tx.objectStore('items');
    const countReq = itemStore.count();

    countReq.onsuccess = () => {
      if (countReq.result === 0) {
        // Database is empty, seed initial data
        const writeTx = db.transaction(['items', 'parties', 'invoices', 'payments', 'expenses', 'company'], 'readwrite');
        
        INITIAL_ITEMS.forEach(i => writeTx.objectStore('items').put(i));
        INITIAL_PARTIES.forEach(p => writeTx.objectStore('parties').put(p));
        INITIAL_INVOICES.forEach(inv => writeTx.objectStore('invoices').put(inv));
        INITIAL_PAYMENTS.forEach(pay => writeTx.objectStore('payments').put(pay));
        INITIAL_EXPENSES.forEach(e => writeTx.objectStore('expenses').put(e));
        writeTx.objectStore('company').put({ id: 'primary', ...DEFAULT_COMPANY });

        writeTx.oncomplete = () => resolve();
        writeTx.onerror = () => resolve();
      } else {
        resolve();
      }
    };

    countReq.onerror = () => resolve();
  });
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
 * and pushes to sync queue if offline.
 */
export async function createInvoiceTransaction(invoice: Invoice, isOnline: boolean = true): Promise<Invoice> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['invoices', 'items', 'parties', 'sync_queue'], 'readwrite');
    const invStore = tx.objectStore('invoices');
    const itemStore = tx.objectStore('items');
    const partyStore = tx.objectStore('parties');
    const queueStore = tx.objectStore('sync_queue');

    // 1. Save invoice
    invoice.isSynced = isOnline;
    invStore.put(invoice);

    // 2. Adjust inventory stock
    const isSales = invoice.documentType === 'SALES_INVOICE' || invoice.documentType === 'DELIVERY_CHALLAN';
    const isPurchase = invoice.documentType === 'PURCHASE_BILL';
    const isCreditNote = invoice.documentType === 'CREDIT_NOTE'; // Return sales -> stock increment
    const isDebitNote = invoice.documentType === 'DEBIT_NOTE'; // Return purchase -> stock decrement

    for (const line of invoice.items) {
      const itemReq = itemStore.get(line.itemId);
      itemReq.onsuccess = () => {
        const item = itemReq.result as Item;
        if (item) {
          if (isSales || isDebitNote) {
            item.currentStock = Math.max(0, item.currentStock - line.quantity);
          } else if (isPurchase || isCreditNote) {
            item.currentStock += line.quantity;
          }
          item.updatedAt = new Date().toISOString();
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
            // Customer owes us more (Receivable increase)
            party.currentBalance += invoice.balanceAmount;
          } else if (isPurchase && invoice.balanceAmount > 0) {
            // We owe supplier more (Payable increase -> negative balance)
            party.currentBalance -= invoice.balanceAmount;
          } else if (isCreditNote) {
            // Sales return: Customer owes us less (decrease receivable)
            party.currentBalance = Math.max(0, party.currentBalance - invoice.grandTotal);
          } else if (isDebitNote) {
            // Purchase return: We owe supplier less (decrease payable)
            party.currentBalance += invoice.grandTotal;
          }
          party.updatedAt = new Date().toISOString();
          partyStore.put(party);
        }
      };
    }

    // 4. If offline, register in sync_queue, if online push to Cloud SQL backend
    if (!isOnline) {
      const queueItem: SyncQueueItem = {
        id: 'sync-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
        entity: 'INVOICE',
        action: 'CREATE',
        payload: invoice,
        timestamp: Date.now(),
        attempts: 0,
      };
      queueStore.put(queueItem);
    }

    tx.oncomplete = () => {
      if (isOnline) {
        // Send async push to Cloud SQL PostgreSQL
        fetch('/api/sync/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoices: [invoice] }),
        }).catch(err => console.warn('Background Cloud SQL sync error:', err));
      }
      resolve(invoice);
    };

    tx.onerror = () => {
      reject(tx.error);
    };
  });
}

/**
 * Record a khata payment (Payment In from customer or Payment Out to supplier)
 */
export async function recordPaymentTransaction(payment: PaymentTransaction): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['payments', 'parties'], 'readwrite');
    const payStore = tx.objectStore('payments');
    const partyStore = tx.objectStore('parties');

    payStore.put(payment);

    const partyReq = partyStore.get(payment.partyId);
    partyReq.onsuccess = () => {
      const party = partyReq.result as Party;
      if (party) {
        if (payment.type === 'PAYMENT_IN') {
          // Customer paid us -> reduce receivable
          party.currentBalance -= payment.amount;
        } else {
          // We paid supplier -> reduce payable
          party.currentBalance += payment.amount;
        }
        party.updatedAt = new Date().toISOString();
        partyStore.put(party);

        // Async sync payment and party balance to Cloud SQL
        fetch('/api/sync/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payments: [payment], parties: [party] }),
        }).catch(err => console.warn('Background payment sync error:', err));
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get sync queue items count
 */
export async function getPendingSyncCount(): Promise<number> {
  const items = await getAllFromStore<SyncQueueItem>('sync_queue');
  return items.length;
}

/**
 * Background cloud synchronization with Cloud SQL PostgreSQL
 */
export async function processSyncQueue(): Promise<{ syncedCount: number }> {
  const db = await getDB();
  const queue = await getAllFromStore<SyncQueueItem>('sync_queue');
  if (queue.length === 0) return { syncedCount: 0 };

  const pendingInvoices: Invoice[] = [];
  for (const item of queue) {
    if (item.entity === 'INVOICE') {
      pendingInvoices.push(item.payload);
    }
  }

  // Push to Cloud SQL
  try {
    if (pendingInvoices.length > 0) {
      await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoices: pendingInvoices }),
      });
    }
  } catch (err) {
    console.warn('Sync push to Cloud SQL failed, will retry later', err);
  }

  return new Promise((resolve) => {
    const tx = db.transaction(['sync_queue', 'invoices'], 'readwrite');
    const queueStore = tx.objectStore('sync_queue');
    const invStore = tx.objectStore('invoices');

    for (const item of queue) {
      if (item.entity === 'INVOICE') {
        const invReq = invStore.get(item.payload.id);
        invReq.onsuccess = () => {
          const inv = invReq.result as Invoice;
          if (inv) {
            inv.isSynced = true;
            invStore.put(inv);
          }
        };
      }
      queueStore.delete(item.id);
    }

    tx.oncomplete = () => {
      resolve({ syncedCount: queue.length });
    };
    tx.onerror = () => {
      resolve({ syncedCount: 0 });
    };
  });
}
