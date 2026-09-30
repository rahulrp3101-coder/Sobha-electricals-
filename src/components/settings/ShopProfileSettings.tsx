import React, { useState, useEffect } from 'react';
import { CompanyProfile } from '../../types';
import { INDIAN_STATES } from '../../services/gstCalculator';
import { 
  Store, Building2, Phone, Mail, MapPin, Hash, 
  CreditCard, QrCode, FileText, Check, Save, RotateCcw, AlertCircle,
  Lock, ShieldCheck, KeyRound, Eye, EyeOff,
  Download, Upload, HardDrive, Cloud, CloudOff, RefreshCw, CheckCircle2,
  ExternalLink, Sparkles, FolderArchive
} from 'lucide-react';
import { changeAdminCredentials } from '../../services/adminAuth';
import { 
  downloadCompleteBackupJSON, 
  restoreCompleteBackupJSON 
} from '../../services/backupService';
import { 
  getGoogleDriveStatus, 
  connectGoogleDrive, 
  disconnectGoogleDrive, 
  uploadShopDataToGoogleDrive, 
  restoreShopDataFromGoogleDrive,
  setGoogleDriveAutoSync,
  setCustomGoogleClientId,
  GoogleDriveStatus
} from '../../services/googleDriveStorage';

interface ShopProfileSettingsProps {
  company: CompanyProfile;
  onSaveCompany: (updated: CompanyProfile) => Promise<void>;
  onBackToBilling?: () => void;
  adminUsername?: string;
  onDataReloaded?: () => Promise<void>;
}

