import React, { useState } from 'react';
import { 
  ShoppingBag, FileText, Package, Users, BarChart3, 
  Layers, Monitor, Smartphone, RefreshCw, Wifi, WifiOff, Download,
  Settings, ArrowDownLeft, Store
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { CompanyProfile } from '../../types';

export type MainTab = 'POS' | 'INVOICES' | 'INVENTORY' | 'PARTIES' | 'REPORTS' | 'SETTINGS' | 'ARCHITECTURE';

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
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

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
              <span className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 group-hover:text-blue-700 transition truncate max-w-[150px] sm:max-w-[220px]">
                {company?.name || 'Vyapar Pro'}
              </span>
              <span className="hidden sm:inline-block text-[9px] bg-blue-50 text-blue-800 font-bold px-1.5 py-0.5 rounded font-mono">
                PWA
              </span>
            </div>
            {company?.state && (
              <span className="text-[10px] text-slate-500 font-medium truncate hidden xs:block">
                राज्य: <strong className="text-slate-700">{company.stateCode}-{company.state}</strong>
                {company.gstin && <span className="ml-1.5 font-mono text-[9px] text-slate-400">GSTIN: {company.gstin}</span>}
              </span>
            )}
          </div>
        </a>
      </div>

      {/* Zone 2: Navigation Links (Desktop) */}
      <nav className="hidden md:flex items-center gap-1 sm:gap-1.5 text-xs font-semibold text-slate-600">
        {[
          { id: 'POS', label: 'बिलिंग (POS)', icon: ShoppingBag },
          { id: 'INVENTORY', label: 'इन्वेंट्री (Stock)', icon: Package },
          { id: 'PARTIES', label: 'खाता (Parties)', icon: Users },
          { id: 'INVOICES', label: 'बिलों की सूची', icon: FileText },
          { id: 'REPORTS', label: 'रिपोर्ट्स (GST)', icon: BarChart3 },
          { id: 'SETTINGS', label: 'दुकान सेटिंग', icon: Settings },
          { id: 'ARCHITECTURE', label: 'आर्किटेक्चर', icon: Layers },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id as MainTab)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition ${
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
      </nav>

      {/* Zone 3: Quick Action Buttons (Payment In, Sync, POS Toggle, PWA) */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Quick Payment In Button */}
        {onOpenPaymentIn && (
          <button
            onClick={onOpenPaymentIn}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-2xs"
            title="ग्राहक से पैसे प्राप्त होने की एंट्री करें"
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">पैसे मिले (Payment In)</span>
            <span className="sm:hidden">+पैसे</span>
          </button>
        )}

        {/* Desktop vs Mobile POS Mode Toggle (Visible on POS tab only) */}
        {activeTab === 'POS' && (
          <button
            onClick={onTogglePosMode}
            className="hidden sm:flex items-center gap-1 px-2 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 transition"
            title="Toggle Desktop Keyboard POS / Mobile Touch View"
          >
            {posMode === 'DESKTOP' ? (
              <>
                <Monitor className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden lg:inline">Desktop POS</span>
              </>
            ) : (
              <>
                <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden lg:inline">Mobile View</span>
              </>
            )}
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

        {/* Settings button on mobile header */}
        <button
          onClick={() => onSelectTab('SETTINGS')}
          className="md:hidden p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
          title="दुकान सेटिंग्स"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* iOS Install Prompt */}
        {!isInstalled && isIOS && (
          <button
            onClick={() => setShowIOSGuide(true)}
            className="flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">iOS</span>
          </button>
        )}
      </div>

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
