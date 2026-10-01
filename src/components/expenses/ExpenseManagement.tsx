import React, { useState, useMemo } from 'react';
import { Expense, ExpenseCategory, PaymentMode, CompanyProfile } from '../../types';
import { formatINR } from '../../services/gstCalculator';
import { 
  Plus, Search, Calendar, DollarSign, Tag, 
  Trash2, X, Check, Image as ImageIcon, 
  CreditCard, Smartphone, Banknote, Building, Zap, 
  Users, Truck, Coffee, Wrench, MoreHorizontal, Download, 
  CheckCircle2, AlertCircle, Eye, ArrowUpRight
} from 'lucide-react';

interface ExpenseManagementProps {
  expenses: Expense[];
  company: CompanyProfile;
  onSaveExpense: (expense: Expense) => Promise<void>;
  onDeleteExpense: (id: string) => Promise<void>;
}

const CATEGORY_META: Record<string, { label: string; hindi: string; icon: any; color: string }> = {
  RENT: { label: 'Shop Rent', hindi: 'दुकान किराया', icon: Building, color: 'text-purple-600 bg-purple-50 border-purple-200' },
  ELECTRICITY: { label: 'Electricity Bill', hindi: 'बिजली बिल', icon: Zap, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  SALARY: { label: 'Staff Salary', hindi: 'स्टाफ पगार', icon: Users, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  FREIGHT: { label: 'Freight & Transport', hindi: 'भाड़ा / ट्रांसपोर्ट', icon: Truck, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  OFFICE: { label: 'Tea & Refreshment', hindi: 'चाय / नाश्ता / ऑफिस', icon: Coffee, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  MAINTENANCE: { label: 'Maintenance & Repair', hindi: 'दुकान मरम्मत', icon: Wrench, color: 'text-orange-600 bg-orange-50 border-orange-200' },
  OTHER: { label: 'Other Expense', hindi: 'अन्य खर्च', icon: MoreHorizontal, color: 'text-slate-600 bg-slate-50 border-slate-200' },
};

export const ExpenseManagement: React.FC<ExpenseManagementProps> = ({
  expenses,
  company,
  onSaveExpense,
  onDeleteExpense,
}) => {
  // Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>('ALL');
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);

  // Form State
  const [category, setCategory] = useState<ExpenseCategory>('RENT');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [notes, setNotes] = useState('');
  const [isGstApplicable, setIsGstApplicable] = useState(false);
  const [gstRate, setGstRate] = useState<number>(18);
  const [receiptPhoto, setReceiptPhoto] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Toast feedback
  const [toastMsg, setToastMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const showToast = (text: string, isError = false) => {
    setToastMsg({ text, isError });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Auto calculate tax amount if GST is applicable
  const taxAmount = useMemo(() => {
    if (!isGstApplicable || !amount || Number(amount) <= 0) return 0;
    const gross = Number(amount);
    // Tax inclusive calculation: tax = gross * (rate / (100 + rate))
    return Number((gross * (gstRate / (100 + gstRate))).toFixed(2));
  }, [isGstApplicable, amount, gstRate]);

  // Current month string YYYY-MM
  const currentMonthStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      const matchesCategory = selectedCategoryFilter === 'ALL' || e.category === selectedCategoryFilter;
      const matchesMonth = selectedMonthFilter === 'ALL' || e.date.startsWith(selectedMonthFilter);
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = 
        !q ||
        (e.title && e.title.toLowerCase().includes(q)) ||
        (e.notes && e.notes.toLowerCase().includes(q)) ||
        e.category.toLowerCase().includes(q);
      return matchesCategory && matchesMonth && matchesSearch;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, selectedCategoryFilter, selectedMonthFilter, searchQuery]);

  // Summary Metrics for filtered month or current month
  const metrics = useMemo(() => {
    const targetExpenses = selectedMonthFilter === 'ALL' 
      ? expenses.filter(e => e.date.startsWith(currentMonthStr))
      : expenses.filter(e => e.date.startsWith(selectedMonthFilter));

    const totalMonthExpense = targetExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const totalMonthItc = targetExpenses.reduce((s, e) => s + (e.taxAmount || 0), 0);
    const cashExpenses = targetExpenses.filter(e => e.paymentMode === 'CASH').reduce((s, e) => s + e.amount, 0);
    const onlineExpenses = targetExpenses.filter(e => e.paymentMode !== 'CASH').reduce((s, e) => s + e.amount, 0);

    return {
      totalMonthExpense,
      totalMonthItc,
      cashExpenses,
      onlineExpenses,
      count: targetExpenses.length,
    };
  }, [expenses, selectedMonthFilter, currentMonthStr]);

  // Image Upload Handler (convert to base64 for offline storage)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('फ़ोटो 2MB से कम होनी चाहिए', true);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setReceiptPhoto(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      showToast('कृपया वैध खर्च राशि दर्ज करें', true);
      return;
    }

    setIsSaving(true);
    try {
      const catLabel = CATEGORY_META[category]?.hindi || category;
      const newExpense: Expense = {
        id: `exp-${Date.now()}`,
        category,
        title: title.trim() || catLabel,
        amount: Number(amount),
        date,
        paymentMode,
        notes: notes.trim() || undefined,
        isGstApplicable,
        gstRate: isGstApplicable ? gstRate : undefined,
        taxAmount: isGstApplicable ? taxAmount : undefined,
        receiptPhoto: receiptPhoto || undefined,
        createdAt: new Date().toISOString(),
      };

      await onSaveExpense(newExpense);
      showToast(`खर्च सेव हुआ: ${newExpense.title} (${formatINR(newExpense.amount)})`);
      setIsAddModalOpen(false);
      // Reset
      setTitle('');
      setAmount('');
      setNotes('');
      setReceiptPhoto('');
      setIsGstApplicable(false);
    } catch (err: any) {
      console.error('Failed to save expense:', err);
      showToast('खर्च सेव करने में समस्या: ' + err.message, true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, nameStr: string) => {
    if (!window.confirm(`क्या आप '${nameStr}' खर्च को हटाना चाहते हैं?`)) return;
    try {
      await onDeleteExpense(id);
      showToast('खर्च हटा दिया गया');
    } catch (err: any) {
      showToast('हटाने में त्रुटि: ' + err.message, true);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Expense ID', 'Date', 'Category', 'Description', 'Payment Mode', 'GST Applicable', 'GST Rate', 'ITC Amount (₹)', 'Total Amount (₹)', 'Notes'];
    const rows = filteredExpenses.map(e => [
      `"${e.id}"`,
      `"${e.date}"`,
      `"${CATEGORY_META[e.category]?.label || e.category}"`,
      `"${e.title}"`,
      `"${e.paymentMode}"`,
      `"${e.isGstApplicable ? 'YES' : 'NO'}"`,
      `"${e.gstRate ? e.gstRate + '%' : '0%'}"`,
      (e.taxAmount || 0).toFixed(2),
      e.amount.toFixed(2),
      `"${e.notes || ''}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Shop_Expenses_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-7xl mx-auto pb-24 lg:pb-12 animate-in fade-in">
      {/* Toast Alert */}
      {toastMsg && (
        <div className={`fixed top-20 right-4 z-50 px-4 py-2.5 rounded-2xl shadow-xl border text-xs sm:text-sm font-bold flex items-center gap-2 ${
          toastMsg.isError ? 'bg-red-900 text-white border-red-700' : 'bg-slate-900 text-white border-slate-700'
        }`}>
          {toastMsg.isError ? <AlertCircle className="w-4 h-4 text-red-400" /> : <Check className="w-4 h-4 text-emerald-400" />}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Shop Expenses <span className="text-xs font-normal text-slate-500">(दुकान खर्च प्रबंधन)</span>
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            किराया, बिजली, स्टाफ सैलरी, भाड़ा व अन्य खर्चों का हिसाब दर्ज करें और व्यापारिक खर्चों पर मिलने वाले GST ITC का लाभ लें।
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Export Expenses Button */}
          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition shadow-2xs"
            title="Download Excel / CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          {/* Add Expense Button (Requirement 1) */}
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-bold transition shadow-xs"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>+ Add Expense (नया खर्च जोड़ें)</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip (Total Monthly Expense & ITC) */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {/* Card 1: Total Monthly Expense */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Monthly Expense (इस महीने का कुल खर्च)
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-purple-700 mt-1">
            {formatINR(metrics.totalMonthExpense)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {metrics.count} expenses recorded this month
          </div>
        </div>

        {/* Card 2: Total Claimable ITC on Expenses */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
            GST ITC on Expenses (खर्च पर मिला ITC)
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-emerald-700 mt-1">
            {formatINR(metrics.totalMonthItc)}
          </div>
          <div className="text-[10px] text-emerald-600 mt-0.5">
            GSTR-2B में टैक्स छूट योग्य इनपुट
          </div>
        </div>

        {/* Card 3: Cash Expenses */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Cash Expenses (नकद खर्च)
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-slate-800 mt-1">
            {formatINR(metrics.cashExpenses)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            दुकान गल्ले (Cash Drawer) से भुगतान
          </div>
        </div>

        {/* Card 4: Online / UPI Expenses */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">
            UPI &amp; Bank Expenses (ऑनलाइन खर्च)
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-blue-700 mt-1">
            {formatINR(metrics.onlineExpenses)}
          </div>
          <div className="text-[10px] text-blue-600 mt-0.5">
            UPI / बैंक खाते से सीधे भुगतान
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row gap-2.5 sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search by expense note or description (खर्च खोजें)..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-purple-600 font-medium"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          {/* Category Filter */}
          <select
            value={selectedCategoryFilter}
            onChange={e => setSelectedCategoryFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-purple-600"
          >
            <option value="ALL">All Categories (सभी श्रेणियां)</option>
            {Object.entries(CATEGORY_META).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.hindi} ({meta.label})
              </option>
            ))}
          </select>

          {/* Month Filter */}
          <input
            type="month"
            value={selectedMonthFilter === 'ALL' ? currentMonthStr : selectedMonthFilter}
            onChange={e => setSelectedMonthFilter(e.target.value || 'ALL')}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-purple-600 font-mono"
          />

          {selectedMonthFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setSelectedMonthFilter('ALL')}
              className="text-xs text-purple-700 font-bold hover:underline whitespace-nowrap"
            >
              Clear Month (सभी देखें)
            </button>
          )}
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {filteredExpenses.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <DollarSign className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-600">No Expenses Recorded</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Click &quot;+ Add Expense&quot; above to log your shop rent, staff wages, electricity bills, and transport costs.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Date (तारीख)</th>
                  <th className="py-3 px-3">Category (श्रेणी)</th>
                  <th className="py-3 px-4">Description (विवरण)</th>
                  <th className="py-3 px-3">Payment Mode</th>
                  <th className="py-3 px-3 text-right">GST ITC (टैक्स)</th>
                  <th className="py-3 px-4 text-right font-black">Amount (रकम)</th>
                  <th className="py-3 px-3 text-center">Receipt (बिल)</th>
                  <th className="py-3 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.map(expense => {
                  const meta = CATEGORY_META[expense.category] || CATEGORY_META.OTHER;
                  const Icon = meta.icon;

                  return (
                    <tr key={expense.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {expense.date}
                      </td>

                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${meta.color}`}>
                          <Icon className="w-3.5 h-3.5" />
                          <span>{meta.hindi}</span>
                        </span>
                      </td>

                      <td className="py-3 px-4 font-bold text-slate-900">
                        <div>{expense.title}</div>
                        {expense.notes && (
                          <div className="text-[10px] text-slate-400 font-normal mt-0.5 truncate max-w-xs">
                            {expense.notes}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 font-semibold text-slate-700">
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px] font-mono">
                          {expense.paymentMode}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right font-mono">
                        {expense.isGstApplicable && expense.taxAmount ? (
                          <div>
                            <span className="text-emerald-700 font-bold">
                              +{formatINR(expense.taxAmount)}
                            </span>
                            <div className="text-[9px] text-slate-400 font-sans">
                              ITC ({expense.gstRate}%)
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-300 text-[11px]">No GST</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-black text-sm text-slate-900 whitespace-nowrap">
                        {formatINR(expense.amount)}
                      </td>

                      <td className="py-3 px-3 text-center">
                        {expense.receiptPhoto ? (
                          <button
                            type="button"
                            onClick={() => setViewingReceipt(expense.receiptPhoto!)}
                            className="p-1 rounded-lg hover:bg-slate-100 text-purple-600 font-bold transition inline-flex items-center gap-1"
                            title="View uploaded receipt photo"
                          >
                            <ImageIcon className="w-4 h-4" />
                            <span className="text-[10px] underline">View</span>
                          </button>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleDelete(expense.id, expense.title)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 transition"
                          title="Delete Expense"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD EXPENSE MODAL (Requirement 1) */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-purple-700 text-white">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-white" />
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base">+ Add New Expense (नया खर्च जोड़ें)</h3>
                  <p className="text-[11px] text-purple-100">दुकान खर्च दर्ज करें और GST ITC क्लेम करें</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-purple-200 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSubmit} className="p-4 sm:p-6 space-y-4 text-xs">
              {/* Category Selector with Icons */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Expense Category (खर्च की श्रेणी) *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(CATEGORY_META).map(([key, meta]) => {
                    const Icon = meta.icon;
                    const isSelected = category === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setCategory(key as ExpenseCategory);
                          if (!title || Object.values(CATEGORY_META).some(m => m.hindi === title)) {
                            setTitle(meta.hindi);
                          }
                        }}
                        className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2 ${
                          isSelected
                            ? 'bg-purple-50 border-purple-600 text-purple-900 font-black shadow-2xs ring-1 ring-purple-600'
                            : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 font-semibold'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0 text-purple-600" />
                        <div className="truncate">
                          <div className="text-xs truncate">{meta.hindi}</div>
                          <div className="text-[10px] text-slate-400 truncate">{meta.label}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Amount & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Amount ₹ (खर्च राशि) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 font-mono font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      required
                      placeholder="0.00"
                      value={amount}
                      onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base font-mono font-black text-purple-900 focus:bg-white focus:outline-none focus:border-purple-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Expense Date (तारीख) *
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-purple-600"
                  />
                </div>
              </div>

              {/* Payment Mode Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Payment Mode (भुगतान का माध्यम) *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'CASH', label: '💵 Cash (नकद)' },
                    { id: 'UPI', label: '📱 UPI / QR' },
                    { id: 'BANK_TRANSFER', label: '💳 Bank Transfer' },
                  ].map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMode(m.id as any)}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition text-center ${
                        paymentMode === m.id
                          ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title / Description */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Description / Note (खर्च का विवरण / नाम)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Shop rent for September / Staff lunch"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-purple-600"
                />
              </div>

              {/* GST & Input Tax Credit (ITC) Toggle */}
              <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isGstApplicable}
                      onChange={e => setIsGstApplicable(e.target.checked)}
                      className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                    />
                    <span className="font-extrabold text-xs text-purple-950">
                      क्या इस खर्च पर GST लगा है? (GST Tax &amp; ITC Claim)
                    </span>
                  </label>
                  {isGstApplicable && (
                    <span className="text-[10px] font-bold bg-purple-200 text-purple-900 px-2 py-0.5 rounded-full">
                      ITC Eligible
                    </span>
                  )}
                </div>

                {isGstApplicable && (
                  <div className="grid grid-cols-2 gap-2.5 pt-1 animate-in fade-in">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        GST Tax Rate %
                      </label>
                      <select
                        value={gstRate}
                        onChange={e => setGstRate(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800"
                      >
                        <option value={5}>5% GST</option>
                        <option value={12}>12% GST</option>
                        <option value={18}>18% GST (Standard)</option>
                        <option value={28}>28% GST</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Claimable ITC (टैक्स क्रेडिट)
                      </label>
                      <div className="px-2.5 py-1.5 bg-emerald-50 border border-emerald-300 rounded-lg text-xs font-mono font-black text-emerald-800">
                        {formatINR(taxAmount)}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Receipt Bill Photo Upload (Optional) */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Bill / Receipt Photo (बिल रसीद की फोटो - वैकल्पिक)
                </label>
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold flex items-center gap-1.5 border border-slate-300 transition">
                    <ImageIcon className="w-4 h-4" />
                    <span>Upload Photo (फोटो चुनें)</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>

                  {receiptPhoto && (
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-lg border border-slate-300 overflow-hidden">
                        <img src={receiptPhoto} alt="Receipt" className="w-full h-full object-cover" />
                      </div>
                      <button
                        type="button"
                        onClick={() => setReceiptPhoto('')}
                        className="text-red-500 font-bold hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition"
                >
                  Cancel (रद्द करें)
                </button>

                <button
                  type="submit"
                  disabled={isSaving || !amount || Number(amount) <= 0}
                  className="flex-2 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl font-bold transition shadow-xs flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{isSaving ? 'Saving...' : 'Save Expense (खर्च सेव करें)'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Enlarged Receipt Photo Viewer */}
      {viewingReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="relative max-w-2xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl p-2">
            <button
              type="button"
              onClick={() => setViewingReceipt(null)}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-black/60 text-white hover:bg-black"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={viewingReceipt} alt="Full Receipt" className="w-full max-h-[85vh] object-contain rounded-xl" />
          </div>
        </div>
      )}
    </div>
  );
};
