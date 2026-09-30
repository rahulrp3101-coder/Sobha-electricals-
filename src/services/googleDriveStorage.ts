/**
 * 100% Client-Owned Google Drive Storage & Backup Service
 * Directly interacts with Google Drive API v3 from user's browser using OAuth2.
 * Zero developer intermediate server, zero developer access to shop data.
 */

import { getCompleteShopData, restoreCompleteBackupJSON, CompleteShopBackup } from './backupService';

const GDRIVE_TOKEN_KEY = 'vyapar_gdrive_access_token';
const GDRIVE_EMAIL_KEY = 'vyapar_gdrive_user_email';
const GDRIVE_FILE_ID_KEY = 'vyapar_gdrive_file_id';
const GDRIVE_LAST_SYNC_KEY = 'vyapar_gdrive_last_sync';
const GDRIVE_AUTO_SYNC_KEY = 'vyapar_gdrive_auto_sync';
const GDRIVE_CUSTOM_CLIENT_ID_KEY = 'vyapar_gdrive_client_id';

// Default Client ID for standard web deployments (can be overridden by user in settings)
const DEFAULT_CLIENT_ID = '958273618492-vyapar-pro-client.apps.googleusercontent.com';

export interface GoogleDriveStatus {
  isConnected: boolean;
  userEmail: string | null;
  fileId: string | null;
  lastSyncedAt: string | null;
  autoSync: boolean;
  customClientId: string;
}

export function getGoogleDriveStatus(): GoogleDriveStatus {
  const token = localStorage.getItem(GDRIVE_TOKEN_KEY);
  const email = localStorage.getItem(GDRIVE_EMAIL_KEY);
  const fileId = localStorage.getItem(GDRIVE_FILE_ID_KEY);
  const lastSync = localStorage.getItem(GDRIVE_LAST_SYNC_KEY);
  const autoSync = localStorage.getItem(GDRIVE_AUTO_SYNC_KEY) === 'true';
  const customClientId = localStorage.getItem(GDRIVE_CUSTOM_CLIENT_ID_KEY) || '';

  return {
    isConnected: Boolean(token && email),
    userEmail: email,
    fileId,
    lastSyncedAt: lastSync,
    autoSync,
    customClientId,
  };
}

export function setGoogleDriveAutoSync(enabled: boolean): void {
  localStorage.setItem(GDRIVE_AUTO_SYNC_KEY, enabled ? 'true' : 'false');
}

export function setCustomGoogleClientId(clientId: string): void {
  localStorage.setItem(GDRIVE_CUSTOM_CLIENT_ID_KEY, clientId.trim());
}

/**
 * Initiates Client-Side OAuth2 Token Flow with Google
 */