export const ShopProfileSettings: React.FC<ShopProfileSettingsProps> = ({
  company,
  onSaveCompany,
  onBackToBilling,
  adminUsername = 'admin',
  onDataReloaded,
}) => {
  const [formData, setFormData] = useState<CompanyProfile>({ ...company });
  const [isSavedToast, setIsSavedToast] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Security & Password Change Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState(adminUsername);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [securitySuccess, setSecuritySuccess] = useState<string | null>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [isUpdatingSecurity, setIsUpdatingSecurity] = useState(false);

  // Google Drive Client-Owned Cloud Sync State
  const [gdriveStatus, setGdriveStatus] = useState<GoogleDriveStatus>(getGoogleDriveStatus);
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  const [isRestoringDrive, setIsRestoringDrive] = useState(false);
  const [driveToast, setDriveToast] = useState<{ msg: string; isError?: boolean } | null>(null);
  const [customClientIdInput, setCustomClientIdInput] = useState(gdriveStatus.customClientId || '');
  const [showClientIdConfig, setShowClientIdConfig] = useState(false);

  // Local JSON Backup / Restore State
  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false);
  const [isRestoringFile, setIsRestoringFile] = useState(false);
  const [backupToast, setBackupToast] = useState<{ msg: string; isError?: boolean } | null>(null);

  useEffect(() => {
    setGdriveStatus(getGoogleDriveStatus());
  }, []);

  const showDriveToastMsg = (msg: string, isError = false) => {
    setDriveToast({ msg, isError });
    setTimeout(() => setDriveToast(null), 4000);
  };

  const showBackupToastMsg = (msg: string, isError = false) => {
    setBackupToast({ msg, isError });
    setTimeout(() => setBackupToast(null), 4000);
  };

  // Google Drive Connect Handler
  const handleConnectDrive = async () => {
    setIsConnectingDrive(true);
    try {
      const res = await connectGoogleDrive(customClientIdInput);
      if (res.success) {
        setGdriveStatus(getGoogleDriveStatus());
        showDriveToastMsg(`Google Drive कनेक्ट हो गया: ${res.email}`);
      } else {
        showDriveToastMsg(res.error || 'Google Drive कनेक्ट विफल रहा।', true);
      }
    } finally {
      setIsConnectingDrive(false);
    }
  };

  // Google Drive Disconnect Handler
  const handleDisconnectDrive = () => {
    disconnectGoogleDrive();
    setGdriveStatus(getGoogleDriveStatus());
    showDriveToastMsg('Google Drive डिस्कनेक्ट कर दिया गया।');
  };

  // Google Drive Upload Handler
  const handleUploadToDrive = async () => {
    setIsSyncingDrive(true);
    try {
      const res = await uploadShopDataToGoogleDrive();
      if (res.success) {
        setGdriveStatus(getGoogleDriveStatus());
        showDriveToastMsg(res.message);
      } else {
        showDriveToastMsg(res.message, true);
      }
    } finally {
      setIsSyncingDrive(false);
    }
  };

  // Google Drive Restore Handler
  const handleRestoreFromDrive = async () => {
    if (!window.confirm('सावधान: Google Drive से डेटा रीस्टोर करने पर वर्तमान ब्राउज़र डेटा अपडेट हो जाएगा। क्या आप जारी रखना चाहते हैं?')) {
      return;
    }

    setIsRestoringDrive(true);
    try {
      const res = await restoreShopDataFromGoogleDrive();
      if (res.success) {
        showDriveToastMsg(res.message);
        if (onDataReloaded) {
          await onDataReloaded();
        }
      } else {
        showDriveToastMsg(res.message, true);
      }
    } finally {
      setIsRestoringDrive(false);
    }
  };

  // Local JSON Backup Download
  const handleDownloadBackup = async () => {
    setIsDownloadingBackup(true);
    try {
      const res = await downloadCompleteBackupJSON();
      showBackupToastMsg(`बैकअप डाउनलोड पूर्ण: ${res.filename} (${res.sizeKB} KB)`);
    } catch (err: any) {
      showBackupToastMsg('बैकअप डाउनलोड विफल: ' + err.message, true);
    } finally {
      setIsDownloadingBackup(false);
    }
  };

  // Local JSON Backup Restore from File Picker
  const handleFileRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm(`क्या आप फ़ाइल '${file.name}' से पूरी दुकान का डेटा रीस्टोर करना चाहते हैं?`)) {
      e.target.value = '';
      return;
    }

    setIsRestoringFile(true);
    try {
      const text = await file.text();
      const res = await restoreCompleteBackupJSON(text);
      if (res.success) {
        showBackupToastMsg(
          `${res.message} (${res.counts?.items} सामान, ${res.counts?.parties} पार्टियां, ${res.counts?.invoices} बिल रीस्टोर हुए)`
        );
        if (onDataReloaded) {
          await onDataReloaded();
        }
      } else {
        showBackupToastMsg(res.message, true);
      }
    } catch (err: any) {
      showBackupToastMsg('फ़ाइल पढ़ने में त्रुटि: ' + err.message, true);
    } finally {
      setIsRestoringFile(false);
      e.target.value = '';
    }
  };

  const handleSecuritySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityError(null);
    setSecuritySuccess(null);

    if (newPassword !== confirmPassword) {
      setSecurityError('नया पासवर्ड और पुष्टि पासवर्ड मेल नहीं खाते!');
      return;
    }

    if (newPassword.length < 4) {
      setSecurityError('नया पासवर्ड कम से कम 4 अक्षरों का होना चाहिए!');
      return;
    }

    setIsUpdatingSecurity(true);
    try {
      const res = await changeAdminCredentials(currentPassword, newUsername, newPassword);
      if (res.success) {
        setSecuritySuccess(res.message || 'यूजरनेम और पासवर्ड सफलतापूर्वक बदल दिया गया है!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setSecurityError(res.error || 'पासवर्ड बदलने में त्रुटि हुई। वर्तमान पासवर्ड जांचें।');
      }
    } catch {
      setSecurityError('सर्वर से संपर्क नहीं हो सका।');
    } finally {
      setIsUpdatingSecurity(false);
    }
  };

  const handleStateChange = (code: string) => {
    const stateName = INDIAN_STATES[code] || 'Maharashtra';
    setFormData(prev => ({
      ...prev,
      stateCode: code,
      state: stateName,
      // If GSTIN starts with 2 digits, update GSTIN state prefix if user wants
      gstin: prev.gstin.length >= 2 ? code + prev.gstin.slice(2) : prev.gstin,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSaveCompany(formData);
      setIsSavedToast(true);
      setTimeout(() => setIsSavedToast(false), 3500);
    } catch (err) {
      console.error('Failed to save company settings', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              दुकान प्रोफाइल व GST सेटिंग्स (Shop Profile & GST)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            यहाँ से अपनी दुकान का नाम, राज्य, मोबाइल नंबर, GSTIN व बैंक/UPI विवरण सेट करें। यह सभी बिलों और रसीदों पर प्रिंट होगा।
          </p>
        </div>

        {onBackToBilling && (
          <button
            type="button"
            onClick={onBackToBilling}
            className="self-start sm:self-auto px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
          >
            ← बिलिंग पर लौटें
          </button>
        )}
      </div>

      {/* Success Toast */}
      {isSavedToast && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 p-3.5 rounded-xl flex items-center gap-2.5 text-xs sm:text-sm font-semibold shadow-xs animate-in fade-in duration-200">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>दुकान की जानकारी और GST सेटिंग्स सफलतापूर्वक सेव हो गई हैं!</span>
        </div>
      )}

      {/* Settings Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Basic Shop Details */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Store className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">दुकान / व्यापार का विवरण (Shop Information)</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                दुकान का नाम (Shop Name) *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="उदा. श्री गणेश सुपरमार्ट & किराना स्टोर्स"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                कानूनी / व्यापारिक नाम (Legal / Trade Name)
              </label>
              <input
                type="text"
                value={formData.legalTradeName || ''}
                onChange={e => setFormData({ ...formData, legalTradeName: e.target.value })}
                placeholder="उदा. Shri Ganesh Traders Pvt Ltd"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                मोबाइल / फोन नंबर (Phone / WhatsApp) *
              </label>
              <input
                type="text"
                required
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+91 98765 43210"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ईमेल (Email Address)
              </label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="billing@shriganeshtraders.com"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
              />
            </div>
          </div>
        </div>

        {/* Section 2: State & GST Settings */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Building2 className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">राज्य और GST सेटिंग्स (State & GST Details)</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                दुकान का राज्य (Shop State & GST Code) *
              </label>
              <select
                value={formData.stateCode}
                onChange={e => handleStateChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
              >
                {Object.entries(INDIAN_STATES).map(([code, stateName]) => (
                  <option key={code} value={code}>
                    {code} - {stateName}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                ग्राहक भी इसी राज्य का होने पर <strong className="text-slate-800">CGST + SGST</strong> लगेगा। दूसरे राज्य के ग्राहक पर <strong className="text-slate-800">IGST</strong> लगेगा।
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                GSTIN नंबर (15-Digit GST Number)
              </label>
              <input
                type="text"
                maxLength={15}
                value={formData.gstin}
                onChange={e => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                placeholder="उदा. 27AABCV1234F1Z5"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-mono font-bold uppercase"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                यदि GST पंजीकरण नहीं है तो खाली छोड़ें या COMPOSITION दर्ज करें।
              </p>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                दुकान का पूरा पता (Shop Address)
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
                placeholder="दुकान न. 12, मेन मार्केट, गांधी चौक..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                शहर / जिला (City)
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={e => setFormData({ ...formData, city: e.target.value })}
                placeholder="शहर का नाम"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                पिनकोड (Pincode)
              </label>
              <input
                type="text"
                maxLength={6}
                value={formData.pincode}
                onChange={e => setFormData({ ...formData, pincode: e.target.value })}
                placeholder="411037"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Section 3: UPI & Bank Details */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <QrCode className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">UPI और बैंक विवरण (Payment QR & Bank Details)</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                दुकान की UPI ID (GooglePay / PhonePe / Paytm / BHIM)
              </label>
              <input
                type="text"
                value={formData.upiId || ''}
                onChange={e => setFormData({ ...formData, upiId: e.target.value })}
                placeholder="उदा. 9876543210@paytm या shop@okhdfcbank"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600 font-mono font-medium"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                इस UPI ID का QR कोड और पेमेंट लिंक WhatsApp बिलों में अपने आप जुड़ जाएगा।
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                बैंक का नाम (Bank Name)
              </label>
              <input
                type="text"
                value={formData.bankName || ''}
                onChange={e => setFormData({ ...formData, bankName: e.target.value })}
                placeholder="उदा. State Bank of India / HDFC Bank"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                बैंक खाता संख्या (Account Number)
              </label>
              <input
                type="text"
                value={formData.bankAccountNo || ''}
                onChange={e => setFormData({ ...formData, bankAccountNo: e.target.value })}
                placeholder="उदा. 50200088991122"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                बैंक IFSC कोड (IFSC Code)
              </label>
              <input
                type="text"
                maxLength={11}
                value={formData.bankIfsc || ''}
                onChange={e => setFormData({ ...formData, bankIfsc: e.target.value.toUpperCase() })}
                placeholder="उदा. SBIN0001234"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-mono uppercase"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Bill Greeting & Terms */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileText className="w-4 h-4 text-purple-600" />
            <h3 className="text-sm font-bold text-slate-900">बिल नियम व शर्तें (Invoice Terms & Greetings)</h3>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              बिल के नीचे प्रिंट होने वाली शर्तें (प्रत्येक लाइन अलग)
            </label>
            <textarea
              rows={3}
              value={formData.terms.join('\n')}
              onChange={e => setFormData({ ...formData, terms: e.target.value.split('\n').filter(Boolean) })}
              placeholder="1. बिका हुआ सामान वापस नहीं होगा।&#10;2. बिल के साथ ही एक्सचेंज संभव है।&#10;3. धन्यवाद, फिर पधारें!"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-purple-600 font-medium"
            />
          </div>
        </div>

        {/* Submit Bar */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold transition shadow-xs flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'सेव हो रहा है...' : 'दुकान की जानकारी सेव करें (Save Settings)'}</span>
          </button>
        </div>
      </form>

      {/* Section 5: Security & Single Admin Password Management */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              सुरक्षा व एडमिन पासवर्ड बदलें (Security & Password)
            </h3>
            <p className="text-[11px] text-slate-500">
              यहाँ से आप एडमिन यूजरनेम व पासवर्ड बदल सकते हैं। सिंगल एक्टिव सेशन के तहत नए डिवाइस में लॉगिन होते ही पुराना सेशन अपने आप बंद हो जाता है।
            </p>
          </div>
        </div>

        {/* Security Toast Messages */}
        {securitySuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{securitySuccess}</span>
          </div>
        )}

        {securityError && (
          <div className="p-3 bg-red-50 border border-red-300 text-red-700 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{securityError}</span>
          </div>
        )}

        <form onSubmit={handleSecuritySubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                वर्तमान पासवर्ड (Current Password) *
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="वर्तमान पासवर्ड डालें"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                नया यूजरनेम (Admin Username) *
              </label>
              <input
                type="text"
                required
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                placeholder="admin"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                नया पासवर्ड (New Password) *
              </label>
              <div className="relative flex items-center">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="कम से कम 4 अक्षर"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 pr-10 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                नए पासवर्ड की पुष्टि (Confirm New Password) *
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="नया पासवर्ड दोबारा डालें"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>पासवर्ड बदलते ही आपका सेशन नए टोकन के साथ सुरक्षित हो जाएगा।</span>
            </div>

            <button
              type="submit"
              disabled={isUpdatingSecurity || !currentPassword || !newPassword}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{isUpdatingSecurity ? 'अपडेट हो रहा है...' : 'पासवर्ड बदलें (Update Password)'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Section 6: Customer-Owned Google Drive Cloud Sync (100% Privacy) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  ग्राहक का निजी Google Drive स्टोरेज (Cloud Backup)
                </h3>
                {gdriveStatus.isConnected ? (
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                    कनेक्टेड
                  </span>
                ) : (
                  <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    ऑफ़लाइन / डिस्कनेक्टेड
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                दुकान का सारा डेटा सीधे आपके अपने निजी Google Drive खाते में सुरक्षित सिंक होता है।
              </p>
            </div>
          </div>

          <div className="hidden sm:block text-right">
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              🔒 100% Client-Owned Data
            </span>
          </div>
        </div>

        {/* Toast Feedback */}
        {driveToast && (
          <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            driveToast.isError
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
          }`}>
            {driveToast.isError ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{driveToast.msg}</span>
          </div>
        )}

        {/* Connected View vs Not Connected View */}
        {gdriveStatus.isConnected ? (
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="text-xs text-slate-500">कनेक्टेड Google खाता:</div>
                <div className="text-sm font-bold text-slate-900 font-mono">
                  {gdriveStatus.userEmail}
                </div>
                {gdriveStatus.lastSyncedAt && (
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    अंतिम सिंक: <strong>{gdriveStatus.lastSyncedAt}</strong>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleDisconnectDrive}
                className="self-start sm:self-auto px-3 py-1.5 bg-white hover:bg-red-50 text-red-600 border border-slate-200 hover:border-red-200 rounded-xl text-xs font-bold transition active:scale-95"
              >
                डिस्कनेक्ट करें
              </button>
            </div>

            {/* Sync Actions Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-200">
              <button
                type="button"
                disabled={isSyncingDrive}
                onClick={handleUploadToDrive}
                className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs active:scale-98"
              >
                <Upload className="w-4 h-4" />
                <span>{isSyncingDrive ? 'अपलोड हो रहा है...' : 'Google Drive पर तुरंत बैकअप भेजें'}</span>
              </button>

              <button
                type="button"
                disabled={isRestoringDrive}
                onClick={handleRestoreFromDrive}
                className="py-2.5 px-4 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 active:scale-98"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>{isRestoringDrive ? 'रीस्टोर हो रहा है...' : 'Google Drive से डेटा रीस्टोर करें'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <p className="text-xs text-slate-600 leading-relaxed">
              Google Drive कनेक्ट करने के बाद आपका सारा डेटा (आइटम, स्टॉक, ग्राहक, इनवॉइस) आपके अपने Google Drive में 
              <strong> 'VyaparPro_Backup.json'</strong> के रूप में सुरक्षित रहेगा। किसी भी समय नया डिवाइस बदलने पर एक क्लिक में सारा हिसाब वापस आ जाएगा।
            </p>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                disabled={isConnectingDrive}
                onClick={handleConnectDrive}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold transition shadow-xs flex items-center gap-2 active:scale-98"
              >
                <Cloud className="w-4 h-4" />
                <span>{isConnectingDrive ? 'कनेक्ट हो रहा है...' : 'Google Drive से कनेक्ट करें'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowClientIdConfig(!showClientIdConfig)}
                className="px-3 py-2 text-slate-500 hover:text-slate-800 text-xs font-semibold transition"
              >
                {showClientIdConfig ? 'कस्टम ID बंद करें' : '⚙️ कस्टम Google Client ID (वैकल्पिक)'}
              </button>
            </div>

            {showClientIdConfig && (
              <div className="pt-2 border-t border-slate-200 space-y-1.5 text-xs animate-in fade-in">
                <label className="block text-slate-700 font-bold">
                  कस्टम Google OAuth Client ID:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="उदा. 123456789-xxx.apps.googleusercontent.com"
                    value={customClientIdInput}
                    onChange={e => {
                      setCustomClientIdInput(e.target.value);
                      setCustomGoogleClientId(e.target.value);
                    }}
                    className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  यदि आप अपना निजी Google Cloud Console प्रोजेक्ट उपयोग करना चाहते हैं तो यहाँ Client ID डालें।
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 7: One-Click Offline Backup & Restore (Full Offline Control) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-2xs space-y-4">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-200">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              ऑफ़लाइन बैकअप व रीस्टोर (Local JSON Backup & Restore)
            </h3>
            <p className="text-[11px] text-slate-500">
              बिना इंटरनेट के भी कभी भी अपनी दुकान का संपूर्ण डेटा कंप्यूटर या फोन में डाउनलोड करें और नए डिवाइस में 1 सेकंड में रीस्टोर करें।
            </p>
          </div>
        </div>

        {/* Backup Toast Feedback */}
        {backupToast && (
          <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            backupToast.isError
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
          }`}>
            {backupToast.isError ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{backupToast.msg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Download JSON Backup Card */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                <Download className="w-4 h-4 text-blue-600" />
                <span>बैकअप डाउनलोड करें (Export .JSON)</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                सभी आइटम, स्टॉक, पार्टियां, इनवॉइस, पेमेंट और सेटिंग्स की एक मास्टर .JSON फ़ाइल डाउनलोड होगी।
              </p>
            </div>

            <button
              type="button"
              disabled={isDownloadingBackup}
              onClick={handleDownloadBackup}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs active:scale-98"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>{isDownloadingBackup ? 'डाउनलोड हो रहा है...' : 'Download Complete Backup'}</span>
            </button>
          </div>

          {/* Restore JSON Backup Card */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                <Upload className="w-4 h-4 text-emerald-600" />
                <span>फ़ाइल से रीस्टोर करें (Import .JSON)</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                डाउनलोड की गई .JSON बैकअप फ़ाइल चुनें। आपका सारा हिसाब तुरंत रीस्टोर हो जाएगा।
              </p>
            </div>

            <label className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer active:scale-98">
              <Upload className="w-4 h-4" />
              <span>{isRestoringFile ? 'रीस्टोर हो रहा है...' : 'Restore Backup File'}</span>
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                disabled={isRestoringFile}
                onChange={handleFileRestore}
              />
            </label>
          </div>
        </div>

        {/* Ownership Assurance Callout */}
        <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-[11px] text-blue-900 flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <strong>100% डेटा सुरक्षा गारंटी:</strong> आपका डेटा किसी बाहरी सर्वर या डेवलपर पर निर्भर नहीं है। आप जब चाहें अपना डेटा एक्सपोर्ट करके अपने पास सुरक्षित रख सकते हैं।
          </div>
        </div>
      </div>
    </div>
  );
};
