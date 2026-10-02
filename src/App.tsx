/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Item, Party, Invoice, PaymentTransaction, Expense, 
  CompanyProfile, DocumentType 
} from './types';
import { 
  getDB, getAllFromStore, putToStore, deleteFromStore, createInvoiceTransaction, 
  recordPaymentTransaction, saveItemTransaction, savePartyTransaction, saveExpenseTransaction 
} from './db/indexedDB';
import { DEFAULT_COMPANY } from './db/defaultData';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { Header, MainTab } from './components/common/Header';
import { BottomNav } from './components/common/BottomNav';
import { OfflineBanner } from './components/common/OfflineBanner';
import { VyaparPOSView } from './components/pos/VyaparPOSView';
import { InvoiceList } from './components/invoices/InvoiceList';
import { InvoiceForm } from './components/invoices/InvoiceForm';
import { A4InvoiceTemplate } from './components/invoices/A4InvoiceTemplate';
import { ThermalReceiptTemplate } from './components/invoices/ThermalReceiptTemplate';
import { InventoryMaster } from './components/inventory/InventoryMaster';
import { PartiesLedger } from './components/parties/PartiesLedger';
import { PurchasesAndVendors } from './components/purchases/PurchasesAndVendors';
import { ExpenseManagement } from './components/expenses/ExpenseManagement';
import { PaymentInModal } from './components/parties/PaymentInModal';
import { GSTReportsView } from './components/reports/GSTReportsView';
import { ShopProfileSettings } from './components/settings/ShopProfileSettings';
import { ArchitectureViewer } from './components/architecture/ArchitectureViewer';
import { AdminLoginScreen } from './components/auth/AdminLoginScreen';
import { 
  getStoredSession, 
  validateActiveSession, 
  logoutAdmin, 
  AdminSession 
} from './services/adminAuth';
import { checkAndRunDailyAutoBackup } from './services/backupService';
import { 
  syncMutation, 
  pullFromSupabaseToIndexedDB, 
  subscribeToRealtimeSync, 
  getSupabaseConfig 
} from './services/supabaseService';
import { CheckCircle2 } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function App() {
  // Single Admin Auth & Single Active Session State
  const [adminSession, setAdminSession] = useState<AdminSession | null>(() => getStoredSession());
  const [sessionTerminatedReason, setSessionTerminatedReason] = useState<string | null>(null);
  const [isValidatingAuth, setIsValidatingAuth] = useState<boolean>(true);

  const [activeTab, setActiveTab] = useState<MainTab>('POS');
  const [posMode, setPosMode] = useState<'DESKTOP' | 'MOBILE'>('DESKTOP');
  
  // Active Invoice View / Print state
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [viewingFormat, setViewingFormat] = useState<'a4' | 'thermal'>('a4');
  const [isCreatingInvoice, setIsCreatingInvoice] = useState<boolean>(false);
  const [newInvoiceDocType, setNewInvoiceDocType] = useState<DocumentType>('SALES_INVOICE');

  // Quick Payment In Modal
  const [isGlobalPaymentInOpen, setIsGlobalPaymentInOpen] = useState<boolean>(false);

  // Direct Customer Ledger Navigation (Requirement 3)
  const [selectedPartyIdForLedger, setSelectedPartyIdForLedger] = useState<string | null>(null);

  // Core Data Stores from IndexedDB
  const [company, setCompany] = useState<CompanyProfile>(DEFAULT_COMPANY);
  const [items, setItems] = useState<Item[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [autoBackupNotice, setAutoBackupNotice] = useState<string | null>(null);

  // Online / Offline Connectivity & Sync
  const { 
    isOnline, 
    pendingSyncCount, 
    isSyncing, 
    triggerSync, 
    refreshSyncCount 
  } = useOnlineStatus();

  // Screen-size detection for automatic touch mobile view
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setPosMode('MOBILE');
    }
  }, []);

  // Daily 24-hour Auto-Backup Scheduler (Requirement 2)
  useEffect(() => {
    const runAutoBackupCheck = async () => {
      try {
        const res = await checkAndRunDailyAutoBackup();
        if (res.triggered && res.filename) {
          setAutoBackupNotice(`दैनिक 24 घंटे का ऑटो-बैकअप सुरक्षित हो गया है: ${res.filename}`);
          setTimeout(() => setAutoBackupNotice(null), 9000);
        }
      } catch (err) {
        console.warn('Auto-backup check error:', err);
      }
    };

    // Run on startup
    runAutoBackupCheck();

    // Check periodically every 20 minutes while app is running
    const timer = setInterval(runAutoBackupCheck, 1000 * 60 * 20);
    return () => clearInterval(timer);
  }, []);

  // Continuous Session Validation: Enforces Single Active Session
  useEffect(() => {
    const verifySession = async () => {
      const stored = getStoredSession();
      if (!stored) {
        setAdminSession(null);
        setIsValidatingAuth(false);
        return;
      }

      const res = await validateActiveSession(stored.token);
      if (!res.valid) {
        setAdminSession(null);
        setSessionTerminatedReason(
          res.message || 'आप किसी दूसरे डिवाइस या नए ब्राउज़र में लॉगिन हो चुके हैं। सुरक्षा कारणों से यह सेशन समाप्त हो गया है।'
        );
      } else {
        setAdminSession(stored);
      }
      setIsValidatingAuth(false);
    };

    verifySession();

    // Periodic check every 12 seconds
    const interval = setInterval(verifySession, 12000);
    const onFocus = () => verifySession();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  const handleLogout = async () => {
    await logoutAdmin();
    setAdminSession(null);
    setSessionTerminatedReason(null);
  };

  // Load Database Data on Mount & Two-Way Cloud Sync (Requirement 2)
  const loadDatabaseData = useCallback(async () => {
    try {
      await getDB();
      const [allComp, allItems, allParties, allInvoices, allPayments, allExpenses] = await Promise.all([
        getAllFromStore<any>('company'),
        getAllFromStore<Item>('items'),
        getAllFromStore<Party>('parties'),
        getAllFromStore<Invoice>('invoices'),
        getAllFromStore<PaymentTransaction>('payments'),
        getAllFromStore<Expense>('expenses'),
      ]);

      if (allComp.length > 0) {
        setCompany(allComp[0]);
      }
      setItems(allItems);
      setParties(allParties);
      // Sort invoices newest first
      setInvoices(allInvoices.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setPayments(allPayments);
      setExpenses(allExpenses);
      await refreshSyncCount();

      // Cloud Two-Way Sync on Load (Mobile <-> PC Sync)
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const cfg = getSupabaseConfig();
        if (cfg.isConnected) {
          pullFromSupabaseToIndexedDB().then(res => {
            if (res.pulledCount > 0) {
              // Reload in-memory state with freshly pulled cloud invoices and parties
              Promise.all([
                getAllFromStore<Item>('items'),
                getAllFromStore<Party>('parties'),
                getAllFromStore<Invoice>('invoices'),
                getAllFromStore<PaymentTransaction>('payments'),
                getAllFromStore<Expense>('expenses'),
              ]).then(([freshItems, freshParties, freshInvs, freshPays, freshExps]) => {
                setItems(freshItems);
                setParties(freshParties);
                setInvoices(freshInvs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
                setPayments(freshPays);
                setExpenses(freshExps);
              }).catch(() => {});
            }
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('Failed to load local IndexedDB data', err);
    } finally {
      setIsLoading(false);
    }
  }, [refreshSyncCount]);

  useEffect(() => {
    loadDatabaseData();
  }, [loadDatabaseData]);

  // Live Supabase Realtime multi-device sync
  useEffect(() => {
    const unsubscribe = subscribeToRealtimeSync(() => {
      loadDatabaseData();
    });
    return () => unsubscribe();
  }, [loadDatabaseData]);

  // Handle Save Invoice (From POS or InvoiceForm)
  const handleSaveInvoice = async (
    invoice: Invoice, 
    printImmediate: boolean = false, 
    printFormat: 'thermal' | 'a4' = 'thermal'
  ): Promise<Invoice> => {
    const saved = await createInvoiceTransaction(invoice, isOnline);
    await loadDatabaseData();

    // Direct Supabase mutation sync (Requirement 2)
    syncMutation(saved.documentType === 'PURCHASE_BILL' ? 'purchases' : 'invoices', saved).catch(() => {});
    if (saved.partyId) {
      const party = parties.find(p => p.id === saved.partyId);
      if (party) syncMutation('parties', party).catch(() => {});
    }

    // Trigger celebration particles
    try {
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.8 },
      });
    } catch {
      // ignore
    }

    if (printImmediate) {
      setViewingInvoice(saved);
      setViewingFormat(printFormat);
    }

    // Trigger daily auto-backup if today's first bill (Requirement 2)
    checkAndRunDailyAutoBackup().then(res => {
      if (res.triggered && res.filename) {
        setAutoBackupNotice(`दिन का पहला बिल: दैनिक ऑटो-बैकअप डाउनलोड हो गया (${res.filename})`);
        setTimeout(() => setAutoBackupNotice(null), 9000);
      }
    }).catch(() => {});

    return saved;
  };

  // Handle Save / Update Product Item
  const handleSaveItem = async (item: Item) => {
    await saveItemTransaction(item);
    await loadDatabaseData();
    syncMutation('items', item).catch(() => {});
  };

  // Handle Save / Update Party
  const handleSaveParty = async (party: Party) => {
    await savePartyTransaction(party);
    await loadDatabaseData();
    syncMutation('parties', party).catch(() => {});
  };

  // Handle Record Payment
  const handleRecordPayment = async (payment: PaymentTransaction) => {
    await recordPaymentTransaction(payment);
    await loadDatabaseData();
    syncMutation('payments', payment).catch(() => {});
    if (payment.partyId) {
      const party = parties.find(p => p.id === payment.partyId);
      if (party) syncMutation('parties', party).catch(() => {});
    }
  };

  // Handle Save Expense
  const handleSaveExpense = async (expense: Expense) => {
    await saveExpenseTransaction(expense);
    await loadDatabaseData();
    syncMutation('expenses', expense).catch(() => {});
  };

  // Handle Delete Expense
  const handleDeleteExpense = async (id: string) => {
    await deleteFromStore('expenses', id);
    await loadDatabaseData();
    syncMutation('expenses', { id }, 'DELETE').catch(() => {});
  };

  // Handle Update Shop Settings
  const handleSaveCompany = async (updatedCompany: CompanyProfile) => {
    await putToStore('company', { id: 'primary', ...updatedCompany });
    setCompany(updatedCompany);
  };

  // Handle direct navigation from Invoice Register to Customer Ledger (Requirement 3)
  const handleSelectPartyFromInvoice = (partyId: string, partyName: string) => {
    const party = parties.find(
      p => p.id === partyId || p.name.trim().toLowerCase() === partyName.trim().toLowerCase()
    );
    if (party) {
      setSelectedPartyIdForLedger(party.id);
    } else {
      setSelectedPartyIdForLedger(partyId || partyName);
    }
    setActiveTab('PARTIES');
  };

  // Count low stock items for badge
  const lowStockCount = items.filter(i => i.currentStock <= i.lowStockThreshold).length;

  if (isLoading || isValidatingAuth) {
    return (
      <div className="h-screen w-screen bg-slate-900 flex flex-col items-center justify-center text-white space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center font-black text-2xl animate-pulse shadow-lg">
          ₹
        </div>
        <div className="text-base font-bold tracking-tight">Vyapar Pro Cloud PWA</div>
        <div className="text-xs text-slate-400">सुरक्षा व डेटाबेस लोड हो रहा है...</div>
      </div>
    );
  }

  // If not logged in, enforce Single Admin Login Screen
  if (!adminSession) {
    return (
      <AdminLoginScreen
        onLoginSuccess={() => {
          setAdminSession(getStoredSession());
          setSessionTerminatedReason(null);
        }}
        sessionTerminatedReason={sessionTerminatedReason}
      />
    );
  }

  // If currently viewing a printable invoice/thermal slip
  if (viewingInvoice) {
    if (viewingFormat === 'thermal') {
      return (
        <ThermalReceiptTemplate
          invoice={viewingInvoice}
          company={company}
          onBack={() => setViewingInvoice(null)}
        />
      );
    }
    return (
      <A4InvoiceTemplate
        invoice={viewingInvoice}
        company={company}
        onBack={() => setViewingInvoice(null)}
      />
    );
  }

  // If creating an invoice from the manual document editor
  if (isCreatingInvoice) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        <Header
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setIsCreatingInvoice(false);
            setActiveTab(tab);
          }}
          posMode={posMode}
          onTogglePosMode={() => setPosMode(posMode === 'DESKTOP' ? 'MOBILE' : 'DESKTOP')}
          isOnline={isOnline}
          pendingSyncCount={pendingSyncCount}
          isSyncing={isSyncing}
          onTriggerSync={triggerSync}
          company={company}
          onOpenPaymentIn={() => setIsGlobalPaymentInOpen(true)}
          adminUsername={adminSession?.username}
          onLogout={handleLogout}
        />
        <InvoiceForm
          initialType={newInvoiceDocType}
          parties={parties}
          items={items}
          company={company}
          onSave={async (inv) => {
            const saved = await handleSaveInvoice(inv);
            setIsCreatingInvoice(false);
            setViewingInvoice(saved);
            setViewingFormat('a4');
            return saved;
          }}
          onCancel={() => setIsCreatingInvoice(false)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Top Header Bar */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        posMode={posMode}
        onTogglePosMode={() => setPosMode(posMode === 'DESKTOP' ? 'MOBILE' : 'DESKTOP')}
        isOnline={isOnline}
        pendingSyncCount={pendingSyncCount}
        isSyncing={isSyncing}
        onTriggerSync={triggerSync}
        company={company}
        onOpenPaymentIn={() => setIsGlobalPaymentInOpen(true)}
        adminUsername={adminSession?.username}
        onLogout={handleLogout}
      />

      {/* Main Viewport Content (pb-20 so mobile bottom navigation bar never covers content) */}
      <main className="flex-1 overflow-x-hidden pb-20 md:pb-6">
        {activeTab === 'POS' && (
          <VyaparPOSView
            items={items}
            parties={parties}
            company={company}
            invoices={invoices}
            onSaveInvoice={handleSaveInvoice}
            onSaveParty={handleSaveParty}
            onSaveItem={handleSaveItem}
            onOpenPaymentIn={() => setIsGlobalPaymentInOpen(true)}
            onViewInvoice={(inv, fmt) => {
              setViewingInvoice(inv);
              setViewingFormat(fmt);
            }}
          />
        )}

        {activeTab === 'PURCHASES' && (
          <PurchasesAndVendors
            parties={parties}
            items={items}
            invoices={invoices}
            payments={payments}
            company={company}
            onSaveInvoice={handleSaveInvoice}
            onSaveParty={handleSaveParty}
            onSaveItem={handleSaveItem}
            onRecordPayment={handleRecordPayment}
            onViewInvoice={(inv, fmt) => {
              setViewingInvoice(inv);
              setViewingFormat(fmt);
            }}
          />
        )}

        {activeTab === 'INVOICES' && (
          <InvoiceList
            invoices={invoices}
            company={company}
            onViewInvoice={(inv, fmt) => {
              setViewingInvoice(inv);
              setViewingFormat(fmt);
            }}
            onNewInvoice={(type = 'SALES_INVOICE') => {
              setNewInvoiceDocType(type);
              setIsCreatingInvoice(true);
            }}
            onSelectParty={handleSelectPartyFromInvoice}
          />
        )}

        {activeTab === 'INVENTORY' && (
          <InventoryMaster
            items={items}
            onSaveItem={handleSaveItem}
          />
        )}

        {activeTab === 'PARTIES' && (
          <PartiesLedger
            parties={parties}
            invoices={invoices}
            payments={payments}
            company={company}
            onSaveParty={handleSaveParty}
            onRecordPayment={handleRecordPayment}
            onViewInvoice={(inv, fmt) => {
              setViewingInvoice(inv);
              setViewingFormat(fmt);
            }}
            initialPartyId={selectedPartyIdForLedger}
            onClearInitialParty={() => setSelectedPartyIdForLedger(null)}
          />
        )}

        {activeTab === 'EXPENSES' && (
          <ExpenseManagement
            expenses={expenses}
            company={company}
            onSaveExpense={handleSaveExpense}
            onDeleteExpense={handleDeleteExpense}
          />
        )}

        {activeTab === 'REPORTS' && (
          <GSTReportsView
            invoices={invoices}
            expenses={expenses}
            payments={payments}
            items={items}
            parties={parties}
            company={company}
          />
        )}

        {activeTab === 'SETTINGS' && (
          <ShopProfileSettings
            company={company}
            onSaveCompany={handleSaveCompany}
            onBackToBilling={() => setActiveTab('POS')}
            adminUsername={adminSession?.username}
            onDataReloaded={loadDatabaseData}
          />
        )}

        {activeTab === 'ARCHITECTURE' && (
          <ArchitectureViewer />
        )}
      </main>

      {/* Mobile Sticky Bottom Navigation Bar with 4 main sections */}
      <BottomNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        lowStockCount={lowStockCount}
      />

      {/* Global Quick Payment In Modal */}
      <PaymentInModal
        isOpen={isGlobalPaymentInOpen}
        onClose={() => setIsGlobalPaymentInOpen(false)}
        parties={parties}
        company={company}
        onRecordPayment={handleRecordPayment}
      />

      {/* Daily Auto-Backup Floating Notification */}
      {autoBackupNotice && (
        <div className="fixed top-16 right-4 z-50 max-w-sm bg-emerald-800 text-white text-xs px-4 py-3 rounded-2xl shadow-2xl border border-emerald-500/40 flex items-center justify-between gap-3 animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
            <span className="font-semibold leading-tight">{autoBackupNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setAutoBackupNotice(null)}
            className="text-emerald-300 hover:text-white font-bold text-sm shrink-0 ml-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Offline Status Floating Banner */}
      <OfflineBanner
        isOnline={isOnline}
        pendingSyncCount={pendingSyncCount}
      />
    </div>
  );
}
