import React, { useState, useMemo } from 'react';
import { 
  Search, Plus, Minus, Trash2, ShoppingBag, 
  Camera, Check, X, ArrowRight, Printer, Share2, 
  Banknote, QrCode, CreditCard, ChevronUp, ChevronDown, UserCheck, AlertTriangle
} from 'lucide-react';
import { Item, Party, Invoice, InvoiceItem, CompanyProfile, PaymentMode } from '../../types';
import { calculateItemGST, calculateInvoiceTotals, formatINR } from '../../services/gstCalculator';
import { BarcodeCameraModal } from './BarcodeCameraModal';
import { generateWhatsAppInvoiceURL } from '../../services/whatsappShare';

interface MobilePOSProps {
  items: Item[];
  parties: Party[];
  company: CompanyProfile;
  onSaveInvoice: (invoice: Invoice, printImmediate?: boolean, printFormat?: 'thermal' | 'a4') => Promise<Invoice>;
  onOpenPartyModal?: () => void;
}

export const MobilePOS: React.FC<MobilePOSProps> = ({
  items,
  parties,
  company,
  onSaveInvoice,
  onOpenPartyModal,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cartLines, setCartLines] = useState<InvoiceItem[]>([]);
  
  // Default to walk-in or first customer
  const defaultParty = parties.find(p => p.id === 'pty-001') || parties[0] || {
    id: 'pty-walkin',
    name: 'Walk-in Customer (नकद ग्राहक)',
    phone: '',
    type: 'CUSTOMER',
    currentBalance: 0,
    state: company.state,
    stateCode: company.stateCode,
    createdAt: '',
    updatedAt: '',
  };
  const [selectedParty, setSelectedParty] = useState<Party>(defaultParty);
  const [isPartyModalOpen, setIsPartyModalOpen] = useState<boolean>(false);

  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState<boolean>(false);
  const [showCameraScanner, setShowCameraScanner] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<Invoice | null>(null);

  // Categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => set.add(i.category));
    return ['All', ...Array.from(set)];
  }, [items]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      const matchesQuery = !searchQuery || 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.barcode?.includes(searchQuery);
      return matchesCategory && matchesQuery;
    });
  }, [items, selectedCategory, searchQuery]);

  // Add item
  const addItem = (item: Item) => {
    const existingIdx = cartLines.findIndex(l => l.itemId === item.id);
    const sellerStateCode = company.stateCode;
    const buyerStateCode = selectedParty.stateCode || company.stateCode;
    const rate = item.retailPrice || item.wholesalePrice;

    if (existingIdx >= 0) {
      const updated = [...cartLines];
      const line = updated[existingIdx];
      const newQty = line.quantity + 1;
      const calc = calculateItemGST({
        quantity: newQty,
        rate: line.unitPrice,
        taxRate: item.taxRate,
        isTaxInclusive: true,
        sellerStateCode,
        buyerStateCode,
      });

      updated[existingIdx] = {
        ...line,
        quantity: newQty,
        taxableAmount: calc.taxableAmount,
        cgstAmount: calc.cgstAmount,
        sgstAmount: calc.sgstAmount,
        igstAmount: calc.igstAmount,
        totalAmount: calc.totalAmount,
      };
      setCartLines(updated);
    } else {
      const calc = calculateItemGST({
        quantity: 1,
        rate,
        taxRate: item.taxRate,
        isTaxInclusive: true,
        sellerStateCode,
        buyerStateCode,
      });

      const newLine: InvoiceItem = {
        itemId: item.id,
        itemName: item.name,
        hsn: item.hsn,
        unit: item.unit,
        quantity: 1,
        unitPrice: rate,
        discountPercent: 0,
        discountAmount: 0,
        taxRate: item.taxRate,
        taxableAmount: calc.taxableAmount,
        cgstAmount: calc.cgstAmount,
        sgstAmount: calc.sgstAmount,
        igstAmount: calc.igstAmount,
        cessAmount: 0,
        totalAmount: calc.totalAmount,
      };
      setCartLines([newLine, ...cartLines]);
    }
  };

  const updateQuantity = (itemId: string, delta: number) => {
    const existingIdx = cartLines.findIndex(l => l.itemId === itemId);
    if (existingIdx < 0) return;

    const updated = [...cartLines];
    const line = updated[existingIdx];
    const newQty = line.quantity + delta;

    if (newQty <= 0) {
      setCartLines(cartLines.filter(l => l.itemId !== itemId));
      return;
    }

    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const calc = calculateItemGST({
      quantity: newQty,
      rate: line.unitPrice,
      taxRate: item.taxRate,
      isTaxInclusive: true,
      sellerStateCode: company.stateCode,
      buyerStateCode: selectedParty.stateCode || company.stateCode,
    });

    updated[existingIdx] = {
      ...line,
      quantity: newQty,
      taxableAmount: calc.taxableAmount,
      cgstAmount: calc.cgstAmount,
      sgstAmount: calc.sgstAmount,
      igstAmount: calc.igstAmount,
      totalAmount: calc.totalAmount,
    };
    setCartLines(updated);
  };

  const totals = calculateInvoiceTotals(cartLines);
  const totalItemCount = cartLines.reduce((s, l) => s + l.quantity, 0);

  const handleCheckout = async (printThermal = false) => {
    if (cartLines.length === 0) return;
    setIsSaving(true);
    try {
      const now = new Date();
      const invoiceNumber = `${company.invoicePrefix || 'INV-'}${now.getFullYear()}-${String(Date.now()).slice(-5)}`;
      const isUdhar = paymentMode === 'CREDIT';

      const invoice: Invoice = {
        id: 'inv-' + Date.now(),
        invoiceNumber,
        documentType: 'SALES_INVOICE',
        partyId: selectedParty.id,
        partyName: selectedParty.name,
        partyGstin: selectedParty.gstin,
        partyPhone: selectedParty.phone,
        partyAddress: selectedParty.address,
        partyState: selectedParty.state || company.state,
        partyStateCode: selectedParty.stateCode || company.stateCode,
        date: now.toISOString().split('T')[0],
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
        receivedAmount: isUdhar ? 0 : totals.grandTotal,
        balanceAmount: isUdhar ? totals.grandTotal : 0,
        paymentMode,
        status: isUdhar ? 'UNPAID' : 'PAID',
        isSynced: true,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      const saved = await onSaveInvoice(invoice, printThermal, 'thermal');
      setLastSaved(saved);
      setCartLines([]);
      setIsCartDrawerOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-4.25rem)] bg-slate-100 overflow-hidden relative">
      {/* Barcode Camera Modal */}
      <BarcodeCameraModal
        isOpen={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onDetected={(code) => {
          const found = items.find(i => i.barcode === code || i.sku === code);
          if (found) {
            addItem(found);
          }
        }}
      />

      {/* Top Customer / Party Bar & Barcode Scanner Button */}
      <div className="bg-white p-3 border-b border-slate-200 space-y-2.5">
        <div className="flex items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold">
              <UserCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>ग्राहक:</span>
              <button
                onClick={() => setIsPartyModalOpen(true)}
                className="text-blue-600 font-bold underline truncate max-w-[150px]"
              >
                {selectedParty.name}
              </button>
            </div>
            {/* Previous Balance Pill */}
            <div className="text-[11px] font-bold mt-0.5">
              <span className="text-slate-500">पिछला बकाया: </span>
              <span className={`font-mono ${selectedParty.currentBalance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                {selectedParty.currentBalance > 0 ? `${formatINR(selectedParty.currentBalance)} (बाकी)` : '₹0 चुकता'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setIsPartyModalOpen(true)}
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700"
            >
              बदलें
            </button>
            <button
              onClick={() => setShowCameraScanner(true)}
              className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs flex items-center gap-1 text-xs font-bold"
              title="कैमरे से बारकोड स्कैन करें"
            >
              <Camera className="w-4 h-4" />
              <span>स्कैन</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="सामान खोजें या नाम टाइप करें..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white font-medium"
          />
        </div>

        {/* Category Horizontal Scrolling Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Touch Product Card View - Single Column / Dual Column on Small Screens */}
      <div className="flex-1 overflow-y-auto p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 pb-28">
        {filteredItems.map((item) => {
          const cartItem = cartLines.find(l => l.itemId === item.id);
          const isLowStock = item.currentStock <= item.lowStockThreshold;

          return (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-slate-200 p-3.5 flex flex-col justify-between shadow-2xs hover:border-blue-400 transition select-none"
            >
              <div>
                <div className="flex items-start justify-between gap-1 mb-1">
                  <span className="text-[10px] text-slate-400 font-mono truncate">{item.category}</span>
                  {isLowStock && (
                    <span className="text-[9px] bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded font-bold font-mono">
                      कम स्टॉक: {item.currentStock}
                    </span>
                  )}
                </div>
                <h4 className="font-bold text-sm text-slate-900 line-clamp-2 leading-tight mb-2">
                  {item.name}
                </h4>
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-2.5">
                  <span className="font-extrabold text-base text-slate-900 font-mono">
                    {formatINR(item.retailPrice || item.wholesalePrice)}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    स्टॉक: {item.currentStock} {item.unit}
                  </span>
                </div>

                {cartItem ? (
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl p-1">
                    <button
                      onClick={() => updateQuantity(item.id, -1)}
                      className="w-9 h-9 bg-white rounded-lg text-blue-700 font-black flex items-center justify-center shadow-xs active:bg-blue-100 text-lg"
                    >
                      <Minus className="w-4 h-4 stroke-[3]" />
                    </button>
                    <span className="font-mono font-black text-sm text-blue-900">
                      {cartItem.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.id, 1)}
                      className="w-9 h-9 bg-blue-600 rounded-lg text-white font-black flex items-center justify-center shadow-xs active:bg-blue-700 text-lg"
                    >
                      <Plus className="w-4 h-4 stroke-[3]" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => addItem(item)}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 shadow-xs transition active:scale-98"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ बिल में जोड़ें</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Bottom Cart Bar */}
      {cartLines.length > 0 && !isCartDrawerOpen && (
        <div className="fixed bottom-20 inset-x-3 z-30 max-w-lg mx-auto">
          <button
            onClick={() => setIsCartDrawerOpen(true)}
            className="w-full bg-slate-900 text-white rounded-2xl p-3.5 flex items-center justify-between shadow-2xl active:scale-[0.98] transition border border-slate-700"
          >
            <div className="flex items-center gap-3">
              <div className="relative p-2 bg-blue-600 rounded-xl">
                <ShoppingBag className="w-5 h-5 text-white" />
                <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                  {totalItemCount}
                </span>
              </div>
              <div className="text-left">
                <div className="text-[11px] text-slate-300 font-medium">कुल सामान: {cartLines.length}</div>
                <div className="text-base font-black font-mono">{formatINR(totals.grandTotal)}</div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-bold text-blue-300 bg-slate-800 px-3.5 py-2 rounded-xl border border-slate-700">
              <span>बिल देखें व भुगतान</span>
              <ChevronUp className="w-4 h-4" />
            </div>
          </button>
        </div>
      )}

      {/* Checkout Drawer (Bottom Sheet) */}
      {isCartDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex flex-col justify-end">
          <div className="bg-white rounded-t-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom-6">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-sm text-slate-900">वर्तमान बिल (Current Bill)</h3>
                <p className="text-[11px] text-slate-500">{totalItemCount} सामान चुने गए · {selectedParty.name}</p>
              </div>
              <button
                onClick={() => setIsCartDrawerOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cart Line List */}
            <div className="p-4 flex-1 overflow-y-auto divide-y divide-slate-100 space-y-2">
              {cartLines.map((line) => (
                <div key={line.itemId} className="pt-2 flex items-center justify-between">
                  <div className="flex-1 pr-2">
                    <div className="font-semibold text-xs sm:text-sm text-slate-900">{line.itemName}</div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {formatINR(line.unitPrice)} x {line.quantity} (GST {line.taxRate}%)
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                      <button
                        onClick={() => updateQuantity(line.itemId, -1)}
                        className="w-7 h-7 bg-white rounded text-slate-800 flex items-center justify-center font-black text-sm shadow-2xs"
                      >
                        -
                      </button>
                      <span className="font-mono text-xs font-bold px-2">{line.quantity}</span>
                      <button
                        onClick={() => updateQuantity(line.itemId, 1)}
                        className="w-7 h-7 bg-white rounded text-slate-800 flex items-center justify-center font-black text-sm shadow-2xs"
                      >
                        +
                      </button>
                    </div>
                    <span className="font-mono font-bold text-xs sm:text-sm text-slate-900 min-w-14 text-right">
                      {formatINR(line.totalAmount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Payment & Totals Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
              {/* Payment Mode Selector: 3 Big Touch Buttons */}
              <div className="space-y-1">
                <div className="text-xs font-bold text-slate-700">भुगतान का माध्यम (Payment Mode):</div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'CASH', label: '💵 नकद', icon: Banknote },
                    { id: 'UPI', label: '📱 UPI QR', icon: QrCode },
                    { id: 'CREDIT', label: '📒 उधार (Udhar)', icon: CreditCard },
                  ].map((m) => {
                    const isSelected = paymentMode === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setPaymentMode(m.id as PaymentMode)}
                        className={`flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-bold border transition ${
                          isSelected
                            ? m.id === 'CREDIT'
                              ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                              : 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Udhar / Khata Notice */}
              {paymentMode === 'CREDIT' && (
                <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>उधार बिल ({selectedParty.name}):</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span>पिछला बकाया: <strong>{formatINR(selectedParty.currentBalance)}</strong></span>
                    <span>नया कुल बकाया: <strong className="text-amber-900">{formatINR((selectedParty.currentBalance || 0) + totals.grandTotal)}</strong></span>
                  </div>
                </div>
              )}

              {/* Total Row */}
              <div className="flex items-center justify-between text-slate-900 pt-1">
                <span className="text-xs font-bold text-slate-600">कुल देय राशि (Grand Total):</span>
                <span className="text-xl font-black font-mono text-blue-700">{formatINR(totals.grandTotal)}</span>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  disabled={isSaving}
                  onClick={() => handleCheckout(true)}
                  className="py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition"
                >
                  <Printer className="w-4 h-4 text-emerald-400" />
                  <span>थर्मल प्रिंट</span>
                </button>

                <button
                  disabled={isSaving}
                  onClick={() => handleCheckout(false)}
                  className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{isSaving ? 'सेव हो रहा है...' : 'बिल पूरा करें'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Notification with prominent WhatsApp Share Button */}
      {lastSaved && (
        <div className="fixed top-16 inset-x-3 z-40 bg-slate-900 text-white p-3.5 rounded-2xl shadow-2xl border border-slate-700 space-y-2 animate-in slide-in-from-top-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-xs text-emerald-400">बिल सेव हो गया! #{lastSaved.invoiceNumber}</div>
              <div className="text-[11px] text-slate-300 font-mono">{formatINR(lastSaved.grandTotal)} · {lastSaved.paymentMode === 'CREDIT' ? 'उधार' : lastSaved.paymentMode}</div>
            </div>
            <button
              onClick={() => setLastSaved(null)}
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <a
              href={generateWhatsAppInvoiceURL(lastSaved, company)}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs"
            >
              <Share2 className="w-4 h-4" />
              <span>WhatsApp पर भेजें</span>
            </a>

            <button
              onClick={() => onSaveInvoice(lastSaved, true, 'thermal')}
              className="py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-slate-700"
            >
              <Printer className="w-4 h-4" />
              <span>थर्मल रसीद</span>
            </button>
          </div>
        </div>
      )}

      {/* Select Customer / Party Modal */}
      {isPartyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-xs sm:text-sm text-slate-900">ग्राहक चुनें (Select Party)</h3>
              <button
                onClick={() => setIsPartyModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-2.5 divide-y divide-slate-100 overflow-y-auto flex-1">
              {parties.map((p) => {
                const isSelected = p.id === selectedParty.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSelectedParty(p);
                      setIsPartyModalOpen(false);
                    }}
                    className={`p-2.5 rounded-xl cursor-pointer flex items-center justify-between transition ${
                      isSelected ? 'bg-blue-50 text-blue-900 font-bold' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900">{p.name}</div>
                      {p.phone && <div className="text-[10px] text-slate-400 font-mono">{p.phone}</div>}
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400">बकाया</div>
                      <div className={`text-xs font-mono font-bold ${p.currentBalance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {p.currentBalance > 0 ? `${formatINR(p.currentBalance)}` : '₹0'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {onOpenPartyModal && (
              <div className="p-2.5 bg-slate-50 border-t border-slate-100">
                <button
                  onClick={() => {
                    setIsPartyModalOpen(false);
                    onOpenPartyModal();
                  }}
                  className="w-full py-2 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ नया ग्राहक जोड़ें</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
