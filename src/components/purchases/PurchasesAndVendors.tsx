import React, { useState, useMemo } from 'react';
import { 
  Party, Item, Invoice, PaymentTransaction, CompanyProfile, 
  InvoiceItem, PaymentMode, DocumentType 
} from '../../types';
import { formatINR, calculateItemGST, calculateInvoiceTotals } from '../../services/gstCalculator';
import { 
  Plus, Search, Building2, Users, FileText, ArrowDownLeft, 
  ArrowUpRight, RotateCcw, AlertTriangle, Check, Printer, 
  Phone, MapPin, Hash, Trash2, X, ChevronRight, DollarSign,
  Calendar, CreditCard, ShoppingBag, Eye
} from 'lucide-react';

interface PurchasesAndVendorsProps {
  parties: Party[];
  items: Item[];
  invoices: Invoice[];
  payments: PaymentTransaction[];
  company: CompanyProfile;
  onSaveInvoice: (invoice: Invoice, printImmediate?: boolean, printFormat?: 'thermal' | 'a4') => Promise<Invoice>;
  onSaveParty: (party: Party) => Promise<void>;
  onSaveItem?: (item: Item) => Promise<void>;
  onRecordPayment: (payment: PaymentTransaction) => Promise<void>;
  onViewInvoice?: (invoice: Invoice, format: 'thermal' | 'a4') => void;
}

