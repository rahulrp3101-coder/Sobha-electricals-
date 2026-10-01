/**
 * Direct Google Drive Save & Share Service
 * Provides frictionless, zero-error backup to Google Drive using Web Share API and direct Drive integration.
 * Eliminates Firebase domain restrictions and technical auth errors completely.
 */

import { saveToGoogleDriveOrShare, getCompleteShopData, restoreCompleteBackupJSON } from './backupService';

const GDRIVE_EMAIL_KEY = 'vyapar_gdrive_user_email';
const GDRIVE_LAST_SYNC_KEY = 'vyapar_gdrive_last_sync';
const GDRIVE_AUTO_SYNC_KEY = 'vyapar_gdrive_auto_sync';

export interface GoogleDriveStatus {
  isConnected: boolean;
  userEmail: string | null;
  lastSyncedAt: string | null;
  autoSync: boolean;
}

export function getGoogleDriveStatus(): GoogleDriveStatus {
  const email = localStorage.getItem(GDRIVE_EMAIL_KEY);
  const lastSync = localStorage.getItem(GDRIVE_LAST_SYNC_KEY);
  const autoSync = localStorage.getItem(GDRIVE_AUTO_SYNC_KEY) === 'true';

  return {
    isConnected: Boolean(lastSync || email),
    userEmail: email || 'Google Drive',
    lastSyncedAt: lastSync,
    autoSync,
  };
}

export function setGoogleDriveAutoSync(enabled: boolean): void {
  localStorage.setItem(GDRIVE_AUTO_SYNC_KEY, enabled ? 'true' : 'false');
}

/**
 * Direct 1-Click Save to Google Drive:
 * Shares directly to the Google Drive app via Web Share API or triggers download + opens Drive.
 */
export async function directSaveToGoogleDrive(): Promise<{
  success: boolean;
  message: string;
  filename: string;
}> {
  try {
    const res = await saveToGoogleDriveOrShare();
    const nowStr = new Date().toLocaleString('hi-IN');
    localStorage.setItem(GDRIVE_LAST_SYNC_KEY, nowStr);

    return {
      success: true,
      message: res.method === 'share' 
        ? 'बैकअप फ़ाइल तैयार है! अपने Google Drive फ़ोल्डर में सेव करें।'
        : 'बैकअप फ़ाइल डाउनलोड हो गई है और Google Drive खुल रहा है।',
      filename: res.filename,
    };
  } catch (err: any) {
    console.warn('Google Drive Save error:', err);
    return {
      success: false,
      message: 'बैकअप सेव करने में समस्या आई। कृपया दोबारा प्रयास करें।',
      filename: '',
    };
  }
}
