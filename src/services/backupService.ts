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

const AUTO_BACKUP_ENABLED_KEY = 'vyapar_auto_backup_enabled';
const LAST_AUTO_BACKUP_DATE_KEY = 'vyapar_last_auto_backup_date';
const LAST_AUTO_BACKUP_TIME_KEY = 'vyapar_last_auto_backup_time';

export interface AutoBackupConfig {
  enabled: boolean;
  lastDate: string | null;
  lastTime: string | null;
}

export function getAutoBackupConfig(): AutoBackupConfig {
  const enabledStr = localStorage.getItem(AUTO_BACKUP_ENABLED_KEY);
  const enabled = enabledStr === null ? true : enabledStr === 'true'; // Default is ON
  const lastDate = localStorage.getItem(LAST_AUTO_BACKUP_DATE_KEY);
  const lastTime = localStorage.getItem(LAST_AUTO_BACKUP_TIME_KEY);
  return { enabled, lastDate, lastTime };
}

export function setAutoBackupEnabled(enabled: boolean): void {
  localStorage.setItem(AUTO_BACKUP_ENABLED_KEY, enabled ? 'true' : 'false');
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
    version: '2.5.0',
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
export async function downloadCompleteBackupJSON(isAuto: boolean = false): Promise<{ filename: string; sizeKB: number }> {
  const backup = await getCompleteShopData();
  const jsonStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const sizeKB = Math.round(blob.size / 1024);

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = isAuto ? `VyaparPro_AutoBackup_${dateStr}.json` : `VyaparPro_Backup_${dateStr}.json`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  if (isAuto) {
    const nowTimeStr = new Date().toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' });
    localStorage.setItem(LAST_AUTO_BACKUP_DATE_KEY, dateStr);
    localStorage.setItem(LAST_AUTO_BACKUP_TIME_KEY, nowTimeStr);
  }

  return { filename, sizeKB };
}

/**
 * Daily 24-hour Auto-Backup Scheduler:
 * Checks if 24 hours have passed (or date changed). If so, triggers an automatic local backup download.
 */
export async function checkAndRunDailyAutoBackup(): Promise<{ triggered: boolean; filename?: string; timestamp?: string }> {
  const config = getAutoBackupConfig();
  if (!config.enabled) {
    return { triggered: false };
  }

  const todayStr = new Date().toISOString().split('T')[0];
  // If already backed up today, skip
  if (config.lastDate === todayStr) {
    return { triggered: false };
  }

  // Trigger auto backup download
  try {
    const res = await downloadCompleteBackupJSON(true);
    const nowTimeStr = new Date().toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' });
    return {
      triggered: true,
      filename: res.filename,
      timestamp: `${todayStr} ${nowTimeStr}`,
    };
  } catch (err) {
    console.warn('Auto backup download error:', err);
    return { triggered: false };
  }
}

/**
 * Saves or Shares shop backup directly to Google Drive via native Web Share API (mobile/tablet/desktop)
 * or triggers instant download and direct link to Google Drive.
 */
export async function saveToGoogleDriveOrShare(): Promise<{
  success: boolean;
  method: 'share' | 'download_and_open';
  message: string;
  filename: string;
}> {
  const backup = await getCompleteShopData();
  const jsonStr = JSON.stringify(backup, null, 2);
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `VyaparPro_Backup_${dateStr}.json`;
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const file = new File([blob], filename, { type: 'application/json' });

  // 1. Try Native Web Share API (Android, iOS, iPad, supported Desktop)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: 'Vyapar Pro Master Backup',
        text: 'Vyapar Pro का बैकअप Google Drive या पसंदीदा फ़ोल्डर में सुरक्षित रखें।',
        files: [file],
      });
      return {
        success: true,
        method: 'share',
        message: 'बैकअप फ़ाइल शेयर / Google Drive में भेजने के लिए तैयार है!',
        filename,
      };
    } catch (shareErr: any) {
      if (shareErr.name === 'AbortError') {
        return {
          success: true,
          method: 'share',
          message: 'शेयर डायलॉग बंद कर दिया गया।',
          filename,
        };
      }
      // If native share failed, fall through to download + open Drive
    }
  }

  // 2. Fallback: Download file directly and open Google Drive web
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Open Google Drive in a new tab/window
  try {
    window.open('https://drive.google.com/drive/my-drive', '_blank');
  } catch {
    // ignore popup blocker
  }

  return {
    success: true,
    method: 'download_and_open',
    message: `'${filename}' डाउनलोड हो गई है और Google Drive खुल रहा है। फ़ाइल को Drive में ड्रॉप करें!`,
    filename,
  };
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
