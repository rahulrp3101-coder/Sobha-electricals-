/**
 * Google Drive Storage & Cloud Sync Service
 * Uses official Google Workspace OAuth with Firebase Auth SDK (workspace-integration skill).
 * Allows shop owners to store complete shop backups safely in their own Google Drive.
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { getCompleteShopData, restoreCompleteBackupJSON } from './backupService';

// Scopes required for Google Drive backup
export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// Initialize Firebase App & Auth
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.setCustomParameters({
  prompt: 'select_account',
});

// In-memory token cache (mandated by workspace-integration skill)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

const GDRIVE_EMAIL_KEY = 'vyapar_gdrive_user_email';
const GDRIVE_FILE_ID_KEY = 'vyapar_gdrive_file_id';
const GDRIVE_LAST_SYNC_KEY = 'vyapar_gdrive_last_sync';
const GDRIVE_AUTO_SYNC_KEY = 'vyapar_gdrive_auto_sync';
const GDRIVE_CUSTOM_CLIENT_ID_KEY = 'vyapar_gdrive_client_id';

export interface GoogleDriveStatus {
  isConnected: boolean;
  userEmail: string | null;
  fileId: string | null;
  lastSyncedAt: string | null;
  autoSync: boolean;
  customClientId: string;
}

export function getGoogleDriveStatus(): GoogleDriveStatus {
  const currentUser = auth.currentUser;
  const storedEmail = localStorage.getItem(GDRIVE_EMAIL_KEY);
  const fileId = localStorage.getItem(GDRIVE_FILE_ID_KEY);
  const lastSync = localStorage.getItem(GDRIVE_LAST_SYNC_KEY);
  const autoSync = localStorage.getItem(GDRIVE_AUTO_SYNC_KEY) === 'true';
  const customClientId = localStorage.getItem(GDRIVE_CUSTOM_CLIENT_ID_KEY) || '';

  const email = currentUser?.email || storedEmail;

  return {
    isConnected: Boolean(email && (cachedAccessToken || currentUser)),
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
 * Initializes Google Auth State listener.
 */
export const initGoogleAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // User logged in to Firebase but token expired or on page refresh
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Connects Google Drive using official Google OAuth popup (Firebase Auth SDK)
 */
export async function connectGoogleDrive(customClientId?: string): Promise<{ success: boolean; email?: string; error?: string }> {
  try {
    isSigningIn = true;

    // If user provided custom client ID for their custom domain, configure it
    const activeClientId = customClientId || localStorage.getItem(GDRIVE_CUSTOM_CLIENT_ID_KEY) || firebaseConfig.oAuthClientId;

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);

    if (!credential?.accessToken) {
      throw new Error('Google से एक्सेस टोकन प्राप्त नहीं हुआ। कृपया पुनः प्रयास करें।');
    }

    cachedAccessToken = credential.accessToken;
    const email = result.user.email || 'customer@gmail.com';

    localStorage.setItem(GDRIVE_EMAIL_KEY, email);
    localStorage.setItem(GDRIVE_AUTO_SYNC_KEY, 'true');

    // Discover or register VyaparPro_Backup.json on user's drive
    await findOrCreateDriveBackupFile(cachedAccessToken);

    return { success: true, email };
  } catch (error: any) {
    console.error('Google Sign In error:', error);
    let errorMsg = error.message || 'Google Drive कनेक्ट करने में त्रुटि।';
    if (error.code === 'auth/popup-closed-by-user') {
      errorMsg = 'Google लॉगिन विंडो बंद कर दी गई।';
    } else if (error.code === 'auth/popup-blocked') {
      errorMsg = 'ब्राउज़र में पॉपअप ब्लॉक हो गया। कृपया पॉपअप की अनुमति दें।';
    } else if (error.code === 'auth/cancelled-popup-request') {
      errorMsg = 'लॉगिन प्रक्रिया रद्द हो गई।';
    }
    return { success: false, error: errorMsg };
  } finally {
    isSigningIn = false;
  }
}

/**
 * Disconnects customer's Google Drive session
 */
export async function disconnectGoogleDrive(): Promise<void> {
  try {
    await signOut(auth);
  } catch (e) {
    console.warn('Sign out error:', e);
  }
  cachedAccessToken = null;
  localStorage.removeItem(GDRIVE_EMAIL_KEY);
  localStorage.removeItem(GDRIVE_FILE_ID_KEY);
  localStorage.removeItem(GDRIVE_LAST_SYNC_KEY);
  localStorage.removeItem(GDRIVE_AUTO_SYNC_KEY);
}

/**
 * Gets active access token or prompts user if missing
 */
async function getValidAccessToken(): Promise<string> {
  if (cachedAccessToken) return cachedAccessToken;

  // Try to re-authenticate if user object is present
  if (auth.currentUser) {
    const res = await connectGoogleDrive();
    if (res.success && cachedAccessToken) {
      return cachedAccessToken;
    }
  }

  throw new Error('Google Drive सत्र समाप्त हो गया है। कृपया "Google Drive से कनेक्ट करें" बटन दबाएं।');
}

/**
 * Checks for existing VyaparPro_Backup.json in the user's Drive
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
 * Uploads full shop database into the customer's private Google Drive file
 */
export async function uploadShopDataToGoogleDrive(): Promise<{ success: boolean; message: string; timestamp?: string }> {
  try {
    const token = await getValidAccessToken();
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
          cachedAccessToken = null;
          throw new Error('Google Drive सत्र समाप्त हो गया। कृपया पुनः कनेक्ट करें।');
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
          cachedAccessToken = null;
          throw new Error('Google Drive सत्र समाप्त हो गया। कृपया पुनः कनेक्ट करें।');
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
  try {
    const token = await getValidAccessToken();
    let fileId = localStorage.getItem(GDRIVE_FILE_ID_KEY);

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
        cachedAccessToken = null;
        throw new Error('Google Drive सत्र समाप्त हो गया। कृपया पुनः कनेक्ट करें।');
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
