import React, { useState, useEffect } from 'react';
import { CompanyProfile } from '../../types';
import { INDIAN_STATES } from '../../services/gstCalculator';
import { 
  Store, Building2, Phone, Mail, MapPin, Hash, 
  CreditCard, QrCode, FileText, Check, Save, RotateCcw, AlertCircle,
  Lock, ShieldCheck, KeyRound, Eye, EyeOff,
  Download, Upload, HardDrive, Cloud, CheckCircle2, Sparkles,
  RefreshCw, Copy, ExternalLink, Code2, Database, Wifi, WifiOff
} from 'lucide-react';
import { changeAdminCredentials } from '../../services/adminAuth';
import { 
  downloadCompleteBackupJSON, 
  restoreCompleteBackupJSON,
  getAutoBackupConfig,
  setAutoBackupEnabled
} from '../../services/backupService';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  testSupabaseConnection,
  performFullTwoWaySync,
  generateSupabaseSQLSchema,
  SupabaseConfig
} from '../../services/supabaseService';
import { getPendingSyncCount, getSavedCompanyProfile } from '../../db/indexedDB';

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
  const [saveAlertMessage, setSaveAlertMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // AI OCR & Gemini Configuration State (Requirement 1)
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => {
    return localStorage.getItem('gemini_user_api_key') || company?.geminiApiKey || '';
  });
  const [showApiKey, setShowApiKey] = useState(false);

  // Requirement 3: Load saved profile on mount and when company prop updates
  useEffect(() => {
    if (company && company.name) {
      setFormData({ ...company });
      if (company.geminiApiKey) {
        setGeminiApiKey(company.geminiApiKey);
      }
    }
  }, [company]);

  useEffect(() => {
    const loadSaved = async () => {
      try {
        const saved = await getSavedCompanyProfile();
        if (saved && saved.name) {
          setFormData(saved);
          if (saved.geminiApiKey) {
            setGeminiApiKey(saved.geminiApiKey);
          }
        }
      } catch (err) {
        console.warn('Error loading saved profile in settings:', err);
      }
    };
    loadSaved();
  }, []);

  // Security & Password Change Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState(adminUsername);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [securitySuccess, setSecuritySuccess] = useState<string | null>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [isUpdatingSecurity, setIsUpdatingSecurity] = useState(false);

  // Backup & Storage State (Zero-latency persistent IndexedDB)
  const [autoBackupConfig, setAutoBackupConfigState] = useState(getAutoBackupConfig);
  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false);
  const [isRestoringFile, setIsRestoringFile] = useState(false);
  const [backupToast, setBackupToast] = useState<{ msg: string; isSuccess: boolean } | null>(null);

  // Supabase Offline-First Architecture State
  const [supabaseConfig, setSupabaseConfig] = useState<SupabaseConfig>(getSupabaseConfig);
  const [isTestingSupabase, setIsTestingSupabase] = useState(false);
  const [isSyncingSupabase, setIsSyncingSupabase] = useState(false);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [showSchemaBox, setShowSchemaBox] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  useEffect(() => {
    getPendingSyncCount().then(setPendingSyncCount).catch(() => {});
  }, []);

  const showBackupToast = (msg: string, isSuccess: boolean = true) => {
    setBackupToast({ msg, isSuccess });
    setTimeout(() => setBackupToast(null), 5000);
  };

  // Local JSON Backup Download
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

  // Supabase Field Update
  const handleUpdateSupabaseUrl = (url: string) => {
    const updated = { ...supabaseConfig, url, isConnected: Boolean(url.trim() && supabaseConfig.anonKey.trim()) };
    setSupabaseConfig(updated);
    saveSupabaseConfig({ url: url.trim() });
  };

  const handleUpdateSupabaseAnonKey = (anonKey: string) => {
    const updated = { ...supabaseConfig, anonKey, isConnected: Boolean(supabaseConfig.url.trim() && anonKey.trim()) };
    setSupabaseConfig(updated);
    saveSupabaseConfig({ anonKey: anonKey.trim() });
  };

  // Test Supabase Connection
  const handleTestConnection = async () => {
    setIsTestingSupabase(true);
    try {
      const res = await testSupabaseConnection();
      showBackupToast(res.message, res.success);
      setSupabaseConfig(getSupabaseConfig());
    } catch (err: any) {
      showBackupToast('Supabase कनेक्शन परीक्षण विफल: ' + (err.message || 'त्रुटि'), false);
    } finally {
      setIsTestingSupabase(false);
    }
  };

  // Manual Sync Now (Requirement 4)
  const handleManualSyncNow = async () => {
    setIsSyncingSupabase(true);
    try {
      const res = await performFullTwoWaySync();
      if (res.success) {
        showBackupToast(
          `🟢 सिंक पूर्ण! ${res.pushedCount} रिकॉर्ड्स Supabase पर सुरक्षित हुए, ${res.pulledCount} क्लाउड से अपडेट हुए।`,
          true
        );
        if (onDataReloaded) {
          await onDataReloaded();
        }
      } else {
        showBackupToast(`सिंक चेतावनी: ${res.error || 'त्रुटि'}`, false);
      }
      setSupabaseConfig(getSupabaseConfig());
      getPendingSyncCount().then(setPendingSyncCount).catch(() => {});
    } catch (err: any) {
      showBackupToast('मैन्युअल सिंक में त्रुटि: ' + (err.message || 'त्रुटि'), false);
    } finally {
      setIsSyncingSupabase(false);
    }
  };

  // Copy Supabase SQL Schema (Requirement 4)
  const handleCopySQLSchema = () => {
    const sql = generateSupabaseSQLSchema();
    navigator.clipboard.writeText(sql);
    setCopiedSchema(true);
    showBackupToast('📋 Supabase SQL स्कीमा कोड कॉपी हो गया! Supabase SQL Editor में Run करें।', true);
    setTimeout(() => setCopiedSchema(false), 3000);
  };

  // Toggle Auto Sync on Network Reconnect
  const handleToggleAutoSync = () => {
    const newVal = !supabaseConfig.autoSync;
    const updated = { ...supabaseConfig, autoSync: newVal };
    setSupabaseConfig(updated);
    saveSupabaseConfig({ autoSync: newVal });
    showBackupToast(newVal ? 'नेटवर्क री-कनेक्ट ऑटो-सिंक सक्रिय है।' : 'ऑटो-सिंक बंद किया गया।', true);
  };

  // Local JSON Backup Restore from File Picker
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

  // Daily Auto-Backup Toggle
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
    setSaveAlertMessage(null);
    try {
      const cleanApiKey = geminiApiKey.trim();
      localStorage.setItem('gemini_user_api_key', cleanApiKey);

      try {
        const { putToStore } = await import('../../db/indexedDB');
        await putToStore('settings', {
          id: 'gemini_config',
          apiKey: cleanApiKey,
          updatedAt: new Date().toISOString(),
        });
      } catch (idbErr) {
        console.warn('Could not save gemini_config to settings store:', idbErr);
      }

      await onSaveCompany({
        ...formData,
        geminiApiKey: cleanApiKey,
      });
      setSaveAlertMessage('दुकान का विवरण व AI सेटिंग्स सफलतापूर्वक सेव हो गया!');
      setIsSavedToast(true);
      setTimeout(() => {
        setIsSavedToast(false);
      }, 5000);
    } catch (err: any) {
      console.error('Failed to save company settings', err);
      setSaveAlertMessage('त्रुटि: ' + (err.message || 'सेव करने में समस्या आई'));
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

      {/* Success Alert Banner (Requirement 2: स्पष्ट सक्सेस अलर्ट) */}
      {(saveAlertMessage || isSavedToast) && (
        <div className="bg-emerald-50 border-2 border-emerald-500 text-emerald-900 p-4 rounded-2xl flex items-center gap-3 text-xs sm:text-sm font-bold shadow-xs animate-in fade-in duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{saveAlertMessage || 'दुकान का विवरण सफलतापूर्वक सेव हो गया!'}</span>
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

        {/* Main Action Buttons */}
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

          {/* Button 3: Manual Cloud Sync Now (Requirement 4) */}
          <button
            type="button"
            disabled={isSyncingSupabase}
            onClick={handleManualSyncNow}
            className="flex flex-col items-start p-4 sm:p-5 rounded-2xl bg-slate-800/90 hover:bg-slate-700/90 active:scale-98 text-white transition shadow-md border border-slate-600/60 text-left group sm:col-span-2 lg:col-span-1"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center mb-3 group-hover:bg-indigo-500/30 transition text-indigo-400">
              <RefreshCw className={`w-5 h-5 ${isSyncingSupabase ? 'animate-spin' : ''}`} />
            </div>
            <div className="font-black text-sm sm:text-base leading-snug">
              ⚡ Manual Sync Now <span className="text-xs font-normal text-indigo-200 block">(क्लाउड डेटाबेस सिंक करें)</span>
            </div>
            <div className="text-[11px] text-slate-300 mt-1 leading-normal">
              Push pending offline records and pull cloud updates immediately without waiting for auto-timer.
            </div>
            <div className="mt-3 text-[11px] font-bold text-indigo-300 bg-indigo-500/20 px-2.5 py-1 rounded-lg border border-indigo-400/30">
              {isSyncingSupabase ? 'सिंक हो रहा है...' : 'Manual Sync Now →'}
            </div>
          </button>
        </div>

        {/* 24-Hour Daily Auto-Backup Setting */}
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

      {/* ========================================================================= */}
      {/* SUPABASE OFFLINE-FIRST ARCHITECTURE & CLOUD SYNC HUB (Requirements 2, 3, 4) */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-7 space-y-6">
        {/* Hub Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-2xs">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight text-slate-900">
                  Supabase क्लाउड सिंक सेटिंग्स (Cloud Database & Auto-Sync)
                </h3>
                {supabaseConfig.isConnected ? (
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                    🟢 कनेक्टेड (Connected)
                  </span>
                ) : (
                  <span className="text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">
                    ⚪ असंपर्कित (Not Configured)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                <strong>Offline-First Architecture:</strong> बिलिंग 0ms में स्थानीय IndexedDB में होती है। इंटरनेट बंद होने पर भी कोई रुकावट नहीं; नेट आते ही स्वतः Supabase पर सिंक हो जाएगा।
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={handleCopySQLSchema}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition shadow-xs"
              title="Copy SQL Schema for Supabase SQL Editor"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedSchema ? '✓ कॉपी हुआ!' : '📋 Copy Supabase SQL Schema'}</span>
            </button>
          </div>
        </div>

        {/* Supabase URL & Anon Key Inputs (Requirement 2) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
              <span>Supabase Project URL *</span>
              <span className="text-[10px] font-mono text-slate-400">https://xyz.supabase.co</span>
            </label>
            <input
              type="url"
              placeholder="https://your-project-id.supabase.co"
              value={supabaseConfig.url}
              onChange={(e) => handleUpdateSupabaseUrl(e.target.value)}
              className="w-full text-xs font-mono px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 placeholder:text-slate-400"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Supabase Dashboard ➔ Project Settings ➔ API ➔ Project URL
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
              <span>Supabase Anon / Public Key *</span>
              <span className="text-[10px] font-mono text-slate-400">anon public key</span>
            </label>
            <input
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={supabaseConfig.anonKey}
              onChange={(e) => handleUpdateSupabaseAnonKey(e.target.value)}
              className="w-full text-xs font-mono px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white text-slate-900 placeholder:text-slate-400"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Supabase Dashboard ➔ Project Settings ➔ API ➔ Project API keys ➔ anon public
            </p>
          </div>
        </div>

        {/* Action Buttons & Sync Triggers */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            {/* Test Connection Button */}
            <button
              type="button"
              disabled={isTestingSupabase || !supabaseConfig.url}
              onClick={handleTestConnection}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTestingSupabase ? 'animate-spin' : ''}`} />
              <span>{isTestingSupabase ? 'जांच हो रही है...' : '🔌 Test Connection (कनेक्शन जांचें)'}</span>
            </button>

            {/* Manual Sync Now Button (Requirement 4) */}
            <button
              type="button"
              disabled={isSyncingSupabase}
              onClick={handleManualSyncNow}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSupabase ? 'animate-spin' : ''}`} />
              <span>{isSyncingSupabase ? 'सिंक हो रहा है...' : '🔄 Manual Sync Now (अभी सिंक करें)'}</span>
            </button>

            {/* Toggle SQL Schema View */}
            <button
              type="button"
              onClick={() => setShowSchemaBox(!showSchemaBox)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
            >
              <Code2 className="w-3.5 h-3.5 text-slate-500" />
              <span>{showSchemaBox ? 'SQL स्कीमा छिपाएं' : '👁️ View Supabase SQL Schema'}</span>
            </button>
          </div>

          {/* Auto Sync on Network Reconnect Switch */}
          <div className="flex items-center gap-3 bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200">
            <div className="text-[11px] font-medium text-slate-700">
              नेटवर्क री-कनेक्ट ऑटो-सिंक: <strong>{supabaseConfig.autoSync ? 'चालू (ON)' : 'बंद (OFF)'}</strong>
            </div>
            <button
              type="button"
              onClick={handleToggleAutoSync}
              className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ease-in-out ${
                supabaseConfig.autoSync ? 'bg-emerald-600' : 'bg-slate-300'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ease-in-out shadow-xs ${
                  supabaseConfig.autoSync ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Sync Status Banner */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {pendingSyncCount > 0 ? (
              <span className="w-3 h-3 rounded-full bg-amber-500 animate-pulse shrink-0" />
            ) : (
              <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
            )}
            <div className="text-xs">
              <span className="font-bold text-slate-800">
                {pendingSyncCount > 0
                  ? `🟡 ${pendingSyncCount} पेंडिंग बदलाव (ऑफ़लाइन कतार में सुरक्षित हैं)`
                  : '🟢 सभी रिकॉर्ड्स Supabase क्लाउड व स्थानीय IndexedDB में सुरक्षित हैं'}
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                अंतिम सिंक समय: {supabaseConfig.lastSyncedAt || 'अभी तक कोई सिंक नहीं हुआ'}
              </p>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 font-mono bg-white px-3 py-1.5 rounded-xl border border-slate-200">
            टेबल्स: items, parties, invoices, purchases, expenses, payments
          </div>
        </div>

        {/* Expandable Supabase SQL DDL Schema Code Box (Requirement 3 & 4) */}
        {showSchemaBox && (
          <div className="bg-slate-900 rounded-2xl p-4 sm:p-5 text-white space-y-3 animate-in fade-in duration-200 border border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div>
                <span className="text-xs font-bold text-emerald-400 font-mono">
                  Supabase PostgreSQL SQL DDL Schema (6 Tables)
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  इसे कॉपी करके Supabase Dashboard ➔ SQL Editor ➔ New Query में Paste करके Run करें:
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopySQLSchema}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedSchema ? '✓ कॉपी हुआ!' : 'Copy Code'}</span>
              </button>
            </div>

            <pre className="text-[11px] font-mono leading-relaxed text-emerald-300/90 bg-slate-950 p-4 rounded-xl overflow-x-auto max-h-72 border border-slate-800/80">
              {generateSupabaseSQLSchema()}
            </pre>
          </div>
        )}
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

        {/* Section 5: AI & Scanner Settings (AI OCR Configuration - Requirement 1) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <h3 className="text-sm font-bold text-slate-900">
                AI & स्कैनर सेटिंग्स (AI OCR Configuration)
              </h3>
            </div>
            <span className="text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
              Google Gemini Vision
            </span>
          </div>

          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Google Gemini API Key
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 hover:underline"
              >
                <span>निःशुल्क API Key प्राप्त करें (Google AI Studio)</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                type={showApiKey ? 'text' : 'password'}
                value={geminiApiKey}
                onChange={e => setGeminiApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-10 py-2.5 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-purple-600 font-mono tracking-wider"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(prev => !prev)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                title={showApiKey ? 'Hide API Key' : 'Show API Key'}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1.5 leading-relaxed">
              <span>💡 बिल ऑटो-स्कैन के लिए Google AI Studio से प्राप्त निःशुल्क API Key यहाँ दर्ज करें।</span>
            </p>
          </div>
        </div>

        {/* Submit Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          {saveAlertMessage && (
            <div className="text-emerald-700 text-xs sm:text-sm font-bold flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 px-3.5 py-2 rounded-xl">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{saveAlertMessage}</span>
            </div>
          )}
          <button
            type="submit"
            disabled={isSaving}
            className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold transition shadow-xs flex items-center justify-center gap-2 ml-auto"
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
