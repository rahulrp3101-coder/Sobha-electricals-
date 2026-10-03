import React, { useState } from 'react';
import { Invoice, DocumentType, CompanyProfile } from '../../types';
import { formatINR } from '../../services/gstCalculator';
import { 
  Search, Plus, Filter, FileText, Printer, 
  Share2, Eye, Download, CheckCircle2, Clock, AlertCircle, Trash2, X, AlertTriangle, Check
} from 'lucide-react';
import { generateWhatsAppInvoiceURL } from '../../services/whatsappShare';
import { exportInvoicesToCSV } from '../../services/gstrExporter';

interface InvoiceListProps {
  invoices: Invoice[];
  company: CompanyProfile;
  onViewInvoice: (invoice: Invoice, format: 'a4' | 'thermal') => void;
  onNewInvoice: (type?: DocumentType) => void;
  onSelectParty?: (partyId: string, partyName: string) => void;
  onDeleteInvoice?: (invoiceId: string) => Promise<void>;
}

export const InvoiceList: React.FC<InvoiceListProps> = ({
  invoices,
  company,
  onViewInvoice,
  onNewInvoice,
  onSelectParty,
  onDeleteInvoice,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [docFilter, setDocFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleConfirmDelete = async () => {
    if (!invoiceToDelete || !onDeleteInvoice) return;
    setIsDeleting(true);
    try {
      await onDeleteInvoice(invoiceToDelete.id);
      showToast('सफलतापूर्वक हटा दिया गया (Deleted Successfully)');
      setInvoiceToDelete(null);
    } catch (err) {
      console.error('Failed to delete invoice:', err);
      showToast('हटाने में त्रुटि हुई');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = 
      inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.partyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.partyGstin && inv.partyGstin.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesDoc = 
      docFilter === 'ALL' || 
      inv.documentType === docFilter || 
      (docFilter === 'QUOTATION' && (inv.documentType === 'QUOTATION' || inv.documentType === 'ESTIMATE'));
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
                      {onSelectParty ? (
                        <button
                          type="button"
                          onClick={() => onSelectParty(inv.partyId, inv.partyName)}
                          className="text-left group flex flex-col items-start hover:opacity-90 transition cursor-pointer"
                          title="Click to open Customer Ledger (ग्राहक खाता खोलें)"
                        >
                          <div className="font-bold text-blue-700 group-hover:text-blue-900 group-hover:underline flex items-center gap-1.5">
                            <span>{inv.partyName}</span>
                            <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-normal transition group-hover:bg-blue-600 group-hover:text-white">
                              👁️ खाता
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {inv.partyState} {inv.partyGstin ? `· ${inv.partyGstin}` : ''}
                          </div>
                        </button>
                      ) : (
                        <div>
                          <div className="font-semibold text-slate-900">{inv.partyName}</div>
                          <div className="text-[10px] text-slate-400">{inv.partyState} {inv.partyGstin ? `· ${inv.partyGstin}` : ''}</div>
                        </div>
                      )}
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

                        {/* Red Delete Invoice Button (Requirement 1) */}
                        {onDeleteInvoice && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setInvoiceToDelete(inv);
                            }}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-bold transition shadow-2xs active:scale-95 cursor-pointer"
                            title="Delete Invoice (इनवॉइस हटाएं व स्टॉक रीसेट करें)"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-600 stroke-[2.5]" />
                            <span>🗑️ Delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Toast Feedback */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-2">
          <div className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-xl font-bold text-xs flex items-center gap-2 border border-emerald-500">
            <Check className="w-4 h-4 stroke-[3]" />
            <span>{toastMsg}</span>
          </div>
        </div>
      )}

      {/* Delete Invoice Confirmation Modal (Requirement 1) */}
      {invoiceToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="bg-red-600 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center font-bold">
                  <AlertTriangle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base">🗑️ Delete Invoice (इनवॉइस हटाएं)</h3>
                  <p className="text-[11px] text-red-100">स्टॉक व ग्राहक बकाया ऑटो-रीसेट होगा</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInvoiceToDelete(null)}
                className="p-1 rounded-lg text-red-200 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl space-y-2 text-red-900">
                <div className="font-extrabold text-sm text-red-950 leading-snug">
                  क्या आप वाकई इनवॉइस [{invoiceToDelete.invoiceNumber}] को हटाना चाहते हैं? इससे स्टॉक और ग्राहक का बकाया रीसेट हो जाएगा।
                </div>
                <p className="text-xs text-red-800 leading-relaxed">
                  इस बिल में शामिल सभी सामानों की मात्रा (<strong className="font-mono">{invoiceToDelete.items?.length || 0} आइटम्स</strong>) को इन्वेंटरी स्टॉक में वापस जोड़ दिया जाएगा, और ग्राहक के खाते से बिल की बकाया राशि (<strong className="font-mono">{formatINR(invoiceToDelete.balanceAmount)}</strong>) घटा दी जाएगी।
                </p>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 font-medium text-slate-700">
                <div className="flex justify-between">
                  <span>ग्राहक / पार्टी:</span>
                  <span className="font-bold text-slate-900">{invoiceToDelete.partyName}</span>
                </div>
                <div className="flex justify-between">
                  <span>दिनांक (Date):</span>
                  <span className="font-mono">{invoiceToDelete.date}</span>
                </div>
                <div className="flex justify-between">
                  <span>कुल बिल राशि (Grand Total):</span>
                  <span className="font-mono font-bold text-blue-700">{formatINR(invoiceToDelete.grandTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>बकाया राशि (Balance Due):</span>
                  <span className="font-mono font-bold text-amber-800">{formatINR(invoiceToDelete.balanceAmount)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setInvoiceToDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
                >
                  रद्द करें (Cancel)
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isDeleting ? 'हटाया जा रहा है...' : 'हाँ, इनवॉइस हटाएं'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
