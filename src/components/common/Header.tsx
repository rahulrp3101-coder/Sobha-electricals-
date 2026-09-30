import React, { useState } from 'react';
import { 
  ShoppingBag, FileText, Package, Users, BarChart3, 
  Layers, Monitor, Smartphone, RefreshCw, Wifi, WifiOff, Download,
  Settings, ArrowDownLeft, Store, LogOut, ShieldCheck
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { CompanyProfile } from '../../types';

export type MainTab = 'POS' | 'INVENTORY' | 'PARTIES' | 'SETTINGS' | 'INVOICES' | 'REPORTS' | 'ARCHITECTURE';

interface HeaderProps {
  activeTab: MainTab;
  onSelectTab: (tab: MainTab) => void;
  posMode: 'DESKTOP' | 'MOBILE';
  onTogglePosMode: () => void;
  isOnline: boolean;
  pendingSyncCount: number;
  isSyncing: boolean;
  onTriggerSync: () => void;
  company?: CompanyProfile;
  onOpenPaymentIn?: () => void;
  adminUsername?: string;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  posMode,
  onTogglePosMode,
  isOnline,
  pendingSyncCount,
  isSyncing,
  onTriggerSync,
  company,
  onOpenPaymentIn,
  adminUsername = 'admin',
  onLogout,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const mainTabs = [
    { id: 'POS' as MainTab, label: 'बिलिंग (POS)', icon: ShoppingBag },
    { id: 'INVENTORY' as MainTab, label: 'स्टॉक / इन्वेंट्री', icon: Package },
    { id: 'PARTIES' as MainTab, label: 'ग्राहक खाता / पार्टी', icon: Users },
    { id: 'SETTINGS' as MainTab, label: 'सेटिंग्स व प्रोफ़ाइल', icon: Settings },
  ];

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between z-30 select-none shadow-2xs">
      {/* Zone 1: Shop Brand & State info */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <a 
          href="/" 
          onClick={(e) => { e.preventDefault(); onSelectTab('POS'); }}
          className="flex items-center gap-2 group min-w-0"
        >
          <div className="w-8 h-8 rounded-xl bg-blue-700 flex items-center justify-center text-white font-black text-sm shadow-xs group-hover:bg-blue-800 transition shrink-0">
            ₹
          </div>
          <div className="min-w-0 flex flex-col justify-center">
            <div className="flex items-center gap-1.5">
              <span className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 group-hover:text-blue-700 transition truncate max-w-[140px] sm:max-w-[200px]">
                {company?.name || 'Vyapar Pro'}
              </span>
              <span className="hidden sm:inline-block text-[9px] bg-blue-50 text-blue-800 font-bold px-1.5 py-0.5 rounded font-mono">
                PWA
              </span>
            </div>
            {company?.state && (
              <span className="text-[10px] text-slate-500 font-medium truncate hidden sm:block">
                राज्य: <strong className="text-slate-700">{company.stateCode}-{company.state}</strong>
                {company.gstin && <span className="ml-1.5 font-mono text-[9px] text-slate-400">GSTIN: {company.gstin}</span>}
              </span>
            )}
          </div>
        </a>
      </div>

      {/* Zone 2: Navigation Links (Desktop) - 4 Primary Sections */}
      <nav className="hidden md:flex items-center gap-1 sm:gap-1.5 text-xs font-semibold text-slate-600">
        {mainTabs.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition ${
                isActive
                  ? 'bg-slate-900 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}

        {/* Secondary: Invoices & Reports */}
        <button
          onClick={() => onSelectTab('INVOICES')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition text-xs ${
            activeTab === 'INVOICES'
              ? 'bg-slate-900 text-white shadow-2xs font-bold'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>बिल लिस्ट</span>
        </button>

        <button
          onClick={() => onSelectTab('REPORTS')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition text-xs ${
            activeTab === 'REPORTS'
              ? 'bg-slate-900 text-white shadow-2xs font-bold'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>GST रिपोर्ट्स</span>
        </button>
      </nav>

      {/* Zone 3: Quick Action Buttons, Admin Status, and Logout */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Quick Payment In Button */}
        {onOpenPaymentIn && (
          <button
            onClick={onOpenPaymentIn}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-2xs active:scale-95"
            title="ग्राहक से पैसे प्राप्त होने की एंट्री करें"
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">पैसे मिले (Payment In)</span>
            <span className="sm:hidden">+पैसे</span>
          </button>
        )}

        {/* Sync & Connectivity Status */}
        <button
          onClick={onTriggerSync}
          disabled={!isOnline || isSyncing}
          className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
            !isOnline
              ? 'bg-amber-50 text-amber-800 border-amber-300'
              : pendingSyncCount > 0
              ? 'bg-blue-50 text-blue-700 border-blue-300'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
          }`}
          title={isOnline ? 'Online - Click to trigger cloud sync' : 'Offline mode - invoices queued locally'}
        >
          {isOnline ? (
            <Wifi className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-amber-600" />
          )}

          <span className="hidden sm:inline">
            {!isOnline
              ? `Offline (${pendingSyncCount})`
              : pendingSyncCount > 0
              ? `Syncing (${pendingSyncCount})`
              : 'Synced'}
          </span>

          {isSyncing && <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />}
        </button>

        {/* In-App PWA Install Button */}
        {!isInstalled && isInstallable && (
          <button
            onClick={install}
            className="flex items-center gap-1 sm:gap-1.5 rounded-lg bg-blue-600 px-2 sm:px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Install</span>
          </button>
        )}

        {/* Admin Badge & Logout Button */}
        <div className="flex items-center gap-1 pl-1 border-l border-slate-200">
          <div className="hidden lg:flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-lg text-[11px] font-bold text-slate-700">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>{adminUsername}</span>
          </div>

          {onLogout && (
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="p-1.5 sm:px-2.5 sm:py-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition text-xs font-bold flex items-center gap-1"
              title="एडमिन लॉग आउट करें"
            >
              <LogOut className="w-3.5 h-3.5 text-red-500" />
              <span className="hidden sm:inline">लॉग आउट</span>
            </button>
          )}
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 mx-auto flex items-center justify-center">
              <LogOut className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">लॉग आउट करना चाहते हैं?</h3>
            <p className="text-xs text-slate-500">
              लॉग आउट करने पर आपको दोबारा यूजरनेम और पासवर्ड डालकर लॉगिन करना होगा।
            </p>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                रद्द करें
              </button>
              <button
                onClick={() => {
                  setShowLogoutConfirm(false);
                  if (onLogout) onLogout();
                }}
                className="py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                हाँ, लॉग आउट करें
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS Safari Installation Guide Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">Install Vyapar Pro on iPhone / iPad</h3>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              1. Safari टूलबार में <strong>Share</strong> बटन दबाएं।<br />
              2. नीचे स्क्रॉल करके <strong>Add to Home Screen</strong> पर टैप करें।<br />
              3. अब बिना इंटरनेट भी ऐप की तरह बिलिंग करें!
            </p>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-4 w-full rounded-xl bg-slate-900 py-2 text-xs font-bold text-white hover:bg-slate-800 transition"
            >
              ठीक है (Got It)
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
