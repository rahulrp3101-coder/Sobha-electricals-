import React, { useState } from 'react';
import { Invoice, CompanyProfile } from '../../types';
import { formatINR } from '../../services/gstCalculator';
import { generateWhatsAppInvoiceURL } from '../../services/whatsappShare';
import { 
  Search, Plus, FileSpreadsheet, Printer, Share2, 
  Trash2, X, AlertTriangle, ArrowRight, RotateCw, CheckCircle2, 
  Clock, ShieldAlert, Sparkles, Eye, Download, Check
} from 'lucide-react';

interface EstimatesRegisterProps {
  invoices: Invoice[];
  company: CompanyProfile;
  onViewEstimate: (estimate: Invoice, format: 'a4' | 'thermal') => void;
  onConvertToInvoice: (estimate: Invoice) => void;
  onDeleteEstimate?: (estimateId: string) => Promise<void>;
  onNewEstimate: () => void;
}

export const EstimatesRegister: React.FC<EstimatesRegisterProps> = ({
  invoices,
  company,
  onViewEstimate,
  onConvertToInvoice,
  onDeleteEstimate,
  onNewEstimate,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'CONVERTED'>('ALL');
  const [estimateToDelete, setEstimateToDelete] = useState<Invoice | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Filter only Estimates and Quotations
  const allEstimates = invoices.filter(
    inv => inv.documentType === 'ESTIMATE' || inv.documentType === 'QUOTATION'
  );

  // Compute summary metrics
  const totalCount = allEstimates.length;
  const totalValue = allEstimates.reduce((sum, e) => sum + (e.grandTotal || 0), 0);
  const convertedCount = allEstimates.filter(e => e.isConvertedToInvoice).length;
  const openCount = totalCount - convertedCount;

  // Filter by search query and status tab
  const filteredEstimates = allEstimates.filter(est => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = 
      !q ||
      est.invoiceNumber.toLowerCase().includes(q) ||
      est.partyName.toLowerCase().includes(q) ||
      (est.partyPhone && est.partyPhone.includes(q)) ||
      (est.notes && est.notes.toLowerCase().includes(q));

    const matchesStatus = 
      statusFilter === 'ALL' ||
      (statusFilter === 'OPEN' && !est.isConvertedToInvoice) ||
      (statusFilter === 'CONVERTED' && Boolean(est.isConvertedToInvoice));

    return matchesSearch && matchesStatus;
  });

  const handleConfirmDelete = async () => {
    if (!estimateToDelete || !onDeleteEstimate) return;
    setIsDeleting(true);
    try {
      await onDeleteEstimate(estimateToDelete.id);
      showToast(`एस्टिमेट #${estimateToDelete.invoiceNumber} सफलतापूर्वक हटा दिया गया`);
      setEstimateToDelete(null);
    } catch (err) {
      console.error('Failed to delete estimate:', err);
      showToast('एस्टिमेट हटाने में त्रुटि हुई');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="px-4 py-2.5 rounded-xl shadow-xl text-xs font-bold flex items-center gap-2 bg-slate-900 text-white border border-slate-700">
            <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
            <span>{toastMsg}</span>
          </div>
        </div>
      )}

      {/* Top Header Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-black shadow-xs">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                Estimates & Quotations Register
              </h2>
              <span className="text-[10px] bg-amber-100 text-amber-900 font-extrabold px-2 py-0.5 rounded-md border border-amber-200">
                कच्चा बिल / कोटेशन
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              ग्राहक के सभी अनुमानित पर्चे देखें, प्रिंट करें अथवा 1-क्लिक में पक्के टैक्स बिल में बदलें।
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onNewEstimate}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs sm:text-sm font-bold transition shadow-xs cursor-pointer active:scale-95"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>+ नया एस्टिमेट बनाएं (Create Estimate)</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">कुल एस्टिमेट (Total)</div>
          <div className="text-2xl font-black font-mono text-slate-900 mt-1">{totalCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">बनाए गए कुल पर्चे</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">अनुमानित राशि (Total Value)</div>
          <div className="text-2xl font-black font-mono text-amber-600 mt-1">{formatINR(totalValue)}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">टैक्स टर्नओवर से बाहर</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">सक्रिय / बाकी (Pending)</div>
          <div className="text-2xl font-black font-mono text-blue-600 mt-1">{openCount}</div>
          <div className="text-[11px] text-blue-500 font-medium mt-0.5">ग्राहक निर्णय की प्रतीक्षा</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">पक्के बिल में बदले (Converted)</div>
          <div className="text-2xl font-black font-mono text-emerald-600 mt-1">{convertedCount}</div>
          <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">टैक्स इनवॉइस बने</div>
        </div>
      </div>

      {/* Search Bar & Filter Tabs */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="एस्टिमेट खोजें: नंबर (EST-2026...), ग्राहक नाम या मोबाइल नंबर..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500 transition"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold shrink-0">
          {[
            { id: 'ALL', label: `सभी (${allEstimates.length})` },
            { id: 'OPEN', label: `सक्रिय / बाकी (${openCount})` },
            { id: 'CONVERTED', label: `पक्का बिल बना (${convertedCount})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Estimates Table / Cards */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {filteredEstimates.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-500 border border-amber-200 flex items-center justify-center mx-auto">
              <FileSpreadsheet className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-800">
                कोई एस्टिमेट / कोटेशन नहीं मिला
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                {searchQuery
                  ? `खोज &quot;${searchQuery}&quot; से मेल खाता कोई कच्चा बिल मौजूद नहीं है।`
                  : 'बिलिंग स्क्रीन पर जाकर ऊपर "Estimate / Quotation" मोड चुनकर नया कच्चा बिल बनाएं।'}
              </p>
            </div>
            <button
              type="button"
              onClick={onNewEstimate}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>पहला एस्टिमेट बनाएं</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[11px] select-none">
                <tr>
                  <th className="py-3 px-4">Estimate No (पर्चा नं)</th>
                  <th className="py-3 px-3">Date (तारीख)</th>
                  <th className="py-3 px-4">Customer Details (ग्राहक)</th>
                  <th className="py-3 px-3 text-center">Items (सामान)</th>
                  <th className="py-3 px-3 text-center">Stock Status (इन्वेंटरी)</th>
                  <th className="py-3 px-3 text-center">Status (स्थिति)</th>
                  <th className="py-3 px-4 text-right font-black">Amount (अनुमानित राशि)</th>
                  <th className="py-3 px-4 text-center">Actions (कार्यवाही)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredEstimates.map((est) => {
                  const isConverted = Boolean(est.isConvertedToInvoice);
                  const isStockDeducted = Boolean(est.deductStock);

                  return (
                    <tr key={est.id} className="hover:bg-amber-50/40 transition">
                      {/* Estimate No */}
                      <td className="py-3 px-4">
                        <div className="font-mono font-black text-amber-700 text-xs sm:text-sm">
                          {est.invoiceNumber}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          ID: {est.id.slice(-6)}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">
                        <div>{est.date}</div>
                        <div className="text-[10px] text-slate-400">
                          {new Date(est.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      {/* Customer */}
                      <td className="py-3 px-4">
                        <div className="font-extrabold text-slate-900 text-xs sm:text-sm">
                          {est.partyName}
                        </div>
                        {est.partyPhone && (
                          <div className="text-[11px] text-slate-500 font-mono">
                            📞 {est.partyPhone}
                          </div>
                        )}
                        {est.partyAddress && (
                          <div className="text-[10px] text-slate-400 truncate max-w-[180px]">
                            📍 {est.partyAddress}
                          </div>
                        )}
                      </td>

                      {/* Items */}
                      <td className="py-3 px-3 text-center">
                        <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                          {est.items?.length || 0} नग
                        </span>
                      </td>

                      {/* Stock Status */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {isStockDeducted ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">
                            <span>📦 स्टॉक घटाया गया</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg">
                            <span>🛡️ स्टॉक सुरक्षित</span>
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {isConverted ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-lg shadow-2xs">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>पक्का बिल बन गया</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg">
                            <Clock className="w-3 h-3 text-blue-600" />
                            <span>सक्रिय पर्चा (Open)</span>
                          </span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4 text-right font-mono font-black text-sm text-slate-900 whitespace-nowrap">
                        {formatINR(est.grandTotal)}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Requirement 4: Convert to Invoice Button */}
                          <button
                            type="button"
                            onClick={() => onConvertToInvoice(est)}
                            className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs active:scale-95 cursor-pointer"
                            title="पक्का बिल बनाएं: इस एस्टिमेट का पूरा सामान बिलिंग स्क्रीन पर लोड होगा"
                          >
                            <RotateCw className="w-3 h-3 stroke-[2.5]" />
                            <span>Convert to Bill</span>
                          </button>

                          {/* Print / View */}
                          <button
                            type="button"
                            onClick={() => onViewEstimate(est, 'thermal')}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                            title="थर्मल रसीद प्रिंट"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onViewEstimate(est, 'a4')}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                            title="A4 एस्टिमेट प्रिंट / PDF"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* WhatsApp Share */}
                          <a
                            href={generateWhatsAppInvoiceURL(est, company)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                            title="WhatsApp पर भेजें"
                          >
                            <Share2 className="w-4 h-4" />
                          </a>

                          {/* Delete Estimate */}
                          {onDeleteEstimate && (
                            <button
                              type="button"
                              onClick={() => setEstimateToDelete(est)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                              title="हटाएं (Delete)"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Estimate Confirmation Modal */}
      {estimateToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 animate-in zoom-in-95 duration-150">
            <div className="bg-red-600 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-white" />
                <h3 className="font-extrabold text-sm sm:text-base">एस्टिमेट हटाने की पुष्टि (Confirm Delete)</h3>
              </div>
              <button
                type="button"
                onClick={() => setEstimateToDelete(null)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/20"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs sm:text-sm">
              <p className="font-semibold text-slate-800">
                क्या आप वाकई एस्टिमेट <strong>#{estimateToDelete.invoiceNumber}</strong> ({estimateToDelete.partyName} - {formatINR(estimateToDelete.grandTotal)}) को हमेशा के लिए हटाना चाहते हैं?
              </p>

              {estimateToDelete.deductStock && (
                <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 font-medium">
                  ⚠️ इस एस्टिमेट में स्टॉक घटाया गया था। हटाने पर संबंधित सामानों का स्टॉक इन्वेंटरी में वापस जुड़ जाएगा।
                </div>
              )}

              <p className="text-[11px] text-slate-500">
                यह रिकॉर्ड लोकल IndexedDB और Supabase क्लाउड दोनों से हमेशा के लिए हटा दिया जाएगा।
              </p>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setEstimateToDelete(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                रद्द करें (Cancel)
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'हटाया जा रहा है...' : 'हाँ, हमेशा के लिए हटाएं'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
