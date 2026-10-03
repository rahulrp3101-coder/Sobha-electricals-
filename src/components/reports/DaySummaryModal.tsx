import React, { useMemo } from 'react';
import { Invoice, PaymentTransaction, Item, CompanyProfile, Expense } from '../../types';
import { formatINR } from '../../services/gstCalculator';
import { 
  DollarSign, Smartphone, CreditCard, ArrowDownLeft, TrendingUp, 
  X, Printer, CheckCircle2, Calendar, ShoppingBag, Receipt, AlertCircle, Sparkles
} from 'lucide-react';

interface DaySummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoices: Invoice[];
  payments?: PaymentTransaction[];
  expenses?: Expense[];
  items: Item[];
  company: CompanyProfile;
}

export const DaySummaryModal: React.FC<DaySummaryModalProps> = ({
  isOpen,
  onClose,
  invoices,
  payments = [],
  expenses = [],
  items,
  company,
}) => {
  if (!isOpen) return null;

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const todayFormatted = useMemo(() => {
    return new Date().toLocaleDateString('hi-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, []);

  const itemsMap = useMemo(() => {
    const map = new Map<string, Item>();
    items.forEach(it => map.set(it.id, it));
    return map;
  }, [items]);

  // Today's Sales Invoices
  const todaySalesInvoices = useMemo(() => {
    return invoices.filter(inv => 
      inv.date === todayStr && 
      (inv.documentType === 'SALES_INVOICE' || !inv.documentType)
    );
  }, [invoices, todayStr]);

  // Day calculations
  const stats = useMemo(() => {
    // 1. Cash Sales
    let cashFromFullCashBills = 0;
    let cashFromCreditBills = 0;
    // 2. UPI / Bank Sales
    let upiBankSales = 0;
    // 3. New Credit Given
    let creditGiven = 0;
    // 5. Estimated Profit (Revenue - COGS)
    let revenueTaxExcl = 0;
    let cogs = 0;

    todaySalesInvoices.forEach(inv => {
      // Cash vs UPI vs Credit
      if (inv.paymentMode === 'CASH') {
        cashFromFullCashBills += (inv.receivedAmount || inv.grandTotal);
      } else if (inv.paymentMode === 'UPI' || inv.paymentMode === 'BANK_TRANSFER') {
        upiBankSales += (inv.receivedAmount || inv.grandTotal);
      } else if (inv.paymentMode === 'CREDIT') {
        cashFromCreditBills += (inv.receivedAmount || 0);
        creditGiven += (inv.balanceAmount || 0);
      }

      // If non-credit invoice has balance
      if (inv.paymentMode !== 'CREDIT' && (inv.balanceAmount || 0) > 0) {
        creditGiven += inv.balanceAmount;
      }

      // Profit calculation
      revenueTaxExcl += (inv.subTotal || inv.grandTotal);
      (inv.items || []).forEach(it => {
        const itemObj = itemsMap.get(it.itemId);
        const purchaseRate = (itemObj && itemObj.purchasePrice > 0)
          ? itemObj.purchasePrice
          : (it.unitPrice * 0.75); // reasonable default cost
        cogs += (it.quantity * purchaseRate);
      });
    });

    const totalCashInHand = cashFromFullCashBills + cashFromCreditBills;

    // 4. Payment-In Collected Today (Old Credit Collected)
    const paymentInCollected = payments
      .filter(p => p.type === 'PAYMENT_IN' && p.date === todayStr)
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    // Today's shop expenses
    const todayExpenses = expenses
      .filter(e => e.date === todayStr)
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const grossProfit = Math.max(0, revenueTaxExcl - cogs);
    const estimatedNetProfit = Math.max(0, grossProfit - todayExpenses);
    const profitMargin = revenueTaxExcl > 0 ? (grossProfit / revenueTaxExcl) * 100 : 0;

    return {
      billCount: todaySalesInvoices.length,
      totalSalesTurnover: todaySalesInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0),
      totalCashInHand,
      upiBankSales,
      creditGiven,
      paymentInCollected,
      todayExpenses,
      cogs,
      grossProfit,
      estimatedNetProfit,
      profitMargin,
    };
  }, [todaySalesInvoices, payments, expenses, itemsMap, todayStr]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-2xs p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200 my-auto">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center font-bold text-blue-300">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight">
                  📊 आज का हिसाब / डे-एंड कैश क्लोजिंग
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/30 text-blue-200 border border-blue-400/30">
                  Day Summary
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium">
                {company.name} · {todayFormatted}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
          {/* Top Quick Status Pill */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-blue-50/70 border border-blue-200 rounded-2xl">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
              <span className="font-extrabold text-blue-950 text-xs">
                आज कुल <strong>{stats.billCount} बिल</strong> जनरेट हुए
              </span>
            </div>
            <div className="text-xs font-mono font-bold text-blue-900">
              कुल बिक्री: <strong>{formatINR(stats.totalSalesTurnover)}</strong>
            </div>
          </div>

          {/* 5 Core Business KPI Cards (Requirement 4) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* 1. Cash in Hand */}
            <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3.5 space-y-1 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wide">
                  💵 नकद बिक्री (Cash in Hand)
                </span>
                <span className="p-1 rounded-lg bg-emerald-200/60 text-emerald-800">
                  <DollarSign className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-xl font-black font-mono text-emerald-950">
                {formatINR(stats.totalCashInHand)}
              </div>
              <p className="text-[10px] text-emerald-800">
                आज गल्ले में आई नकद राशि
              </p>
            </div>

            {/* 2. Total UPI / Bank */}
            <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-3.5 space-y-1 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wide">
                  📱 कुल UPI / Bank बिक्री
                </span>
                <span className="p-1 rounded-lg bg-blue-200/60 text-blue-800">
                  <Smartphone className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-xl font-black font-mono text-blue-950">
                {formatINR(stats.upiBankSales)}
              </div>
              <p className="text-[10px] text-blue-800">
                सीधे बैंक खाते/QR कोड में जमा
              </p>
            </div>

            {/* 3. New Credit Given */}
            <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 space-y-1 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wide">
                  📒 आज की नई उधारी (Credit Given)
                </span>
                <span className="p-1 rounded-lg bg-amber-200/60 text-amber-800">
                  <CreditCard className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-xl font-black font-mono text-amber-950">
                {formatINR(stats.creditGiven)}
              </div>
              <p className="text-[10px] text-amber-800">
                आज ग्राहकों को उधार दिया गया
              </p>
            </div>

            {/* 4. Payment-In Collected */}
            <div className="bg-purple-50/80 border border-purple-200 rounded-2xl p-3.5 space-y-1 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-purple-900 uppercase tracking-wide">
                  📥 पुरानी उधारी वसूली (Payment-In)
                </span>
                <span className="p-1 rounded-lg bg-purple-200/60 text-purple-800">
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-xl font-black font-mono text-purple-950">
                {formatINR(stats.paymentInCollected)}
              </div>
              <p className="text-[10px] text-purple-800">
                ग्राहकों से पुराने बकाए के मिले पैसे
              </p>
            </div>

            {/* 5. Today's Estimated Profit */}
            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border-2 border-indigo-300 rounded-2xl p-3.5 space-y-1 shadow-2xs sm:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-indigo-950 uppercase tracking-wide flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>📈 आज का अनुमानित कुल मुनाफ़ा (Estimated Profit)</span>
                </span>
                <span className="text-[10px] font-bold bg-indigo-200/80 text-indigo-900 px-2 py-0.5 rounded-full font-mono">
                  मार्जिन: {stats.profitMargin.toFixed(1)}%
                </span>
              </div>
              <div className="text-2xl font-black font-mono text-indigo-950">
                {formatINR(stats.grossProfit)}
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-indigo-200/60">
                <span>माल लागत (COGS): <strong>{formatINR(stats.cogs)}</strong></span>
                {stats.todayExpenses > 0 && (
                  <span>दुकान खर्चे: <strong>-{formatINR(stats.todayExpenses)}</strong></span>
                )}
                <span className="font-bold text-emerald-700">
                  शुद्ध बचत: {formatINR(stats.estimatedNetProfit)}
                </span>
              </div>
            </div>
          </div>

          {/* Cash Drawer Reconciliation Summary */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
            <h4 className="font-extrabold text-slate-800 text-xs">
              💼 गल्ला क्लोजिंग सारांश (Cash Drawer Balance Verification):
            </h4>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between items-center text-slate-600">
                <span>नकद बिक्री (Cash Sales):</span>
                <span className="font-mono font-bold text-slate-900">+{formatINR(stats.totalCashInHand)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>उधारी वसूली नकद (Payment In Cash):</span>
                <span className="font-mono font-bold text-purple-700">+{formatINR(stats.paymentInCollected)}</span>
              </div>
              {stats.todayExpenses > 0 && (
                <div className="flex justify-between items-center text-rose-700">
                  <span>दुकान से दिए नकद खर्चे (Cash Expenses):</span>
                  <span className="font-mono font-bold">-{formatINR(stats.todayExpenses)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-black text-sm text-slate-900">
                <span>कुल गल्ले में अपेक्षित नकद (Expected Cash in Hand):</span>
                <span className="font-mono text-emerald-700 text-base">
                  {formatINR(Math.max(0, stats.totalCashInHand + stats.paymentInCollected - stats.todayExpenses))}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>प्रिंट सारांश (Print Day Report)</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs active:scale-95 transition cursor-pointer"
          >
            बंद करें (Close)
          </button>
        </div>
      </div>
    </div>
  );
};
