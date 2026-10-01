import React, { useState } from 'react';
import { CompanyProfile } from '../../types';
import { INDIAN_STATES } from '../../services/gstCalculator';
import { 
  Store, Building2, Phone, Mail, MapPin, Hash, 
  CreditCard, QrCode, FileText, Check, Save, RotateCcw, AlertCircle,
  Lock, ShieldCheck, KeyRound, Eye, EyeOff,
  Download, Upload, HardDrive, Cloud, CheckCircle2, Sparkles
} from 'lucide-react';
import { changeAdminCredentials } from '../../services/adminAuth';
import { 
  downloadCompleteBackupJSON, 
  restoreCompleteBackupJSON,
  saveToGoogleDriveOrShare,
  getAutoBackupConfig,
  setAutoBackupEnabled
} from '../../services/backupService';

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

  // Backup & Storage State (Zero-latency persistent IndexedDB + Drive Share)
  const [autoBackupConfig, setAutoBackupConfigState] = useState(getAutoBackupConfig);
  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false);
  const [isRestoringFile, setIsRestoringFile] = useState(false);
  const [isSavingToDrive, setIsSavingToDrive] = useState(false);
  const [backupToast, setBackupToast] = useState<{ msg: string; isSuccess: boolean } | null>(null);

  const showBackupToast = (msg: string, isSuccess: boolean = true) => {
    setBackupToast({ msg, isSuccess });
    setTimeout(() => setBackupToast(null), 4500);
  };

  // Local JSON Backup Download (Requirement 5)
  const handleDownloadBackup = async () => {
    setIsDownloadingBackup(true);
    try {
      const res = await downloadCompleteBackupJSON(false);
      showBackupToast(`पूरा बैकअप डाउनलोड हुआ: ${res.filename} (${res.sizeKB} KB)`, true);
    } catch (err: any) {
      showBackupToast('डाउनलोड में समस्या: ' + (err.message || 'त्रुटि'), false);
    } finally {
      setIsDownloadingBackup(false);
    }
  };

  // Save to Google Drive or Native Share (Requirement 4 - Zero Auth Error!)
  const handleSaveToGoogleDrive = async () => {
    setIsSavingToDrive(true);
    try {
      const res = await saveToGoogleDriveOrShare();
      showBackupToast(res.message, true);
    } catch (err: any) {
      showBackupToast('Google Drive में सेव करने में त्रुटि: ' + (err.message || 'त्रुटि'), false);
    } finally {
      setIsSavingToDrive(false);
    }
  };

  // Local JSON Backup Restore from File Picker (Requirement 5)
  const handleFileRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm(`क्या आप फ़ाइल '${file.name}' से पूरी दुकान का डेटा रीस्टोर करना चाहते हैं? वर्तमान डेटा अपडेट हो जाएगा।`)) {
      e.target.value = '';
      return;
    }

    setIsRestoringFile(true);
    try {
      const text = await file.text();
      const res = await restoreCompleteBackupJSON(text);
      if (res.success) {
        showBackupToast(
          `${res.message} (${res.counts?.items || 0} सामान, ${res.counts?.parties || 0} पार्टियां, ${res.counts?.invoices || 0} बिल रीस्टोर हुए)`,
          true
        );
        if (onDataReloaded) {
          await onDataReloaded();
        }
      } else {
        showBackupToast(res.message, false);
      }
    } catch (err: any) {
      showBackupToast('फ़ाइल पढ़ने में त्रुटि: ' + err.message, false);
    } finally {
      setIsRestoringFile(false);
      e.target.value = '';
    }
  };

  // Daily Auto-Backup Toggle (Requirement 2)
  const handleToggleAutoBackup = () => {
    const newVal = !autoBackupConfig.enabled;
    setAutoBackupEnabled(newVal);
    const updated = getAutoBackupConfig();
    setAutoBackupConfigState(updated);
    showBackupToast(newVal ? 'दैनिक 24 घंटे का ऑटो-बैकअप सक्रिय किया गया।' : 'दैनिक ऑटो-बैकअप बंद किया गया।', true);
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

      {/* Primary Data Backup & Restore Hub (Top of Settings) */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-3xl p-5 sm:p-7 shadow-lg border border-slate-700/60 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/60 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400 shadow-inner">
              <HardDrive className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight text-white">
                  डेटा बैकअप व रीस्टोर केंद्र (Master Backup & Restore)
                </h3>
                <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  सुरक्षित स्थानीय डेटाबेस
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                दुकान का 100% डेटा आपके ब्राउज़र IndexedDB में स्थायी रहता है। बिना इंटरनेट भी सुरक्षित है।
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
              🔒 100% Zero-Dependency
            </span>
          </div>
        </div>

        {/* Toast Alert */}
        {backupToast && (
          <div className={`p-3.5 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2.5 shadow-md ${
            backupToast.isSuccess
              ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-200'
              : 'bg-red-500/20 border border-red-500/40 text-red-200'
          }`}>
            {backupToast.isSuccess ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />}
            <span>{backupToast.msg}</span>
          </div>
        )}

        {/* Main 2 Large Action Buttons (Requirement 5) + Google Drive (Requirement 4) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {/* Button 1: Download Complete Backup */}
          <button
            type="button"
            disabled={isDownloadingBackup}
            onClick={handleDownloadBackup}
            className="flex flex-col items-start p-4 sm:p-5 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-98 text-white transition shadow-md border border-blue-400/30 text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-3 group-hover:bg-white/20 transition">
              <Download className="w-5 h-5 text-white" />
            </div>
            <div className="font-black text-sm sm:text-base leading-snug">
              💾 Download JSON Backup <span className="text-xs font-normal text-blue-200 block">(अभी पूरा बैकअप डाउनलोड करें)</span>
            </div>
            <div className="text-[11px] text-blue-100/80 mt-1 leading-normal">
              1-Click instant download of all items, stock, parties and billing invoices in secure .json format.
            </div>
            <div className="mt-3 text-[11px] font-bold text-blue-200 bg-blue-700/60 px-2.5 py-1 rounded-lg">
              {isDownloadingBackup ? 'Downloading...' : 'Download JSON Backup →'}
            </div>
          </button>

          {/* Button 2: Restore from File */}
          <label className="flex flex-col items-start p-4 sm:p-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white transition shadow-md border border-emerald-400/30 text-left group cursor-pointer">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-3 group-hover:bg-white/20 transition">
              <Upload className="w-5 h-5 text-white" />
            </div>
            <div className="font-black text-sm sm:text-base leading-snug">
              📥 Restore from Backup File <span className="text-xs font-normal text-emerald-200 block">(बैकअप से डेटा रीस्टोर करें)</span>
            </div>
            <div className="text-[11px] text-emerald-100/80 mt-1 leading-normal">
              Select any previous .json backup file to immediately restore your items, bills and khata on any device.
            </div>
            <div className="mt-3 text-[11px] font-bold text-emerald-200 bg-emerald-700/60 px-2.5 py-1 rounded-lg">
              {isRestoringFile ? 'Restoring Data...' : 'Restore File (फ़ाइल चुनें) →'}
            </div>
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              disabled={isRestoringFile}
              onChange={handleFileRestore}
            />
          </label>

          {/* Button 3: Save to Google Drive (Requirement 4) */}
          <button
            type="button"
            disabled={isSavingToDrive}
            onClick={handleSaveToGoogleDrive}
            className="flex flex-col items-start p-4 sm:p-5 rounded-2xl bg-slate-800/90 hover:bg-slate-700/90 active:scale-98 text-white transition shadow-md border border-slate-600/60 text-left group sm:col-span-2 lg:col-span-1"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center mb-3 group-hover:bg-amber-500/30 transition text-amber-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div className="font-black text-sm sm:text-base leading-snug">
              ☁️ Save to Google Drive <span className="text-xs font-normal text-amber-200 block">(Google Drive में सेव करें)</span>
            </div>
            <div className="text-[11px] text-slate-300 mt-1 leading-normal">
              One-click direct save or share to your Google Drive folder without complicated OAuth errors.
            </div>
            <div className="mt-3 text-[11px] font-bold text-amber-300 bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-400/30">
              {isSavingToDrive ? 'Preparing...' : 'Save to Google Drive →'}
            </div>
          </button>
        </div>

        {/* 24-Hour Daily Auto-Backup Setting (Requirement 2) */}
        <div className="pt-3 border-t border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-bold text-white">
                ⏰ 24-घंटे का दैनिक ऑटो-बैकअप (Daily Auto-Backup)
              </span>
              {autoBackupConfig.enabled && (
                <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full">
                  चालू (ON)
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-300">
              हर 24 घंटे में एक बार (या दिन का पहला बिल बनते ही) ब्राउज़र अपने आप 'VyaparPro_AutoBackup_YYYY-MM-DD.json' डाउनलोड कर लेगा।
            </p>
            {autoBackupConfig.lastDate && (
              <div className="text-[10px] text-slate-400 font-mono pt-0.5">
                अंतिम ऑटो-बैकअप: {autoBackupConfig.lastDate} {autoBackupConfig.lastTime || ''}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleToggleAutoBackup}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
              autoBackupConfig.enabled
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
            }`}
          >
            <span>{autoBackupConfig.enabled ? '✓ दैनिक ऑटो-बैकअप सक्रिय' : 'ऑटो-बैकअप बंद करें'}</span>
          </button>
        </div>
      </div>

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
            <h3 className="text-sm font-bold text-slate-900">UPI &amp; Bank Payment Details (UPI और बैंक विवरण)</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Shop UPI ID (दुकान की UPI ID)
              </label>
              <input
                type="text"
                value={formData.upiId || ''}
                onChange={e => setFormData({ ...formData, upiId: e.target.value })}
                placeholder="e.g. shopname@okaxis / 9876543210@upi"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600 font-mono font-medium"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Dynamic UPI QR code with exact bill amount will appear on screen and printed receipts (PhonePe/GPay/Paytm).
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Bank Name (बैंक का नाम)
              </label>
              <input
                type="text"
                value={formData.bankName || ''}
                onChange={e => setFormData({ ...formData, bankName: e.target.value })}
                placeholder="e.g. State Bank of India / HDFC Bank"
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
    </div>
  );
};
