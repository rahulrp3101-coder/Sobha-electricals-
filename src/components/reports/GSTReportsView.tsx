import React, { useState, useMemo } from 'react';
import { Invoice, CompanyProfile, Expense, PaymentTransaction, Item, Party } from '../../types';
import { formatINR } from '../../services/gstCalculator';
import { 
  generateGSTR1JSON, 
  downloadJSONFile, 
  exportInvoicesToCSV, 
  exportFullCASummaryCSV 
} from '../../services/gstrExporter';
import { 
  BarChart3, FileSpreadsheet, Download, TrendingUp, 
  ArrowUpRight, ArrowDownLeft, Calendar, FileText, CheckCircle2,
  Building2, Users, Receipt, PieChart, ShieldCheck, Wallet, 
  AlertCircle, ChevronRight, Layers, DollarSign
} from 'lucide-react';

interface GSTReportsViewProps {
  invoices: Invoice[];
  expenses: Expense[];
  payments: PaymentTransaction[];
  items: Item[];
  parties: Party[];
  company: CompanyProfile;
}

type PeriodFilter = 'CURRENT_MONTH' | 'LAST_MONTH' | 'FY_2026_27' | 'ALL';
type ReportSection = 'GSTR1' | 'GSTR2' | 'NET_TAX_PL';

