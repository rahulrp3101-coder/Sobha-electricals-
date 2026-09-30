import React, { useState } from 'react';
import { Invoice, DocumentType, CompanyProfile } from '../../types';
import { formatINR } from '../../services/gstCalculator';
import { 
  Search, Plus, Filter, FileText, Printer, 
  Share2, Eye, Download, CheckCircle2, Clock, AlertCircle 
} from 'lucide-react';
import { generateWhatsAppInvoiceURL } from '../../services/whatsappShare';
import { exportInvoicesToCSV } from '../../services/gstrExporter';

interface InvoiceListProps {
  invoices: Invoice[];
  company: CompanyProfile;
  onViewInvoice: (invoice: Invoice, format: 'a4' | 'thermal') => void;
  onNewInvoice: (type?: DocumentType) => void;
}

export const InvoiceList: React.FC<InvoiceListProps> = ({
  invoices,
  company,
  onViewInvoice,
  onNewInvoice,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [docFilter, setDocFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = 
      inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.partyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.partyGstin && inv.partyGstin.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesDoc = docFilter === 'ALL' || inv.documentType === docFilter;
    const matchesStatus = statusFilter === 'ALL' || inv.status === statusFilter;

    return matchesSearch && matchesDoc && matchesStatus;
  });

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Invoices & Bills Register</h2>
          <p className="text-xs text-slate-500">
            Manage GST sales invoices, purchase bills, quotations, and challans
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => exportInvoicesToCSV(filteredInvoices)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export Excel</span>
          </button>

          <button
            onClick={() => onNewInvoice('SALES_INVOICE')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>+ Create Invoice</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by invoice number, customer name, GSTIN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          {/* Document Type Dropdown */}
          <select
            value={docFilter}
            onChange={(e) => setDocFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-600"
          >
            <option value="ALL">All Document Types</option>
            <option value="SALES_INVOICE">Sales Invoices</option>
            <option value="PURCHASE_BILL">Purchase Bills</option>
            <option value="QUOTATION">Quotations / Estimates</option>
            <option value="DELIVERY_CHALLAN">Delivery Challans</option>
            <option value="CREDIT_NOTE">Credit Notes</option>
            <option value="DEBIT_NOTE">Debit Notes</option>
          </select>

          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-600"
          >
            <option value="ALL">All Statuses</option>
            <option value="PAID">Paid</option>
            <option value="PARTIAL">Partial</option>
            <option value="UNPAID">Unpaid</option>
          </select>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Customer / Party</th>
                <th className="py-3 px-4 text-right">Taxable</th>
                <th className="py-3 px-4 text-right">Tax</th>
                <th className="py-3 px-4 text-right">Grand Total</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <FileText className="w-10 h-10 stroke-1 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm font-medium text-slate-600">No invoices matching your criteria</p>
                    <p className="text-xs text-slate-400 mt-1">Try clearing filters or create a new invoice.</p>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 text-slate-600 font-mono whitespace-nowrap">
                      {inv.date}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {inv.invoiceNumber}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        {inv.documentType.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{inv.partyName}</div>
                      <div className="text-[10px] text-slate-400">{inv.partyState} {inv.partyGstin ? `· ${inv.partyGstin}` : ''}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {formatINR(inv.subTotal)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600">
                      {formatINR(inv.totalTax)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      {formatINR(inv.grandTotal)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        inv.status === 'PAID' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : inv.status === 'PARTIAL'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onViewInvoice(inv, 'a4')}
                          className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-blue-600 rounded-lg transition"
                          title="View A4 Invoice"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => onViewInvoice(inv, 'thermal')}
                          className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-emerald-600 rounded-lg transition"
                          title="Print Thermal Receipt"
                        >
                          <Printer className="w-4 h-4" />
                        </button>

                        <a
                          href={generateWhatsAppInvoiceURL(inv, company)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-emerald-600 rounded-lg transition"
                          title="Share via WhatsApp"
                        >
                          <Share2 className="w-4 h-4" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
