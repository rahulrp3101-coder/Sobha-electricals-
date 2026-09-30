import React, { useState } from 'react';
import { Invoice, CompanyProfile, Expense, PaymentTransaction, Item, Party } from '../../types';
import { formatINR } from '../../services/gstCalculator';
import { generateGSTR1JSON, downloadJSONFile, exportInvoicesToCSV } from '../../services/gstrExporter';
import { 
  BarChart3, FileSpreadsheet, Download, TrendingUp, 
  ArrowUpRight, ArrowDownLeft, Calendar, FileText, CheckCircle2 
} from 'lucide-react';

interface GSTReportsViewProps {
  invoices: Invoice[];
  expenses: Expense[];
  payments: PaymentTransaction[];
  items: Item[];
  parties: Party[];
  company: CompanyProfile;
}

export const GSTReportsView: React.FC<GSTReportsViewProps> = ({
  invoices,
  expenses,
  payments,
  items,
  parties,
  company,
}) => {
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'PL' | 'BALANCE_SHEET' | 'GSTR1' | 'DAYBOOK'>('DASHBOARD');

  // Compute Live Metrics
  const salesInvoices = invoices.filter(i => i.documentType === 'SALES_INVOICE');
  const purchaseBills = invoices.filter(i => i.documentType === 'PURCHASE_BILL');

  const totalSalesRevenue = salesInvoices.reduce((s, i) => s + i.grandTotal, 0);
  const totalTaxCollected = salesInvoices.reduce((s, i) => s + i.totalTax, 0);
  const totalPurchases = purchaseBills.reduce((s, i) => s + i.grandTotal, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  // Approximate COGS: 70% of sales
  const estimatedCOGS = totalSalesRevenue * 0.68;
  const grossProfit = totalSalesRevenue - estimatedCOGS;
  const netProfit = grossProfit - totalExpenses;

  // Inventory Asset Value
  const totalStockAssetValue = items.reduce((s, i) => s + (i.currentStock * i.purchasePrice), 0);
  const totalReceivables = parties.filter(p => p.currentBalance > 0).reduce((s, p) => s + p.currentBalance, 0);
  const totalPayables = parties.filter(p => p.currentBalance < 0).reduce((s, p) => s + Math.abs(p.currentBalance), 0);
  const cashInHand = 42800; // Simulated cash balance
  const bankBalance = 168450; // Simulated bank balance

  const totalAssets = totalStockAssetValue + totalReceivables + cashInHand + bankBalance;
  const totalLiabilities = totalPayables + 50000; // Trade payables + working capital loan

  const handleDownloadGSTR1 = () => {
    const data = generateGSTR1JSON(invoices, company, '092026');
    downloadJSONFile(data, `GSTR1_${company.gstin}_092026.json`);
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header & Sub-Nav */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Business Reports & GST Filing</h2>
          <p className="text-xs text-slate-500">
            Real-time financial statements, GST compliance returns (GSTR-1, GSTR-3B), and daybook
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs self-start sm:self-auto overflow-x-auto">
          {[
            { id: 'DASHBOARD', label: 'Overview' },
            { id: 'PL', label: 'Profit & Loss' },
            { id: 'BALANCE_SHEET', label: 'Balance Sheet' },
            { id: 'GSTR1', label: 'GSTR-1 JSON' },
            { id: 'DAYBOOK', label: 'Daybook' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: OVERVIEW DASHBOARD */}
      {activeTab === 'DASHBOARD' && (
        <div className="space-y-4">
          {/* Key Metric Tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-400 font-medium">Total Sales (Turnover)</span>
              <div className="text-xl font-black font-mono text-slate-900 mt-1">
                {formatINR(totalSalesRevenue)}
              </div>
              <div className="text-[10px] text-emerald-600 font-semibold mt-1">
                {salesInvoices.length} invoices generated
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-400 font-medium">Net Estimated Profit</span>
              <div className="text-xl font-black font-mono text-emerald-600 mt-1">
                {formatINR(netProfit)}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                After COGS & OpEx
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-400 font-medium">Customer Receivables</span>
              <div className="text-xl font-black font-mono text-amber-600 mt-1">
                {formatINR(totalReceivables)}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                Pending Khata dues
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-400 font-medium">Total Stock Value</span>
              <div className="text-xl font-black font-mono text-blue-600 mt-1">
                {formatINR(totalStockAssetValue)}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                {items.length} inventory items
              </div>
            </div>
          </div>

          {/* Quick GST Actions Card */}
          <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded text-[10px] font-mono font-bold">
                  GST PORTAL READY
                </span>
                <span className="text-xs text-slate-400">GSTIN: {company.gstin}</span>
              </div>
              <h3 className="text-lg font-bold">GSTR-1 Monthly Return Filing Export</h3>
              <p className="text-xs text-slate-400 max-w-xl mt-1">
                Download pre-validated B2B and B2CS JSON for direct upload into the GST portal (gst.gov.in) offline utility.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadGSTR1}
                className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2 transition shadow-md"
              >
                <Download className="w-4 h-4" />
                <span>Download GSTR-1 JSON</span>
              </button>

              <button
                onClick={() => exportInvoicesToCSV(invoices)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl text-xs flex items-center gap-2 transition border border-slate-700"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Excel CSV</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PROFIT & LOSS STATEMENT */}
      {activeTab === 'PL' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-bold text-base text-slate-900">Trading & Profit and Loss Account</h3>
              <p className="text-xs text-slate-400 font-mono">For Period: 01-Sep-2026 to 30-Sep-2026</p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400">Reporting Currency:</span>
              <span className="text-xs font-bold text-slate-800 ml-1 font-mono">INR (₹)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs">
            {/* Revenue / Income */}
            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] border-b border-slate-200 pb-1.5">
                Revenue & Incomes
              </h4>
              <div className="flex justify-between text-slate-700">
                <span>Gross Sales Turnover:</span>
                <span className="font-mono font-bold">{formatINR(totalSalesRevenue)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Less: Sales Return / Credit Notes:</span>
                <span className="font-mono">(-) ₹0.00</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 pt-2 border-t border-slate-100">
                <span>Net Sales:</span>
                <span className="font-mono text-emerald-600">{formatINR(totalSalesRevenue)}</span>
              </div>

              {/* COGS */}
              <div className="pt-4 space-y-2">
                <h5 className="font-semibold text-slate-700 text-[11px]">Cost of Goods Sold (COGS)</h5>
                <div className="flex justify-between text-slate-600">
                  <span>Opening Stock:</span>
                  <span className="font-mono">₹1,20,000.00</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Add: Purchases:</span>
                  <span className="font-mono">{formatINR(totalPurchases)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Direct Freight & Inward:</span>
                  <span className="font-mono">₹1,200.00</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Less: Closing Inventory:</span>
                  <span className="font-mono">(-) {formatINR(totalStockAssetValue)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 pt-2 border-t border-slate-100">
                  <span>Gross Profit:</span>
                  <span className="font-mono text-blue-600">{formatINR(grossProfit)}</span>
                </div>
              </div>
            </div>

            {/* Operating Expenses */}
            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] border-b border-slate-200 pb-1.5">
                Indirect Operating Expenses
              </h4>
              {expenses.map((e) => (
                <div key={e.id} className="flex justify-between text-slate-700">
                  <span>{e.title} ({e.category}):</span>
                  <span className="font-mono">{formatINR(e.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold text-slate-900 pt-2 border-t border-slate-100">
                <span>Total Operating Expenses:</span>
                <span className="font-mono text-red-600">{formatINR(totalExpenses)}</span>
              </div>

              {/* Net Profit Callout Box */}
              <div className="mt-8 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                    Net Profit Before Taxes
                  </div>
                  <div className="text-xl font-black font-mono text-emerald-950 mt-1">
                    {formatINR(netProfit)}
                  </div>
                </div>
                <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BALANCE SHEET */}
      {activeTab === 'BALANCE_SHEET' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-bold text-base text-slate-900">Statement of Financial Position (Balance Sheet)</h3>
              <p className="text-xs text-slate-400 font-mono">As of: 29-Sep-2026</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs">
            {/* Assets */}
            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] border-b border-slate-200 pb-1.5">
                Assets (Current & Liquid)
              </h4>
              <div className="flex justify-between text-slate-700">
                <span>Closing Stock Value:</span>
                <span className="font-mono font-semibold">{formatINR(totalStockAssetValue)}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>Trade Debtors (Customer Receivables):</span>
                <span className="font-mono font-semibold">{formatINR(totalReceivables)}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>Cash in Hand:</span>
                <span className="font-mono font-semibold">{formatINR(cashInHand)}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>Bank Accounts (HDFC):</span>
                <span className="font-mono font-semibold">{formatINR(bankBalance)}</span>
              </div>
              <div className="flex justify-between font-bold text-base text-slate-900 pt-3 border-t-2 border-slate-900">
                <span>Total Assets:</span>
                <span className="font-mono text-blue-600">{formatINR(totalAssets)}</span>
              </div>
            </div>

            {/* Liabilities & Equity */}
            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] border-b border-slate-200 pb-1.5">
                Liabilities & Capital
              </h4>
              <div className="flex justify-between text-slate-700">
                <span>Trade Creditors (Supplier Payables):</span>
                <span className="font-mono font-semibold">{formatINR(totalPayables)}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>Duties & Taxes Payable (GST):</span>
                <span className="font-mono font-semibold">{formatINR(totalTaxCollected)}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>Proprietor Capital & Retained Earnings:</span>
                <span className="font-mono font-semibold">{formatINR(totalAssets - totalLiabilities)}</span>
              </div>
              <div className="flex justify-between font-bold text-base text-slate-900 pt-3 border-t-2 border-slate-900">
                <span>Total Liabilities & Equity:</span>
                <span className="font-mono text-slate-900">{formatINR(totalAssets)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: GSTR-1 JSON VIEWER */}
      {activeTab === 'GSTR1' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-base text-slate-900">GSTR-1 Government Schema Export</h3>
              <p className="text-xs text-slate-500">
                Contains B2B table 4, B2CS table 7, and HSN summary table 12
              </p>
            </div>
            <button
              onClick={handleDownloadGSTR1}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>Download JSON File</span>
            </button>
          </div>

          <pre className="bg-slate-950 text-emerald-400 p-4 rounded-xl text-xs font-mono max-h-96 overflow-y-auto leading-relaxed border border-slate-800">
            {JSON.stringify(generateGSTR1JSON(invoices, company, '092026'), null, 2)}
          </pre>
        </div>
      )}

      {/* TAB 5: DAYBOOK */}
      {activeTab === 'DAYBOOK' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-base text-slate-900">Daily Cash & Bank Transaction Daybook</h3>
              <p className="text-xs text-slate-500">Chronological flow of all sales, payments, and expenses</p>
            </div>
          </div>

          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Particulars</th>
                  <th className="py-2.5 px-3">Voucher Type</th>
                  <th className="py-2.5 px-3 text-right">Debit (In)</th>
                  <th className="py-2.5 px-3 text-right">Credit (Out)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-2 px-3 font-mono text-slate-500">{inv.date}</td>
                    <td className="py-2 px-3 font-semibold text-slate-900">{inv.partyName} ({inv.invoiceNumber})</td>
                    <td className="py-2 px-3 text-slate-500">{inv.documentType}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600">
                      {formatINR(inv.receivedAmount)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-400">-</td>
                  </tr>
                ))}
                {expenses.map((exp) => (
                  <tr key={exp.id}>
                    <td className="py-2 px-3 font-mono text-slate-500">{exp.date}</td>
                    <td className="py-2 px-3 font-semibold text-slate-900">{exp.title} ({exp.category})</td>
                    <td className="py-2 px-3 text-slate-500">PAYMENT VOUCHER</td>
                    <td className="py-2 px-3 text-right font-mono text-slate-400">-</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-red-600">
                      {formatINR(exp.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