export const GSTReportsView: React.FC<GSTReportsViewProps> = ({
  invoices,
  expenses,
  payments,
  items,
  parties,
  company,
}) => {
  const [activeSection, setActiveSection] = useState<ReportSection>('GSTR1');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('CURRENT_MONTH');
  const [gstr1SubTab, setGstr1SubTab] = useState<'ALL' | 'B2B' | 'B2C'>('ALL');

  // Compute Period Bounds
  const periodBounds = useMemo(() => {
    const now = new Date();
    const currYear = now.getFullYear();
    const currMonth = now.getMonth(); // 0-indexed

    // Current month string prefix YYYY-MM
    const currentMonthPrefix = `${currYear}-${String(currMonth + 1).padStart(2, '0')}`;
    
    // Last month calculation
    const lastMonthDate = new Date(currYear, currMonth - 1, 1);
    const lastMonthPrefix = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

    // Financial year 2026-27 (Apr 2026 - Mar 2027)
    const fyStart = '2026-04-01';
    const fyEnd = '2027-03-31';

    return {
      currentMonthPrefix,
      lastMonthPrefix,
      fyStart,
      fyEnd,
    };
  }, []);

  // Filter invoices & expenses based on selected period
  const { filteredInvoices, filteredExpenses, periodLabel } = useMemo(() => {
    let invs = [...invoices];
    let exps = [...expenses];
    let label = 'Current Month (सितंबर 2026)';

    if (periodFilter === 'CURRENT_MONTH') {
      invs = invs.filter(i => i.date.startsWith(periodBounds.currentMonthPrefix));
      exps = exps.filter(e => e.date.startsWith(periodBounds.currentMonthPrefix));
      label = `Current Month (${periodBounds.currentMonthPrefix})`;
    } else if (periodFilter === 'LAST_MONTH') {
      invs = invs.filter(i => i.date.startsWith(periodBounds.lastMonthPrefix));
      exps = exps.filter(e => e.date.startsWith(periodBounds.lastMonthPrefix));
      label = `Last Month (${periodBounds.lastMonthPrefix})`;
    } else if (periodFilter === 'FY_2026_27') {
      invs = invs.filter(i => i.date >= periodBounds.fyStart && i.date <= periodBounds.fyEnd);
      exps = exps.filter(e => e.date >= periodBounds.fyStart && e.date <= periodBounds.fyEnd);
      label = 'FY 2026-27 (वित्तीय वर्ष)';
    } else {
      label = 'All Time Records (सभी रिकॉर्ड्स)';
    }

    return { filteredInvoices: invs, filteredExpenses: exps, periodLabel: label };
  }, [invoices, expenses, periodFilter, periodBounds]);

  // Section 1: GSTR-1 Outward Supplies (Sales)
  const salesInvoices = useMemo(() => {
    return filteredInvoices.filter(i => 
      (i.documentType === 'SALES_INVOICE' || !i.documentType) && 
      i.status !== 'CANCELLED'
    );
  }, [filteredInvoices]);

  const b2bInvoices = useMemo(() => {
    return salesInvoices.filter(i => i.partyGstin && i.partyGstin.trim().length >= 15);
  }, [salesInvoices]);

  const b2cInvoices = useMemo(() => {
    return salesInvoices.filter(i => !i.partyGstin || i.partyGstin.trim().length < 15);
  }, [salesInvoices]);

  const gstr1Totals = useMemo(() => {
    const totalGross = salesInvoices.reduce((s, i) => s + (i.grandTotal || 0), 0);
    const taxableTurnover = salesInvoices.reduce((s, i) => s + (i.subTotal || 0), 0);
    const totalCgst = salesInvoices.reduce((s, i) => s + (i.totalCgst || 0), 0);
    const totalSgst = salesInvoices.reduce((s, i) => s + (i.totalSgst || 0), 0);
    const totalIgst = salesInvoices.reduce((s, i) => s + (i.totalIgst || 0), 0);
    const totalTax = totalCgst + totalSgst + totalIgst;

    const b2bGross = b2bInvoices.reduce((s, i) => s + i.grandTotal, 0);
    const b2bTaxable = b2bInvoices.reduce((s, i) => s + i.subTotal, 0);
    const b2bTax = b2bInvoices.reduce((s, i) => s + i.totalTax, 0);

    const b2cGross = b2cInvoices.reduce((s, i) => s + i.grandTotal, 0);
    const b2cTaxable = b2cInvoices.reduce((s, i) => s + i.subTotal, 0);
    const b2cTax = b2cInvoices.reduce((s, i) => s + i.totalTax, 0);

    return {
      totalGross,
      taxableTurnover,
      totalCgst,
      totalSgst,
      totalIgst,
      totalTax,
      b2bCount: b2bInvoices.length,
      b2bGross,
      b2bTaxable,
      b2bTax,
      b2cCount: b2cInvoices.length,
      b2cGross,
      b2cTaxable,
      b2cTax,
    };
  }, [salesInvoices, b2bInvoices, b2cInvoices]);

  // Section 2: GSTR-2 Inward Supplies (Purchases & ITC)
  const purchaseBills = useMemo(() => {
    return filteredInvoices.filter(i => i.documentType === 'PURCHASE_BILL' && i.status !== 'CANCELLED');
  }, [filteredInvoices]);

  const gstr2Totals = useMemo(() => {
    const totalGross = purchaseBills.reduce((s, i) => s + (i.grandTotal || 0), 0);
    const taxableTurnover = purchaseBills.reduce((s, i) => s + (i.subTotal || 0), 0);
    const totalCgstItc = purchaseBills.reduce((s, i) => s + (i.totalCgst || 0), 0);
    const totalSgstItc = purchaseBills.reduce((s, i) => s + (i.totalSgst || 0), 0);
    const totalIgstItc = purchaseBills.reduce((s, i) => s + (i.totalIgst || 0), 0);
    const purchaseItc = totalCgstItc + totalSgstItc + totalIgstItc;

    // Expenses with GST ITC
    const expenseItc = filteredExpenses
      .filter(e => e.isGstApplicable)
      .reduce((s, e) => s + (e.taxAmount || 0), 0);
    const totalExpenseAmount = filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0);

    const totalClaimableItc = purchaseItc + expenseItc;

    return {
      totalGross,
      taxableTurnover,
      totalCgstItc,
      totalSgstItc,
      totalIgstItc,
      purchaseItc,
      expenseItc,
      totalExpenseAmount,
      totalClaimableItc,
      billCount: purchaseBills.length,
    };
  }, [purchaseBills, filteredExpenses]);

  // Section 3: Net Tax Liability & Profit and Loss Summary
  const netLiabilityAndProfit = useMemo(() => {
    const outputTax = gstr1Totals.totalTax; // Tax on sales
    const inputTaxCredit = gstr2Totals.totalClaimableItc; // ITC on purchases + expenses
    const netGstPayable = Math.max(0, outputTax - inputTaxCredit);
    const itcCarryForward = Math.max(0, inputTaxCredit - outputTax);

    // Net Profit = Gross Sales - (Purchases + Total Shop Expenses)
    const grossSales = gstr1Totals.totalGross;
    const purchases = gstr2Totals.totalGross;
    const shopExpenses = gstr2Totals.totalExpenseAmount;
    const totalCosts = purchases + shopExpenses;
    const netProfit = grossSales - totalCosts;
    const profitMargin = grossSales > 0 ? (netProfit / grossSales) * 100 : 0;

    return {
      outputTax,
      inputTaxCredit,
      netGstPayable,
      itcCarryForward,
      grossSales,
      purchases,
      shopExpenses,
      totalCosts,
      netProfit,
      profitMargin,
    };
  }, [gstr1Totals, gstr2Totals]);

  // Export Handlers
  const handleDownloadCASummary = () => {
    exportFullCASummaryCSV(filteredInvoices, filteredExpenses, company, periodLabel);
  };

  const handleDownloadGSTR1JSON = () => {
    const periodCode = periodBounds.currentMonthPrefix.replace('-', '').substring(4, 6) + periodBounds.currentMonthPrefix.substring(0, 4);
    const jsonData = generateGSTR1JSON(filteredInvoices, company, periodCode);
    downloadJSONFile(jsonData, `GSTR1_${company.gstin || 'TRADE'}_${periodCode}.json`);
  };

  const handleDownloadSalesCSV = () => {
    exportInvoicesToCSV(filteredInvoices);
  };

  return (
    <div className="p-3 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Top Banner: Header, Period Filter, and Action Buttons */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-blue-100 text-blue-800 rounded-xl">
                <BarChart3 className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                  GST Reports & CA Tax Filing
                </h1>
                <p className="text-xs text-slate-500 font-medium">
                  संपूर्ण GST रिटर्न (GSTR-1, GSTR-2, ITC), शुद्ध टैक्स देनदारी और मुनाफा रिपोर्ट
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 font-mono">
              <span>GSTIN: <strong className="text-slate-800">{company.gstin || 'NOT SPECIFIED'}</strong></span>
              <span>•</span>
              <span>State: <strong className="text-slate-800">{company.stateCode}-{company.state}</strong></span>
              <span>•</span>
              <span className="text-blue-700 font-semibold">{periodLabel}</span>
            </div>
          </div>

          {/* Export Action Buttons (CA Ready) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleDownloadCASummary}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs transition shadow-xs active:scale-95"
              title="Download CA Excel/CSV Summary containing GSTR-1, GSTR-2 ITC, Expenses, and Net Tax"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
              <span>Export GST Summary (Excel)</span>
            </button>

            <button
              onClick={handleDownloadGSTR1JSON}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl text-xs transition shadow-xs active:scale-95"
              title="Download Government GSTR-1 JSON file for direct upload on gst.gov.in offline tool"
            >
              <Download className="w-4 h-4" />
              <span>GSTR-1 JSON (GST Portal)</span>
            </button>

            <button
              onClick={handleDownloadSalesCSV}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition border border-slate-300"
              title="Export all invoices to CSV"
            >
              <FileText className="w-4 h-4 text-slate-500" />
              <span>Sales CSV</span>
            </button>
          </div>
        </div>

        {/* Period Selector Bar */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3 flex-wrap gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="font-semibold text-slate-700">Reporting Period (समय अवधि):</span>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setPeriodFilter('CURRENT_MONTH')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                periodFilter === 'CURRENT_MONTH'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              This Month (इस महीने)
            </button>
            <button
              onClick={() => setPeriodFilter('LAST_MONTH')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                periodFilter === 'LAST_MONTH'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Last Month (पिछले महीने)
            </button>
            <button
              onClick={() => setPeriodFilter('FY_2026_27')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                periodFilter === 'FY_2026_27'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              FY 2026-27 (वित्तीय वर्ष)
            </button>
            <button
              onClick={() => setPeriodFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                periodFilter === 'ALL'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Time (सभी)
            </button>
          </div>
        </div>
      </div>

      {/* Main 3 Section Tabs (User Requirement 2) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <button
          onClick={() => setActiveSection('GSTR1')}
          className={`p-3.5 rounded-2xl border text-left transition flex items-center justify-between shadow-2xs ${
            activeSection === 'GSTR1'
              ? 'bg-blue-900 text-white border-blue-900 ring-2 ring-blue-500'
              : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${activeSection === 'GSTR1' ? 'bg-blue-800 text-blue-200' : 'bg-blue-50 text-blue-700'}`}>
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider opacity-80">Section 1</div>
              <div className="text-sm font-extrabold">GSTR-1 Outward Supplies</div>
              <div className={`text-[11px] ${activeSection === 'GSTR1' ? 'text-blue-200' : 'text-slate-500'}`}>
                बिक्री रिपोर्ट (B2B & B2C)
              </div>
            </div>
          </div>
          <div className="text-right font-mono font-bold text-sm">
            {formatINR(gstr1Totals.totalGross)}
          </div>
        </button>

        <button
          onClick={() => setActiveSection('GSTR2')}
          className={`p-3.5 rounded-2xl border text-left transition flex items-center justify-between shadow-2xs ${
            activeSection === 'GSTR2'
              ? 'bg-purple-900 text-white border-purple-900 ring-2 ring-purple-500'
              : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${activeSection === 'GSTR2' ? 'bg-purple-800 text-purple-200' : 'bg-purple-50 text-purple-700'}`}>
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider opacity-80">Section 2</div>
              <div className="text-sm font-extrabold">GSTR-2 Inward & ITC</div>
              <div className={`text-[11px] ${activeSection === 'GSTR2' ? 'text-purple-200' : 'text-slate-500'}`}>
                खरीद व इनपुट टैक्स क्रेडिट
              </div>
            </div>
          </div>
          <div className="text-right font-mono font-bold text-sm">
            {formatINR(gstr2Totals.totalClaimableItc)}
            <div className={`text-[10px] font-normal ${activeSection === 'GSTR2' ? 'text-purple-300' : 'text-slate-400'}`}>
              Total ITC
            </div>
          </div>
        </button>

        <button
          onClick={() => setActiveSection('NET_TAX_PL')}
          className={`p-3.5 rounded-2xl border text-left transition flex items-center justify-between shadow-2xs ${
            activeSection === 'NET_TAX_PL'
              ? 'bg-emerald-900 text-white border-emerald-900 ring-2 ring-emerald-500'
              : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${activeSection === 'NET_TAX_PL' ? 'bg-emerald-800 text-emerald-200' : 'bg-emerald-50 text-emerald-700'}`}>
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider opacity-80">Section 3</div>
              <div className="text-sm font-extrabold">Net Tax & Profit (P&L)</div>
              <div className={`text-[11px] ${activeSection === 'NET_TAX_PL' ? 'text-emerald-200' : 'text-slate-500'}`}>
                शुद्ध टैक्स देनदारी व मुनाफा
              </div>
            </div>
          </div>
          <div className="text-right font-mono font-bold text-sm">
            {formatINR(netLiabilityAndProfit.netProfit)}
            <div className={`text-[10px] font-normal ${activeSection === 'NET_TAX_PL' ? 'text-emerald-300' : 'text-slate-400'}`}>
              Net Profit
            </div>
          </div>
        </button>
      </div>

      {/* SECTION 1: GSTR-1 OUTWARD SUPPLIES */}
      {activeSection === 'GSTR1' && (
        <div className="space-y-4">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-400 font-semibold block">Total Gross Sales</span>
              <span className="text-[9px] text-slate-400 font-normal">कुल बिक्री राशि</span>
              <div className="text-lg font-black font-mono text-slate-900 mt-1">
                {formatINR(gstr1Totals.totalGross)}
              </div>
              <div className="text-[10px] text-blue-700 font-bold mt-0.5">
                {salesInvoices.length} Bills
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-400 font-semibold block">Taxable Turnover</span>
              <span className="text-[9px] text-slate-400 font-normal">कर योग्य बिक्री मूल्य</span>
              <div className="text-lg font-black font-mono text-slate-800 mt-1">
                {formatINR(gstr1Totals.taxableTurnover)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Before GST</div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-400 font-semibold block">CGST Collected</span>
              <span className="text-[9px] text-slate-400 font-normal">केंद्रीय कर</span>
              <div className="text-lg font-black font-mono text-blue-600 mt-1">
                {formatINR(gstr1Totals.totalCgst)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Central Tax</div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-400 font-semibold block">SGST Collected</span>
              <span className="text-[9px] text-slate-400 font-normal">राज्य कर</span>
              <div className="text-lg font-black font-mono text-indigo-600 mt-1">
                {formatINR(gstr1Totals.totalSgst)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">State Tax</div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-400 font-semibold block">IGST Collected</span>
              <span className="text-[9px] text-slate-400 font-normal">अंतर्राज्यीय कर</span>
              <div className="text-lg font-black font-mono text-purple-600 mt-1">
                {formatINR(gstr1Totals.totalIgst)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Integrated Tax</div>
            </div>

            <div className="bg-blue-50 p-3.5 rounded-2xl border border-blue-200 shadow-2xs">
              <span className="text-[11px] text-blue-800 font-bold block">Total Output GST</span>
              <span className="text-[9px] text-blue-600 font-normal">कुल वसूला गया टैक्स</span>
              <div className="text-lg font-black font-mono text-blue-900 mt-1">
                {formatINR(gstr1Totals.totalTax)}
              </div>
              <div className="text-[10px] text-blue-700 font-bold mt-0.5">Output Liability</div>
            </div>
          </div>

          {/* Sub Tabs: All, B2B, B2C */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">Filter Invoices:</span>
                <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs">
                  <button
                    onClick={() => setGstr1SubTab('ALL')}
                    className={`px-3 py-1 rounded-lg font-bold transition ${
                      gstr1SubTab === 'ALL' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All Sales ({salesInvoices.length})
                  </button>
                  <button
                    onClick={() => setGstr1SubTab('B2B')}
                    className={`px-3 py-1 rounded-lg font-bold transition ${
                      gstr1SubTab === 'B2B' ? 'bg-blue-700 text-white shadow-2xs' : 'text-slate-600 hover:text-blue-700'
                    }`}
                  >
                    B2B Invoices ({gstr1Totals.b2bCount})
                  </button>
                  <button
                    onClick={() => setGstr1SubTab('B2C')}
                    className={`px-3 py-1 rounded-lg font-bold transition ${
                      gstr1SubTab === 'B2C' ? 'bg-emerald-700 text-white shadow-2xs' : 'text-slate-600 hover:text-emerald-700'
                    }`}
                  >
                    B2C Retail ({gstr1Totals.b2cCount})
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">B2B Total: <strong className="text-slate-900 font-mono">{formatINR(gstr1Totals.b2bGross)}</strong></span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-500">B2C Total: <strong className="text-slate-900 font-mono">{formatINR(gstr1Totals.b2cGross)}</strong></span>
              </div>
            </div>

            {/* Invoices Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3">Invoice No & Date</th>
                    <th className="py-3 px-3">Customer / Party Name</th>
                    <th className="py-3 px-3">Type & GSTIN</th>
                    <th className="py-3 px-3 text-right">Taxable (₹)</th>
                    <th className="py-3 px-3 text-right">CGST (₹)</th>
                    <th className="py-3 px-3 text-right">SGST (₹)</th>
                    <th className="py-3 px-3 text-right">IGST (₹)</th>
                    <th className="py-3 px-3 text-right">Total GST (₹)</th>
                    <th className="py-3 px-3 text-right">Bill Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {salesInvoices
                    .filter(inv => {
                      const isB2B = inv.partyGstin && inv.partyGstin.trim().length >= 15;
                      if (gstr1SubTab === 'B2B') return isB2B;
                      if (gstr1SubTab === 'B2C') return !isB2B;
                      return true;
                    })
                    .map((inv) => {
                      const isB2B = inv.partyGstin && inv.partyGstin.trim().length >= 15;
                      return (
                        <tr key={inv.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">{inv.invoiceNumber}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{inv.date}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-900">{inv.partyName || 'Cash / Retail'}</div>
                            <div className="text-[10px] text-slate-400">{inv.partyState || 'Local'} ({inv.partyStateCode || '08'})</div>
                          </td>
                          <td className="py-2.5 px-3">
                            {isB2B ? (
                              <div>
                                <span className="inline-block px-1.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded">
                                  B2B
                                </span>
                                <div className="font-mono text-[10px] text-slate-700 font-semibold mt-0.5">
                                  {inv.partyGstin}
                                </div>
                              </div>
                            ) : (
                              <span className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-semibold rounded">
                                B2C Small
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                            {formatINR(inv.subTotal)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-blue-600">
                            {formatINR(inv.totalCgst)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-indigo-600">
                            {formatINR(inv.totalSgst)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-purple-600">
                            {formatINR(inv.totalIgst)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                            {formatINR(inv.totalTax)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-slate-950">
                            {formatINR(inv.grandTotal)}
                          </td>
                        </tr>
                      );
                    })}
                  {salesInvoices.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        इस अवधि में कोई बिक्री बिल नहीं है (No sales invoices found for this period).
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: GSTR-2 INWARD SUPPLIES (PURCHASES & ITC) */}
      {activeSection === 'GSTR2' && (
        <div className="space-y-4">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-400 font-semibold block">Total Purchases Gross</span>
              <span className="text-[9px] text-slate-400 font-normal">सप्लायर से कुल खरीद</span>
              <div className="text-lg font-black font-mono text-slate-900 mt-1">
                {formatINR(gstr2Totals.totalGross)}
              </div>
              <div className="text-[10px] text-purple-700 font-bold mt-0.5">
                {gstr2Totals.billCount} Purchase Bills
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-400 font-semibold block">Purchase Taxable Value</span>
              <span className="text-[9px] text-slate-400 font-normal">कर योग्य खरीद मूल्य</span>
              <div className="text-lg font-black font-mono text-slate-800 mt-1">
                {formatINR(gstr2Totals.taxableTurnover)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Base Goods Value</div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-400 font-semibold block">Goods Purchase ITC</span>
              <span className="text-[9px] text-slate-400 font-normal">सामान खरीद पर ITC</span>
              <div className="text-lg font-black font-mono text-purple-700 mt-1">
                {formatINR(gstr2Totals.purchaseItc)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">CGST + SGST + IGST</div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-400 font-semibold block">Shop Expenses ITC</span>
              <span className="text-[9px] text-slate-400 font-normal">दुकान खर्चों पर ITC</span>
              <div className="text-lg font-black font-mono text-emerald-700 mt-1">
                {formatINR(gstr2Totals.expenseItc)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Rent / Freight / Power</div>
            </div>

            <div className="bg-purple-50 p-3.5 rounded-2xl border border-purple-200 shadow-2xs">
              <span className="text-[11px] text-purple-900 font-bold block">Total Claimable ITC</span>
              <span className="text-[9px] text-purple-700 font-normal">कुल दावा योग्य इनपुट क्रेडिट</span>
              <div className="text-lg font-black font-mono text-purple-900 mt-1">
                {formatINR(gstr2Totals.totalClaimableItc)}
              </div>
              <div className="text-[10px] text-purple-700 font-bold mt-0.5">GSTR-3B Input Credit</div>
            </div>
          </div>

          {/* Supplier Bills List (Inward Supplies) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Inward Supplies & Supplier Purchase Bills (खरीद बिल व सप्लायर लिस्ट)
                </h3>
                <p className="text-xs text-slate-500">
                  सभी सप्लायर परचेज बिल जिन पर सरकार से Input Tax Credit (ITC) वापस क्लेम किया जाना है
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200">
                Total ITC: {formatINR(gstr2Totals.purchaseItc)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3">Bill No & Date</th>
                    <th className="py-3 px-3">Supplier Name</th>
                    <th className="py-3 px-3">Supplier GSTIN</th>
                    <th className="py-3 px-3 text-right">Taxable (₹)</th>
                    <th className="py-3 px-3 text-right">CGST (ITC)</th>
                    <th className="py-3 px-3 text-right">SGST (ITC)</th>
                    <th className="py-3 px-3 text-right">IGST (ITC)</th>
                    <th className="py-3 px-3 text-right">Total ITC (₹)</th>
                    <th className="py-3 px-3 text-right">Gross Bill (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {purchaseBills.map((inv) => {
                    const itc = inv.totalCgst + inv.totalSgst + inv.totalIgst;
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{inv.invoiceNumber}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{inv.date}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{inv.partyName}</div>
                          <div className="text-[10px] text-slate-400">{inv.partyState || 'Local'}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
                            {inv.partyGstin || 'Unregistered'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                          {formatINR(inv.subTotal)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-purple-600">
                          {formatINR(inv.totalCgst)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-purple-600">
                          {formatINR(inv.totalSgst)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-purple-600">
                          {formatINR(inv.totalIgst)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-purple-800">
                          {formatINR(itc)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                          {formatINR(inv.grandTotal)}
                        </td>
                      </tr>
                    );
                  })}
                  {purchaseBills.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        इस अवधि में कोई खरीद बिल दर्ज नहीं है (No purchase bills found for this period).
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: NET TAX LIABILITY & PROFIT/LOSS (P&L) */}
      {activeSection === 'NET_TAX_PL' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Card 1: Net Tax Liability Calculation */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <span className="p-2 bg-blue-100 text-blue-800 rounded-xl">
                  <ShieldCheck className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    Net GST Tax Liability (शुद्ध सरकार को देय टैक्स)
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    टैक्स देनदारी = [बिक्री टैक्स] - [खरीद/खर्च ITC टैक्स]
                  </p>
                </div>
              </div>

              {/* Formula & Breakdown Table */}
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs">
                      1
                    </span>
                    <div>
                      <div className="font-bold text-slate-900">Output GST Collected on Sales</div>
                      <div className="text-[10px] text-slate-500">बिक्री बिलों पर वसूला गया कुल टैक्स</div>
                    </div>
                  </div>
                  <div className="font-mono font-bold text-sm text-slate-900">
                    +{formatINR(netLiabilityAndProfit.outputTax)}
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center text-xs">
                      2
                    </span>
                    <div>
                      <div className="font-bold text-slate-900">Less: Purchase Input Tax Credit (ITC)</div>
                      <div className="text-[10px] text-slate-500">माल खरीद पर चुकाया गया क्लेम योग्य टैक्स</div>
                    </div>
                  </div>
                  <div className="font-mono font-bold text-sm text-purple-700">
                    -{formatINR(gstr2Totals.purchaseItc)}
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">
                      3
                    </span>
                    <div>
                      <div className="font-bold text-slate-900">Less: Business Expenses ITC</div>
                      <div className="text-[10px] text-slate-500">दुकान खर्चों (किराया/बिजली/भाड़ा) पर चुकाया टैक्स</div>
                    </div>
                  </div>
                  <div className="font-mono font-bold text-sm text-emerald-700">
                    -{formatINR(gstr2Totals.expenseItc)}
                  </div>
                </div>

                {/* Net GST Payable Result Box */}
                {netLiabilityAndProfit.netGstPayable > 0 ? (
                  <div className="p-4 bg-amber-50 rounded-2xl border-2 border-amber-300 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                        Net GST Payable to Government (शुद्ध देय GST):
                      </span>
                      <span className="text-xl font-black font-mono text-amber-950">
                        {formatINR(netLiabilityAndProfit.netGstPayable)}
                      </span>
                    </div>
                    <div className="text-[11px] text-amber-800 font-medium">
                      ⚠️ इस माह का चालान बैंक/GST पोर्टल पर भरकर यह राशि सरकार को जमा करवानी होगी।
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-emerald-50 rounded-2xl border-2 border-emerald-300 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
                        Net GST Payable to Government:
                      </span>
                      <span className="text-xl font-black font-mono text-emerald-900">
                        ₹0.00 (NIL)
                      </span>
                    </div>
                    <div className="text-[11px] text-emerald-800 font-medium">
                      ✓ सरकार को कोई टैक्स नहीं देना है। <strong>{formatINR(netLiabilityAndProfit.itcCarryForward)}</strong> की अतिरिक्त ITC अगले महीने के टैक्स से कटेगी।
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Card 2: Net Profit & Loss (P&L) Summary */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <span className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                  <TrendingUp className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    Net Business Profit / P&L (शुद्ध मुनाफा सारांश)
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    शुद्ध मुनाफा = कुल बिक्री - (कुल खरीद + दुकान के सारे खर्चे)
                  </p>
                </div>
              </div>

              {/* Profit Calculation Rows */}
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    <div>
                      <div className="font-bold text-slate-900">Total Gross Sales Revenue</div>
                      <div className="text-[10px] text-slate-500">अवधि की कुल बिक्री (Turnover)</div>
                    </div>
                  </div>
                  <div className="font-mono font-bold text-sm text-slate-900">
                    +{formatINR(netLiabilityAndProfit.grossSales)}
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-red-500" />
                    <div>
                      <div className="font-bold text-slate-900">Less: Goods Purchased (COGS)</div>
                      <div className="text-[10px] text-slate-500">सप्लायर से माल की कुल खरीद</div>
                    </div>
                  </div>
                  <div className="font-mono font-bold text-sm text-red-600">
                    -{formatINR(netLiabilityAndProfit.purchases)}
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-rose-500" />
                    <div>
                      <div className="font-bold text-slate-900">Less: Total Shop Expenses</div>
                      <div className="text-[10px] text-slate-500">दुकान किराया, बिजली, पगार, भाड़ा आदि</div>
                    </div>
                  </div>
                  <div className="font-mono font-bold text-sm text-rose-600">
                    -{formatINR(netLiabilityAndProfit.shopExpenses)}
                  </div>
                </div>

                {/* Net Profit Callout Box */}
                <div className={`p-4 rounded-2xl border-2 space-y-1 ${
                  netLiabilityAndProfit.netProfit >= 0
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : 'bg-rose-50 border-rose-300 text-rose-950'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wide block">
                        Net Business Profit (शुद्ध शुद्ध मुनाफा):
                      </span>
                      <span className="text-[10px] font-semibold opacity-75">
                        मार्जिन: {netLiabilityAndProfit.profitMargin.toFixed(1)}% of Sales
                      </span>
                    </div>
                    <span className="text-2xl font-black font-mono">
                      {formatINR(netLiabilityAndProfit.netProfit)}
                    </span>
                  </div>
                  <div className="text-[11px] font-medium pt-1 border-t border-slate-200/50">
                    {netLiabilityAndProfit.netProfit >= 0
                      ? '✓ आपकी दुकान मुनाफे में चल रही है (Net Profit positive).'
                      : '⚠️ इस अवधि में खर्चे और खरीद बिक्री से अधिक रहे हैं (Net Loss).'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
