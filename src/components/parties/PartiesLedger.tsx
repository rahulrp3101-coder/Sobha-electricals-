import React, { useState, useMemo } from 'react';
import { 
  Party, CompanyProfile, PaymentMode, PaymentTransaction, 
  Invoice, InvoiceItem, DocumentType 
} from '../../types';
import { formatINR, INDIAN_STATES } from '../../services/gstCalculator';
import { 
  Users, Search, Plus, Phone, Mail, Share2, 
  ArrowDownLeft, ArrowUpRight, DollarSign, X, Check, CreditCard, AlertCircle,
  ArrowLeft, Eye, ChevronDown, ChevronUp, Printer, FileText, ShoppingBag,
  Calendar, CheckCircle2, Building2, MapPin, QrCode, Smartphone, ExternalLink
} from 'lucide-react';
import { 
  generateWhatsAppKhataReminderURL, 
  generateWhatsAppCustomerLedgerURL,
  generateWhatsAppInvoiceURL
} from '../../services/whatsappShare';
import { PaymentInModal } from './PaymentInModal';
import { DynamicUpiQrModal } from '../pos/DynamicUpiQrModal';

interface PartiesLedgerProps {
  parties: Party[];
  invoices?: Invoice[];
  payments?: PaymentTransaction[];
  company: CompanyProfile;
  onSaveParty: (party: Party) => Promise<void>;
  onRecordPayment: (payment: PaymentTransaction) => Promise<void>;
  onViewInvoice?: (invoice: Invoice, format: 'thermal' | 'a4') => void;
  initialPartyId?: string | null;
  onClearInitialParty?: () => void;
}

interface StatementEntry {
  id: string;
  date: string;
  type: 'OPENING' | 'INVOICE' | 'PAYMENT' | 'RETURN';
  title: string;
  documentNumber?: string;
  paymentMode?: PaymentMode;
  notes?: string;
  debit: number; // Goods value / Amount due added
  credit: number; // Amount paid / Credit given
  runningBalance: number;
  invoiceStatus?: 'PAID' | 'PARTIAL' | 'UNPAID' | 'CANCELLED';
  rawInvoice?: Invoice;
  rawPayment?: PaymentTransaction;
  items?: InvoiceItem[];
}

