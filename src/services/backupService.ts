import { CompanyProfile, Item, Party, Invoice, PaymentTransaction, Expense } from '../types';
import { getAllFromStore, putToStore, clearStore, getDB } from '../db/indexedDB';
import { DEFAULT_COMPANY } from '../db/defaultData';

export interface CompleteShopBackup {
  appName: string;
  version: string;
  exportedAt: string;
  company: CompanyProfile;
  items: Item[];
  parties: Party[];
  invoices: Invoice[];
  payments: PaymentTransaction[];
  expenses: Expense[];
}

/**
 * Collects all shop records from IndexedDB and returns a structured backup object.
 */
export async function getCompleteShopData(): Promise<CompleteShopBackup> {
  const [compList, items, parties, invoices, payments, expenses] = await Promise.all([
    getAllFromStore<CompanyProfile>('company'),
    getAllFromStore<Item>('items'),
    getAllFromStore<Party>('parties'),
    getAllFromStore<Invoice>('invoices'),
    getAllFromStore<PaymentTransaction>('payments'),
    getAllFromStore<Expense>('expenses'),
  ]);

  return {
    appName: 'Vyapar Pro Cloud PWA',
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    company: compList[0] || DEFAULT_COMPANY,
    items,
    parties,
    invoices,
    payments,
    expenses,
  };
}

/**
 * Downloads the entire shop database as a formatted .json file directly in user's browser.
 */
export async function downloadCompleteBackupJSON(): Promise<{ filename: string; sizeKB: number }> {
  const backup = await getCompleteShopData();
  const jsonStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const sizeKB = Math.round(blob.size / 1024);

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `vyapar-pro-backup-${dateStr}.json`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { filename, sizeKB };
}

/**
 * Restores a full backup from a JSON string or file into the local IndexedDB.
 */
export async function restoreCompleteBackupJSON(
  jsonContent: string
): Promise<{ success: boolean; message: string; counts?: { items: number; parties: number; invoices: number } }> {
  try {
    const data = JSON.parse(jsonContent) as Partial<CompleteShopBackup>;

    if (!data.items && !data.invoices && !data.parties) {
      return { success: false, message: 'अमान्य बैकअप फ़ाइल: आवश्यक डेटा नहीं मिला।' };
    }

    const db = await getDB();

    // Clear and restore items
    if (Array.isArray(data.items)) {
      await clearStore('items');
      for (const item of data.items) {
        await putToStore('items', item);
      }
    }

    // Clear and restore parties
    if (Array.isArray(data.parties)) {
      await clearStore('parties');
      for (const party of data.parties) {
        await putToStore('parties', party);
      }
    }

    // Clear and restore invoices
    if (Array.isArray(data.invoices)) {
      await clearStore('invoices');
      for (const invoice of data.invoices) {
        await putToStore('invoices', invoice);
      }
    }

    // Clear and restore payments
    if (Array.isArray(data.payments)) {
      await clearStore('payments');
      for (const payment of data.payments) {
        await putToStore('payments', payment);
      }
    }

    // Clear and restore expenses
    if (Array.isArray(data.expenses)) {
      await clearStore('expenses');
      for (const exp of data.expenses) {
        await putToStore('expenses', exp);
      }
    }

    // Restore Company Profile
    if (data.company) {
      await putToStore('company', { id: 'primary', ...data.company });
    }

    return {
      success: true,
      message: 'बैकअप सफलतापूर्वक रीस्टोर हो गया!',
      counts: {
        items: data.items?.length || 0,
        parties: data.parties?.length || 0,
        invoices: data.invoices?.length || 0,
      },
    };
  } catch (err: any) {
    console.error('Failed to restore backup:', err);
    return { success: false, message: `रीस्टोर विफल रहा: ${err.message || 'फ़ाइल करप्ट है'}` };
  }
}
