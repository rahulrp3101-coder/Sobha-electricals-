import React, { useState } from 'react';
import { 
  ShoppingBag, FileText, Package, Users, BarChart3, 
  Layers, Monitor, Smartphone, RefreshCw, Wifi, WifiOff, Download,
  Settings, ArrowDownLeft, Store, LogOut, ShieldCheck, Building2,
  Wallet, Menu, X, Check
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { CompanyProfile } from '../../types';

export type MainTab = 'POS' | 'PURCHASES' | 'INVENTORY' | 'PARTIES' | 'ESTIMATES' | 'EXPENSES' | 'SETTINGS' | 'INVOICES' | 'REPORTS' | 'ARCHITECTURE';

interface HeaderProps {
  activeTab: MainTab;
  onSelectTab: (tab: MainTab) => void;
  posMode: 'DESKTOP' | 'MOBILE';
  onTogglePosMode: () => void;
  isOnline: boolean;
  pendingSyncCount: number;
  isSyncing: boolean;
  justSynced?: boolean;
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
  justSynced = false,
  onTriggerSync,
  company,
  onOpenPaymentIn,
  adminUsername = 'admin',
  onLogout,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);

  const mainTabs = [
    { id: 'POS' as MainTab, label: 'Billing (बिलिंग)', icon: ShoppingBag },
    { id: 'PURCHASES' as MainTab, label: 'Purchases (खरीद)', icon: Building2 },
    { id: 'INVENTORY' as MainTab, label: 'Inventory (स्टॉक)', icon: Package },
    { id: 'PARTIES' as MainTab, label: 'Customers (ग्राहक खाता)', icon: Users },
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
                State: <strong className="text-slate-700">{company.stateCode}-{company.state}</strong>
                {company.gstin && <span className="ml-1.5 font-mono text-[9px] text-slate-400">GSTIN: {company.gstin}</span>}
              </span>
            )}
          </div>
        </a>
      </div>

      {/* Zone 2: Navigation Links (Desktop) - Primary Sections */}
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

        {/* Secondary: Estimates, Invoices, Expenses, Reports & Settings */}
        <button
          onClick={() => onSelectTab('ESTIMATES')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition text-xs ${
            activeTab === 'ESTIMATES'
              ? 'bg-amber-600 text-white shadow-2xs font-bold'
              : 'text-amber-700 bg-amber-50 hover:bg-amber-100 font-semibold'
          }`}
          title="Estimates & Quotations Register (कच्चा पर्चा / कोटेशन रजिस्टर)"
        >
          <FileText className="w-3.5 h-3.5 text-amber-600" />
          <span>Estimates (कोटेशन)</span>
        </button>

        <button
          onClick={() => onSelectTab('INVOICES')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition text-xs ${
            activeTab === 'INVOICES'
              ? 'bg-slate-900 text-white shadow-2xs font-bold'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Invoices (बिल सूची)</span>
        </button>

        <button
          onClick={() => onSelectTab('EXPENSES')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition text-xs ${
            activeTab === 'EXPENSES'
              ? 'bg-slate-900 text-white shadow-2xs font-bold'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          }`}
        >
          <Wallet className="w-3.5 h-3.5" />
          <span>Expenses (दुकान खर्च)</span>
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
          <span>Reports (GST)</span>
        </button>

        <button
          onClick={() => onSelectTab('SETTINGS')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition text-xs ${
            activeTab === 'SETTINGS'
              ? 'bg-slate-900 text-white shadow-2xs font-bold'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Settings (सेटिंग्स)</span>
        </button>
      </nav>

      {/* Zone 3: Quick Action Buttons, Admin Status, and Logout */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Mobile menu toggle button */}
        <button
          onClick={() => setShowMobileNav(!showMobileNav)}
          className="md:hidden p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition"
          aria-label="Navigation Menu"
        >
          {showMobileNav ? <X className="w-5 h-5 text-slate-800" /> : <Menu className="w-5 h-5 text-slate-700" />}
        </button>
        {/* Quick Payment In Button */}
        {onOpenPaymentIn && (
          <button
            onClick={onOpenPaymentIn}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-2xs active:scale-95"
            title="Record Payment In from customer"
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Payment In (पैसे मिले)</span>
            <span className="sm:hidden">+Payment</span>
          </button>
        )}

        {/* Sync & Connectivity Status Indicator (Optimized & Instant Feedback) */}
        <div className="flex items-center gap-1">
          <button
            onClick={onTriggerSync}
            disabled={isSyncing}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition shadow-2xs ${
              justSynced
                ? 'bg-emerald-600 text-white border-emerald-500 scale-102 ring-2 ring-emerald-300'
                : isSyncing
                ? 'bg-blue-50 text-blue-800 border-blue-300 ring-2 ring-blue-200'
                : !isOnline
                ? 'bg-amber-50 text-amber-900 border-amber-300'
                : pendingSyncCount > 0
                ? 'bg-amber-50 text-amber-800 border-amber-300'
                : 'bg-emerald-50 text-emerald-800 border-emerald-300'
            }`}
            title="क्लाउड सिंक स्थिति (Manual Sync Now के लिए क्लिक करें)"
          >
            {justSynced ? (
              <>
                <Check className="w-3.5 h-3.5 text-white stroke-[3] animate-in zoom-in-75 duration-200" />
                <span className="text-white font-extrabold">🟢 Synced (सुरक्षित ✓)</span>
              </>
            ) : isSyncing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />
                <span className="hidden xl:inline">🔵 सिंक हो रहा है... (Syncing...)</span>
                <span className="xl:hidden sm:inline">🔵 सिंक हो रहा है...</span>
                <span className="sm:hidden">🔵 Syncing...</span>
              </>
            ) : !isOnline ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="hidden xl:inline">
                  🟡 ऑफ़लाइन - {pendingSyncCount} पेंडिंग बदलाव (वापस ऑनलाइन आने पर स्वतः सिंक होंगे)
                </span>
                <span className="xl:hidden sm:inline">
                  🟡 ऑफ़लाइन ({pendingSyncCount} पेंडिंग)
                </span>
                <span className="sm:hidden">🟡 Offline ({pendingSyncCount})</span>
              </>
            ) : pendingSyncCount > 0 ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="hidden xl:inline">
                  🟡 {pendingSyncCount} पेंडिंग बदलाव (क्लिक करके सिंक करें)
                </span>
                <span className="xl:hidden sm:inline">
                  🟡 {pendingSyncCount} पेंडिंग बदलाव
                </span>
                <span className="sm:hidden">🟡 Sync ({pendingSyncCount})</span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="hidden xl:inline">🟢 ऑनलाइन - क्लाउड सिंक सुरक्षित (Synced)</span>
                <span className="xl:hidden sm:inline">🟢 ऑनलाइन (Synced)</span>
                <span className="sm:hidden">🟢 Synced</span>
              </>
            )}
          </button>

          {/* Quick Manual Sync Now Button */}
          {onTriggerSync && (
            <button
              onClick={onTriggerSync}
              disabled={isSyncing}
              className={`hidden lg:flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg border transition ${
                justSynced
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : 'text-slate-700 hover:text-blue-700 hover:bg-blue-50 border-slate-200'
              }`}
              title="Manual Sync Now - तुरंत 1 सेकंड में क्लाउड सिंक पूरा करें"
            >
              <RefreshCw className={`w-3 h-3 text-slate-500 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="text-[11px]">{justSynced ? '✓ Done' : 'Sync Now'}</span>
            </button>
          )}
        </div>

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

      {/* Mobile Navigation Drawer / Dropdown */}
      {showMobileNav && (
        <div className="fixed inset-x-0 top-16 z-40 bg-white border-b border-slate-200 shadow-2xl p-4 md:hidden animate-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
            <button
              onClick={() => { onSelectTab('POS'); setShowMobileNav(false); }}
              className={`p-3 rounded-xl flex items-center gap-2 border text-left transition ${
                activeTab === 'POS' ? 'bg-blue-50 text-blue-700 border-blue-200 font-bold' : 'bg-slate-50 text-slate-700 border-slate-100'
              }`}
            >
              <ShoppingBag className="w-4 h-4 text-blue-600" />
              <div>
                <div>Billing</div>
                <div className="text-[10px] text-slate-400 font-normal">बिलिंग व POS</div>
              </div>
            </button>

            <button
              onClick={() => { onSelectTab('PURCHASES'); setShowMobileNav(false); }}
              className={`p-3 rounded-xl flex items-center gap-2 border text-left transition ${
                activeTab === 'PURCHASES' ? 'bg-blue-50 text-blue-700 border-blue-200 font-bold' : 'bg-slate-50 text-slate-700 border-slate-100'
              }`}
            >
              <Building2 className="w-4 h-4 text-purple-600" />
              <div>
                <div>Purchases</div>
                <div className="text-[10px] text-slate-400 font-normal">खरीद व सप्लायर</div>
              </div>
            </button>

            <button
              onClick={() => { onSelectTab('INVENTORY'); setShowMobileNav(false); }}
              className={`p-3 rounded-xl flex items-center gap-2 border text-left transition ${
                activeTab === 'INVENTORY' ? 'bg-blue-50 text-blue-700 border-blue-200 font-bold' : 'bg-slate-50 text-slate-700 border-slate-100'
              }`}
            >
              <Package className="w-4 h-4 text-amber-600" />
              <div>
                <div>Inventory</div>
                <div className="text-[10px] text-slate-400 font-normal">स्टॉक व सामान</div>
              </div>
            </button>

            <button
              onClick={() => { onSelectTab('PARTIES'); setShowMobileNav(false); }}
              className={`p-3 rounded-xl flex items-center gap-2 border text-left transition ${
                activeTab === 'PARTIES' ? 'bg-blue-50 text-blue-700 border-blue-200 font-bold' : 'bg-slate-50 text-slate-700 border-slate-100'
              }`}
            >
              <Users className="w-4 h-4 text-emerald-600" />
              <div>
                <div>Customers</div>
                <div className="text-[10px] text-slate-400 font-normal">ग्राहक खाता बही</div>
              </div>
            </button>

            <button
              onClick={() => { onSelectTab('EXPENSES'); setShowMobileNav(false); }}
              className={`p-3 rounded-xl flex items-center gap-2 border text-left transition ${
                activeTab === 'EXPENSES' ? 'bg-blue-50 text-blue-700 border-blue-200 font-bold' : 'bg-slate-50 text-slate-700 border-slate-100'
              }`}
            >
              <Wallet className="w-4 h-4 text-rose-600" />
              <div>
                <div>Expenses</div>
                <div className="text-[10px] text-slate-400 font-normal">दुकान खर्च</div>
              </div>
            </button>

            <button
              onClick={() => { onSelectTab('REPORTS'); setShowMobileNav(false); }}
              className={`p-3 rounded-xl flex items-center gap-2 border text-left transition ${
                activeTab === 'REPORTS' ? 'bg-blue-50 text-blue-700 border-blue-200 font-bold' : 'bg-slate-50 text-slate-700 border-slate-100'
              }`}
            >
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              <div>
                <div>GST Reports</div>
                <div className="text-[10px] text-slate-400 font-normal">GSTR-1, GSTR-2, P&L</div>
              </div>
            </button>

            <button
              onClick={() => { onSelectTab('ESTIMATES'); setShowMobileNav(false); }}
              className={`p-3 rounded-xl flex items-center gap-2 border text-left transition ${
                activeTab === 'ESTIMATES' ? 'bg-amber-50 text-amber-700 border-amber-200 font-bold' : 'bg-slate-50 text-slate-700 border-slate-100'
              }`}
            >
              <FileText className="w-4 h-4 text-amber-600" />
              <div>
                <div>Estimates</div>
                <div className="text-[10px] text-slate-400 font-normal">कच्चा पर्चा / कोटेशन</div>
              </div>
            </button>

            <button
              onClick={() => { onSelectTab('INVOICES'); setShowMobileNav(false); }}
              className={`p-3 rounded-xl flex items-center gap-2 border text-left transition ${
                activeTab === 'INVOICES' ? 'bg-blue-50 text-blue-700 border-blue-200 font-bold' : 'bg-slate-50 text-slate-700 border-slate-100'
              }`}
            >
              <FileText className="w-4 h-4 text-sky-600" />
              <div>
                <div>Invoices</div>
                <div className="text-[10px] text-slate-400 font-normal">सभी बिल सूची</div>
              </div>
            </button>

            <button
              onClick={() => { onSelectTab('SETTINGS'); setShowMobileNav(false); }}
              className={`p-3 rounded-xl flex items-center gap-2 border text-left transition ${
                activeTab === 'SETTINGS' ? 'bg-blue-50 text-blue-700 border-blue-200 font-bold' : 'bg-slate-50 text-slate-700 border-slate-100'
              }`}
            >
              <Settings className="w-4 h-4 text-slate-600" />
              <div>
                <div>Settings</div>
                <div className="text-[10px] text-slate-400 font-normal">दुकान प्रोफाइल व बैकअप</div>
              </div>
            </button>
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