export async function connectGoogleDrive(customClientId?: string): Promise<{ success: boolean; email?: string; error?: string }> {
  const clientId = (customClientId || localStorage.getItem(GDRIVE_CUSTOM_CLIENT_ID_KEY) || DEFAULT_CLIENT_ID).trim();

  return new Promise((resolve) => {
    try {
      // Check if Google GIS SDK is loaded or load dynamically
      const redirectUri = window.location.origin;
      const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.file email profile');
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
        clientId
      )}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${scope}&prompt=select_account`;

      // Open OAuth popup window
      const width = 500;
      const height = 650;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        authUrl,
        'google_oauth_popup',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      if (!popup) {
        // If popup blocked, offer manual prompt or direct fallback
        const manualToken = prompt(
          'पॉपअप ब्लॉक हो गया! यदि आपके पास Google Access Token है तो यहाँ दर्ज करें (या ब्राउज़र में पॉपअप अनुमति दें):'
        );
        if (manualToken && manualToken.trim()) {
          saveGoogleAuthSession(manualToken.trim(), 'customer@gmail.com').then((r) => resolve(r));
          return;
        }
        resolve({ success: false, error: 'पॉपअप विंडो ब्लॉक हो गई। कृपया ब्राउज़र में पॉपअप अनुमति दें।' });
        return;
      }

      // Check popup location for hash token
      const checkInterval = setInterval(async () => {
        try {
          if (popup.closed) {
            clearInterval(checkInterval);
            resolve({ success: false, error: 'Google लॉगिन रद्द कर दिया गया।' });
            return;
          }

          if (popup.location && popup.location.hash) {
            const hash = popup.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const accessToken = params.get('access_token');

            if (accessToken) {
              clearInterval(checkInterval);
              popup.close();
              const result = await saveGoogleAuthSession(accessToken);
              resolve(result);
            }
          }
        } catch {
          // Cross-origin access while navigating - ignore until redirect back to origin
        }
      }, 500);

      // Timeout after 2 minutes
      setTimeout(() => {
        clearInterval(checkInterval);
        if (!popup.closed) popup.close();
      }, 120000);
    } catch (err: any) {
      resolve({ success: false, error: err.message || 'Google Drive कनेक्ट करने में त्रुटि।' });
    }
  });
}

/**
 * Saves access token, fetches user email, and initializes backup file
 */
export async function saveGoogleAuthSession(
  accessToken: string,
  fallbackEmail?: string
): Promise<{ success: boolean; email?: string; error?: string }> {
  try {
    let email = fallbackEmail || 'customer@gmail.com';

    // Fetch user profile from Google UserInfo endpoint
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userRes.ok) {
        const userInfo = await userRes.json();
        email = userInfo.email || email;
      }
    } catch {
      // Use fallback
    }

    localStorage.setItem(GDRIVE_TOKEN_KEY, accessToken);
    localStorage.setItem(GDRIVE_EMAIL_KEY, email);
    localStorage.setItem(GDRIVE_AUTO_SYNC_KEY, 'true');

    // Find or create VyaparPro_Backup.json in customer's drive
    await findOrCreateDriveBackupFile(accessToken);

    return { success: true, email };
  } catch (err: any) {
    return { success: false, error: err.message || 'सत्र सुरक्षित करने में त्रुटि।' };
  }
}

/**
 * Disconnects customer's Google Drive
 */
export function disconnectGoogleDrive(): void {
  localStorage.removeItem(GDRIVE_TOKEN_KEY);
  localStorage.removeItem(GDRIVE_EMAIL_KEY);
  localStorage.removeItem(GDRIVE_FILE_ID_KEY);
  localStorage.removeItem(GDRIVE_LAST_SYNC_KEY);
  localStorage.removeItem(GDRIVE_AUTO_SYNC_KEY);
}

/**
 * Checks for existing VyaparPro_Backup.json or registers a new file ID
 */
async function findOrCreateDriveBackupFile(accessToken: string): Promise<string | null> {
  try {
    const listRes = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=name='VyaparPro_Backup.json'+and+trashed=false&fields=files(id,name)",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (listRes.ok) {
      const data = await listRes.json();
      if (data.files && data.files.length > 0) {
        const fileId = data.files[0].id;
        localStorage.setItem(GDRIVE_FILE_ID_KEY, fileId);
        return fileId;
      }
    }
  } catch (err) {
    console.warn('Could not search Drive files:', err);
  }
  return null;
}

/**
 * Uploads/Syncs full shop database into the customer's private Google Drive file
 */
export async function uploadShopDataToGoogleDrive(): Promise<{ success: boolean; message: string; timestamp?: string }> {
  const token = localStorage.getItem(GDRIVE_TOKEN_KEY);
  if (!token) {
    return { success: false, message: 'Google Drive कनेक्ट नहीं है।' };
  }

  try {
    const backupData = await getCompleteShopData();
    const jsonStr = JSON.stringify(backupData, null, 2);
    let fileId = localStorage.getItem(GDRIVE_FILE_ID_KEY);

    if (!fileId) {
      fileId = await findOrCreateDriveBackupFile(token);
    }

    if (fileId) {
      // Update existing file
      const updateRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: jsonStr,
        }
      );

      if (!updateRes.ok) {
        if (updateRes.status === 401) {
          disconnectGoogleDrive();
          return { success: false, message: 'Google Drive सत्र समाप्त हो गया। कृपया पुनः कनेक्ट करें।' };
        }
        throw new Error(`Drive Update failed with status ${updateRes.status}`);
      }
    } else {
      // Create new file with multipart upload (metadata + body)
      const metadata = {
        name: 'VyaparPro_Backup.json',
        mimeType: 'application/json',
        description: 'Vyapar Pro Cloud PWA Shop Master Backup',
      };

      const boundary = 'foo_bar_boundary';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelim = `\r\n--${boundary}--`;

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        jsonStr +
        closeDelim;

      const createRes = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartRequestBody,
        }
      );

      if (!createRes.ok) {
        if (createRes.status === 401) {
          disconnectGoogleDrive();
          return { success: false, message: 'Google Drive सत्र समाप्त हो गया। कृपया पुनः कनेक्ट करें।' };
        }
        throw new Error(`Drive Create failed with status ${createRes.status}`);
      }

      const createdFile = await createRes.json();
      if (createdFile.id) {
        localStorage.setItem(GDRIVE_FILE_ID_KEY, createdFile.id);
      }
    }

    const nowStr = new Date().toLocaleString('hi-IN');
    localStorage.setItem(GDRIVE_LAST_SYNC_KEY, nowStr);

    return {
      success: true,
      message: 'आपकी दुकान का डेटा सुरक्षित Google Drive में सिंक हो गया!',
      timestamp: nowStr,
    };
  } catch (err: any) {
    console.error('Google Drive Upload error:', err);
    return { success: false, message: `Google Drive सिंक विफल: ${err.message || 'नेटवर्क त्रुटि'}` };
  }
}

/**
 * Downloads and restores full shop database from customer's Google Drive
 */
export async function restoreShopDataFromGoogleDrive(): Promise<{ success: boolean; message: string; counts?: any }> {
  const token = localStorage.getItem(GDRIVE_TOKEN_KEY);
  let fileId = localStorage.getItem(GDRIVE_FILE_ID_KEY);

  if (!token) {
    return { success: false, message: 'Google Drive कनेक्ट नहीं है।' };
  }

  try {
    if (!fileId) {
      fileId = await findOrCreateDriveBackupFile(token);
    }

    if (!fileId) {
      return { success: false, message: 'Google Drive पर कोई पिछला बैकअप (VyaparPro_Backup.json) नहीं मिला।' };
    }

    const downloadRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!downloadRes.ok) {
      if (downloadRes.status === 401) {
        disconnectGoogleDrive();
        return { success: false, message: 'Google Drive सत्र समाप्त हो गया। कृपया पुनः कनेक्ट करें।' };
      }
      throw new Error(`डाउनलोड विफल: HTTP ${downloadRes.status}`);
    }

    const fileText = await downloadRes.text();
    return await restoreCompleteBackupJSON(fileText);
  } catch (err: any) {
    console.error('Drive Restore error:', err);
    return { success: false, message: `Google Drive से रीस्टोर विफल: ${err.message}` };
  }
}
