import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Item, Party, Invoice, InvoiceItem, CompanyProfile, PaymentMode, DocumentType 
} from '../../types';
import { 
  calculateItemGST, calculateInvoiceTotals, formatINR, INDIAN_STATES 
} from '../../services/gstCalculator';
import { PartySelectModal } from './PartySelectModal';
import { FinalInvoiceModal } from './FinalInvoiceModal';
import { BarcodeCameraModal } from './BarcodeCameraModal';
import { playBarcodeBeep } from '../../services/soundEffects';
import { generateWhatsAppInvoiceURL } from '../../services/whatsappShare';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { 
  Plus, Search, Camera, Trash2, Printer, Share2, 
  UserCheck, AlertTriangle, ArrowLeft, Check, ShoppingBag, 
  FileText, Sparkles, Banknote, QrCode, CreditCard, ArrowDownLeft,
  X, ChevronRight, TrendingUp, Calendar, Clock
} from 'lucide-react';

interface VyaparPOSViewProps {
  items: Item[];
  parties: Party[];
  company: CompanyProfile;
  invoices: Invoice[];
  onSaveInvoice: (invoice: Invoice, printImmediate?: boolean, printFormat?: 'thermal' | 'a4') => Promise<Invoice>;
  onSaveParty: (party: Party) => Promise<void>;
  onSaveItem?: (item: Item) => Promise<void>;
  onOpenPaymentIn?: () => void;
  onViewInvoice?: (invoice: Invoice, format: 'thermal' | 'a4') => void;
}