export const PurchasesAndVendors: React.FC<PurchasesAndVendorsProps> = ({
  parties,
  items,
  invoices,
  payments,
  company,
  onSaveInvoice,
  onSaveParty,
  onSaveItem,
  onRecordPayment,
  onViewInvoice,
}) => {
  // Main Sub-tabs: 'PURCHASE_BILLS' | 'SUPPLIERS' | 'RETURNS'
  const [activeTab, setActiveTab] = useState<'PURCHASE_BILLS' | 'SUPPLIERS' | 'RETURNS'>('PURCHASE_BILLS');

  // Supplier filter & search
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isAddSupplierModalOpen, setIsAddSupplierModalOpen] = useState(false);
  const [isNewPurchaseModalOpen, setIsNewPurchaseModalOpen] = useState(false);
  const [isPaymentOutModalOpen, setIsPaymentOutModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnType, setReturnType] = useState<'SALES_RETURN' | 'PURCHASE_RETURN'>('PURCHASE_RETURN');
  const [selectedSupplierForLedger, setSelectedSupplierForLedger] = useState<Party | null>(null);

  // Supplier Form State
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [supplierGstin, setSupplierGstin] = useState('');
  const [supplierOpeningBalance, setSupplierOpeningBalance] = useState(0); // positive = we owe them

  // Purchase Bill Form State
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [supplierBillNo, setSupplierBillNo] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [purchaseLines, setPurchaseLines] = useState<InvoiceItem[]>([]);
  const [purchasePaymentMode, setPurchasePaymentMode] = useState<PaymentMode>('CREDIT');
  const [purchaseNotes, setPurchaseNotes] = useState('');
  const [purchaseItemSearch, setPurchaseItemSearch] = useState('');
  const [isSavingPurchase, setIsSavingPurchase] = useState(false);

  // Payment Out Form State
  const [paymentOutPartyId, setPaymentOutPartyId] = useState('');
  const [paymentOutAmount, setPaymentOutAmount] = useState<number>(0);
  const [paymentOutMode, setPaymentOutMode] = useState<PaymentMode>('CASH');
  const [paymentOutRef, setPaymentOutRef] = useState('');
  const [paymentOutNotes, setPaymentOutNotes] = useState('');
  const [isSavingPaymentOut, setIsSavingPaymentOut] = useState(false);

  // Return Form State
  const [returnPartyId, setReturnPartyId] = useState('');
  const [returnLines, setReturnLines] = useState<InvoiceItem[]>([]);
  const [returnNotes, setReturnNotes] = useState('');
  const [isSavingReturn, setIsSavingReturn] = useState(false);

  // Feedback Toast
  const [toastMsg, setToastMsg] = useState<{ msg: string; isError?: boolean } | null>(null);

  const showToast = (msg: string, isError = false) => {
    setToastMsg({ msg, isError });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Filtered Suppliers
  const suppliers = useMemo(() => {
    return parties.filter(p => p.type === 'SUPPLIER');
  }, [parties]);

  const filteredSuppliers = useMemo(() => {
    if (!searchQuery.trim()) return suppliers;
    const q = searchQuery.toLowerCase();
    return suppliers.filter(
      s => s.name.toLowerCase().includes(q) || s.phone.includes(q) || (s.gstin && s.gstin.toLowerCase().includes(q))
    );
  }, [suppliers, searchQuery]);

  // Filtered Purchase Invoices (PURCHASE_BILL & DEBIT_NOTE)
  const purchaseInvoices = useMemo(() => {
    return invoices.filter(i => i.documentType === 'PURCHASE_BILL' || i.documentType === 'DEBIT_NOTE');
  }, [invoices]);

  // Returns list (CREDIT_NOTE for sales return, DEBIT_NOTE for purchase return)
  const returnsList = useMemo(() => {
    return invoices.filter(i => i.documentType === 'CREDIT_NOTE' || i.documentType === 'DEBIT_NOTE');
  }, [invoices]);

  // Aggregate stats
  const totalPurchaseAmount = useMemo(() => {
    return purchaseInvoices
      .filter(i => i.documentType === 'PURCHASE_BILL')
      .reduce((sum, inv) => sum + inv.grandTotal, 0);
  }, [purchaseInvoices]);

  const totalPayableToSuppliers = useMemo(() => {
    // CurrentBalance: negative = we owe them (Payable)
    return suppliers.reduce((sum, s) => sum + (s.currentBalance < 0 ? Math.abs(s.currentBalance) : 0), 0);
  }, [suppliers]);

  // -------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------

  // Save New Supplier
  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim()) return;

    try {
      const newParty: Party = {
        id: `supp-${Date.now()}`,
        name: supplierName.trim(),
        type: 'SUPPLIER',
        phone: supplierPhone.trim() || '9999999999',
        address: supplierAddress.trim() || '',
        gstin: supplierGstin.trim().toUpperCase() || undefined,
        state: company.state || 'Maharashtra',
        stateCode: company.stateCode || '27',
        creditLimit: 0,
        currentBalance: supplierOpeningBalance > 0 ? -supplierOpeningBalance : 0, // negative represents payable
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await onSaveParty(newParty);
      showToast(`Supplier added: ${newParty.name}`);
      setIsAddSupplierModalOpen(false);
      setSupplierName('');
      setSupplierPhone('');
      setSupplierAddress('');
      setSupplierGstin('');
      setSupplierOpeningBalance(0);
    } catch (err: any) {
      showToast('Failed to save supplier: ' + err.message, true);
    }
  };

  // Add Item Line to Purchase Bill
  const handleAddPurchaseLine = (item: Item) => {
    const existing = purchaseLines.find(l => l.itemId === item.id);
    if (existing) {
      setPurchaseLines(purchaseLines.map(l => 
        l.itemId === item.id ? { ...l, quantity: l.quantity + 1, totalAmount: (l.quantity + 1) * l.unitPrice } : l
      ));
      return;
    }

    const price = item.purchasePrice || item.retailPrice || 100;
    const calc = calculateItemGST({
      rate: price,
      quantity: 1,
      discountPercent: 0,
      taxRate: item.taxRate || 18,
      isTaxInclusive: true,
      sellerStateCode: company.stateCode,
      buyerStateCode: company.stateCode,
    });

    const newLine: InvoiceItem = {
      itemId: item.id,
      itemName: item.name,
      hsn: item.hsn || '19053100',
      unit: item.unit || 'PCS',
      quantity: 1,
      unitPrice: price,
      discountPercent: 0,
      discountAmount: 0,
      taxRate: item.taxRate || 18,
      taxableAmount: calc.taxableAmount,
      cgstAmount: calc.cgstAmount,
      sgstAmount: calc.sgstAmount,
      igstAmount: calc.igstAmount,
      cessAmount: 0,
      totalAmount: calc.totalAmount,
    };

    setPurchaseLines([...purchaseLines, newLine]);
  };

  // Update Line Quantity / Price in Purchase Bill
  const handleUpdatePurchaseLine = (index: number, qty: number, price: number) => {
    if (qty <= 0) {
      setPurchaseLines(purchaseLines.filter((_, i) => i !== index));
      return;
    }

    const current = purchaseLines[index];
    const calc = calculateItemGST({
      rate: price,
      quantity: qty,
      discountPercent: 0,
      taxRate: current.taxRate,
      isTaxInclusive: true,
      sellerStateCode: company.stateCode,
      buyerStateCode: company.stateCode,
    });

    const updated: InvoiceItem = {
      ...current,
      quantity: qty,
      unitPrice: price,
      taxableAmount: calc.taxableAmount,
      cgstAmount: calc.cgstAmount,
      sgstAmount: calc.sgstAmount,
      igstAmount: calc.igstAmount,
      totalAmount: calc.totalAmount,
    };

    const newArr = [...purchaseLines];
    newArr[index] = updated;
    setPurchaseLines(newArr);
  };

  // Calculate Purchase Bill Totals
  const purchaseTotals = useMemo(() => {
    return calculateInvoiceTotals(purchaseLines);
  }, [purchaseLines]);

  // Submit Purchase Bill
  const handleSavePurchaseBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId || purchaseLines.length === 0) {
      showToast('Please select a supplier and add at least 1 item', true);
      return;
    }

    const supplier = suppliers.find(s => s.id === selectedSupplierId);
    if (!supplier) return;

    setIsSavingPurchase(true);
    try {
      const invNum = supplierBillNo.trim() || `PUR-${Date.now().toString().slice(-6)}`;
      const isPaid = purchasePaymentMode !== 'CREDIT';

      const purchaseInvoice: Invoice = {
        id: `pur-${Date.now()}`,
        invoiceNumber: invNum,
        documentType: 'PURCHASE_BILL',
        partyId: supplier.id,
        partyName: supplier.name,
        partyGstin: supplier.gstin,
        partyPhone: supplier.phone,
        partyAddress: supplier.address,
        partyState: supplier.state,
        partyStateCode: supplier.stateCode,
        date: billDate,
        items: purchaseLines,
        subTotal: purchaseTotals.subTotal,
        totalDiscount: 0,
        totalCgst: purchaseTotals.totalCgst,
        totalSgst: purchaseTotals.totalSgst,
        totalIgst: purchaseTotals.totalIgst,
        totalCess: 0,
        totalTax: purchaseTotals.totalTax,
        roundOff: purchaseTotals.roundOff,
        grandTotal: purchaseTotals.grandTotal,
        receivedAmount: isPaid ? purchaseTotals.grandTotal : 0,
        balanceAmount: isPaid ? 0 : purchaseTotals.grandTotal,
        paymentMode: purchasePaymentMode,
        status: isPaid ? 'PAID' : 'UNPAID',
        notes: purchaseNotes.trim() || undefined,
        isSynced: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await onSaveInvoice(purchaseInvoice);
      showToast(`Purchase bill saved! Stock has been incremented for ${purchaseLines.length} items.`);
      setIsNewPurchaseModalOpen(false);
      setPurchaseLines([]);
      setSelectedSupplierId('');
      setSupplierBillNo('');
      setPurchaseNotes('');
    } catch (err: any) {
      showToast('Failed to save purchase bill: ' + err.message, true);
    } finally {
      setIsSavingPurchase(false);
    }
  };

  // Submit Payment Out (Paid to supplier)
  const handleSavePaymentOut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentOutPartyId || paymentOutAmount <= 0) {
      showToast('Please select supplier and enter valid amount', true);
      return;
    }

    const supplier = suppliers.find(s => s.id === paymentOutPartyId);
    if (!supplier) return;

    setIsSavingPaymentOut(true);
    try {
      const payment: PaymentTransaction = {
        id: `pay-out-${Date.now()}`,
        receiptNumber: `VOUCHER-${String(Date.now()).slice(-5)}`,
        partyId: supplier.id,
        partyName: supplier.name,
        amount: Number(paymentOutAmount),
        paymentMode: paymentOutMode,
        type: 'PAYMENT_OUT',
        date: new Date().toISOString().split('T')[0],
        referenceNo: paymentOutRef.trim() || undefined,
        notes: paymentOutNotes.trim() || undefined,
        createdAt: new Date().toISOString(),
      };

      await onRecordPayment(payment);
      showToast(`Payment Out of ${formatINR(paymentOutAmount)} recorded for ${supplier.name}`);
      setIsPaymentOutModalOpen(false);
      setPaymentOutAmount(0);
      setPaymentOutRef('');
      setPaymentOutNotes('');
    } catch (err: any) {
      showToast('Failed to record payment: ' + err.message, true);
    } finally {
      setIsSavingPaymentOut(false);
    }
  };

  // Submit Return (Sales Return or Purchase Return)
  const handleSaveReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnPartyId || returnLines.length === 0) {
      showToast('Please select party and add item(s) to return', true);
      return;
    }

    const party = parties.find(p => p.id === returnPartyId);
    if (!party) return;

    setIsSavingReturn(true);
    try {
      const isSalesReturn = returnType === 'SALES_RETURN';
      const docType: DocumentType = isSalesReturn ? 'CREDIT_NOTE' : 'DEBIT_NOTE';
      const totals = calculateInvoiceTotals(returnLines);

      const returnInvoice: Invoice = {
        id: `ret-${Date.now()}`,
        invoiceNumber: isSalesReturn ? `CN-${Date.now().toString().slice(-5)}` : `DN-${Date.now().toString().slice(-5)}`,
        documentType: docType,
        partyId: party.id,
        partyName: party.name,
        partyGstin: party.gstin,
        partyPhone: party.phone,
        partyAddress: party.address,
        partyState: party.state,
        partyStateCode: party.stateCode,
        date: new Date().toISOString().split('T')[0],
        items: returnLines,
        subTotal: totals.subTotal,
        totalDiscount: 0,
        totalCgst: totals.totalCgst,
        totalSgst: totals.totalSgst,
        totalIgst: totals.totalIgst,
        totalCess: 0,
        totalTax: totals.totalTax,
        roundOff: totals.roundOff,
        grandTotal: totals.grandTotal,
        receivedAmount: totals.grandTotal,
        balanceAmount: 0,
        paymentMode: 'CASH',
        status: 'PAID',
        notes: returnNotes.trim() || (isSalesReturn ? 'Sales Return (ग्राहक वापसी)' : 'Purchase Return (सप्लायर वापसी)'),
        isSynced: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await onSaveInvoice(returnInvoice);
      showToast(
        isSalesReturn
          ? `Sales Return recorded! Item stock has been restocked.`
          : `Purchase Return recorded! Item stock has been deducted.`
      );
      setIsReturnModalOpen(false);
      setReturnLines([]);
      setReturnPartyId('');
      setReturnNotes('');
    } catch (err: any) {
      showToast('Return failed: ' + err.message, true);
    } finally {
      setIsSavingReturn(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Toast Alert */}
      {toastMsg && (
        <div className={`fixed top-18 right-4 z-50 px-4 py-2.5 rounded-2xl shadow-xl border text-xs sm:text-sm font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 ${
          toastMsg.isError ? 'bg-red-900 text-white border-red-700' : 'bg-slate-900 text-white border-slate-700'
        }`}>
          {toastMsg.isError ? <AlertTriangle className="w-4 h-4 text-red-300" /> : <Check className="w-4 h-4 text-emerald-400" />}
          <span>{toastMsg.msg}</span>
        </div>
      )}

      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                Purchases &amp; Vendors <span className="text-xs font-normal text-slate-500">(खरीद व सप्लायर)</span>
              </h2>
              <p className="text-xs text-slate-500">
                Manage supplier bills, stock replenishment, vendor ledger, and returns
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsNewPurchaseModalOpen(true)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Purchase Bill (खरीद दर्ज करें)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPaymentOutPartyId(suppliers[0]?.id || '');
              setIsPaymentOutModalOpen(true);
            }}
            className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
          >
            <ArrowUpRight className="w-4 h-4 text-amber-400" />
            <span>Payment Out (पैसा दिया)</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAddSupplierModalOpen(true)}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
          >
            <Users className="w-4 h-4 text-slate-600" />
            <span>+ New Supplier</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Total Purchases (कुल खरीद)
          </span>
          <div className="text-lg sm:text-xl font-black font-mono text-slate-900">
            {formatINR(totalPurchaseAmount)}
          </div>
          <span className="text-[10px] text-slate-400 block">
            {purchaseInvoices.length} Bills recorded
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">
            To Pay (देना बाकी)
          </span>
          <div className="text-lg sm:text-xl font-black font-mono text-amber-900">
            {formatINR(totalPayableToSuppliers)}
          </div>
          <span className="text-[10px] text-amber-600 font-semibold block">
            Supplier Pending Payable
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Total Suppliers (सप्लायर संख्या)
          </span>
          <div className="text-lg sm:text-xl font-black font-mono text-indigo-700">
            {suppliers.length}
          </div>
          <span className="text-[10px] text-slate-400 block">Active vendors in directory</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Returns / Adjustments (वापसी)
          </span>
          <div className="text-lg sm:text-xl font-black font-mono text-slate-700">
            {returnsList.length}
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveTab('RETURNS');
              setIsReturnModalOpen(true);
            }}
            className="text-[10px] font-bold text-blue-600 hover:text-blue-800 underline block"
          >
            + Create Return (वापसी दर्ज करें)
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('PURCHASE_BILLS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'PURCHASE_BILLS'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Purchase Bills (खरीद बिल)</span>
          <span className="ml-1 text-[10px] bg-slate-700 text-white px-1.5 py-0.2 rounded-full">
            {purchaseInvoices.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('SUPPLIERS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'SUPPLIERS'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Supplier Directory &amp; Ledger (व्यापारी खाता)</span>
          <span className="ml-1 text-[10px] bg-slate-200 text-slate-800 px-1.5 py-0.2 rounded-full">
            {suppliers.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('RETURNS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'RETURNS'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span>Returns &amp; Debit Notes (वापसी रजिस्टर)</span>
          <span className="ml-1 text-[10px] bg-slate-200 text-slate-800 px-1.5 py-0.2 rounded-full">
            {returnsList.length}
          </span>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: PURCHASE BILLS REGISTER */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'PURCHASE_BILLS' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search purchase bill or supplier..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
              />
            </div>

            <button
              type="button"
              onClick={() => setIsNewPurchaseModalOpen(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Purchase Bill</span>
            </button>
          </div>

          {purchaseInvoices.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-3">
              <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto" />
              <div>
                <p className="text-sm font-bold text-slate-700">No Purchase Bills Yet (कोई खरीद बिल दर्ज नहीं है)</p>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-0.5">
                  Click "+ Add Purchase Bill" to record stock purchase from suppliers. Stock will automatically increment!
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsNewPurchaseModalOpen(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>+ Create First Purchase Bill</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3.5">Bill Number (बिल नंबर)</th>
                    <th className="p-3.5">Supplier (व्यापारी)</th>
                    <th className="p-3.5">Date (दिनांक)</th>
                    <th className="p-3.5">Items (सामान)</th>
                    <th className="p-3.5">Payment (भुगतान)</th>
                    <th className="p-3.5 text-right">Amount (कुल राशि)</th>
                    <th className="p-3.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {purchaseInvoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3.5 font-mono font-bold text-slate-900">
                        {inv.invoiceNumber}
                      </td>
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900">{inv.partyName}</div>
                        {inv.partyPhone && <div className="text-[11px] text-slate-400">{inv.partyPhone}</div>}
                      </td>
                      <td className="p-3.5 text-slate-500 whitespace-nowrap">
                        {inv.date}
                      </td>
                      <td className="p-3.5 text-slate-600">
                        {inv.items.length} items
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          inv.paymentMode === 'CREDIT' 
                            ? 'bg-amber-100 text-amber-800' 
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {inv.paymentMode === 'CREDIT' ? 'उधार (Credit)' : inv.paymentMode}
                        </span>
                      </td>
                      <td className="p-3.5 text-right font-mono font-black text-slate-900 text-sm">
                        {formatINR(inv.grandTotal)}
                      </td>
                      <td className="p-3.5 text-center">
                        {onViewInvoice && (
                          <button
                            type="button"
                            onClick={() => onViewInvoice(inv, 'a4')}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                            title="View / Print Bill"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: SUPPLIER DIRECTORY & LEDGER */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'SUPPLIERS' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search supplier by name, phone or GSTIN..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
              />
            </div>

            <button
              type="button"
              onClick={() => setIsAddSupplierModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add New Supplier (नया व्यापारी)</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredSuppliers.map(supplier => {
              const isPayable = supplier.currentBalance < 0;
              const balanceAmt = Math.abs(supplier.currentBalance);

              return (
                <div
                  key={supplier.id}
                  className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs hover:shadow-sm transition flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-extrabold text-sm text-slate-900 truncate">
                          {supplier.name}
                        </h4>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{supplier.phone}</span>
                        </div>
                      </div>

                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        isPayable ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-800'
                      }`}>
                        {isPayable ? 'देना बाकी (To Pay)' : 'चुकता (Clear)'}
                      </span>
                    </div>

                    {supplier.gstin && (
                      <div className="text-[10px] text-slate-400 font-mono">
                        GSTIN: {supplier.gstin}
                      </div>
                    )}
                    {supplier.address && (
                      <div className="text-[11px] text-slate-500 truncate flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{supplier.address}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Balance (बकाया राशि):</span>
                      <span className={`text-sm font-black font-mono ${
                        isPayable ? 'text-red-700' : 'text-slate-700'
                      }`}>
                        {formatINR(balanceAmt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentOutPartyId(supplier.id);
                          setPaymentOutAmount(balanceAmt);
                          setIsPaymentOutModalOpen(true);
                        }}
                        className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-xs font-bold transition"
                      >
                        Pay Out
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedSupplierForLedger(supplier)}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition"
                      >
                        Khata →
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: RETURNS & ADJUSTMENTS (SALES & PURCHASE RETURNS) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'RETURNS' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">
                Returns &amp; Credit/Debit Notes (वापसी रजिस्टर)
              </h3>
              <p className="text-[11px] text-slate-500">
                Record customer returns (stock restocked) or vendor returns (stock deducted)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setReturnType('SALES_RETURN');
                  setIsReturnModalOpen(true);
                }}
                className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>+ Sales Return (ग्राहक वापसी)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setReturnType('PURCHASE_RETURN');
                  setIsReturnModalOpen(true);
                }}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>+ Purchase Return (सप्लायर वापसी)</span>
              </button>
            </div>
          </div>

          {returnsList.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <RotateCcw className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">No Returns Recorded Yet</p>
              <p className="text-xs text-slate-400">
                Customer returns and vendor returns will appear here. Stock adjusts automatically!
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3.5">Note Number</th>
                    <th className="p-3.5">Type (प्रकार)</th>
                    <th className="p-3.5">Party (पार्टी)</th>
                    <th className="p-3.5">Date</th>
                    <th className="p-3.5">Items</th>
                    <th className="p-3.5 text-right">Amount (राशि)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {returnsList.map(ret => (
                    <tr key={ret.id} className="hover:bg-slate-50 transition">
                      <td className="p-3.5 font-mono font-bold text-slate-900">
                        {ret.invoiceNumber}
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          ret.documentType === 'CREDIT_NOTE'
                            ? 'bg-purple-100 text-purple-900'
                            : 'bg-amber-100 text-amber-900'
                        }`}>
                          {ret.documentType === 'CREDIT_NOTE' ? 'Sales Return (ग्राहक)' : 'Purchase Return (सप्लायर)'}
                        </span>
                      </td>
                      <td className="p-3.5 font-bold text-slate-900">
                        {ret.partyName}
                      </td>
                      <td className="p-3.5 text-slate-500">
                        {ret.date}
                      </td>
                      <td className="p-3.5 text-slate-600">
                        {ret.items.length} items
                      </td>
                      <td className="p-3.5 text-right font-mono font-black text-slate-900 text-sm">
                        {formatINR(ret.grandTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1: ADD NEW SUPPLIER */}
      {/* ------------------------------------------------------------- */}
      {isAddSupplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  + Add New Supplier (नया सप्लायर / व्यापारी)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddSupplierModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Supplier / Vendor Name (व्यापारी का नाम) *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="उदा. श्री कृष्णा डिस्ट्रीब्यूटर्स / बालाजी एजेंसी"
                  value={supplierName}
                  onChange={e => setSupplierName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Phone / Mobile (फोन नंबर) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="+91 98765 43210"
                    value={supplierPhone}
                    onChange={e => setSupplierPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    GSTIN (वैकल्पिक)
                  </label>
                  <input
                    type="text"
                    placeholder="27ABCDE1234F1Z5"
                    value={supplierGstin}
                    onChange={e => setSupplierGstin(e.target.value.toUpperCase())}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono text-xs text-slate-900 focus:bg-white focus:outline-none uppercase focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Shop Address / City (दुकान का पता)
                </label>
                <input
                  type="text"
                  placeholder="मार्केट यार्ड, दुकान नं 12, पुणे"
                  value={supplierAddress}
                  onChange={e => setSupplierAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Opening Payable Balance (पिछला बकाया - जो हमें देना है ₹)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="0.00"
                  value={supplierOpeningBalance || ''}
                  onChange={e => setSupplierOpeningBalance(Number(e.target.value) || 0)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddSupplierModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs active:scale-95"
                >
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2: ADD PURCHASE BILL */}
      {/* ------------------------------------------------------------- */}
      {isNewPurchaseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-2xs p-3 sm:p-4">
          <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  + Add Purchase Bill (सप्लायर से खरीद दर्ज करें)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewPurchaseModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePurchaseBill} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
              {/* Header Inputs: Supplier, Bill No, Date */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Select Supplier (सप्लायर चुनें) *
                  </label>
                  <select
                    required
                    value={selectedSupplierId}
                    onChange={e => setSelectedSupplierId(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none"
                  >
                    <option value="">-- Choose Supplier --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.phone})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Supplier Invoice No (बिल नंबर)
                  </label>
                  <input
                    type="text"
                    placeholder="उदा. INV-2024-892"
                    value={supplierBillNo}
                    onChange={e => setSupplierBillNo(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Bill Date (तारीख)
                  </label>
                  <input
                    type="date"
                    required
                    value={billDate}
                    onChange={e => setBillDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              {/* Item Selector */}
              <div className="space-y-2">
                <label className="block font-bold text-slate-700">
                  Select Purchased Items (खरीदे गए सामान जोड़ें):
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Type item name to add..."
                      value={purchaseItemSearch}
                      onChange={e => setPurchaseItemSearch(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                {purchaseItemSearch && (
                  <div className="bg-white border border-slate-200 rounded-xl max-h-36 overflow-y-auto divide-y divide-slate-100 shadow-sm">
                    {items
                      .filter(i => i.name.toLowerCase().includes(purchaseItemSearch.toLowerCase()))
                      .slice(0, 6)
                      .map(item => (
                        <div
                          key={item.id}
                          onClick={() => {
                            handleAddPurchaseLine(item);
                            setPurchaseItemSearch('');
                          }}
                          className="p-2.5 hover:bg-blue-50 cursor-pointer flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-900">{item.name}</span>
                            <span className="text-[10px] text-slate-400 ml-2">Stock: {item.currentStock}</span>
                          </div>
                          <span className="font-mono text-slate-700 font-bold">
                            Purchase: {formatINR(item.purchasePrice || item.retailPrice)}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Purchase Lines Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="bg-slate-100 px-3.5 py-2 font-bold text-[11px] text-slate-700 grid grid-cols-12 gap-2">
                  <div className="col-span-5">Item Name</div>
                  <div className="col-span-2 text-center">Qty</div>
                  <div className="col-span-2 text-right">Rate (₹)</div>
                  <div className="col-span-2 text-right">Total (₹)</div>
                  <div className="col-span-1 text-center">✕</div>
                </div>

                {purchaseLines.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-xs">
                    No items added to bill yet. Search items above to add.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                    {purchaseLines.map((line, idx) => (
                      <div key={line.itemId} className="p-3 grid grid-cols-12 gap-2 items-center text-xs">
                        <div className="col-span-5 font-bold text-slate-900 truncate">
                          {line.itemName}
                        </div>
                        <div className="col-span-2 flex items-center justify-center">
                          <input
                            type="number"
                            min="1"
                            value={line.quantity}
                            onChange={e => handleUpdatePurchaseLine(idx, Number(e.target.value) || 1, line.unitPrice)}
                            className="w-14 text-center bg-slate-50 border border-slate-300 rounded-lg py-1 font-mono font-bold"
                          />
                        </div>
                        <div className="col-span-2 flex items-center justify-end">
                          <input
                            type="number"
                            min="0"
                            value={line.unitPrice}
                            onChange={e => handleUpdatePurchaseLine(idx, line.quantity, Number(e.target.value) || 0)}
                            className="w-20 text-right bg-slate-50 border border-slate-300 rounded-lg py-1 px-1.5 font-mono font-bold"
                          />
                        </div>
                        <div className="col-span-2 text-right font-mono font-black text-slate-900">
                          {formatINR(line.totalAmount)}
                        </div>
                        <div className="col-span-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleUpdatePurchaseLine(idx, 0, 0)}
                            className="text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5 mx-auto" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Summary & Payment Mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Payment Mode (भुगतान का प्रकार):
                  </label>
                  <select
                    value={purchasePaymentMode}
                    onChange={e => setPurchasePaymentMode(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                  >
                    <option value="CREDIT">📒 उधार / बाकी (Credit - Pay Later)</option>
                    <option value="CASH">💵 नकद दिया (Paid in Cash)</option>
                    <option value="BANK_TRANSFER">💳 बैंक / ट्रांसफर (Bank Transfer)</option>
                    <option value="UPI">📱 UPI द्वारा भुगतान (Paid via UPI)</option>
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {purchasePaymentMode === 'CREDIT' 
                      ? 'बकाया राशि सप्लायर के खाते में जुड़ जाएगी।' 
                      : 'बिल का पूरा भुगतान तुरंत दर्ज होगा।'}
                  </p>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1 text-right">
                  <div className="text-slate-500 text-xs">
                    Subtotal: <span className="font-mono">{formatINR(purchaseTotals.subTotal)}</span>
                  </div>
                  <div className="text-slate-500 text-xs">
                    GST Tax: <span className="font-mono">{formatINR(purchaseTotals.totalTax)}</span>
                  </div>
                  <div className="text-base font-black text-blue-700 pt-1 border-t border-slate-200">
                    Grand Total: <span className="font-mono">{formatINR(purchaseTotals.grandTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewPurchaseModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingPurchase || purchaseLines.length === 0}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold shadow-md active:scale-95 flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{isSavingPurchase ? 'Saving...' : 'Save Purchase Bill & Add Stock'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 3: PAYMENT OUT (PAID TO SUPPLIER) */}
      {/* ------------------------------------------------------------- */}
      {isPaymentOutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-amber-400" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  Payment Out (सप्लायर को भुगतान)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentOutModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePaymentOut} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Supplier (व्यापारी) *
                </label>
                <select
                  required
                  value={paymentOutPartyId}
                  onChange={e => setPaymentOutPartyId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                >
                  <option value="">-- Choose Supplier --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} (देना बाकी: {formatINR(Math.abs(s.currentBalance))})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Amount Paid (भुगतान राशि ₹) *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  autoFocus
                  placeholder="0.00"
                  value={paymentOutAmount || ''}
                  onChange={e => setPaymentOutAmount(Number(e.target.value) || 0)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-black text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Payment Mode
                  </label>
                  <select
                    value={paymentOutMode}
                    onChange={e => setPaymentOutMode(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                  >
                    <option value="CASH">💵 Cash (नकद)</option>
                    <option value="BANK_TRANSFER">💳 Bank / NEFT</option>
                    <option value="UPI">📱 UPI</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Reference / UTR No
                  </label>
                  <input
                    type="text"
                    placeholder="उदा. UTR982312"
                    value={paymentOutRef}
                    onChange={e => setPaymentOutRef(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono text-xs text-slate-900"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentOutModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingPaymentOut || paymentOutAmount <= 0}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-bold shadow-xs active:scale-95"
                >
                  Save Payment Out
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 4: RECORD RETURN (SALES RETURN / PURCHASE RETURN) */}
      {/* ------------------------------------------------------------- */}
      {isReturnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-purple-400" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  {returnType === 'SALES_RETURN' 
                    ? 'Sales Return / Credit Note (ग्राहक वापसी)' 
                    : 'Purchase Return / Debit Note (सप्लायर वापसी)'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsReturnModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveReturn} className="p-5 space-y-3.5 text-xs overflow-y-auto">
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setReturnType('SALES_RETURN')}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition ${
                    returnType === 'SALES_RETURN' ? 'bg-purple-600 text-white shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Sales Return (ग्राहक वापसी)
                </button>
                <button
                  type="button"
                  onClick={() => setReturnType('PURCHASE_RETURN')}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition ${
                    returnType === 'PURCHASE_RETURN' ? 'bg-amber-600 text-white shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Purchase Return (सप्लायर वापसी)
                </button>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {returnType === 'SALES_RETURN' ? 'Select Customer (ग्राहक)' : 'Select Supplier (व्यापारी)'} *
                </label>
                <select
                  required
                  value={returnPartyId}
                  onChange={e => setReturnPartyId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900"
                >
                  <option value="">-- Choose Party --</option>
                  {(returnType === 'SALES_RETURN' 
                    ? parties.filter(p => p.type === 'CUSTOMER')
                    : suppliers
                  ).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.phone})
                    </option>
                  ))}
                </select>
              </div>

              {/* Add Returned Item */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Add Item Returned (वापस हुआ सामान जोड़ें)
                </label>
                <select
                  onChange={e => {
                    const found = items.find(i => i.id === e.target.value);
                    if (found) {
                      handleAddPurchaseLine(found);
                      e.target.value = '';
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900"
                >
                  <option value="">-- Click to select item --</option>
                  {items.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.name} (Stock: {i.currentStock}) - Rate: {formatINR(i.retailPrice || i.wholesalePrice)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Items List */}
              <div className="border border-slate-200 rounded-xl p-2 max-h-40 overflow-y-auto space-y-2">
                {purchaseLines.length === 0 ? (
                  <div className="text-center text-slate-400 py-4">No items selected for return.</div>
                ) : (
                  purchaseLines.map((line, idx) => (
                    <div key={line.itemId} className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded-lg">
                      <div className="font-bold text-slate-900 truncate flex-1">{line.itemName}</div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={e => handleUpdatePurchaseLine(idx, Number(e.target.value) || 1, line.unitPrice)}
                          className="w-12 text-center bg-white border border-slate-300 rounded py-0.5 font-bold"
                        />
                        <span className="font-mono font-bold text-slate-900">{formatINR(line.totalAmount)}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdatePurchaseLine(idx, 0, 0)}
                          className="text-red-500 hover:text-red-700"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsReturnModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingReturn || purchaseLines.length === 0}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl font-bold shadow-xs active:scale-95"
                >
                  Record Return &amp; Adjust Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 5: SUPPLIER LEDGER KHATA VIEW */}
      {/* ------------------------------------------------------------- */}
      {selectedSupplierForLedger && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4">
          <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-sm sm:text-base">
                  {selectedSupplierForLedger.name} - Ledger Khata (व्यापारी का खाता)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Ph: {selectedSupplierForLedger.phone} | GSTIN: {selectedSupplierForLedger.gstin || 'None'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSupplierForLedger(null)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 block font-bold uppercase">Net Payable (देना बाकी):</span>
                <span className="text-xl font-black font-mono text-red-700">
                  {formatINR(Math.abs(selectedSupplierForLedger.currentBalance))}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setPaymentOutPartyId(selectedSupplierForLedger.id);
                  setPaymentOutAmount(Math.abs(selectedSupplierForLedger.currentBalance));
                  setSelectedSupplierForLedger(null);
                  setIsPaymentOutModalOpen(true);
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>Record Payment Out (भुगतान दें)</span>
              </button>
            </div>

            {/* Transaction List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 text-xs">
              <h4 className="font-bold text-slate-700 text-xs mb-2">Transaction History (लेन-देन विवरण):</h4>
              {invoices.filter(i => i.partyId === selectedSupplierForLedger.id).length === 0 &&
               payments.filter(p => p.partyId === selectedSupplierForLedger.id).length === 0 ? (
                <div className="p-8 text-center text-slate-400">No transactions recorded with this supplier yet.</div>
              ) : (
                <div className="space-y-2">
                  {invoices
                    .filter(i => i.partyId === selectedSupplierForLedger.id)
                    .map(inv => (
                      <div key={inv.id} className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-900">
                            {inv.documentType === 'PURCHASE_BILL' ? 'Purchase Bill' : 'Purchase Return'} #{inv.invoiceNumber}
                          </div>
                          <div className="text-[11px] text-slate-400">📅 {inv.date} | {inv.items.length} items</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-black text-slate-900">{formatINR(inv.grandTotal)}</div>
                          <div className="text-[10px] text-amber-700 font-bold">{inv.paymentMode}</div>
                        </div>
                      </div>
                    ))}

                  {payments
                    .filter(p => p.partyId === selectedSupplierForLedger.id)
                    .map(pay => (
                      <div key={pay.id} className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl flex items-center justify-between">
                        <div>
                          <div className="font-bold text-emerald-950 flex items-center gap-1">
                            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-700" />
                            <span>Payment Out ({pay.receiptNumber})</span>
                          </div>
                          <div className="text-[11px] text-emerald-700">📅 {pay.date} | Mode: {pay.paymentMode}</div>
                        </div>
                        <div className="text-right font-mono font-black text-emerald-800 text-sm">
                          - {formatINR(pay.amount)}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
