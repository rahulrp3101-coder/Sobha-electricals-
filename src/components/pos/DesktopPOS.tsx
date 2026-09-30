import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, Minus, Trash2, Printer, Save, Smartphone, 
  CreditCard, Banknote, UserCheck, ShieldCheck, 
  QrCode, AlertTriangle, ArrowRight, Share2, Sparkles,
  Percent, Hash, RefreshCw, X, Camera, ArrowDownLeft, FileText, Check
} from 'lucide-react';
import { Item, Party, Invoice, InvoiceItem, CompanyProfile, PaymentMode, DocumentType } from '../../types';
import { calculateItemGST, calculateInvoiceTotals, formatINR, INDIAN_STATES } from '../../services/gstCalculator';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { BarcodeCameraModal } from './BarcodeCameraModal';
import { generateWhatsAppInvoiceURL } from '../../services/whatsappShare';

interface DesktopPOSProps {
  items: Item[];
  parties: Party[];
  company: CompanyProfile;
  onSaveInvoice: (invoice: Invoice, printImmediate?: boolean, printFormat?: 'thermal' | 'a4') => Promise<Invoice>;
  onOpenPartyModal?: () => void;
  onOpenPaymentIn?: () => void;
}

export const DesktopPOS: React.FC<DesktopPOSProps> = ({
  items,
  parties,
  company,
  onSaveInvoice,
  onOpenPartyModal,
  onOpenPaymentIn,
}) => {
  // Active Party (Default Walk-in)
  const defaultParty = parties.find(p => p.id === 'pty-001') || parties[0];
  const [selectedParty, setSelectedParty] = useState<Party>(defaultParty || {
    id: 'pty-walkin',
    name: 'Walk-in Customer (नकद ग्राहक)',
    phone: '',
    type: 'CUSTOMER',
    currentBalance: 0,
    state: company.state,
    stateCode: company.stateCode,
    createdAt: '',
    updatedAt: '',
  });

  // Cart Items
  const [cartLines, setCartLines] = useState<InvoiceItem[]>([]);
  
  // Search & Selector State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Item[]>([]);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isPartySelectOpen, setIsPartySelectOpen] = useState(false);
  
  // Billing Totals & Options
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [receivedAmount, setReceivedAmount] = useState<number>(0);
  const [overallDiscountPercent, setOverallDiscountPercent] = useState<number>(0);
  const [invoiceNotes, setInvoiceNotes] = useState<string>('');
  const [isTaxInclusive, setIsTaxInclusive] = useState<boolean>(true);
  
  // Modals & Camera
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [lastSavedInvoice, setLastSavedInvoice] = useState<Invoice | null>(null);
  const [showSavedSuccessModal, setShowSavedSuccessModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Input Refs for hotkeys
  const searchInputRef = useRef<HTMLInputElement>(null);
  const receivedInputRef = useRef<HTMLInputElement>(null);

  // Hardware Barcode Scanner listener
  useBarcodeScanner({
    onScan: (barcode) => {
      handleBarcodeScanned(barcode);
    },
  });

  const handleBarcodeScanned = (code: string) => {
    const cleanCode = code.trim().toLowerCase();
    const foundItem = items.find(
      i => i.barcode?.toLowerCase() === cleanCode || i.sku?.toLowerCase() === cleanCode
    );

    if (foundItem) {
      addItemToCart(foundItem);
      showFlashFeedback(`स्कैन सफल: ${foundItem.name}`);
    } else {
      showFlashFeedback(`बारकोड नहीं मिला: ${code}`, true);
    }
  };

  const showFlashFeedback = (msg: string, isError = false) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  // Keyboard Shortcuts (F2: search, Alt+P: Print, Alt+S: Save, Alt+C: Party, Alt+T: Tax) - active on desktop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F2 or '/' to focus search
      if (e.key === 'F2' || (e.key === '/' && (e.target as HTMLElement)?.tagName !== 'INPUT')) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        setIsSearchOpen(true);
      }
      // Alt + S to Save
      if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSave(false);
      }
      // Alt + P to Print Thermal
      if (e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        handleSave(true, 'thermal');
      }
      // Alt + C to Switch Party
      if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        setIsPartySelectOpen(prev => !prev);
      }
      // Alt + T to toggle Tax Mode
      if (e.altKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        setIsTaxInclusive(prev => !prev);
      }
      // Escape to close modals
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setIsPartySelectOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cartLines, selectedParty, paymentMode, receivedAmount, overallDiscountPercent]);

  // Search Filter
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearchOpen(false);
      return;
    }

    const q = searchQuery.toLowerCase();
    const filtered = items.filter(
      item =>
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        (item.barcode && item.barcode.includes(q)) ||
        item.category.toLowerCase().includes(q)
    );

    setSearchResults(filtered);
    setSelectedSearchIndex(0);
    setIsSearchOpen(true);
  }, [searchQuery, items]);

  // Add Item to active cart
  const addItemToCart = (item: Item) => {
    const existingIndex = cartLines.findIndex(l => l.itemId === item.id);
    const sellerStateCode = company.stateCode;
    const buyerStateCode = selectedParty.stateCode || company.stateCode;
    const unitPrice = item.retailPrice || item.wholesalePrice;

    if (existingIndex >= 0) {
      const updatedLines = [...cartLines];
      const existingLine = updatedLines[existingIndex];
      const newQty = existingLine.quantity + 1;

      const gst = calculateItemGST({
        quantity: newQty,
        rate: existingLine.unitPrice,
        taxRate: existingLine.taxRate,
        discountPercent: existingLine.discountPercent,
        isTaxInclusive,
        sellerStateCode,
        buyerStateCode,
      });

      updatedLines[existingIndex] = {
        ...existingLine,
        quantity: newQty,
        taxableAmount: gst.taxableAmount,
        cgstAmount: gst.cgstAmount,
        sgstAmount: gst.sgstAmount,
        igstAmount: gst.igstAmount,
        totalAmount: gst.totalAmount,
      };

      setCartLines(updatedLines);
    } else {
      const gst = calculateItemGST({
        quantity: 1,
        rate: unitPrice,
        taxRate: item.taxRate,
        discountPercent: 0,
        isTaxInclusive,
        sellerStateCode,
        buyerStateCode,
      });

      const newLine: InvoiceItem = {
        itemId: item.id,
        itemName: item.name,
        hsn: item.hsn,
        unit: item.unit,
        quantity: 1,
        unitPrice,
        discountPercent: 0,
        discountAmount: 0,
        taxRate: item.taxRate,
        taxableAmount: gst.taxableAmount,
        cgstAmount: gst.cgstAmount,
        sgstAmount: gst.sgstAmount,
        igstAmount: gst.igstAmount,
        cessAmount: 0,
        totalAmount: gst.totalAmount,
        batchNumber: item.batches?.[0]?.batchNumber,
      };

      setCartLines([newLine, ...cartLines]);
    }

    setSearchQuery('');
    setIsSearchOpen(false);
  };

  // Update line quantity
  const updateLineQuantity = (index: number, newQty: number) => {
    if (newQty <= 0) {
      removeLine(index);
      return;
    }

    const updated = [...cartLines];
    const line = updated[index];
    const sellerStateCode = company.stateCode;
    const buyerStateCode = selectedParty.stateCode || company.stateCode;

    const gst = calculateItemGST({
      quantity: newQty,
      rate: line.unitPrice,
      taxRate: line.taxRate,
      discountPercent: line.discountPercent,
      isTaxInclusive,
      sellerStateCode,
      buyerStateCode,
    });

    updated[index] = {
      ...line,
      quantity: newQty,
      taxableAmount: gst.taxableAmount,
      cgstAmount: gst.cgstAmount,
      sgstAmount: gst.sgstAmount,
      igstAmount: gst.igstAmount,
      totalAmount: gst.totalAmount,
    };

    setCartLines(updated);
  };

  // Update line discount
  const updateLineDiscount = (index: number, discPercent: number) => {
    const updated = [...cartLines];
    const line = updated[index];
    const sellerStateCode = company.stateCode;
    const buyerStateCode = selectedParty.stateCode || company.stateCode;

    const gst = calculateItemGST({
      quantity: line.quantity,
      rate: line.unitPrice,
      taxRate: line.taxRate,
      discountPercent: discPercent,
      isTaxInclusive,
      sellerStateCode,
      buyerStateCode,
    });

    updated[index] = {
      ...line,
      discountPercent: discPercent,
      discountAmount: (line.unitPrice * line.quantity * discPercent) / 100,
      taxableAmount: gst.taxableAmount,
      cgstAmount: gst.cgstAmount,
      sgstAmount: gst.sgstAmount,
      igstAmount: gst.igstAmount,
      totalAmount: gst.totalAmount,
    };

    setCartLines(updated);
  };

  // Remove line
  const removeLine = (index: number) => {
    setCartLines(cartLines.filter((_, idx) => idx !== index));
  };

  // Clear bill
  const handleClearCart = () => {
    setCartLines([]);
    setSearchQuery('');
    setReceivedAmount(0);
    setOverallDiscountPercent(0);
    setInvoiceNotes('');
    setPaymentMode('CASH');
  };

  // Compute Invoice Totals
  const totals = calculateInvoiceTotals(cartLines);

  // Keep receivedAmount in sync if cash / UPI is full
  useEffect(() => {
    if (paymentMode === 'CASH' || paymentMode === 'UPI' || paymentMode === 'BANK_TRANSFER') {
      setReceivedAmount(totals.grandTotal);
    } else if (paymentMode === 'CREDIT') {
      setReceivedAmount(0);
    }
  }, [totals.grandTotal, paymentMode]);

  // Handle Save Invoice
  const handleSave = async (printImmediate: boolean = false, format: 'thermal' | 'a4' = 'thermal') => {
    if (cartLines.length === 0) {
      showFlashFeedback('कृपया बिल में कम से कम एक सामान जोड़ें', true);
      return;
    }

    // Check if Udhar on Walk-in customer
    if (paymentMode === 'CREDIT' && (!selectedParty.phone && selectedParty.name.includes('Walk-in'))) {
      const confirmProceed = window.confirm(
        'उधार बिल के लिए "Walk-in" की जगह कोई नामी ग्राहक चुनना बेहतर है। क्या आप इसी पर बिल सेव करना चाहते हैं?'
      );
      if (!confirmProceed) {
        setIsPartySelectOpen(true);
        return;
      }
    }

    setIsSaving(true);
    try {
      const now = new Date();
      const invoiceNumber = `${company.invoicePrefix || 'INV-'}${now.getFullYear()}-${String(Date.now()).slice(-5)}`;
      const sellerStateCode = company.stateCode;
      const partyStateCode = selectedParty.stateCode || company.stateCode;
      const isInterState = sellerStateCode.trim() !== partyStateCode.trim();

      const newInvoice: Invoice = {
        id: `inv-${Date.now()}`,
        invoiceNumber,
        documentType: 'SALES_INVOICE' as DocumentType,
        date: now.toISOString().split('T')[0],
        partyId: selectedParty.id,
        partyName: selectedParty.name,
        partyPhone: selectedParty.phone,
        partyGstin: selectedParty.gstin,
        partyAddress: selectedParty.address,
        partyState: selectedParty.state || company.state,
        partyStateCode,
        items: cartLines,
        subTotal: totals.subTotal,
        totalDiscount: totals.totalDiscount,
        totalCgst: totals.totalCgst,
        totalSgst: totals.totalSgst,
        totalIgst: totals.totalIgst,
        totalCess: totals.totalCess,
        totalTax: totals.totalTax,
        roundOff: totals.roundOff,
        grandTotal: totals.grandTotal,
        receivedAmount,
        balanceAmount: Math.max(0, totals.grandTotal - receivedAmount),
        paymentMode,
        status: receivedAmount >= totals.grandTotal ? 'PAID' : receivedAmount > 0 ? 'PARTIAL' : 'UNPAID',
        notes: invoiceNotes || undefined,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        isSynced: false,
      };

      const saved = await onSaveInvoice(newInvoice, printImmediate, format);
      setLastSavedInvoice(saved);
      setShowSavedSuccessModal(true);
      handleClearCart();
    } catch (err) {
      console.error('Save invoice error:', err);
      showFlashFeedback('बिल सेव करने में त्रुटि हुई', true);
    } finally {
      setIsSaving(false);
    }
  };

  const isInterState = company.stateCode.trim() !== (selectedParty.stateCode || company.stateCode).trim();

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-5 pb-24 lg:pb-6 space-y-4">
      {/* Flash Success/Error Toast */}
      {successToast && (
        <div className="fixed top-18 right-4 z-50 bg-slate-900 text-white text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg border border-slate-700 animate-in fade-in slide-in-from-top-2">
          {successToast}
        </div>
      )}

      {/* Top Bar: Customer Selector, Outstanding Khata Balance, and Camera Scan button */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Customer Khata Info */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">ग्राहक / पार्टी (Customer):</span>
                <button
                  onClick={() => setIsPartySelectOpen(true)}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                >
                  बदलें / चुनें
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                <span className="text-sm font-bold text-slate-900 truncate">
                  {selectedParty.name}
                </span>

                {selectedParty.phone && (
                  <span className="text-xs text-slate-500 font-mono">
                    📱 {selectedParty.phone}
                  </span>
                )}

                {/* Highlight Previous Outstanding Balance */}
                <div className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md ${
                  selectedParty.currentBalance > 0
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : 'bg-emerald-50 text-emerald-700'
                }`}>
                  <span>पिछला बकाया (Old Khata):</span>
                  <span className="font-mono">
                    {selectedParty.currentBalance > 0 
                      ? `${formatINR(selectedParty.currentBalance)} (बाकी)` 
                      : '₹0 (चुकता)'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons on Top Bar */}
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            {/* Camera Barcode Scanner Button */}
            <button
              onClick={() => setShowCameraScanner(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
              title="फोन के कैमरे से बारकोड स्कैन करें"
            >
              <Camera className="w-4 h-4" />
              <span>📷 बारकोड स्कैन</span>
            </button>

            {/* Quick Payment In Button */}
            {onOpenPaymentIn && (
              <button
                onClick={onOpenPaymentIn}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
                title="ग्राहक से पैसे प्राप्त होने की एंट्री"
              >
                <ArrowDownLeft className="w-4 h-4" />
                <span className="hidden sm:inline">पैसे मिले (Payment In)</span>
                <span className="sm:hidden">+पैसे</span>
              </button>
            )}
          </div>
        </div>

        {/* Notice when Udhar / Credit is active */}
        {paymentMode === 'CREDIT' && (
          <div className="mt-3 p-2.5 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>उधार बिल (Credit Sale):</strong> यह बिल सेव होते ही <strong className="underline">{formatINR(totals.grandTotal)}</strong> सीधे <strong>{selectedParty.name}</strong> के खाते में बकाया के रूप में जुड़ जाएगा।
              </span>
            </div>
            <div className="hidden sm:block font-bold">
              नया कुल बकाया होगा: <span className="font-mono text-amber-950">{formatINR((selectedParty.currentBalance || 0) + totals.grandTotal)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Main POS Interface: Responsive Desktop 2-Column / Mobile Single Column */}
      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4">
        
        {/* Left Column / Mobile Top: Search Bar & Cart Lines */}
        <div className="w-full lg:col-span-8 space-y-3">
          
          {/* Search Bar with Autocomplete Dropdown */}
          <div className="relative">
            <div className="flex items-center bg-white border-2 border-slate-300 focus-within:border-blue-600 rounded-2xl px-3.5 py-2.5 shadow-2xs transition">
              <Search className="w-5 h-5 text-slate-400 shrink-0 mr-2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedSearchIndex(prev => Math.min(searchResults.length - 1, prev + 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedSearchIndex(prev => Math.max(0, prev - 1));
                  } else if (e.key === 'Enter' && searchResults[selectedSearchIndex]) {
                    e.preventDefault();
                    addItemToCart(searchResults[selectedSearchIndex]);
                  }
                }}
                placeholder="सामान खोजें या बारकोड स्कैन करें (F2)..."
                className="w-full bg-transparent text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none font-medium"
              />

              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {/* Desktop Shortcut Pill */}
              <span className="hidden lg:inline-flex ml-2 text-[10px] font-bold font-mono bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded">
                F2 /
              </span>
            </div>

            {/* Search Results Dropdown */}
            {isSearchOpen && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-72 overflow-y-auto z-40 p-1.5 divide-y divide-slate-100">
                {searchResults.map((item, idx) => {
                  const isSelected = idx === selectedSearchIndex;
                  return (
                    <div
                      key={item.id}
                      onClick={() => addItemToCart(item)}
                      onMouseEnter={() => setSelectedSearchIndex(idx)}
                      className={`p-2.5 rounded-xl cursor-pointer flex items-center justify-between transition ${
                        isSelected ? 'bg-blue-50 text-blue-950 font-semibold' : 'hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs sm:text-sm font-bold truncate">{item.name}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                          <span>SKU: {item.sku}</span>
                          {item.barcode && <span>बारकोड: {item.barcode}</span>}
                          <span>GST: {item.taxRate}%</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0 ml-3">
                        <div className="text-xs sm:text-sm font-extrabold text-slate-900">
                          {formatINR(item.retailPrice)}
                        </div>
                        <div className={`text-[10px] font-bold ${
                          item.currentStock <= item.lowStockThreshold ? 'text-red-600' : 'text-slate-500'
                        }`}>
                          स्टॉक: {item.currentStock} {item.unit}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cart Items Section */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  बिल में जोड़े गए सामान (Cart Items)
                </span>
                <span className="bg-blue-100 text-blue-800 text-[11px] font-black px-2 py-0.5 rounded-full">
                  {cartLines.length}
                </span>
              </div>

              {cartLines.length > 0 && (
                <button
                  onClick={handleClearCart}
                  className="text-xs text-red-600 hover:text-red-700 font-semibold flex items-center gap-1 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>बिल खाली करें</span>
                </button>
              )}
            </div>

            {/* When Cart is Empty */}
            {cartLines.length === 0 ? (
              <div className="p-8 sm:p-12 text-center text-slate-400">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
                  <Search className="w-7 h-7" />
                </div>
                <p className="text-sm font-bold text-slate-600">बिल में अभी कोई सामान नहीं है</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  ऊपर सर्च बार से सामान चुनें या '📷 बारकोड स्कैन' बटन दबाकर कैमरे से बारकोड स्कैन करें।
                </p>
              </div>
            ) : (
              <>
                {/* 1. Desktop Table View (Hidden on mobile) */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">सामान (Item)</th>
                        <th className="py-2.5 px-2 text-center w-28">मात्रा (Qty)</th>
                        <th className="py-2.5 px-2 text-right">दर (Price)</th>
                        <th className="py-2.5 px-2 text-center w-20">छूट%</th>
                        <th className="py-2.5 px-2 text-right">GST%</th>
                        <th className="py-2.5 px-3 text-right">कुल (Total)</th>
                        <th className="py-2.5 px-2 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cartLines.map((line, idx) => (
                        <tr key={line.itemId} className="hover:bg-slate-50/70 transition">
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">{line.itemName}</div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-2">
                              <span>HSN: {line.hsn}</span>
                              {line.batchNumber && <span>बैच: {line.batchNumber}</span>}
                            </div>
                          </td>

                          <td className="py-2.5 px-2">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => updateLineQuantity(idx, line.quantity - 1)}
                                className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min="1"
                                value={line.quantity}
                                onChange={e => updateLineQuantity(idx, Math.max(1, Number(e.target.value)))}
                                className="w-12 text-center py-1 bg-white border border-slate-300 rounded-md font-bold text-slate-900 font-mono text-xs focus:outline-none focus:border-blue-600"
                              />
                              <button
                                onClick={() => updateLineQuantity(idx, line.quantity + 1)}
                                className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold"
                              >
                                +
                              </button>
                            </div>
                          </td>

                          <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-800">
                            {formatINR(line.unitPrice)}
                          </td>

                          <td className="py-2.5 px-2">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={line.discountPercent || ''}
                              placeholder="0"
                              onChange={e => updateLineDiscount(idx, Number(e.target.value) || 0)}
                              className="w-14 mx-auto text-center py-1 bg-white border border-slate-300 rounded-md font-bold text-slate-800 text-xs font-mono focus:outline-none focus:border-blue-600"
                            />
                          </td>

                          <td className="py-2.5 px-2 text-right text-slate-600 font-mono">
                            {line.taxRate}%
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono font-extrabold text-slate-900">
                            {formatINR(line.totalAmount)}
                          </td>

                          <td className="py-2.5 px-2 text-center">
                            <button
                              onClick={() => removeLine(idx)}
                              className="p-1 text-slate-400 hover:text-red-600 rounded-md transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 2. Mobile Responsive Touch Card View (Shown on screens < lg, ZERO OVERLAP) */}
                <div className="block lg:hidden divide-y divide-slate-100">
                  {cartLines.map((line, idx) => (
                    <div key={line.itemId} className="p-3 space-y-2.5 bg-white">
                      {/* Top: Name & Remove */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                            {line.itemName}
                          </h4>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                            <span>दर: <strong className="font-mono text-slate-800">{formatINR(line.unitPrice)}</strong></span>
                            <span>GST: {line.taxRate}%</span>
                          </div>
                        </div>

                        <button
                          onClick={() => removeLine(idx)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg bg-slate-50 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Bottom Controls: Large Touch Qty [-] [Qty] [+], Discount, Line Total */}
                      <div className="flex items-center justify-between gap-2 bg-slate-50 p-2 rounded-xl">
                        {/* Qty +/- Stepper */}
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => updateLineQuantity(idx, line.quantity - 1)}
                            className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-slate-800 flex items-center justify-center font-extrabold active:bg-slate-200 transition text-base"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-9 text-center font-mono font-extrabold text-sm text-slate-900">
                            {line.quantity}
                          </span>
                          <button
                            onClick={() => updateLineQuantity(idx, line.quantity + 1)}
                            className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-slate-800 flex items-center justify-center font-extrabold active:bg-slate-200 transition text-base"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Discount */}
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-slate-500 font-bold">छूट:</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={line.discountPercent || ''}
                            placeholder="0%"
                            onChange={e => updateLineDiscount(idx, Number(e.target.value) || 0)}
                            className="w-12 text-center py-1 bg-white border border-slate-300 rounded-md font-bold text-xs font-mono focus:outline-none"
                          />
                        </div>

                        {/* Line Total */}
                        <div className="text-right">
                          <div className="text-[10px] text-slate-400">कुल</div>
                          <div className="text-xs sm:text-sm font-extrabold text-slate-900 font-mono">
                            {formatINR(line.totalAmount)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Column / Mobile Bottom: Billing Summary & Payment Modes */}
        <div className="w-full lg:col-span-4 space-y-3">
          
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">बिल सारांश (Summary)</span>
              <span className="text-[11px] text-slate-500">
                GST: {isInterState ? 'IGST (अंतर-राज्य)' : 'CGST + SGST (राज्य)'}
              </span>
            </div>

            {/* Calculations Breakdown */}
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>उप-कुल (Subtotal):</span>
                <span className="font-mono font-medium">{formatINR(totals.subTotal)}</span>
              </div>

              {totals.totalDiscount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>कुल छूट (Discount):</span>
                  <span className="font-mono font-medium">-{formatINR(totals.totalDiscount)}</span>
                </div>
              )}

              <div className="flex justify-between text-slate-600">
                <span>कर योग्य मूल्य (Taxable):</span>
                <span className="font-mono font-medium">{formatINR(totals.subTotal)}</span>
              </div>

              {/* Tax Details */}
              {isInterState ? (
                <div className="flex justify-between text-slate-600">
                  <span>IGST कर:</span>
                  <span className="font-mono font-medium">{formatINR(totals.totalIgst)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-slate-600">
                    <span>CGST कर:</span>
                    <span className="font-mono font-medium">{formatINR(totals.totalCgst)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>SGST कर:</span>
                    <span className="font-mono font-medium">{formatINR(totals.totalSgst)}</span>
                  </div>
                </>
              )}

              {totals.roundOff !== 0 && (
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>राउंड ऑफ (Round Off):</span>
                  <span className="font-mono">{totals.roundOff > 0 ? `+${totals.roundOff}` : totals.roundOff}</span>
                </div>
              )}

              {/* Grand Total Display */}
              <div className="pt-2 border-t border-slate-200 flex justify-between items-baseline">
                <span className="text-sm font-extrabold text-slate-900">कुल देय राशि (Grand Total):</span>
                <span className="text-xl sm:text-2xl font-black text-blue-700 font-mono">
                  {formatINR(totals.grandTotal)}
                </span>
              </div>
            </div>

            {/* Payment Mode Selector: 2x2 Grid, Large Touch Targets, Zero Overlap */}
            <div className="pt-2 border-t border-slate-100">
              <label className="block text-xs font-bold text-slate-700 mb-2">
                भुगतान का तरीका (Payment Mode)
              </label>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'CASH', label: '💵 नकद (Cash)', desc: 'पूरा भुगतान' },
                  { id: 'UPI', label: '📱 UPI / QR', desc: 'ऑनलाइन पे' },
                  { id: 'CREDIT', label: '📒 उधार (Udhar)', desc: 'खाते में जुड़ेगा' },
                  { id: 'BANK_TRANSFER', label: '💳 कार्ड / बैंक', desc: 'स्वाइप / ट्रांसफर' },
                ].map(mode => {
                  const isSelected = paymentMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setPaymentMode(mode.id as PaymentMode)}
                      className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-center active:scale-98 ${
                        isSelected
                          ? mode.id === 'CREDIT'
                            ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-xs ring-1 ring-amber-500'
                            : 'bg-blue-50 border-blue-600 text-blue-950 shadow-xs ring-1 ring-blue-600'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-xs font-extrabold">{mode.label}</span>
                      <span className="text-[10px] text-slate-500 mt-0.5">{mode.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Received Amount Input */}
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-700">प्राप्त राशि (Received ₹):</span>
                <span className="text-[11px] text-slate-500 font-mono">
                  बकाया: {formatINR(Math.max(0, totals.grandTotal - receivedAmount))}
                </span>
              </div>
              <input
                ref={receivedInputRef}
                type="number"
                min="0"
                step="any"
                value={receivedAmount || ''}
                placeholder="0.00"
                onChange={e => setReceivedAmount(Number(e.target.value) || 0)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-mono font-bold text-slate-900 text-sm focus:outline-none focus:border-blue-600"
              />
            </div>

            {/* Action Buttons: Clean, Big, Touch-Friendly */}
            <div className="space-y-2 pt-1">
              {/* Primary: Save Bill */}
              <button
                disabled={isSaving || cartLines.length === 0}
                onClick={() => handleSave(false)}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-extrabold transition shadow-xs flex items-center justify-center gap-2 active:scale-98"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'सेव हो रहा है...' : '💾 बिल सेव करें (Save Bill)'}</span>
                <span className="hidden lg:inline-block ml-1 text-[10px] bg-blue-800 text-blue-100 px-1 rounded font-mono">Alt+S</span>
              </button>

              {/* Secondary Buttons Grid: Thermal Print & A4 Print */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={isSaving || cartLines.length === 0}
                  onClick={() => handleSave(true, 'thermal')}
                  className="py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-98"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>थर्मल प्रिंट</span>
                  <span className="hidden lg:inline-block text-[9px] bg-slate-700 px-1 rounded font-mono">Alt+P</span>
                </button>

                <button
                  disabled={isSaving || cartLines.length === 0}
                  onClick={() => handleSave(true, 'a4')}
                  className="py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 disabled:opacity-50 text-slate-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-98"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  <span>A4 बिल प्रिंट</span>
                </button>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Bill Saved Success Modal: WhatsApp Share & Print Prompt */}
      {showSavedSuccessModal && lastSavedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 p-5 sm:p-6 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
              <Check className="w-9 h-9 stroke-[2.5]" />
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-900">बिल सफलतापूर्वक सेव हो गया!</h3>
              <p className="text-xs text-slate-500 mt-1">
                बिल नं.: <strong className="font-mono text-slate-800">{lastSavedInvoice.invoiceNumber}</strong> | कुल: <strong className="text-emerald-700">{formatINR(lastSavedInvoice.grandTotal)}</strong>
              </p>
            </div>

            {/* Prominent WhatsApp Share Button */}
            <a
              href={generateWhatsAppInvoiceURL(lastSavedInvoice, company)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-extrabold transition flex items-center justify-center gap-2 shadow-sm"
            >
              <Share2 className="w-4 h-4" />
              <span>ग्राहक को WhatsApp पर बिल भेजें</span>
            </a>

            {/* Print Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  onSaveInvoice(lastSavedInvoice, true, 'thermal');
                  setShowSavedSuccessModal(false);
                }}
                className="py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>थर्मल रसीद प्रिंट</span>
              </button>

              <button
                onClick={() => {
                  onSaveInvoice(lastSavedInvoice, true, 'a4');
                  setShowSavedSuccessModal(false);
                }}
                className="py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span>A4 बिल देखें</span>
              </button>
            </div>

            <button
              onClick={() => setShowSavedSuccessModal(false)}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition"
            >
              ➕ अगला नया बिल बनाएं (Next Bill)
            </button>
          </div>
        </div>
      )}

      {/* Select Customer / Party Modal */}
      {isPartySelectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900">ग्राहक / पार्टी चुनें (Select Party)</h3>
              </div>
              <button
                onClick={() => setIsPartySelectOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 divide-y divide-slate-100 overflow-y-auto flex-1">
              {parties.map(p => {
                const isSelected = p.id === selectedParty.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSelectedParty(p);
                      setIsPartySelectOpen(false);
                    }}
                    className={`p-3 rounded-xl cursor-pointer flex items-center justify-between transition ${
                      isSelected ? 'bg-blue-50 text-blue-900 font-semibold' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="text-xs sm:text-sm font-bold text-slate-900">{p.name}</div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                        {p.phone && <span>📱 {p.phone}</span>}
                        <span>राज्य: {p.state} ({p.stateCode})</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] text-slate-400">खाता बैलेंस</div>
                      <div className={`text-xs font-mono font-bold ${
                        p.currentBalance > 0 ? 'text-amber-700' : 'text-emerald-700'
                      }`}>
                        {p.currentBalance > 0 ? `${formatINR(p.currentBalance)} बाकी` : '₹0 चुकता'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {onOpenPartyModal && (
              <div className="p-3 bg-slate-50 border-t border-slate-100">
                <button
                  onClick={() => {
                    setIsPartySelectOpen(false);
                    onOpenPartyModal();
                  }}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ नया ग्राहक / पार्टी जोड़ें</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Barcode Camera Scanner Modal */}
      <BarcodeCameraModal
        isOpen={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onDetected={(scannedCode) => {
          handleBarcodeScanned(scannedCode);
        }}
      />
    </div>
  );
};