export const PartiesLedger: React.FC<PartiesLedgerProps> = ({
  parties,
  invoices = [],
  payments = [],
  company,
  onSaveParty,
  onRecordPayment,
  onViewInvoice,
  initialPartyId,
  onClearInitialParty,
}) => {
  const [partyTypeFilter, setPartyTypeFilter] = useState<'ALL' | 'CUSTOMER' | 'SUPPLIER'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);

  // Sync with initialPartyId if passed from Invoices Register
  React.useEffect(() => {
    if (initialPartyId) {
      const match = parties.find(
        p => p.id === initialPartyId || 
        p.name.trim().toLowerCase() === initialPartyId.trim().toLowerCase()
      );
      if (match) {
        setSelectedParty(match);
      }
    }
  }, [initialPartyId, parties]);

  // Expanded items for statement rows
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Modals
  const [isPartyModalOpen, setIsPartyModalOpen] = useState(false);
  const [isPaymentInModalOpen, setIsPaymentInModalOpen] = useState(false);
  const [paymentInPartyId, setPaymentInPartyId] = useState<string | undefined>(undefined);

  // Supplier Payment Out Modal
  const [isPaymentOutModalOpen, setIsPaymentOutModalOpen] = useState(false);
  const [paymentOutAmount, setPaymentOutAmount] = useState<number | ''>('');
  const [paymentOutMode, setPaymentOutMode] = useState<PaymentMode>('CASH');
  const [paymentOutRef, setPaymentOutRef] = useState('');
  const [paymentOutNotes, setPaymentOutNotes] = useState('');
  const [isSavingPaymentOut, setIsSavingPaymentOut] = useState(false);

  // Instant UPI QR Code Modal for pending dues
  const [isUpiQrModalOpen, setIsUpiQrModalOpen] = useState(false);
  const [upiModalAmount, setUpiModalAmount] = useState(0);

  // Invoice Preview / Print Modal
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);

  // New Party Form State
  const [name, setName] = useState('');
  const [type, setType] = useState<'CUSTOMER' | 'SUPPLIER'>('CUSTOMER');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [stateCode, setStateCode] = useState(company.stateCode || '27');
  const [address, setAddress] = useState('');
  const [creditLimit, setCreditLimit] = useState(25000);
  const [openingBalance, setOpeningBalance] = useState(0);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Sync selectedParty with latest data from parties list
  const activeParty = useMemo(() => {
    if (!selectedParty) return null;
    return parties.find(p => p.id === selectedParty.id) || selectedParty;
  }, [selectedParty, parties]);

  const filteredParties = useMemo(() => {
    return parties.filter(p => {
      const matchesType = partyTypeFilter === 'ALL' || p.type === partyTypeFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = 
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.phone.includes(q) ||
        (p.gstin && p.gstin.toLowerCase().includes(q));
      return matchesType && matchesSearch;
    });
  }, [parties, partyTypeFilter, searchQuery]);

  const totalReceivables = useMemo(() => {
    return parties
      .filter(p => p.currentBalance > 0)
      .reduce((s, p) => s + p.currentBalance, 0);
  }, [parties]);

  const totalPayables = useMemo(() => {
    return parties
      .filter(p => p.currentBalance < 0)
      .reduce((s, p) => s + Math.abs(p.currentBalance), 0);
  }, [parties]);

  // --------------------------------------------------------------------------
  // UNIFIED RUNNING LEDGER COMPUTATION (Customers & Suppliers - Requirement 2 & 4)
  // --------------------------------------------------------------------------
  const { ledgerEntries, summaryStats } = useMemo(() => {
    if (!activeParty) {
      return { 
        ledgerEntries: [], 
        summaryStats: { totalPurchases: 0, totalPaid: 0, netBalance: 0, isSupplier: false } 
      };
    }

    const isSupplier = activeParty.type === 'SUPPLIER';

    // Comprehensive matching: by partyId, partyName, or partyPhone
    const partyInvoices = invoices.filter(inv => {
      if (inv.partyId && activeParty.id && inv.partyId === activeParty.id) return true;
      if (inv.partyName && activeParty.name && inv.partyName.trim().toLowerCase() === activeParty.name.trim().toLowerCase()) return true;
      if (inv.partyPhone && activeParty.phone && inv.partyPhone.replace(/\D/g, '') === activeParty.phone.replace(/\D/g, '')) return true;
      return false;
    });

    const partyPayments = payments.filter(pmt => {
      if (pmt.partyId && activeParty.id && pmt.partyId === activeParty.id) return true;
      if (pmt.partyName && activeParty.name && pmt.partyName.trim().toLowerCase() === activeParty.name.trim().toLowerCase()) return true;
      return false;
    });

    type RawEvent = 
      | { kind: 'INVOICE'; date: string; timestamp: number; inv: Invoice }
      | { kind: 'PAYMENT'; date: string; timestamp: number; pmt: PaymentTransaction };

    const events: RawEvent[] = [];

    partyInvoices.forEach(inv => {
      const ts = inv.createdAt ? new Date(inv.createdAt).getTime() : new Date(inv.date).getTime();
      events.push({ kind: 'INVOICE', date: inv.date, timestamp: ts, inv });
    });

    partyPayments.forEach(pmt => {
      const ts = pmt.createdAt ? new Date(pmt.createdAt).getTime() : new Date(pmt.date).getTime();
      events.push({ kind: 'PAYMENT', date: pmt.date, timestamp: ts, pmt });
    });

    // Chronological order: oldest to newest
    events.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return a.timestamp - b.timestamp;
    });

    // Calculate net impact of all recorded events
    let transactionsNet = 0;
    events.forEach(ev => {
      if (ev.kind === 'INVOICE') {
        const inv = ev.inv;
        const isSales = inv.documentType === 'SALES_INVOICE' || (!inv.documentType && !isSupplier);
        const isPurchase = inv.documentType === 'PURCHASE_BILL' || (isSupplier && !inv.documentType);
        const isCreditNote = inv.documentType === 'CREDIT_NOTE';
        const isDebitNote = inv.documentType === 'DEBIT_NOTE';

        if (isSales || isPurchase) {
          transactionsNet += (inv.grandTotal - (inv.receivedAmount || 0));
        } else if (isCreditNote || isDebitNote) {
          transactionsNet -= inv.grandTotal;
        }
      } else if (ev.kind === 'PAYMENT') {
        transactionsNet -= ev.pmt.amount;
      }
    });

    // Exact Opening Balance Determination (Requirement 1):
    // If openingBalance is explicitly defined on the party, use it.
    // Otherwise, if the party has a currentBalance (e.g. Sharma Kirana ₹12,450),
    // calculate the exact opening balance that reconciles to currentBalance!
    let startBalance = 0;
    if (activeParty.openingBalance !== undefined && activeParty.openingBalance !== null && activeParty.openingBalance !== 0) {
      startBalance = activeParty.openingBalance;
    } else if (activeParty.currentBalance !== undefined && activeParty.currentBalance !== 0) {
      const targetBalance = isSupplier ? Math.abs(activeParty.currentBalance) : activeParty.currentBalance;
      startBalance = targetBalance - transactionsNet;
    }

    let runningBalance = 0;
    let totalPurchases = 0;
    let totalPaid = 0;

    const entries: StatementEntry[] = [];

    // Line 1: Opening Balance if non-zero (Requirement 1)
    if (startBalance !== 0) {
      runningBalance = startBalance;
      if (startBalance > 0) {
        totalPurchases += startBalance;
      } else {
        totalPaid += Math.abs(startBalance);
      }

      entries.push({
        id: `open-${activeParty.id}`,
        date: activeParty.createdAt ? activeParty.createdAt.split('T')[0] : '2026-09-01',
        type: 'OPENING',
        title: isSupplier 
          ? 'Opening Payable Balance (शुरुआती पिछला बकाया)' 
          : 'Opening Khata Balance (शुरुआती पिछला बकाया)',
        debit: startBalance > 0 ? startBalance : 0,
        credit: startBalance < 0 ? Math.abs(startBalance) : 0,
        runningBalance,
      });
    }

    events.forEach(ev => {
      if (ev.kind === 'INVOICE') {
        const inv = ev.inv;
        const isSales = inv.documentType === 'SALES_INVOICE' || (!inv.documentType && !isSupplier);
        const isPurchase = inv.documentType === 'PURCHASE_BILL' || (isSupplier && !inv.documentType);
        const isCreditNote = inv.documentType === 'CREDIT_NOTE'; // Sales Return
        const isDebitNote = inv.documentType === 'DEBIT_NOTE'; // Purchase Return

        if (isSales) {
          totalPurchases += inv.grandTotal;
          totalPaid += (inv.receivedAmount || 0);

          const debit = inv.grandTotal; // Goods taken
          const credit = inv.receivedAmount || 0; // Paid on spot
          const net = debit - credit;
          runningBalance += net;

          entries.push({
            id: inv.id,
            date: inv.date,
            type: 'INVOICE',
            title: `Invoice #${inv.invoiceNumber} (सामान ले गए)`,
            documentNumber: inv.invoiceNumber,
            paymentMode: inv.paymentMode,
            notes: inv.notes,
            debit,
            credit,
            runningBalance,
            invoiceStatus: inv.status,
            rawInvoice: inv,
            items: inv.items,
          });
        } else if (isPurchase) {
          // Supplier Purchase Bill: We bought goods from vendor
          totalPurchases += inv.grandTotal;
          totalPaid += (inv.receivedAmount || 0);

          const debit = inv.grandTotal; // Goods value
          const credit = inv.receivedAmount || 0; // Paid on spot
          const net = debit - credit;
          runningBalance += net; // Positive = We owe the vendor (Payable)

          entries.push({
            id: inv.id,
            date: inv.date,
            type: 'INVOICE',
            title: `Purchase Bill #${inv.invoiceNumber} (माल खरीदा)`,
            documentNumber: inv.invoiceNumber,
            paymentMode: inv.paymentMode,
            notes: inv.notes,
            debit,
            credit,
            runningBalance,
            invoiceStatus: inv.status,
            rawInvoice: inv,
            items: inv.items,
          });
        } else if (isCreditNote) {
          // Sales Return: Customer returns goods -> credit reduces receivable
          const credit = inv.grandTotal;
          runningBalance = runningBalance - credit;

          entries.push({
            id: inv.id,
            date: inv.date,
            type: 'RETURN',
            title: `Sales Return #${inv.invoiceNumber} (ग्राहक माल वापसी)`,
            documentNumber: inv.invoiceNumber,
            notes: inv.notes,
            debit: 0,
            credit,
            runningBalance,
            rawInvoice: inv,
            items: inv.items,
          });
        } else if (isDebitNote) {
          // Purchase Return: We returned goods to supplier -> credit reduces payable
          const credit = inv.grandTotal;
          runningBalance = runningBalance - credit;

          entries.push({
            id: inv.id,
            date: inv.date,
            type: 'RETURN',
            title: `Purchase Return #${inv.invoiceNumber} (सप्लायर को माल वापसी)`,
            documentNumber: inv.invoiceNumber,
            notes: inv.notes,
            debit: 0,
            credit,
            runningBalance,
            rawInvoice: inv,
            items: inv.items,
          });
        }
      } else if (ev.kind === 'PAYMENT') {
        const pmt = ev.pmt;
        if (pmt.type === 'PAYMENT_IN') {
          // Received money from customer -> balance decreases
          totalPaid += pmt.amount;
          runningBalance = runningBalance - pmt.amount;

          entries.push({
            id: pmt.id,
            date: pmt.date,
            type: 'PAYMENT',
            title: `Payment In #${pmt.receiptNumber || 'REC'} (जमा किए - ${pmt.paymentMode})`,
            documentNumber: pmt.receiptNumber,
            paymentMode: pmt.paymentMode,
            notes: pmt.notes || pmt.referenceNo,
            debit: 0,
            credit: pmt.amount,
            runningBalance,
            rawPayment: pmt,
          });
        } else if (pmt.type === 'PAYMENT_OUT') {
          // Paid money to supplier -> balance payable decreases
          totalPaid += pmt.amount;
          runningBalance = runningBalance - pmt.amount;

          entries.push({
            id: pmt.id,
            date: pmt.date,
            type: 'PAYMENT',
            title: `Payment Out #${pmt.receiptNumber || 'VOUCHER'} (पैसा दिया - ${pmt.paymentMode})`,
            documentNumber: pmt.receiptNumber,
            paymentMode: pmt.paymentMode,
            notes: pmt.notes || pmt.referenceNo,
            debit: 0,
            credit: pmt.amount,
            runningBalance,
            rawPayment: pmt,
          });
        }
      }
    });

    const netBalance = runningBalance;

    return {
      ledgerEntries: entries,
      summaryStats: {
        totalPurchases,
        totalPaid,
        netBalance,
        isSupplier,
      },
    };
  }, [activeParty, invoices, payments]);

  const handleCreateParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newParty: Party = {
      id: `pty-${Date.now()}`,
      name: name.trim(),
      type,
      phone: phone.trim(),
      email: email.trim() || undefined,
      gstin: gstin ? gstin.trim().toUpperCase() : undefined,
      state: INDIAN_STATES[stateCode] || company.state,
      stateCode,
      address: address.trim(),
      creditLimit: Number(creditLimit) || 25000,
      currentBalance: Number(openingBalance) || 0,
      openingBalance: Number(openingBalance) || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await onSaveParty(newParty);
    showToast(`Party added: ${newParty.name}`);
    setIsPartyModalOpen(false);
  };

  const openPaymentInForParty = (partyId?: string) => {
    setPaymentInPartyId(partyId);
    setIsPaymentInModalOpen(true);
  };

  const handleOpenInstantUpiQr = () => {
    if (!activeParty) return;
    const amount = summaryStats.netBalance > 0 ? summaryStats.netBalance : 1000;
    setUpiModalAmount(amount);
    setIsUpiQrModalOpen(true);
  };

  const handleSavePaymentOut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeParty || !paymentOutAmount || Number(paymentOutAmount) <= 0) return;

    setIsSavingPaymentOut(true);
    try {
      const payment: PaymentTransaction = {
        id: `pay-out-${Date.now()}`,
        receiptNumber: `VOUCHER-${String(Date.now()).slice(-5)}`,
        partyId: activeParty.id,
        partyName: activeParty.name,
        amount: Number(paymentOutAmount),
        paymentMode: paymentOutMode,
        type: 'PAYMENT_OUT',
        date: new Date().toISOString().split('T')[0],
        referenceNo: paymentOutRef.trim() || undefined,
        notes: paymentOutNotes.trim() || undefined,
        createdAt: new Date().toISOString(),
      };

      await onRecordPayment(payment);
      showToast(`Payment Out of ${formatINR(Number(paymentOutAmount))} recorded for ${activeParty.name}`);
      setIsPaymentOutModalOpen(false);
      setPaymentOutAmount('');
      setPaymentOutRef('');
      setPaymentOutNotes('');
    } catch (err: any) {
      console.error('Payment out error:', err);
      showToast('भुगतान सेव करने में त्रुटि: ' + err.message);
    } finally {
      setIsSavingPaymentOut(false);
    }
  };

  const toggleRowExpanded = (id: string) => {
    setExpandedRowId(prev => (prev === id ? null : id));
  };

  // WhatsApp Statement URL Generator (Requirement 3)
  const whatsAppStatementUrl = useMemo(() => {
    if (!activeParty) return '';
    return generateWhatsAppCustomerLedgerURL(activeParty, company, {
      totalPurchases: summaryStats.totalPurchases,
      totalPaid: summaryStats.totalPaid,
      netBalance: summaryStats.netBalance,
      entries: ledgerEntries.map(e => ({
        date: e.date,
        title: e.title,
        debit: e.debit,
        credit: e.credit,
        balance: e.runningBalance,
        itemsSummary: e.items && e.items.length > 0 
          ? e.items.map(i => `${i.itemName} (x${i.quantity})`).join(', ')
          : undefined,
      })),
    });
  }, [activeParty, company, summaryStats, ledgerEntries]);

  // --------------------------------------------------------------------------
  // VIEW 1: SINGLE CUSTOMER / SUPPLIER DETAILED STATEMENT & LEDGER (Requirement 2, 3, 4)
  // --------------------------------------------------------------------------
  if (activeParty) {
    const isSupplier = activeParty.type === 'SUPPLIER';

    return (
      <div className="p-3 sm:p-6 space-y-4 max-w-7xl mx-auto pb-24 lg:pb-12 animate-in fade-in">
        {/* Toast Alert */}
        {toastMessage && (
          <div className="fixed top-20 right-4 z-50 bg-slate-900 text-white border border-slate-700 px-4 py-2.5 rounded-2xl shadow-xl text-xs sm:text-sm font-bold flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Back and Action Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                setSelectedParty(null);
                onClearInitialParty?.();
              }}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 transition flex items-center gap-1.5 font-bold text-xs active:scale-95 shadow-2xs"
              title="Back to Parties List"
            >
              <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
              <span>← Back to Parties List (पार्टी सूची)</span>
            </button>
            <span className="text-slate-300">|</span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-slate-900 truncate">
                  {activeParty.name}
                </h2>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  isSupplier 
                    ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}>
                  {isSupplier ? 'Supplier / Vendor (व्यापारी/सप्लायर)' : 'Customer (ग्राहक)'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500 mt-0.5 font-mono">
                {activeParty.phone && <span>📱 {activeParty.phone}</span>}
                {activeParty.address && <span className="font-sans">📍 {activeParty.address}</span>}
                {activeParty.gstin && <span>GSTIN: {activeParty.gstin}</span>}
              </div>
            </div>
          </div>

          {/* Statement Actions */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {/* If Customer: Dynamic UPI QR button for instant dues settlement */}
            {!isSupplier && (
              <button
                type="button"
                onClick={handleOpenInstantUpiQr}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 rounded-xl text-xs font-bold transition active:scale-95 shadow-2xs"
                title="Generate Dynamic UPI QR for instant payment"
              >
                <QrCode className="w-4 h-4 text-blue-600" />
                <span>📱 UPI QR Code (तुरंत QR से पेमेंट लें)</span>
              </button>
            )}

            {/* Record Payment Button */}
            {!isSupplier ? (
              <button
                onClick={() => openPaymentInForParty(activeParty.id)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs active:scale-95"
              >
                <ArrowDownLeft className="w-4 h-4 stroke-[2.5]" />
                <span>+ Payment In (पैसे जमा करें)</span>
              </button>
            ) : (
              <button
                onClick={() => setIsPaymentOutModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs active:scale-95"
              >
                <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
                <span>+ Payment Out (पैसा दिया)</span>
              </button>
            )}

            {/* Share on WhatsApp Button (Requirement 3) */}
            <a
              href={whatsAppStatementUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition shadow-2xs active:scale-95"
              title="Share Ledger Statement on WhatsApp"
            >
              <Share2 className="w-4 h-4 text-emerald-600" />
              <span>Share on WhatsApp</span>
            </a>

            {/* Print Statement Button */}
            <button
              onClick={() => window.print()}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1"
              title="Print Account Statement"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Print (प्रिंट)</span>
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* STATEMENT HEADER SUMMARY (3 CLEAN CARDS - REQUIREMENT 3 & 4) */}
        {/* ------------------------------------------------------------- */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Card 1: Total Purchases / Billing */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {isSupplier ? 'Total Purchases (कुल खरीद)' : 'Total Purchases (कुल बिक्री)'}
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 mt-1">
                {formatINR(summaryStats.totalPurchases)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {isSupplier ? 'सप्लायर से खरीदे गए सामान की कुल कीमत' : 'ग्राहक द्वारा खरीदे गए सामान की कुल बिलिंग'}
              </div>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-200">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>

          {/* Card 2: Total Paid / Received */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
                {isSupplier ? 'Total Paid to Vendor (कुल दिया भुगतान)' : 'Total Paid / Received (कुल प्राप्त राशि)'}
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono text-emerald-700 mt-1">
                {formatINR(summaryStats.totalPaid)}
              </div>
              <div className="text-[10px] text-emerald-600 mt-0.5">
                {isSupplier ? 'सप्लायर को दी गई कुल रकम (Cash/Bank)' : 'मौके पर भुगतान + बाद में जमा की गई रकम'}
              </div>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          {/* Card 3: Current Net Balance */}
          <div className={`border rounded-2xl p-4 sm:p-5 shadow-2xs flex items-center justify-between ${
            summaryStats.netBalance > 0
              ? 'bg-amber-50/70 border-amber-300'
              : 'bg-emerald-50/70 border-emerald-200'
          }`}>
            <div>
              <div className={`text-[11px] font-bold uppercase tracking-wider ${
                summaryStats.netBalance > 0 ? 'text-amber-800' : 'text-emerald-800'
              }`}>
                {isSupplier ? 'Current Net Payable (देना बाकी)' : 'Current Net Balance (लेना बाकी)'}
              </div>
              <div className={`text-xl sm:text-2xl font-black font-mono mt-1 ${
                summaryStats.netBalance > 0 ? 'text-amber-950' : 'text-emerald-900'
              }`}>
                {formatINR(summaryStats.netBalance)}
              </div>
              <div className={`text-[10px] font-semibold mt-0.5 ${
                summaryStats.netBalance > 0 ? 'text-amber-700' : 'text-emerald-600'
              }`}>
                {summaryStats.netBalance > 0 
                  ? (isSupplier ? 'सप्लायर को देना बाकी है' : 'ग्राहक से लेना बाकी है (Outstanding Due)') 
                  : 'खाता चुकता है (Fully Settled)'}
              </div>
            </div>
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 font-bold ${
              summaryStats.netBalance > 0 ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white'
            }`}>
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* UNIFIED RUNNING LEDGER TABLE (REQUIREMENT 2)                  */}
        {/* ------------------------------------------------------------- */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                Detailed Statement &amp; Running Ledger <span className="text-xs font-normal text-slate-500">(कच्चा-चिट्ठा व रनिंग हिसाब)</span>
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-slate-500 bg-slate-200/80 px-2.5 py-0.5 rounded-full font-mono">
                {ledgerEntries.length} Transactions
              </span>
            </div>
          </div>

          {ledgerEntries.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <FileText className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-600">No transactions recorded yet</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                When bills are created, items purchased, or payments recorded for {activeParty.name}, all items and running balances will appear here in chronological order.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3.5 whitespace-nowrap">Date (तारीख)</th>
                    <th className="py-3 px-3.5">Transaction Type &amp; Details (विवरण)</th>
                    <th className="py-3 px-3.5 text-right whitespace-nowrap">
                      {isSupplier ? 'Bill Amount (खरीद)' : 'Total Bill (बिल राशि)'}
                    </th>
                    <th className="py-3 px-3.5 text-right whitespace-nowrap">
                      {isSupplier ? 'Paid to Vendor (भुगतान)' : 'Paid on Spot (जमा राशि)'}
                    </th>
                    <th className="py-3 px-4 text-right font-black whitespace-nowrap">
                      Running Balance (शुद्ध बकाया)
                    </th>
                    <th className="py-3 px-3.5 text-center whitespace-nowrap">Actions &amp; Print</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledgerEntries.map((entry) => {
                    const isExpanded = expandedRowId === entry.id;
                    const hasItems = entry.items && entry.items.length > 0;

                    return (
                      <React.Fragment key={entry.id}>
                        <tr className={`hover:bg-slate-50/80 transition ${
                          isExpanded ? 'bg-blue-50/40' : ''
                        }`}>
                          {/* Date */}
                          <td className="py-3 px-3.5 font-mono text-slate-600 whitespace-nowrap font-medium">
                            {entry.date}
                          </td>

                          {/* Particulars / Title & Items Preview */}
                          <td className="py-3 px-3.5">
                            <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                              <span>{entry.title}</span>
                              {entry.invoiceStatus && (
                                <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                                  entry.invoiceStatus === 'PAID'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : entry.invoiceStatus === 'PARTIAL'
                                    ? 'bg-amber-100 text-amber-900'
                                    : 'bg-red-100 text-red-800'
                                }`}>
                                  {entry.invoiceStatus}
                                </span>
                              )}
                            </div>

                            {/* Inline Items Summary Chips if items exist (Requirement 2) */}
                            {hasItems && (
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                {entry.items?.slice(0, 3).map((item, idx) => (
                                  <span key={idx} className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-medium">
                                    {item.itemName} (x{item.quantity} @ {formatINR(item.unitPrice)})
                                  </span>
                                ))}
                                {entry.items && entry.items.length > 3 && (
                                  <span className="text-[10px] text-blue-700 font-bold">
                                    +{entry.items.length - 3} more items
                                  </span>
                                )}
                              </div>
                            )}

                            {entry.notes && (
                              <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-sm">
                                {entry.notes}
                              </div>
                            )}
                          </td>

                          {/* Total Bill / Debit */}
                          <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                            {entry.debit > 0 ? (
                              <span className="text-slate-900">{formatINR(entry.debit)}</span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>

                          {/* Paid Amount / Credit */}
                          <td className="py-3 px-3.5 text-right font-mono font-bold whitespace-nowrap">
                            {entry.credit > 0 ? (
                              <span className="text-emerald-700">{formatINR(entry.credit)}</span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>

                          {/* Running Balance */}
                          <td className="py-3 px-4 text-right font-mono font-black text-sm whitespace-nowrap">
                            <span className={entry.runningBalance > 0 ? 'text-amber-800' : 'text-emerald-700'}>
                              {formatINR(entry.runningBalance)}
                            </span>
                          </td>

                          {/* Actions: View Items & View/Print Invoice (Requirement 3) */}
                          <td className="py-3 px-3.5 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              {hasItems && (
                                <button
                                  type="button"
                                  onClick={() => toggleRowExpanded(entry.id)}
                                  className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 border ${
                                    isExpanded
                                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                      : 'bg-slate-50 hover:bg-blue-50 text-blue-700 border-blue-200'
                                  }`}
                                  title="Expand/Collapse item list"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>{isExpanded ? 'Hide' : 'Items'}</span>
                                  <span className={`text-[10px] px-1 rounded-full ${
                                    isExpanded ? 'bg-blue-700 text-white' : 'bg-blue-100 text-blue-800'
                                  }`}>
                                    {entry.items?.length}
                                  </span>
                                </button>
                              )}

                              {entry.rawInvoice && (
                                <button
                                  type="button"
                                  onClick={() => setPreviewInvoice(entry.rawInvoice!)}
                                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1 border border-slate-300 shadow-2xs active:scale-95"
                                  title="View and reprint this invoice"
                                >
                                  <Printer className="w-3.5 h-3.5 text-slate-600" />
                                  <span>View / Print</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expandable Items Details Row (Requirement 2) */}
                        {isExpanded && hasItems && (
                          <tr>
                            <td colSpan={6} className="p-3 bg-blue-50/50 border-y border-blue-200">
                              <div className="bg-white rounded-2xl border border-blue-200 p-3.5 space-y-3 shadow-2xs">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                  <div className="flex items-center gap-2">
                                    <ShoppingBag className="w-4 h-4 text-blue-600" />
                                    <span className="font-extrabold text-xs text-slate-900">
                                      Items in Bill: {entry.documentNumber} ({entry.date})
                                    </span>
                                  </div>

                                  {entry.rawInvoice && (
                                    <div className="flex items-center gap-2">
                                      {onViewInvoice ? (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => onViewInvoice(entry.rawInvoice!, 'thermal')}
                                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition flex items-center gap-1"
                                          >
                                            <Printer className="w-3 h-3" />
                                            <span>Thermal Slip</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => onViewInvoice(entry.rawInvoice!, 'a4')}
                                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1 shadow-2xs"
                                          >
                                            <Printer className="w-3 h-3" />
                                            <span>A4 Invoice</span>
                                          </button>
                                        </>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setPreviewInvoice(entry.rawInvoice!)}
                                          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1 shadow-2xs"
                                        >
                                          <Printer className="w-3 h-3" />
                                          <span>View Bill Details</span>
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Items detailed breakdown table */}
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-xs">
                                    <thead>
                                      <tr className="text-[10px] text-slate-400 border-b border-slate-100 uppercase">
                                        <th className="pb-1.5 font-bold">#</th>
                                        <th className="pb-1.5 font-bold">Item Name (सामान का नाम)</th>
                                        <th className="pb-1.5 text-center font-bold">Qty (मात्रा)</th>
                                        <th className="pb-1.5 text-right font-bold">Rate (दर)</th>
                                        <th className="pb-1.5 text-right font-bold">Tax (GST %)</th>
                                        <th className="pb-1.5 text-right font-bold">Total (कुल योग)</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50 font-medium">
                                      {entry.items?.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                          <td className="py-1.5 text-slate-400 font-mono">{idx + 1}</td>
                                          <td className="py-1.5 text-slate-900 font-bold">{item.itemName}</td>
                                          <td className="py-1.5 text-center font-mono">
                                            {item.quantity} {item.unit}
                                          </td>
                                          <td className="py-1.5 text-right font-mono text-slate-600">
                                            {formatINR(item.unitPrice)}
                                          </td>
                                          <td className="py-1.5 text-right font-mono text-slate-500">
                                            {item.taxRate}%
                                          </td>
                                          <td className="py-1.5 text-right font-mono font-bold text-slate-900">
                                            {formatINR(item.totalAmount)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Dynamic UPI QR Modal for Instant Settle */}
        <DynamicUpiQrModal
          isOpen={isUpiQrModalOpen}
          onClose={() => setIsUpiQrModalOpen(false)}
          upiId={company.upiId}
          shopName={company.name}
          amount={upiModalAmount}
          invoiceNumber={`KHATA-${activeParty.name}`}
          onConfirmPaid={() => {
            setIsUpiQrModalOpen(false);
            openPaymentInForParty(activeParty.id);
          }}
        />

        {/* Payment In Modal Component */}
        <PaymentInModal
          isOpen={isPaymentInModalOpen}
          onClose={() => setIsPaymentInModalOpen(false)}
          parties={parties}
          company={company}
          initialPartyId={paymentInPartyId}
          onRecordPayment={onRecordPayment}
        />

        {/* Supplier Payment Out Modal (Requirement 4) */}
        {isPaymentOutModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-blue-600 text-white">
                <div className="flex items-center gap-2">
                  <ArrowUpRight className="w-5 h-5 text-white" />
                  <div>
                    <h3 className="font-bold text-sm sm:text-base">Payment Out (सप्लायर को भुगतान)</h3>
                    <p className="text-[11px] text-blue-100">{activeParty.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPaymentOutModalOpen(false)}
                  className="p-1 rounded-lg text-blue-200 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSavePaymentOut} className="p-4 sm:p-5 space-y-3.5 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Amount Paid (दी गई रकम ₹) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    autoFocus
                    placeholder="0.00"
                    value={paymentOutAmount}
                    onChange={e => setPaymentOutAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm sm:text-base font-mono font-black text-blue-800 focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                  {summaryStats.netBalance > 0 && (
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Total Due: {formatINR(summaryStats.netBalance)}</span>
                      <button
                        type="button"
                        onClick={() => setPaymentOutAmount(summaryStats.netBalance)}
                        className="text-blue-600 font-bold hover:underline"
                      >
                        Settle Full (पूरा चुकता)
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Payment Mode (माध्यम)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'CASH', label: '💵 Cash' },
                      { id: 'UPI', label: '📱 UPI' },
                      { id: 'BANK_TRANSFER', label: '💳 Bank' },
                    ].map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentOutMode(m.id as any)}
                        className={`py-2 px-2 rounded-xl text-xs font-bold border transition text-center ${
                          paymentOutMode === m.id
                            ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Reference / Cheque / UTR No (वैकल्पिक)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. UTR123456 / Cheque #891"
                    value={paymentOutRef}
                    onChange={e => setPaymentOutRef(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Notes / Remarks (टिप्पणी)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Cleared bill for raw material"
                    value={paymentOutNotes}
                    onChange={e => setPaymentOutNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsPaymentOutModalOpen(false)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition"
                  >
                    Cancel (रद्द करें)
                  </button>

                  <button
                    type="submit"
                    disabled={isSavingPaymentOut || !paymentOutAmount || Number(paymentOutAmount) <= 0}
                    className="flex-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold transition shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isSavingPaymentOut ? 'Saving...' : 'Save Payment Out (भुगतान सेव करें)'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Quick Invoice Details / Print Modal (Requirement 3) */}
        {previewInvoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
            <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200 my-auto">
              <div className="bg-slate-900 p-4 text-white flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base">
                    Invoice #{previewInvoice.invoiceNumber}
                  </h3>
                  <p className="text-[11px] text-slate-300 font-mono">
                    Date: {previewInvoice.date} · {previewInvoice.partyName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewInvoice(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
                {/* Items Table */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">Item</th>
                        <th className="py-2 px-2 text-center">Qty</th>
                        <th className="py-2 px-3 text-right">Rate</th>
                        <th className="py-2 px-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewInvoice.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-bold text-slate-900">{item.itemName}</td>
                          <td className="py-2 px-2 text-center font-mono">{item.quantity} {item.unit}</td>
                          <td className="py-2 px-3 text-right font-mono text-slate-600">{formatINR(item.unitPrice)}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">{formatINR(item.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals Summary */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-1.5 font-medium">
                  <div className="flex justify-between text-slate-600">
                    <span>Taxable Amount:</span>
                    <span className="font-mono">{formatINR(previewInvoice.subTotal)}</span>
                  </div>
                  {previewInvoice.totalTax > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>GST Tax:</span>
                      <span className="font-mono">{formatINR(previewInvoice.totalTax)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-black text-slate-900 pt-1 border-t border-slate-200">
                    <span>Grand Total:</span>
                    <span className="font-mono text-blue-700">{formatINR(previewInvoice.grandTotal)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Received / Paid:</span>
                    <span className="font-mono">{formatINR(previewInvoice.receivedAmount)}</span>
                  </div>
                  {previewInvoice.balanceAmount > 0 && (
                    <div className="flex justify-between text-amber-800 font-bold">
                      <span>Balance Due:</span>
                      <span className="font-mono">{formatINR(previewInvoice.balanceAmount)}</span>
                    </div>
                  )}
                </div>

                {/* Print & Action Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
                  {onViewInvoice ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const inv = previewInvoice;
                          setPreviewInvoice(null);
                          onViewInvoice(inv, 'thermal');
                        }}
                        className="py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <Printer className="w-4 h-4" />
                        <span>Thermal Slip</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const inv = previewInvoice;
                          setPreviewInvoice(null);
                          onViewInvoice(inv, 'a4');
                        }}
                        className="py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <Printer className="w-4 h-4" />
                        <span>A4 Invoice</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Print (प्रिंट)</span>
                    </button>
                  )}

                  <a
                    href={generateWhatsAppInvoiceURL(previewInvoice, company)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs sm:col-span-1 col-span-2"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>WhatsApp Bill</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // VIEW 2: MASTER PARTIES LIST VIEW (ALL CUSTOMERS & SUPPLIERS - REQUIREMENT 1)
  // --------------------------------------------------------------------------
  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-7xl mx-auto pb-24 lg:pb-8">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 bg-slate-900 text-white border border-slate-700 px-4 py-2.5 rounded-2xl shadow-xl text-xs sm:text-sm font-bold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Customer &amp; Supplier Khata <span className="text-xs font-normal text-slate-500">(पार्टी लिस्ट व खाता बही)</span>
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            किसी भी पार्टी के नाम या &apos;खाता देखें&apos; बटन पर क्लिक करके उसका पूरा तारीखवार कच्चा-चिट्ठा व सामान विवरण खोलें।
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Quick Payment In button */}
          <button
            onClick={() => openPaymentInForParty(undefined)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold transition shadow-xs active:scale-98"
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>+ Payment In (पैसे मिले)</span>
          </button>

          {/* Add Party Button */}
          <button
            onClick={() => {
              setName('');
              setPhone('');
              setEmail('');
              setGstin('');
              setStateCode(company.stateCode || '27');
              setAddress('');
              setOpeningBalance(0);
              setIsPartyModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold transition shadow-xs active:scale-98"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Party (नया ग्राहक/सप्लायर)</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Total Receivables / Udhar Given */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1">
              <span>Total Receivables (ग्राहकों से लेना बाकी / उधारी)</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-950 font-mono mt-1">
              {formatINR(totalReceivables)}
            </div>
            <div className="text-[11px] text-amber-700 mt-0.5">
              ग्राहकों से वसूल करने योग्य कुल उधारी राशि
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-amber-600 text-white flex items-center justify-center font-bold shrink-0">
            <ArrowDownLeft className="w-6 h-6" />
          </div>
        </div>

        {/* Total Payables / Supplier Dues */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-xs font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1">
              <span>Total Payables (सप्लायर देनदारी / देना बाकी)</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-blue-950 font-mono mt-1">
              {formatINR(totalPayables)}
            </div>
            <div className="text-[11px] text-blue-700 mt-0.5">
              थोक व्यापारियों व सप्लायर्स को देने योग्य कुल राशि
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold shrink-0">
            <ArrowUpRight className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row gap-2.5 sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search party by name, phone or GSTIN (पार्टी नाम, मोबाइल या GSTIN से खोजें)..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          {[
            { id: 'ALL', label: 'All (सभी पार्टियां)' },
            { id: 'CUSTOMER', label: 'Customers (ग्राहक)' },
            { id: 'SUPPLIER', label: 'Suppliers (सप्लायर)' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setPartyTypeFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg transition ${
                partyTypeFilter === tab.id
                  ? 'bg-white text-slate-900 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Parties List: Interactive Rows with 1-Click Ledger (Requirement 1) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Party Name (पार्टी का नाम)</th>
                <th className="py-3 px-3">Type (प्रकार)</th>
                <th className="py-3 px-3">Phone (मोबाइल)</th>
                <th className="py-3 px-3">State (राज्य)</th>
                <th className="py-3 px-4 text-right">Khata Balance (बकाया)</th>
                <th className="py-3 px-4 text-right">Actions (कार्रवाई)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredParties.map(party => {
                const isReceivable = party.currentBalance > 0;
                const isPayable = party.currentBalance < 0;
                const isSettled = party.currentBalance === 0;

                return (
                  <tr 
                    key={party.id} 
                    onClick={() => setSelectedParty(party)}
                    className="hover:bg-blue-50/70 transition cursor-pointer group"
                    title="Click row to open detailed ledger statement"
                  >
                    <td className="py-3 px-4">
                      <div className="font-extrabold text-slate-900 text-sm group-hover:text-blue-700 transition flex items-center gap-1.5">
                        <span>{party.name}</span>
                        <span className="text-blue-500 opacity-0 group-hover:opacity-100 transition text-[11px] font-medium">
                          → View Ledger
                        </span>
                      </div>
                      {party.gstin && (
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          GSTIN: {party.gstin}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        party.type === 'CUSTOMER' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {party.type === 'CUSTOMER' ? 'Customer (ग्राहक)' : 'Supplier (सप्लायर)'}
                      </span>
                    </td>

                    <td className="py-3 px-3 font-mono text-slate-700">
                      {party.phone ? `📱 ${party.phone}` : '-'}
                    </td>

                    <td className="py-3 px-3 text-slate-600">
                      {party.state} ({party.stateCode})
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="font-mono font-black text-sm">
                        {isReceivable && (
                          <span className="text-amber-700">
                            {formatINR(party.currentBalance)} <span className="text-[10px] uppercase font-sans font-bold">Due</span>
                          </span>
                        )}
                        {isPayable && (
                          <span className="text-blue-700">
                            {formatINR(Math.abs(party.currentBalance))} <span className="text-[10px] uppercase font-sans font-bold">Payable</span>
                          </span>
                        )}
                        {isSettled && (
                          <span className="text-slate-400">₹0.00 (Settled)</span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Prominent View Ledger Button (Requirement 1) */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedParty(party);
                          }}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                          title="View complete running ledger & statement"
                        >
                          <Eye className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>👁️ खाता देखें (View Ledger)</span>
                        </button>

                        {/* Payment In button for customers or Payment Out for suppliers */}
                        {party.type === 'CUSTOMER' ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openPaymentInForParty(party.id);
                            }}
                            className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition flex items-center gap-1"
                            title="पैसे प्राप्त करें"
                          >
                            <ArrowDownLeft className="w-3.5 h-3.5" />
                            <span>पैसे लें</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedParty(party);
                              setIsPaymentOutModalOpen(true);
                            }}
                            className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg text-xs font-bold transition flex items-center gap-1"
                            title="सप्लायर को भुगतान दर्ज करें"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            <span>पैसा दिया</span>
                          </button>
                        )}

                        {/* WhatsApp Payment Reminder */}
                        {party.phone && isReceivable && (
                          <a
                            href={generateWhatsAppKhataReminderURL(party, company)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center shadow-2xs"
                            title="Send WhatsApp payment reminder"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Touch Cards View (Requirement 1) */}
        <div className="block md:hidden divide-y divide-slate-100">
          {filteredParties.map(party => {
            const isReceivable = party.currentBalance > 0;
            const isPayable = party.currentBalance < 0;
            const isSettled = party.currentBalance === 0;

            return (
              <div 
                key={party.id} 
                onClick={() => setSelectedParty(party)}
                className="p-3.5 space-y-2.5 bg-white hover:bg-blue-50/50 cursor-pointer transition active:bg-blue-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-black text-slate-900 leading-tight">
                      {party.name}
                    </h4>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                        party.type === 'CUSTOMER' ? 'bg-emerald-50 text-emerald-800' : 'bg-blue-50 text-blue-800'
                      }`}>
                        {party.type === 'CUSTOMER' ? 'Customer' : 'Supplier'}
                      </span>
                      {party.phone && <span>📱 {party.phone}</span>}
                    </div>
                  </div>

                  {/* Balance badge */}
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 font-semibold">Balance</div>
                    <div className={`text-sm font-mono font-black ${
                      isReceivable ? 'text-amber-800' : isPayable ? 'text-blue-800' : 'text-slate-400'
                    }`}>
                      {isReceivable && `${formatINR(party.currentBalance)} Due`}
                      {isPayable && `${formatINR(Math.abs(party.currentBalance))} Payable`}
                      {isSettled && `₹0 Settled`}
                    </div>
                  </div>
                </div>

                {/* Mobile Action Buttons Bar */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-50">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedParty(party);
                    }}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Eye className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>👁️ खाता देखें (View Ledger)</span>
                  </button>

                  {party.type === 'CUSTOMER' ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openPaymentInForParty(party.id);
                      }}
                      className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 shadow-2xs"
                    >
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                      <span>Payment In</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedParty(party);
                        setIsPaymentOutModalOpen(true);
                      }}
                      className="px-3 py-2 bg-blue-100 text-blue-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>पैसा दिया</span>
                    </button>
                  )}

                  {party.phone && isReceivable && (
                    <a
                      href={generateWhatsAppKhataReminderURL(party, company)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition flex items-center gap-1"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment In Modal Component */}
      <PaymentInModal
        isOpen={isPaymentInModalOpen}
        onClose={() => setIsPaymentInModalOpen(false)}
        parties={parties}
        company={company}
        initialPartyId={paymentInPartyId}
        onRecordPayment={onRecordPayment}
      />

      {/* Add Party Modal */}
      {isPartyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-blue-600 text-white">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-white" />
                <h3 className="font-bold text-sm sm:text-base">Add New Party (नया ग्राहक/सप्लायर जोड़ें)</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPartyModalOpen(false)}
                className="p-1 rounded-lg text-blue-200 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateParty} className="p-4 sm:p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Customer / Vendor Name (पार्टी का नाम) *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Rajesh Kumar / Sharma Kirana Store"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Party Type (प्रकार)
                  </label>
                  <select
                    value={type}
                    onChange={e => setType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  >
                    <option value="CUSTOMER">Customer (ग्राहक)</option>
                    <option value="SUPPLIER">Supplier (सप्लायर/व्यापारी)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Mobile Number (WhatsApp) *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="9876543210"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    State (राज्य)
                  </label>
                  <select
                    value={stateCode}
                    onChange={e => setStateCode(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  >
                    {Object.entries(INDIAN_STATES).map(([code, stateName]) => (
                      <option key={code} value={code}>
                        {code} - {stateName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    GSTIN Number (वैकल्पिक)
                  </label>
                  <input
                    type="text"
                    placeholder="27ABCDE1234F1Z5"
                    value={gstin}
                    onChange={e => setGstin(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono uppercase text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Opening Khata Balance (शुरुआती पुराना बकाया ₹)
                </label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={openingBalance}
                  onChange={e => setOpeningBalance(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-amber-800 focus:bg-white focus:outline-none focus:border-blue-600"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">
                  यदि ग्राहक या सप्लायर पर पहले से बकाया बाकी है तो यहाँ दर्ज करें।
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Address (पता या गांव का नाम)
                </label>
                <input
                  type="text"
                  placeholder="Street / Market / Village"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
                />
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPartyModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition"
                >
                  Cancel (रद्द करें)
                </button>

                <button
                  type="submit"
                  className="flex-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition shadow-xs flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Party (पार्टी सेव करें)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
