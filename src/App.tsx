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
  getDB, getAllFromStore, putToStore, createInvoiceTransaction, 
  recordPaymentTransaction 
} from './db/indexedDB';
import { DEFAULT_COMPANY } from './db/defaultData';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { Header, MainTab } from './components/common/Header';
import { BottomNav } from './components/common/BottomNav';
import { OfflineBanner } from './components/common/OfflineBanner';
import { DesktopPOS } from './components/pos/DesktopPOS';
import { MobilePOS } from './components/pos/MobilePOS';
import { InvoiceList } from './components/invoices/InvoiceList';
import { InvoiceForm } from './components/invoices/InvoiceForm';
import { A4InvoiceTemplate } from './components/invoices/A4InvoiceTemplate';
import { ThermalReceiptTemplate } from './components/invoices/ThermalReceiptTemplate';
import { InventoryMaster } from './components/inventory/InventoryMaster';
import { PartiesLedger } from './components/parties/PartiesLedger';
import { PaymentInModal } from './components/parties/PaymentInModal';
import { GSTReportsView } from './components/reports/GSTReportsView';
import { ShopProfileSettings } from './components/settings/ShopProfileSettings';
import { ArchitectureViewer } from './components/architecture/ArchitectureViewer';
import confetti from 'canvas-confetti';

export default function App() {
  const [activeTab, setActiveTab] = useState<MainTab>('POS');
  const [posMode, setPosMode] = useState<'DESKTOP' | 'MOBILE'>('DESKTOP');
  
  // Active Invoice View / Print state
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [viewingFormat, setViewingFormat] = useState<'a4' | 'thermal'>('a4');
  const [isCreatingInvoice, setIsCreatingInvoice] = useState<boolean>(false);
  const [newInvoiceDocType, setNewInvoiceDocType] = useState<DocumentType>('SALES_INVOICE');

  // Quick Payment In Modal
  const [isGlobalPaymentInOpen, setIsGlobalPaymentInOpen] = useState<boolean>(false);

  // Core Data Stores from IndexedDB
  const [company, setCompany] = useState<CompanyProfile>(DEFAULT_COMPANY);
  const [items, setItems] = useState<Item[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Online / Offline Connectivity & Sync
  const { 
    isOnline, 
    pendingSyncCount, 
    isSyncing, 
    triggerSync, 
    refreshSyncCount 
  } = useOnlineStatus();

  // Load Database Data on Mount
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
    } catch (err) {
      console.error('Failed to load local IndexedDB data', err);
    } finally {
      setIsLoading(false);
    }
  }, [refreshSyncCount]);

  useEffect(() => {
    loadDatabaseData();
  }, [loadDatabaseData]);

  // Handle Save Invoice (From POS or InvoiceForm)
  const handleSaveInvoice = async (
    invoice: Invoice, 
    printImmediate: boolean = false, 
    printFormat: 'thermal' | 'a4' = 'thermal'
  ): Promise<Invoice> => {
    const saved = await createInvoiceTransaction(invoice, isOnline);
    await loadDatabaseData();

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

    return saved;
  };

  // Handle Save / Update Product Item
  const handleSaveItem = async (item: Item) => {
    await putToStore('items', item);
    await loadDatabaseData();
  };

  // Handle Save / Update Party
  const handleSaveParty = async (party: Party) => {
    await putToStore('parties', party);
    await loadDatabaseData();
  };

  // Handle Record Payment
  const handleRecordPayment = async (payment: PaymentTransaction) => {
    await recordPaymentTransaction(payment);
    await loadDatabaseData();
  };

  // Handle Update Shop Settings
  const handleSaveCompany = async (updatedCompany: CompanyProfile) => {
    await putToStore('company', { id: 'primary', ...updatedCompany });
    setCompany(updatedCompany);
  };

  // Count low stock items for badge
  const lowStockCount = items.filter(i => i.currentStock <= i.lowStockThreshold).length;

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-slate-900 flex flex-col items-center justify-center text-white space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center font-black text-2xl animate-pulse">
          ₹
        </div>
        <div className="text-sm font-bold tracking-tight">Vyapar Pro Cloud PWA</div>
        <div className="text-xs text-slate-400">IndexedDB डेटाबेस और बिलिंग इंजन लोड हो रहा है...</div>
      </div>
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
      />

      {/* Main Viewport Content (pb-20 so mobile bottom navigation bar never covers content) */}
      <main className="flex-1 overflow-x-hidden pb-20 md:pb-6">
        {activeTab === 'POS' && (
          posMode === 'DESKTOP' ? (
            <DesktopPOS
              items={items}
              parties={parties}
              company={company}
              onSaveInvoice={handleSaveInvoice}
              onOpenPartyModal={() => setActiveTab('PARTIES')}
              onOpenPaymentIn={() => setIsGlobalPaymentInOpen(true)}
            />
          ) : (
            <MobilePOS
              items={items}
              parties={parties}
              company={company}
              onSaveInvoice={handleSaveInvoice}
            />
          )
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
            company={company}
            onSaveParty={handleSaveParty}
            onRecordPayment={handleRecordPayment}
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
          />
        )}

        {activeTab === 'ARCHITECTURE' && (
          <ArchitectureViewer />
        )}
      </main>

      {/* Mobile Sticky Bottom Navigation Bar */}
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

      {/* Offline Status Floating Banner */}
      <OfflineBanner
        isOnline={isOnline}
        pendingSyncCount={pendingSyncCount}
      />
    </div>
  );
}