export const VyaparPOSView: React.FC<VyaparPOSViewProps> = ({
  items,
  parties,
  company,
  invoices,
  onSaveInvoice,
  onSaveParty,
  onSaveItem,
  onOpenPaymentIn,
  onViewInvoice,
}) => {
  // Mode: 'DASHBOARD' (Home screen with "+ New Bill") vs 'CREATE_INVOICE' (The Bill Form)
  const [isCreatingInvoice, setIsCreatingInvoice] = useState<boolean>(false);

  // Selected Party for Current Bill
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [isPartyModalOpen, setIsPartyModalOpen] = useState<boolean>(false);

  // Cart Lines for Current Bill
  const [cartLines, setCartLines] = useState<InvoiceItem[]>([]);

  // Item Search & Input fields
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSearchItem, setSelectedSearchItem] = useState<Item | null>(null);
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [itemDiscountPercent, setItemDiscountPercent] = useState<number>(0);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState<boolean>(false);

  // Item Not Found in Stock & Quick Add State
  const [unrecognizedBarcode, setUnrecognizedBarcode] = useState<string | null>(null);
  const [isQuickAddingItem, setIsQuickAddingItem] = useState<boolean>(false);
  const [quickItemName, setQuickItemName] = useState<string>('');
  const [quickItemCategory, setQuickItemCategory] = useState<string>('किराना व दैनिक सामान');
  const [quickItemRetailPrice, setQuickItemRetailPrice] = useState<number>(0);
  const [quickItemPurchasePrice, setQuickItemPurchasePrice] = useState<number>(0);
  const [quickItemUnit, setQuickItemUnit] = useState<'PCS' | 'KG' | 'PACK' | 'BOX' | 'LTR' | 'BAG'>('PCS');
  const [quickItemStock, setQuickItemStock] = useState<number>(20);
  const [quickItemTaxRate, setQuickItemTaxRate] = useState<number>(18);
  const [isSavingQuickItem, setIsSavingQuickItem] = useState<boolean>(false);

  // Payment & Totals
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [receivedAmount, setReceivedAmount] = useState<number>(0);
  const [invoiceNotes, setInvoiceNotes] = useState<string>('');

  // Modals
  const [showCameraScanner, setShowCameraScanner] = useState<boolean>(false);
  const [finalInvoice, setFinalInvoice] = useState<Invoice | null>(null);
  const [showFinalModal, setShowFinalModal] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedbackToast, setFeedbackToast] = useState<{ msg: string; isError?: boolean } | null>(null);

  // Previous balance of selected party at start
  const customerPreviousBalance = selectedParty ? selectedParty.currentBalance : 0;

  // Search filter
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return items.filter(
      i =>
        i.name.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        (i.barcode && i.barcode.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [items, searchQuery]);

  // Flash feedback toast
  const showFlashToast = (msg: string, isError = false) => {
    setFeedbackToast({ msg, isError });
    setTimeout(() => setFeedbackToast(null), 3000);
  };

  // Hardware barcode listener
  useBarcodeScanner({
    onScan: (barcode) => {
      if (isCreatingInvoice) {
        handleBarcodeScanned(barcode);
      }
    },
  });

  const handleBarcodeScanned = (code: string) => {
    const cleanCode = code.trim().toLowerCase();
    const foundItem = items.find(
      i => (i.barcode && i.barcode.trim().toLowerCase() === cleanCode) || 
           (i.sku && i.sku.trim().toLowerCase() === cleanCode)
    );

    if (foundItem) {
      playBarcodeBeep();
      addItemToCartDirectly(foundItem, 1, 0);
      showFlashToast(`स्कैन सफल: ${foundItem.name} (${formatINR(foundItem.retailPrice || foundItem.wholesalePrice)})`);
    } else {
      // ⚠️ Not found in stock! Trigger prompt/modal to add item right away
      setUnrecognizedBarcode(code.trim());
      setIsQuickAddingItem(false);
    }
  };

  const handleOpenQuickAddForm = () => {
    setQuickItemName('');
    setQuickItemCategory('किराना व दैनिक सामान');
    setQuickItemRetailPrice(100);
    setQuickItemPurchasePrice(80);
    setQuickItemUnit('PCS');
    setQuickItemStock(20);
    setQuickItemTaxRate(18);
    setIsQuickAddingItem(true);
  };

  const handleQuickItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickItemName.trim() || !unrecognizedBarcode) return;

    setIsSavingQuickItem(true);
    try {
      const newItem: Item = {
        id: `itm-${Date.now()}`,
        name: quickItemName.trim(),
        category: quickItemCategory.trim(),
        sku: `SKU-${String(Date.now()).slice(-6)}`,
        barcode: unrecognizedBarcode,
        hsn: '19053100',
        unit: quickItemUnit,
        purchasePrice: Number(quickItemPurchasePrice) || 0,
        wholesalePrice: Number(quickItemRetailPrice) * 0.9,
        retailPrice: Number(quickItemRetailPrice) || 0,
        taxRate: Number(quickItemTaxRate) || 18,
        taxInclusive: true,
        currentStock: Number(quickItemStock) || 10,
        lowStockThreshold: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (onSaveItem) {
        await onSaveItem(newItem);
      }

      // Audio BEEP!
      playBarcodeBeep();

      // Immediately add this new item with its scanned barcode to the current bill!
      addItemToCartDirectly(newItem, 1, 0);

      showFlashToast(`स्टॉक में नया सामान सेव हुआ व बिल में जुड़ा: ${newItem.name}`);
      setUnrecognizedBarcode(null);
      setIsQuickAddingItem(false);
    } catch (err) {
      console.error('Failed to quick add item:', err);
      showFlashToast('सामान सेव करने में त्रुटि हुई', true);
    } finally {
      setIsSavingQuickItem(false);
    }
  };

  // Add Item Directly with custom qty & discount
  const addItemToCartDirectly = (
    item: Item, 
    qty: number = 1, 
    discountPercent: number = 0
  ) => {
    const sellerStateCode = company.stateCode;
    const buyerStateCode = selectedParty ? (selectedParty.stateCode || company.stateCode) : company.stateCode;
    const rate = item.retailPrice || item.wholesalePrice;

    const existingIdx = cartLines.findIndex(l => l.itemId === item.id);
    if (existingIdx >= 0) {
      const updated = [...cartLines];
      const line = updated[existingIdx];
      const newQty = line.quantity + qty;
      const gst = calculateItemGST({
        quantity: newQty,
        rate: line.unitPrice,
        taxRate: item.taxRate,
        discountPercent: line.discountPercent,
        isTaxInclusive: true,
        sellerStateCode,
        buyerStateCode,
      });

      updated[existingIdx] = {
        ...line,
        quantity: newQty,
        taxableAmount: gst.taxableAmount,
        cgstAmount: gst.cgstAmount,
        sgstAmount: gst.sgstAmount,
        igstAmount: gst.igstAmount,
        totalAmount: gst.totalAmount,
      };
      setCartLines(updated);
    } else {
      const gst = calculateItemGST({
        quantity: qty,
        rate,
        taxRate: item.taxRate,
        discountPercent,
        isTaxInclusive: true,
        sellerStateCode,
        buyerStateCode,
      });

      const newLine: InvoiceItem = {
        itemId: item.id,
        itemName: item.name,
        hsn: item.hsn,
        unit: item.unit,
        quantity: qty,
        unitPrice: rate,
        discountPercent,
        discountAmount: (rate * qty * discountPercent) / 100,
        taxRate: item.taxRate,
        taxableAmount: gst.taxableAmount,
        cgstAmount: gst.cgstAmount,
        sgstAmount: gst.sgstAmount,
        igstAmount: gst.igstAmount,
        cessAmount: 0,
        totalAmount: gst.totalAmount,
      };
      setCartLines([newLine, ...cartLines]);
    }
  };

  // Update line quantity in cart
  const updateLineQty = (idx: number, newQty: number) => {
    if (newQty <= 0) {
      setCartLines(cartLines.filter((_, i) => i !== idx));
      return;
    }

    const updated = [...cartLines];
    const line = updated[idx];
    const item = items.find(i => i.id === line.itemId);
    const taxRate = item ? item.taxRate : line.taxRate;
    const sellerStateCode = company.stateCode;
    const buyerStateCode = selectedParty ? (selectedParty.stateCode || company.stateCode) : company.stateCode;

    const gst = calculateItemGST({
      quantity: newQty,
      rate: line.unitPrice,
      taxRate,
      discountPercent: line.discountPercent,
      isTaxInclusive: true,
      sellerStateCode,
      buyerStateCode,
    });

    updated[idx] = {
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

  // Remove line from cart
  const removeLine = (idx: number) => {
    setCartLines(cartLines.filter((_, i) => i !== idx));
  };

  // Invoice calculations
  const totals = calculateInvoiceTotals(cartLines);

  // Sync received amount based on payment mode
  useEffect(() => {
    if (paymentMode === 'CREDIT') {
      setReceivedAmount(0);
    } else {
      setReceivedAmount(totals.grandTotal);
    }
  }, [totals.grandTotal, paymentMode]);

  // Start a fresh new bill
  const handleStartNewBill = () => {
    // Default to Walk-in customer or first customer
    const walkIn = parties.find(p => p.id === 'pty-001' || p.name.includes('Walk-in')) || parties[0] || null;
    setSelectedParty(walkIn);
    setCartLines([]);
    setSearchQuery('');
    setSelectedSearchItem(null);
    setItemQuantity(1);
    setItemDiscountPercent(0);
    setPaymentMode('CASH');
    setInvoiceNotes('');
    setIsCreatingInvoice(true);
  };

  // Finalize & Save Bill
  const handleFinalizeBill = async () => {
    if (!selectedParty) {
      showFlashToast('कृपया पहले ग्राहक / पार्टी चुनें', true);
      setIsPartyModalOpen(true);
      return;
    }

    if (cartLines.length === 0) {
      showFlashToast('बिल में कम से कम एक सामान जोड़ें', true);
      return;
    }

    setIsSaving(true);
    try {
      const now = new Date();
      const invoiceNumber = `${company.invoicePrefix || 'INV-'}${now.getFullYear()}-${String(Date.now()).slice(-5)}`;
      const isUdhar = paymentMode === 'CREDIT';
      const actualReceived = isUdhar ? 0 : receivedAmount;
      const balanceDue = Math.max(0, totals.grandTotal - actualReceived);

      const invoice: Invoice = {
        id: `inv-${Date.now()}`,
        invoiceNumber,
        documentType: 'SALES_INVOICE' as DocumentType,
        partyId: selectedParty.id,
        partyName: selectedParty.name,
        partyPhone: selectedParty.phone,
        partyAddress: selectedParty.address,
        partyGstin: selectedParty.gstin,
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
        receivedAmount: actualReceived,
        balanceAmount: balanceDue,
        paymentMode,
        status: actualReceived >= totals.grandTotal ? 'PAID' : actualReceived > 0 ? 'PARTIAL' : 'UNPAID',
        notes: invoiceNotes || undefined,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        isSynced: false,
      };

      const saved = await onSaveInvoice(invoice, false);
      setFinalInvoice(saved);
      setShowFinalModal(true);
      // Reset form state
      setCartLines([]);
    } catch (err) {
      console.error('Error saving invoice:', err);
      showFlashToast('बिल सेव करने में त्रुटि हुई', true);
    } finally {
      setIsSaving(false);
    }
  };

  // Today's summary stats
  const todayDateStr = new Date().toISOString().split('T')[0];
  const todayInvoices = invoices.filter(inv => inv.date === todayDateStr);
  const todaySalesTotal = todayInvoices.reduce((s, inv) => s + inv.grandTotal, 0);
  const totalReceivables = parties.filter(p => p.currentBalance > 0).reduce((s, p) => s + p.currentBalance, 0);

  // -------------------------------------------------------------
  // VIEW 1: BILLING DASHBOARD / HOME (With big "+ New Bill" button)
  // -------------------------------------------------------------
  if (!isCreatingInvoice) {
    return (
      <div className="p-3 sm:p-6 max-w-6xl mx-auto space-y-5 pb-24">
        {/* Top Hero Card with Big "+ New Bill" Button */}
        <div className="bg-linear-to-br from-blue-700 via-blue-800 to-slate-900 rounded-3xl p-5 sm:p-8 text-white shadow-xl relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-blue-200 text-xs font-semibold backdrop-blur-xs mb-3">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>व्यापार बिलिंग व इनवॉइसिंग (Vyapar Invoice)</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
                नया बिक्री बिल बनाएँ
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-1 max-w-md leading-relaxed">
                ग्राहक चुनें, मोबाइल कैमरे से बारकोड स्कैन करें या सामान सर्च करें और 10 सेकंड में GST बिल प्रिंट व WhatsApp शेयर करें।
              </p>
            </div>

            {/* BIG "+ Create Invoice" BUTTON */}
            <button
              onClick={handleStartNewBill}
              className="py-4 px-8 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-2xl text-base sm:text-lg font-black transition shadow-2xl flex items-center justify-center gap-2.5 active:scale-95 group shrink-0"
            >
              <div className="w-8 h-8 rounded-xl bg-slate-950/15 flex items-center justify-center">
                <Plus className="w-5 h-5 text-slate-950 stroke-[3]" />
              </div>
              <span>+ नया बिल बनाएँ (Create Invoice)</span>
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition" />
            </button>
          </div>
        </div>

        {/* Quick KPI Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>आज की बिक्री (Today's Sale)</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1 font-mono">
              {formatINR(todaySalesTotal)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {todayInvoices.length} बिल बनाए गए
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>कुल ग्राहक उधारी (Total Udhar)</span>
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-700 mt-1 font-mono">
              {formatINR(totalReceivables)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              ग्राहकों से लेना बाकी
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>कुल पंजीकृत सामान (Items)</span>
              <ShoppingBag className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-blue-700 mt-1">
              {items.length}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              स्टॉक में उपलब्ध उत्पाद
            </div>
          </div>
        </div>

        {/* Recent Invoices Section */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                हाल ही में बने बिल (Recent Invoices)
              </h3>
            </div>

            <button
              onClick={handleStartNewBill}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-2xs active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ नया बिल</span>
            </button>
          </div>

          {invoices.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                <FileText className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700">अभी तक कोई बिल नहीं बना है</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  अपनी पहली बिक्री दर्ज करने के लिए ऊपर "+ नया बिल बनाएँ" बटन दबाएं।
                </p>
              </div>
              <button
                onClick={handleStartNewBill}
                className="mt-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>पहला बिल बनाएँ</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-x-auto">
              {invoices.slice(0, 10).map((inv) => (
                <div
                  key={inv.id}
                  className="p-3.5 sm:p-4 hover:bg-slate-50 transition flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-900 font-mono text-xs sm:text-sm">
                        {inv.invoiceNumber}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                        inv.paymentMode === 'CREDIT'
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-blue-100 text-blue-900'
                      }`}>
                        {inv.paymentMode === 'CREDIT' ? 'उधार' : inv.paymentMode}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-500 mt-0.5 text-[11px]">
                      <span className="font-semibold text-slate-800">{inv.partyName}</span>
                      <span>📅 {inv.date}</span>
                      <span>{inv.items.length} सामान</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="font-mono font-black text-slate-900 text-xs sm:text-sm">
                        {formatINR(inv.grandTotal)}
                      </div>
                      <div className={`text-[10px] font-bold ${
                        inv.status === 'PAID' ? 'text-emerald-700' : 'text-amber-700'
                      }`}>
                        {inv.status === 'PAID' ? 'चुकता' : 'बकाया'}
                      </div>
                    </div>

                    {/* Quick WhatsApp & Print Actions */}
                    <div className="flex items-center gap-1">
                      <a
                        href={generateWhatsAppInvoiceURL(inv, company)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl transition"
                        title="WhatsApp पर भेजें"
                      >
                        <Share2 className="w-4 h-4" />
                      </a>

                      {onViewInvoice && (
                        <button
                          onClick={() => onViewInvoice(inv, 'thermal')}
                          className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
                          title="प्रिंट रसीद"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW 2: AUTHENTIC VYAPAR "CREATE INVOICE" WORKFLOW (4 STEPS)
  // -------------------------------------------------------------
  return (
    <div className="min-h-[calc(100vh-4.25rem)] bg-slate-100 pb-28 sm:pb-8">
      {/* Toast Feedback */}
      {feedbackToast && (
        <div className={`fixed top-18 right-4 z-50 px-4 py-2.5 rounded-2xl shadow-xl border text-xs sm:text-sm font-bold animate-in fade-in slide-in-from-top-2 ${
          feedbackToast.isError
            ? 'bg-red-900 text-white border-red-700'
            : 'bg-slate-900 text-white border-slate-700'
        }`}>
          {feedbackToast.msg}
        </div>
      )}

      {/* Barcode Camera Scanner Modal */}
      <BarcodeCameraModal
        isOpen={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onDetected={(code) => {
          handleBarcodeScanned(code);
        }}
      />

      {/* Party Select / Add Modal */}
      <PartySelectModal
        isOpen={isPartyModalOpen}
        onClose={() => setIsPartyModalOpen(false)}
        parties={parties}
        selectedPartyId={selectedParty?.id}
        company={company}
        onSelectParty={(party) => {
          setSelectedParty(party);
          showFlashToast(`ग्राहक चुना गया: ${party.name}`);
        }}
        onSaveNewParty={onSaveParty}
      />

      {/* Final Bill Preview Modal */}
      <FinalInvoiceModal
        isOpen={showFinalModal}
        onClose={() => setShowFinalModal(false)}
        invoice={finalInvoice}
        company={company}
        customerPreviousBalance={customerPreviousBalance}
        onPrintThermal={(inv) => {
          if (onViewInvoice) onViewInvoice(inv, 'thermal');
        }}
        onPrintA4={(inv) => {
          if (onViewInvoice) onViewInvoice(inv, 'a4');
        }}
        onStartNewBill={() => {
          setShowFinalModal(false);
          handleStartNewBill();
        }}
      />

      {/* Item Not Found in Stock Alert & Quick Add Modal */}
      {unrecognizedBarcode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-2xs p-3 sm:p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {!isQuickAddingItem ? (
              // Alert Screen: Item not found
              <div className="p-5 sm:p-6 text-center space-y-4">
                <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                  <AlertTriangle className="w-9 h-9 stroke-[2.5]" />
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-base sm:text-lg font-black text-slate-900">
                    यह सामान स्टॉक में नहीं मिला!
                  </h3>
                  <div className="text-xs text-slate-500">
                    स्कैन बारकोड: <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{unrecognizedBarcode}</span>
                  </div>
                  <p className="text-xs text-slate-600 pt-1 leading-relaxed">
                    यह बारकोड आपकी इन्वेंट्री में पंजीकृत नहीं है। क्या आप इसे अभी तुरंत स्टॉक में जोड़ना चाहते हैं?
                  </p>
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setUnrecognizedBarcode(null)}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                  >
                    रद्द करें (Cancel)
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenQuickAddForm}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-extrabold transition shadow-xs flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <Plus className="w-4 h-4 stroke-[3]" />
                    <span>+ नया सामान जोड़ें</span>
                  </button>
                </div>
              </div>
            ) : (
              // Quick Add Form Screen
              <form onSubmit={handleQuickItemSubmit} className="flex flex-col">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                      + नया सामान स्टॉक में जोड़ें
                    </h3>
                    <p className="text-[11px] text-slate-500 font-mono">
                      बारकोड: <strong>{unrecognizedBarcode}</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUnrecognizedBarcode(null);
                      setIsQuickAddingItem(false);
                    }}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-4 sm:p-5 space-y-3 max-h-[75vh] overflow-y-auto text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      सामान का नाम (Item Name) *
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      placeholder="उदा. पारले-जी बिस्कुट 200g / अमूल दूध 1L"
                      value={quickItemName}
                      onChange={e => setQuickItemName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        कैटेगरी (Category)
                      </label>
                      <input
                        type="text"
                        value={quickItemCategory}
                        onChange={e => setQuickItemCategory(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        इकाई (Unit)
                      </label>
                      <select
                        value={quickItemUnit}
                        onChange={e => setQuickItemUnit(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none font-medium"
                      >
                        <option value="PCS">PCS (नग)</option>
                        <option value="PACK">PACK (पैकेट)</option>
                        <option value="KG">KG (किलो)</option>
                        <option value="BOX">BOX (डिब्बा)</option>
                        <option value="LTR">LTR (लीटर)</option>
                        <option value="BAG">BAG (बोरी)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 bg-blue-50/70 p-3 rounded-2xl border border-blue-200">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        बिक्री दर (Sale Price ₹) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        required
                        placeholder="0.00"
                        value={quickItemRetailPrice || ''}
                        onChange={e => setQuickItemRetailPrice(Number(e.target.value))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-mono font-black text-blue-700 focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        खरीद दर (Purchase ₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0.00"
                        value={quickItemPurchasePrice || ''}
                        onChange={e => setQuickItemPurchasePrice(Number(e.target.value))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-mono font-bold text-slate-700 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        स्टॉक मात्रा (Stock Qty)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={quickItemStock || ''}
                        onChange={e => setQuickItemStock(Number(e.target.value) || 1)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        GST दर (Tax Rate %)
                      </label>
                      <select
                        value={quickItemTaxRate}
                        onChange={e => setQuickItemTaxRate(Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none"
                      >
                        <option value={0}>0% (कर मुक्त)</option>
                        <option value={5}>5% GST</option>
                        <option value={12}>12% GST</option>
                        <option value={18}>18% GST</option>
                        <option value={28}>28% GST</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="p-4 border-t border-slate-100 bg-white flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsQuickAddingItem(false)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                  >
                    पीछे
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingQuickItem || !quickItemName.trim()}
                    className="flex-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-extrabold transition shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isSavingQuickItem ? 'सेव हो रहा है...' : 'सेव करें व बिल में जोड़ें'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto p-3 sm:p-6 space-y-4">
        {/* Navigation Bar / Return to Billing Home */}
        <div className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCreatingInvoice(false)}
              className="p-1.5 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition flex items-center gap-1 text-xs font-bold"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>बिलिंग होम पर लौटें</span>
            </button>
            <span className="text-slate-300">|</span>
            <span className="font-extrabold text-sm text-slate-900">नया बिक्री बिल (Create Bill)</span>
          </div>

          <div className="text-xs text-slate-500 font-mono hidden sm:block">
            तारीख: <strong>{new Date().toLocaleDateString('hi-IN')}</strong>
          </div>
        </div>

        {/* STEP 1: PARTY / CUSTOMER SELECTION & DETAILS */}
        <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center">
                1
              </span>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                ग्राहक / पार्टी विवरण (Customer Details)
              </h3>
            </div>

            <button
              onClick={() => setIsPartyModalOpen(true)}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold transition flex items-center gap-1 border border-blue-200 active:scale-95"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>{selectedParty ? 'ग्राहक बदलें' : 'ग्राहक चुनें / जोड़ें'}</span>
            </button>
          </div>

          {selectedParty ? (
            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-base font-black text-slate-900 truncate">
                    {selectedParty.name}
                  </span>
                  <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-1.5 py-0.5 rounded">
                    {selectedParty.type === 'CUSTOMER' ? 'ग्राहक' : 'सप्लायर'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-slate-500">
                  {selectedParty.phone && (
                    <span className="font-mono font-medium">📱 {selectedParty.phone}</span>
                  )}
                  {selectedParty.address && (
                    <span className="truncate max-w-xs">📍 {selectedParty.address}</span>
                  )}
                  <span>राज्य: {selectedParty.state} ({selectedParty.stateCode})</span>
                </div>
              </div>

              {/* Outstanding Balance Badge */}
              <div className="shrink-0 self-start sm:self-auto bg-white p-2.5 rounded-xl border border-slate-200 text-right">
                <div className="text-[10px] text-slate-400 font-semibold">पिछला बकाया (Old Balance):</div>
                <div className={`text-sm font-mono font-black ${
                  selectedParty.currentBalance > 0
                    ? 'text-amber-700'
                    : selectedParty.currentBalance < 0
                    ? 'text-purple-700'
                    : 'text-emerald-700'
                }`}>
                  {selectedParty.currentBalance > 0
                    ? `${formatINR(selectedParty.currentBalance)} बाकी`
                    : selectedParty.currentBalance < 0
                    ? `${formatINR(Math.abs(selectedParty.currentBalance))} एडवांस`
                    : '₹0 चुकता'}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-amber-900 font-semibold">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>बिल शुरू करने के लिए कृपया ग्राहक चुनें या नकद ग्राहक सेट करें।</span>
              </div>
              <button
                onClick={() => setIsPartyModalOpen(true)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                + ग्राहक चुनें
              </button>
            </div>
          )}
        </div>

        {/* STEP 2: DUAL ITEM ADD SYSTEM (SCAN & SEARCH) */}
        <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center">
                2
              </span>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                सामान जोड़ें (Scan Barcode & Search Items)
              </h3>
            </div>

            {/* BIG PROMINENT CAMERA BARCODE SCAN BUTTON */}
            <button
              onClick={() => setShowCameraScanner(true)}
              className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs sm:text-sm font-extrabold transition shadow-md flex items-center gap-2 active:scale-95 animate-pulse-subtle"
            >
              <Camera className="w-4 h-4 stroke-[2.5]" />
              <span>📷 बारकोड स्कैन करें (Scan Barcode)</span>
            </button>
          </div>

          {/* Search, Quantity & Add Section */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
              {/* Autocomplete Search Input */}
              <div className="md:col-span-6 relative">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  सामान खोजें (नाम / SKU / बारकोड)
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setIsSearchDropdownOpen(true);
                    }}
                    onFocus={() => setIsSearchDropdownOpen(true)}
                    placeholder="सामान का नाम या कोड टाइप करें..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-semibold"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedSearchItem(null);
                      }}
                      className="absolute right-2.5 top-2.5 p-0.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Dropdown search results */}
                {isSearchDropdownOpen && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-60 overflow-y-auto z-40 p-1 divide-y divide-slate-100">
                    {searchResults.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          setSelectedSearchItem(item);
                          setSearchQuery(item.name);
                          setIsSearchDropdownOpen(false);
                        }}
                        className="p-2.5 hover:bg-blue-50 rounded-xl cursor-pointer flex items-center justify-between text-xs transition"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 truncate">{item.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            SKU: {item.sku} {item.barcode ? `· बारकोड: ${item.barcode}` : ''}
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <div className="font-mono font-bold text-slate-900">
                            {formatINR(item.retailPrice || item.wholesalePrice)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            स्टॉक: {item.currentStock} {item.unit}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quantity Input */}
              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  मात्रा (Qty)
                </label>
                <div className="flex items-center bg-slate-50 border border-slate-300 rounded-xl p-1">
                  <button
                    type="button"
                    onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))}
                    className="w-7 h-7 bg-white rounded-lg text-slate-800 font-bold flex items-center justify-center shadow-2xs active:bg-slate-200"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={itemQuantity}
                    onChange={(e) => setItemQuantity(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full text-center bg-transparent font-mono font-bold text-xs sm:text-sm text-slate-900 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setItemQuantity(itemQuantity + 1)}
                    className="w-7 h-7 bg-white rounded-lg text-slate-800 font-bold flex items-center justify-center shadow-2xs active:bg-slate-200"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Discount Input */}
              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  छूट % (Discount)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={itemDiscountPercent || ''}
                  placeholder="0%"
                  onChange={(e) => setItemDiscountPercent(Number(e.target.value) || 0)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 font-mono font-bold focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              {/* Add to Bill Button */}
              <div className="md:col-span-2 flex items-end">
                <button
                  type="button"
                  disabled={!selectedSearchItem}
                  onClick={() => {
                    if (selectedSearchItem) {
                      addItemToCartDirectly(selectedSearchItem, itemQuantity, itemDiscountPercent);
                      showFlashToast(`जोड़ा गया: ${selectedSearchItem.name}`);
                      setSearchQuery('');
                      setSelectedSearchItem(null);
                      setItemQuantity(1);
                      setItemDiscountPercent(0);
                    }
                  }}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl text-xs sm:text-sm font-extrabold transition shadow-xs flex items-center justify-center gap-1 active:scale-98"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ जोड़ें (Add)</span>
                </button>
              </div>
            </div>

            {/* Quick Catalog Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-1 scrollbar-none">
              <span className="text-[11px] text-slate-400 font-medium shrink-0">जल्दी जोड़ें:</span>
              {items.slice(0, 6).map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    addItemToCartDirectly(item, 1, 0);
                    showFlashToast(`+1 ${item.name}`);
                  }}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-800 rounded-lg text-xs font-semibold whitespace-nowrap transition border border-slate-200 active:scale-95"
                >
                  + {item.name} ({formatINR(item.retailPrice || item.wholesalePrice)})
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* STEP 3 & 4: CART & LIVE INVOICE SUMMARY */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          
          {/* Cart Table (8 Cols on Desktop) */}
          <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center">
                  3
                </span>
                <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                  चालू बिल में सामान (Cart Items)
                </h3>
                <span className="bg-blue-100 text-blue-800 text-xs font-black px-2 py-0.5 rounded-full">
                  {cartLines.length}
                </span>
              </div>

              {cartLines.length > 0 && (
                <button
                  onClick={() => setCartLines([])}
                  className="text-xs text-red-600 hover:text-red-800 font-bold flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>बिल खाली करें</span>
                </button>
              )}
            </div>

            {cartLines.length === 0 ? (
              <div className="p-8 sm:p-12 text-center text-slate-400 space-y-2">
                <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-600">वर्तमान बिल खाली है</p>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  ऊपर '📷 बारकोड स्कैन करें' दबाएं या सर्च बार से सामान जोड़ें।
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {cartLines.map((line, idx) => (
                  <div key={line.itemId} className="py-3 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="font-extrabold text-slate-900 text-xs sm:text-sm truncate">
                        {line.itemName}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>दर: {formatINR(line.unitPrice)}</span>
                        <span>GST: {line.taxRate}%</span>
                        {line.discountPercent > 0 && <span className="text-emerald-700">छूट: {line.discountPercent}%</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Qty Stepper */}
                      <div className="flex items-center bg-slate-100 rounded-xl p-0.5">
                        <button
                          onClick={() => updateLineQty(idx, line.quantity - 1)}
                          className="w-7 h-7 bg-white rounded-lg text-slate-800 font-bold flex items-center justify-center shadow-2xs"
                        >
                          -
                        </button>
                        <span className="font-mono font-black px-2 text-xs sm:text-sm text-slate-900">
                          {line.quantity}
                        </span>
                        <button
                          onClick={() => updateLineQty(idx, line.quantity + 1)}
                          className="w-7 h-7 bg-white rounded-lg text-slate-800 font-bold flex items-center justify-center shadow-2xs"
                        >
                          +
                        </button>
                      </div>

                      {/* Line Total */}
                      <span className="font-mono font-black text-xs sm:text-sm text-slate-900 min-w-16 text-right">
                        {formatINR(line.totalAmount)}
                      </span>

                      {/* Remove */}
                      <button
                        onClick={() => removeLine(idx)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payment & Live Summary (5 Cols on Desktop) */}
          <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center">
                4
              </span>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                भुगतान व बिल सारांश (Payment & Finalize)
              </h3>
            </div>

            {/* Calculations Breakdown */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>उप-कुल (Subtotal):</span>
                <span className="font-mono">{formatINR(totals.subTotal)}</span>
              </div>

              {totals.totalDiscount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>कुल छूट (Discount):</span>
                  <span className="font-mono">-{formatINR(totals.totalDiscount)}</span>
                </div>
              )}

              <div className="flex justify-between text-slate-600">
                <span>कुल GST कर (Total Tax):</span>
                <span className="font-mono">{formatINR(totals.totalTax)}</span>
              </div>

              {totals.roundOff !== 0 && (
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>राउंड ऑफ (Round Off):</span>
                  <span className="font-mono">{totals.roundOff > 0 ? `+${totals.roundOff}` : totals.roundOff}</span>
                </div>
              )}

              <div className="pt-2 border-t border-slate-200 flex justify-between items-baseline font-black text-slate-900">
                <span className="text-sm">कुल देय राशि (Grand Total):</span>
                <span className="text-xl sm:text-2xl font-mono text-blue-700">{formatINR(totals.grandTotal)}</span>
              </div>
            </div>

            {/* Payment Mode Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                भुगतान का माध्यम (Payment Mode):
              </label>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'CASH', label: '💵 नकद (Cash)' },
                  { id: 'UPI', label: '📱 UPI / QR' },
                  { id: 'CREDIT', label: '📒 उधार (Udhar)' },
                  { id: 'BANK_TRANSFER', label: '💳 कार्ड / बैंक' },
                ].map((m) => {
                  const isSelected = paymentMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMode(m.id as PaymentMode)}
                      className={`p-2.5 rounded-xl border text-xs font-extrabold transition text-center ${
                        isSelected
                          ? m.id === 'CREDIT'
                            ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                            : 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Udhar / Khata Notice */}
            {paymentMode === 'CREDIT' && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl text-xs text-amber-950 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>उधार बिल (Credit Sale):</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  यह बिल सेव होते ही <strong className="font-mono text-amber-900">{formatINR(totals.grandTotal)}</strong> सीधे <strong>{selectedParty?.name || 'ग्राहक'}</strong> के खाते में बकाया के रूप में जुड़ जाएगा।
                </p>
                {selectedParty && (
                  <div className="text-[11px] font-bold pt-1 border-t border-amber-200">
                    नया कुल बकाया: <span className="font-mono text-amber-900">{formatINR(customerPreviousBalance + totals.grandTotal)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div>
              <input
                type="text"
                placeholder="बिल टिप्पणी / नोट (वैकल्पिक)..."
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* BIG FINALIZE & PRINT BUTTON */}
            <button
              type="button"
              disabled={isSaving || cartLines.length === 0}
              onClick={handleFinalizeBill}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl text-sm sm:text-base font-black transition shadow-lg flex items-center justify-center gap-2 active:scale-98"
            >
              <Check className="w-5 h-5 stroke-[3]" />
              <span>{isSaving ? 'बिल सेव हो रहा है...' : 'बिल पूरा करें / सेव व प्रिंट (Finalize & Print)'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
