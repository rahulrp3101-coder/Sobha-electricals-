import React, { useState, useMemo } from 'react';
import { Party, CompanyProfile, PaymentMode, PaymentTransaction, Invoice, InvoiceItem } from '../../types';
import { formatINR, INDIAN_STATES } from '../../services/gstCalculator';
import { 
  Users, Search, Plus, Phone, Mail, Share2, 
  ArrowDownLeft, ArrowUpRight, DollarSign, X, Check, CreditCard, AlertCircle,
  ArrowLeft, Eye, ChevronDown, ChevronUp, Printer, FileText, ShoppingBag,
  Calendar, CheckCircle2, Building2, MapPin
} from 'lucide-react';
import { generateWhatsAppKhataReminderURL, generateWhatsAppCustomerLedgerURL } from '../../services/whatsappShare';
import { PaymentInModal } from './PaymentInModal';

interface PartiesLedgerProps {
  parties: Party[];
  invoices?: Invoice[];
  payments?: PaymentTransaction[];
  company: CompanyProfile;
  onSaveParty: (party: Party) => Promise<void>;
  onRecordPayment: (payment: PaymentTransaction) => Promise<void>;
  onViewInvoice?: (invoice: Invoice, format: 'thermal' | 'a4') => void;
}

interface StatementEntry {
  id: string;
  date: string;
  type: 'OPENING' | 'INVOICE' | 'PAYMENT' | 'RETURN';
  title: string;
  documentNumber?: string;
  paymentMode?: PaymentMode;
  notes?: string;
  debit: number; // Goods bought / Receivable increase
  credit: number; // Amount paid / Receivable decrease
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
}) => {
  const [partyTypeFilter, setPartyTypeFilter] = useState<'ALL' | 'CUSTOMER' | 'SUPPLIER'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);

  // Expanded items for statement rows
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Modals
  const [isPartyModalOpen, setIsPartyModalOpen] = useState(false);
  const [isPaymentInModalOpen, setIsPaymentInModalOpen] = useState(false);
  const [paymentInPartyId, setPaymentInPartyId] = useState<string | undefined>(undefined);

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
  // UNIFIED RUNNING LEDGER COMPUTATION (Requirement 2 & 3)
  // --------------------------------------------------------------------------
  const { ledgerEntries, summaryStats } = useMemo(() => {
    if (!activeParty) {
      return { ledgerEntries: [], summaryStats: { totalPurchases: 0, totalPaid: 0, netBalance: 0 } };
    }

    const partyInvoices = invoices.filter(inv => inv.partyId === activeParty.id);
    const partyPayments = payments.filter(pmt => pmt.partyId === activeParty.id);

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

    let runningBalance = 0;
    let totalPurchases = 0;
    let totalPaid = 0;

    const entries: StatementEntry[] = [];

    // Optional initial starting balance if non-zero
    if (activeParty.openingBalance && activeParty.openingBalance !== 0) {
      runningBalance = activeParty.openingBalance;
      entries.push({
        id: `open-${activeParty.id}`,
        date: activeParty.createdAt ? activeParty.createdAt.split('T')[0] : 'Opening',
        type: 'OPENING',
        title: 'Opening Khata Balance (शुरुआती पुराना बकाया)',
        debit: activeParty.openingBalance > 0 ? activeParty.openingBalance : 0,
        credit: activeParty.openingBalance < 0 ? Math.abs(activeParty.openingBalance) : 0,
        runningBalance,
      });
    }

    events.forEach(ev => {
      if (ev.kind === 'INVOICE') {
        const inv = ev.inv;
        const isSalesInvoice = inv.documentType === 'SALES_INVOICE' || !inv.documentType;
        const isCreditNote = inv.documentType === 'CREDIT_NOTE'; // sales return

        if (isSalesInvoice) {
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
        } else if (isCreditNote) {
          // Sales Return: customer gets credit, running balance decreases
          const credit = inv.grandTotal;
          runningBalance = Math.max(0, runningBalance - credit);

          entries.push({
            id: inv.id,
            date: inv.date,
            type: 'RETURN',
            title: `Sales Return #${inv.invoiceNumber} (माल वापसी)`,
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
          totalPaid += pmt.amount;
          runningBalance = Math.max(0, runningBalance - pmt.amount);

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
          // Refund given to customer or payment to supplier
          runningBalance += pmt.amount;
          entries.push({
            id: pmt.id,
            date: pmt.date,
            type: 'PAYMENT',
            title: `Payment Out #${pmt.receiptNumber} (वापसी भुगतान)`,
            documentNumber: pmt.receiptNumber,
            paymentMode: pmt.paymentMode,
            notes: pmt.notes,
            debit: pmt.amount,
            credit: 0,
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
  // VIEW 1: SINGLE CUSTOMER STATEMENT & RUNNING LEDGER
  // --------------------------------------------------------------------------
  if (activeParty) {
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
              onClick={() => setSelectedParty(null)}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition flex items-center gap-1 font-bold text-xs"
              title="Back to Parties List"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>← Back (वापस)</span>
            </button>
            <span className="text-slate-300">|</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 truncate">
                  {activeParty.name}
                </h2>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  activeParty.type === 'CUSTOMER' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                }`}>
                  {activeParty.type === 'CUSTOMER' ? 'Customer (ग्राहक)' : 'Supplier (सप्लायर)'}
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
            {/* Payment In button */}
            <button
              onClick={() => openPaymentInForParty(activeParty.id)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs active:scale-95"
            >
              <ArrowDownLeft className="w-4 h-4" />
              <span>+ Record Payment (पैसे जमा करें)</span>
            </button>

            {/* Share on WhatsApp Button (Requirement 3) */}
            <a
              href={whatsAppStatementUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition shadow-2xs active:scale-95"
              title="Share Ledger Statement on WhatsApp"
            >
              <Share2 className="w-4 h-4 text-emerald-600" />
              <span>Share Ledger on WhatsApp</span>
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
        {/* STATEMENT HEADER SUMMARY (3 CLEAN CARDS - REQUIREMENT 3)     */}
        {/* ------------------------------------------------------------- */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Card 1: Total Purchases */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Total Purchases (कुल बिक्री)
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 mt-1">
                {formatINR(summaryStats.totalPurchases)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                ग्राहक द्वारा सामान की कुल खरीदारी
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
                Total Paid / Received (कुल प्राप्त राशि)
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono text-emerald-700 mt-1">
                {formatINR(summaryStats.totalPaid)}
              </div>
              <div className="text-[10px] text-emerald-600 mt-0.5">
                मौके पर भुगतान + जमा की गई रकम
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
                Current Net Balance (वर्तमान बकाया)
              </div>
              <div className={`text-xl sm:text-2xl font-black font-mono mt-1 ${
                summaryStats.netBalance > 0 ? 'text-amber-950' : 'text-emerald-900'
              }`}>
                {formatINR(summaryStats.netBalance)}
              </div>
              <div className={`text-[10px] font-semibold mt-0.5 ${
                summaryStats.netBalance > 0 ? 'text-amber-700' : 'text-emerald-600'
              }`}>
                {summaryStats.netBalance > 0 ? 'लेना बाकी (Outstanding Due)' : 'खाता चुकता है (Fully Settled)'}
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
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                Unified Running Ledger <span className="text-xs font-normal text-slate-500">(तारीखवार संयुक्त क्रमिक खाता)</span>
              </h3>
            </div>
            <span className="text-xs font-bold text-slate-500 bg-slate-200/80 px-2.5 py-0.5 rounded-full font-mono">
              {ledgerEntries.length} Transactions
            </span>
          </div>

          {ledgerEntries.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <FileText className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-600">No transactions recorded yet</p>
              <p className="text-xs text-slate-400">
                When bills are created or payments are recorded for {activeParty.name}, they will appear here in chronological order.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3.5">Date (तारीख)</th>
                    <th className="py-3 px-3.5">Particulars (विवरण / बिल संख्या)</th>
                    <th className="py-3 px-3.5 text-right">Total Bill (Debit)</th>
                    <th className="py-3 px-3.5 text-right">Paid (Credit)</th>
                    <th className="py-3 px-4 text-right font-black">Running Balance (बकाया)</th>
                    <th className="py-3 px-3.5 text-center">Items (सामान)</th>
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
                          <td className="py-3 px-3.5 font-mono text-slate-600 whitespace-nowrap">
                            {entry.date}
                          </td>

                          {/* Particulars / Title */}
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
                            {entry.notes && (
                              <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-xs">
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

                          {/* Items View Toggle Button (Requirement 2) */}
                          <td className="py-3 px-3.5 text-center">
                            {hasItems ? (
                              <button
                                type="button"
                                onClick={() => toggleRowExpanded(entry.id)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 mx-auto border ${
                                  isExpanded
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                    : 'bg-slate-50 hover:bg-blue-50 text-blue-700 border-blue-200'
                                }`}
                                title="View items purchased in this bill"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>{isExpanded ? 'Hide' : '👁️ Items'}</span>
                                <span className={`text-[10px] px-1 rounded-full ${
                                  isExpanded ? 'bg-blue-700 text-white' : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {entry.items?.length}
                                </span>
                              </button>
                            ) : (
                              <span className="text-slate-300 text-[11px]">-</span>
                            )}
                          </td>
                        </tr>

                        {/* Expandable Items Details Row */}
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

                                  {entry.rawInvoice && onViewInvoice && (
                                    <div className="flex items-center gap-2">
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
                                    </div>
                                  )}
                                </div>

                                {/* Items mini-table */}
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-xs">
                                    <thead>
                                      <tr className="text-[10px] text-slate-400 border-b border-slate-100 uppercase">
                                        <th className="pb-1.5 font-bold">#</th>
                                        <th className="pb-1.5 font-bold">Item Name (सामान)</th>
                                        <th className="pb-1.5 text-center font-bold">Qty (मात्रा)</th>
                                        <th className="pb-1.5 text-right font-bold">Rate (दर)</th>
                                        <th className="pb-1.5 text-right font-bold">Tax (टैक्स)</th>
                                        <th className="pb-1.5 text-right font-bold">Total (कुल)</th>
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

        {/* Payment In Modal Component */}
        <PaymentInModal
          isOpen={isPaymentInModalOpen}
          onClose={() => setIsPaymentInModalOpen(false)}
          parties={parties}
          company={company}
          initialPartyId={paymentInPartyId}
          onRecordPayment={onRecordPayment}
        />
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // VIEW 2: MASTER PARTIES LIST VIEW (ALL CUSTOMERS & SUPPLIERS)
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
              Customer Khata Ledger <span className="text-xs font-normal text-slate-500">(ग्राहक खाता व उधारी बही)</span>
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            ग्राहकों की उधारी (Debit), भुगतान (Credit), रनिंग स्टेटमेंट, WhatsApp खाता शेयर व UPI पेमेंट लिंक
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
            <span>+ Add Party (नया ग्राहक)</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Total Receivables / Udhar Given */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1">
              <span>Total Receivables (लेना बाकी / उधारी)</span>
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
              थोक व्यापारियों व सप्लायर्स को देने योग्य राशि
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
            placeholder="Search party by name, phone or GSTIN (ग्राहक नाम या नंबर खोजें)..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          {[
            { id: 'ALL', label: 'All (सभी)' },
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

      {/* Parties List: Responsive Cards on Mobile & Table on Desktop */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Party Name (पार्टी नाम)</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3">Phone</th>
                <th className="py-3 px-3">State</th>
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
                  <tr key={party.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => setSelectedParty(party)}
                        className="font-bold text-slate-900 text-sm hover:text-blue-700 text-left transition"
                      >
                        {party.name}
                      </button>
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
                        {party.type === 'CUSTOMER' ? 'Customer' : 'Supplier'}
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
                        {/* View Statement Button */}
                        <button
                          type="button"
                          onClick={() => setSelectedParty(party)}
                          className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg text-xs font-bold transition flex items-center gap-1"
                          title="View complete running ledger statement"
                        >
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                          <span>Statement (खाता)</span>
                        </button>

                        {/* Payment In button */}
                        <button
                          onClick={() => openPaymentInForParty(party.id)}
                          className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition flex items-center gap-1"
                          title="Record Payment In"
                        >
                          <ArrowDownLeft className="w-3.5 h-3.5" />
                          <span>पैसे लें</span>
                        </button>

                        {/* WhatsApp Payment Reminder */}
                        {party.phone && isReceivable && (
                          <a
                            href={generateWhatsAppKhataReminderURL(party, company)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs"
                            title="Send WhatsApp payment reminder"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
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

        {/* Mobile Touch Cards View */}
        <div className="block md:hidden divide-y divide-slate-100">
          {filteredParties.map(party => {
            const isReceivable = party.currentBalance > 0;
            const isPayable = party.currentBalance < 0;
            const isSettled = party.currentBalance === 0;

            return (
              <div key={party.id} className="p-3.5 space-y-2.5 bg-white">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <button
                      type="button"
                      onClick={() => setSelectedParty(party)}
                      className="text-sm font-bold text-slate-900 leading-tight text-left hover:text-blue-700"
                    >
                      {party.name}
                    </button>
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
                    <div className="text-[10px] text-slate-400">Balance</div>
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
                    onClick={() => setSelectedParty(party)}
                    className="flex-1 py-2 bg-blue-50 text-blue-800 border border-blue-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Statement (खाता देखें)</span>
                  </button>

                  <button
                    onClick={() => openPaymentInForParty(party.id)}
                    className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 shadow-2xs"
                  >
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                    <span>Payment In</span>
                  </button>

                  {party.phone && isReceivable && (
                    <a
                      href={generateWhatsAppKhataReminderURL(party, company)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition flex items-center gap-1"
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
                <h3 className="font-bold text-sm sm:text-base">Add New Party (नया ग्राहक जोड़ें)</h3>
              </div>
              <button
                onClick={() => setIsPartyModalOpen(false)}
                className="p-1 rounded-lg text-blue-200 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateParty} className="p-4 sm:p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Customer or Party Name (ग्राहक का नाम) *
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
                    <option value="SUPPLIER">Supplier (सप्लायर)</option>
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
                  यदि ग्राहक पर पहले से उधारी बाकी है तो यहाँ दर्ज करें।
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
                  <span>Save Party (ग्राहक सेव करें)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
