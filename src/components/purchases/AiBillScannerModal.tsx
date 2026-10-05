import React, { useState, useRef, useMemo } from 'react';
import { Item, Party, CompanyProfile, InvoiceItem } from '../../types';
import { findBestItemMatches, ItemMatchResult } from '../../services/fuzzyMatch';
import { calculateItemGST, formatINR } from '../../services/gstCalculator';
import { 
  Camera, UploadCloud, FileText, CheckCircle2, AlertCircle, 
  Sparkles, RefreshCw, X, ArrowRight, Layers, Tag, ShieldCheck,
  Building2, Hash, Calendar, DollarSign, PlusCircle, Check
} from 'lucide-react';

export interface ScannedBillItem {
  id: string;
  scannedName: string;
  scannedHsn?: string;
  quantity: number;
  unit: string;
  mrp: number; // MRP or printed list price
  discountPercent: number; // Trade discount %
  unitPrice: number; // Net Purchase Rate = MRP - (MRP * discount% / 100)
  salePrice: number; // Retail selling price (from existing item or +20% margin)
  taxRate: number;
  
  // Mapping Decision
  mappingMode: 'EXISTING' | 'CREATE_NEW';
  mappedItemId?: string;
  learnAlias: boolean; // remember scannedName into item.aliases
  
  // Best Match
  bestMatch: ItemMatchResult | null;
  matchCandidates: ItemMatchResult[];
}

export interface ScannedBillData {
  supplierName: string;
  supplierGstin?: string;
  supplierPhone?: string;
  supplierAddress?: string;
  billNumber: string;
  billDate: string;
  paymentMode?: string;
  notes?: string;
  items: ScannedBillItem[];
}

interface AiBillScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: Item[];
  suppliers: Party[];
  company: CompanyProfile;
  onSaveItem?: (item: Item) => Promise<void>;
  onSaveParty?: (party: Party) => Promise<void>;
  onApplyScannedBill: (data: {
    supplierId: string;
    tempNewSupplier?: {
      name: string;
      gstin?: string;
      phone?: string;
      address?: string;
    };
    supplierBillNo: string;
    billDate: string;
    paymentMode: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CREDIT';
    lines: InvoiceItem[];
    notes?: string;
  }) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const AiBillScannerModal: React.FC<AiBillScannerModalProps> = ({
  isOpen,
  onClose,
  items,
  suppliers,
  company,
  onSaveItem,
  onSaveParty,
  onApplyScannedBill,
  showToast,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState<'UPLOAD' | 'REVIEW'>('UPLOAD');
  const [isApplying, setIsApplying] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Scanned State
  const [scannedBill, setScannedBill] = useState<ScannedBillData | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [isCreatingNewSupplier, setIsCreatingNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierGstin, setNewSupplierGstin] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Calculate live preview totals for the scanned bill (Tax Exclusive + MRP Savings)
  // Hook declared unconditionally before early return to strictly adhere to React Rules of Hooks
  const scannedTotals = useMemo(() => {
    if (!scannedBill) return { mrpTotal: 0, discountSaved: 0, taxable: 0, tax: 0, grand: 0 };
    let mrpTotal = 0;
    let taxable = 0;
    let tax = 0;

    scannedBill.items.forEach(it => {
      const lineMrp = (it.mrp || it.unitPrice) * it.quantity;
      const lineTaxable = it.unitPrice * it.quantity;
      const lineTax = (lineTaxable * it.taxRate) / 100;
      mrpTotal += lineMrp;
      taxable += lineTaxable;
      tax += lineTax;
    });

    const discountSaved = Math.max(0, mrpTotal - taxable);

    return {
      mrpTotal,
      discountSaved,
      taxable,
      tax,
      grand: taxable + tax,
    };
  }, [scannedBill]);

  if (!isOpen) return null;

  // Compress image if needed using HTML5 Canvas to keep transfer fast & reliable
  const fileToBase64 = (file: File): Promise<{ base64: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      if (file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve({ base64: result, mimeType: file.type });
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
        return;
      }

      const img = new Image();
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDimension = 2000;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          resolve({ base64: dataUrl, mimeType: 'image/jpeg' });
        } else {
          resolve({ base64: reader.result as string, mimeType: file.type });
        }
      };
      img.onerror = () => {
        // Fallback to direct read
        const directReader = new FileReader();
        directReader.onload = () => resolve({ base64: directReader.result as string, mimeType: file.type });
        directReader.onerror = err => reject(err);
        directReader.readAsDataURL(file);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  // Perform AI OCR via server endpoint
  const handleStartScan = async () => {
    if (!selectedFile) {
      showToast('कृपया पहले बिल की फोटो या PDF चुनें', true);
      return;
    }

    setIsScanning(true);
    setStatusMessage('Google Gemini Vision API बिल का विश्लेषण कर रहा है...');

    try {
      const { base64, mimeType } = await fileToBase64(selectedFile);
      setStatusMessage('सप्लायर विवरण, GSTIN, बिल नंबर और आइटम्स पहचाने जा रहे हैं...');

      const response = await fetch('/api/ai/scan-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
        }),
      });

      let json: any;
      try {
        const textRes = await response.text();
        const clean = textRes.replace(/```json/gi, '').replace(/```/g, '').trim();
        const start = clean.indexOf('{');
        const end = clean.lastIndexOf('}');
        json = JSON.parse(start !== -1 && end !== -1 ? clean.slice(start, end + 1) : clean);
      } catch (parseErr) {
        throw new Error('बिल का डेटा अधूरा प्राप्त हुआ, कृपया साफ़ फोटो लें या दोबारा स्कैन करें।');
      }

      if (!response.ok || !json.success) {
        const errMessage = json.error || 'बिल का डेटा अधूरा प्राप्त हुआ, कृपया साफ़ फोटो लें या दोबारा स्कैन करें।';
        if (/json|unexpected end|syntaxerror/i.test(errMessage)) {
          throw new Error('बिल का डेटा अधूरा प्राप्त हुआ, कृपया साफ़ फोटो लें या दोबारा स्कैन करें।');
        }
        throw new Error(errMessage);
      }

      const raw = json.data;
      setStatusMessage('इन्वेंट्री के साथ स्मार्ट Fuzzy Matching व Aliases की जांच हो रही है...');

      // Smart Supplier Matching: Match by GSTIN or by similar name
      let matchedSupplierId = '';
      if (raw.supplierGstin && raw.supplierGstin.trim()) {
        const foundByGstin = suppliers.find(
          s => s.gstin && s.gstin.trim().toUpperCase() === raw.supplierGstin.trim().toUpperCase()
        );
        if (foundByGstin) matchedSupplierId = foundByGstin.id;
      }

      if (!matchedSupplierId && raw.supplierName) {
        const normRawName = raw.supplierName.toLowerCase().trim();
        const foundByName = suppliers.find(s => {
          const sName = s.name.toLowerCase().trim();
          return sName.includes(normRawName) || normRawName.includes(sName);
        });
        if (foundByName) matchedSupplierId = foundByName.id;
      }

      if (matchedSupplierId) {
        setSelectedSupplierId(matchedSupplierId);
        setIsCreatingNewSupplier(false);
      } else {
        setSelectedSupplierId('');
        setIsCreatingNewSupplier(true);
        setNewSupplierName(raw.supplierName || 'New Vendor');
        setNewSupplierGstin(raw.supplierGstin || '');
      }

      // Process and Smart Map Items
      const processedItems: ScannedBillItem[] = (raw.items || []).map((sc: any, idx: number) => {
        const scName = String(sc.name || '').trim();
        const scHsn = sc.hsn ? String(sc.hsn).trim() : undefined;
        const matches = findBestItemMatches(scName, items, scHsn, 4);

        const hasGoodMatch = matches.bestMatch && matches.bestMatch.score >= 0.40;

        const rawMrp = Number(sc.mrp) || 0;
        const rawDiscount = Number(sc.discountPercent) || 0;
        let calculatedNetPrice = Number(sc.unitPrice) || 0;

        // Rule: If MRP and discount% are given, Net Rate = MRP - (MRP * discount% / 100)
        if (rawMrp > 0 && rawDiscount > 0) {
          calculatedNetPrice = Math.round((rawMrp * (1 - rawDiscount / 100)) * 100) / 100;
        } else if (rawMrp > 0 && calculatedNetPrice === 0) {
          calculatedNetPrice = rawMrp;
        }

        // Smart Selling Price default:
        // If matched to existing item, use item.retailPrice
        // Else use Net Rate + 20% margin
        let defaultSalePrice = 0;
        if (hasGoodMatch && matches.bestMatch && matches.bestMatch.item.retailPrice) {
          defaultSalePrice = matches.bestMatch.item.retailPrice;
        } else {
          defaultSalePrice = Math.round(calculatedNetPrice * 1.20);
        }

        return {
          id: `scan-item-${idx}-${Date.now()}`,
          scannedName: scName || `Item #${idx + 1}`,
          scannedHsn: scHsn,
          quantity: Math.max(1, Number(sc.quantity) || 1),
          unit: sc.unit ? String(sc.unit).toUpperCase().trim() : 'PCS',
          mrp: rawMrp > 0 ? rawMrp : calculatedNetPrice,
          discountPercent: rawDiscount,
          unitPrice: calculatedNetPrice,
          salePrice: defaultSalePrice,
          taxRate: [0, 5, 12, 18, 28].includes(Number(sc.taxRate)) ? Number(sc.taxRate) : 18,
          mappingMode: hasGoodMatch ? 'EXISTING' : 'CREATE_NEW',
          mappedItemId: hasGoodMatch && matches.bestMatch ? matches.bestMatch.item.id : (items[0]?.id || ''),
          learnAlias: true, // by default save alias
          bestMatch: matches.bestMatch,
          matchCandidates: matches.candidates,
        };
      });

      setScannedBill({
        supplierName: raw.supplierName || '',
        supplierGstin: raw.supplierGstin || '',
        supplierPhone: raw.supplierPhone || '',
        supplierAddress: raw.supplierAddress || '',
        billNumber: raw.billNumber || `PUR-${Date.now().toString().slice(-6)}`,
        billDate: raw.billDate || new Date().toISOString().split('T')[0],
        paymentMode: raw.paymentMode || 'CREDIT',
        notes: raw.notes || '',
        items: processedItems,
      });

      setScanStep('REVIEW');
      showToast('बिल सफलतापूर्वक स्कैन हो गया! मैपिंग की समीक्षा करें।');
    } catch (err: any) {
      console.error('Scan error:', err);
      const isJsonOrIncomplete = /json|unexpected end|syntaxerror|parse|अधूरा/i.test(err.message || '');
      const userFriendlyMsg = isJsonOrIncomplete
        ? 'बिल का डेटा अधूरा प्राप्त हुआ, कृपया साफ़ फोटो लें या दोबारा स्कैन करें।'
        : (err.message || 'बिल स्कैन करने में समस्या आई, कृपया दोबारा प्रयास करें।');
      showToast(userFriendlyMsg, true);
    } finally {
      setIsScanning(false);
      setStatusMessage('');
    }
  };

  // Modify an item's mapping with smart MRP / Discount / Net Rate recalculations
  const updateScannedItem = (id: string, patch: Partial<ScannedBillItem>) => {
    if (!scannedBill) return;
    setScannedBill({
      ...scannedBill,
      items: scannedBill.items.map(it => {
        if (it.id !== id) return it;

        let mrp = patch.mrp !== undefined ? patch.mrp : it.mrp;
        let discountPercent = patch.discountPercent !== undefined ? patch.discountPercent : it.discountPercent;
        let unitPrice = patch.unitPrice !== undefined ? patch.unitPrice : it.unitPrice;
        let salePrice = patch.salePrice !== undefined ? patch.salePrice : it.salePrice;

        // If MRP or Discount was changed, recalculate Net Rate = MRP - (MRP * Disc% / 100)
        if (patch.mrp !== undefined || patch.discountPercent !== undefined) {
          unitPrice = Math.round((mrp * (1 - discountPercent / 100)) * 100) / 100;
        } else if (patch.unitPrice !== undefined) {
          // If Net Rate was directly changed, update discount% if MRP > 0
          if (mrp > 0 && mrp >= unitPrice) {
            discountPercent = Math.round(((mrp - unitPrice) / mrp) * 1000) / 10;
          }
        }

        // If mapping mode or mapped item changed, update salePrice default
        if (patch.mappedItemId && patch.mappedItemId !== it.mappedItemId) {
          const newlyMappedItem = items.find(i => i.id === patch.mappedItemId);
          if (newlyMappedItem && newlyMappedItem.retailPrice) {
            salePrice = newlyMappedItem.retailPrice;
          }
        }

        return {
          ...it,
          ...patch,
          mrp,
          discountPercent,
          unitPrice,
          salePrice,
        };
      }),
    });
  };

  // Confirm mapping and auto-fill purchase form
  const handleConfirmAndApply = async () => {
    if (!scannedBill) return;
    if (!selectedSupplierId && !isCreatingNewSupplier) {
      showToast('कृपया सप्लायर चुनें या नया बनाएं', true);
      return;
    }

    setIsApplying(true);
    try {
      let finalSupplierId = selectedSupplierId;

      // 1. Create Supplier if new
      if (isCreatingNewSupplier && onSaveParty) {
        const suppName = newSupplierName.trim() || scannedBill.supplierName || 'New Supplier';
        const newSupplier: Party = {
          id: `supp-${Date.now()}`,
          name: suppName,
          type: 'SUPPLIER',
          phone: scannedBill.supplierPhone || '9999999999',
          gstin: newSupplierGstin.trim().toUpperCase() || undefined,
          address: scannedBill.supplierAddress || '',
          state: company.state || 'Maharashtra',
          stateCode: company.stateCode || '27',
          creditLimit: 0,
          currentBalance: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await onSaveParty(newSupplier);
        finalSupplierId = newSupplier.id;
        showToast(`नया सप्लायर '${suppName}' बनाया गया!`);
      }

      // 2. Handle Item Aliases & New Items
      const finalLines: InvoiceItem[] = [];
      const supp = suppliers.find(s => s.id === finalSupplierId);
      const sellerStateCode = supp?.stateCode || company.stateCode || '27';
      const buyerStateCode = company.stateCode || '27';

      for (const scItem of scannedBill.items) {
        let itemId = scItem.mappedItemId;
        let itemName = scItem.scannedName;
        let itemHsn = scItem.scannedHsn || '19053100';
        let itemUnit = scItem.unit || 'PCS';

        if (scItem.mappingMode === 'CREATE_NEW') {
          // Create new item in inventory
          const newItemId = `itm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const created: Item = {
            id: newItemId,
            name: scItem.scannedName,
            category: 'General',
            sku: `SKU-${Date.now().toString().slice(-6)}`,
            purchasePrice: scItem.unitPrice,
            retailPrice: Math.round(scItem.unitPrice * 1.2), // reasonable default margin
            wholesalePrice: Math.round(scItem.unitPrice * 1.1),
            taxRate: scItem.taxRate,
            taxInclusive: false,
            hsn: scItem.scannedHsn || '19053100',
            unit: (scItem.unit as any) || 'PCS',
            currentStock: 0,
            lowStockThreshold: 5,
            aliases: [scItem.scannedName], // Save alias
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          if (onSaveItem) {
            await onSaveItem(created);
          }
          itemId = newItemId;
          itemName = created.name;
          itemHsn = created.hsn;
          itemUnit = created.unit;
        } else {
          // Map to existing item
          const existingItem = items.find(i => i.id === scItem.mappedItemId);
          if (existingItem) {
            itemId = existingItem.id;
            itemName = existingItem.name;
            itemHsn = scItem.scannedHsn || existingItem.hsn || '19053100';
            itemUnit = existingItem.unit || scItem.unit || 'PCS';

            // Learn alias if checked!
            if (scItem.learnAlias && onSaveItem) {
              const currentAliases = existingItem.aliases || [];
              const rawTrimmed = scItem.scannedName.trim();
              if (
                rawTrimmed &&
                rawTrimmed.toLowerCase() !== existingItem.name.toLowerCase() &&
                !currentAliases.some(a => a.toLowerCase() === rawTrimmed.toLowerCase())
              ) {
                const updatedItem: Item = {
                  ...existingItem,
                  aliases: [...currentAliases, rawTrimmed],
                  updatedAt: new Date().toISOString(),
                };
                await onSaveItem(updatedItem);
              }
            }
          }
        }

        // Calculate Tax Exclusive amounts for line
        const calc = calculateItemGST({
          rate: scItem.unitPrice,
          quantity: scItem.quantity,
          discountPercent: scItem.discountPercent || 0,
          taxRate: scItem.taxRate,
          isTaxInclusive: false,
          sellerStateCode,
          buyerStateCode,
        });

        finalLines.push({
          itemId: itemId || `itm-${Date.now()}`,
          itemName,
          hsn: itemHsn,
          unit: itemUnit,
          quantity: scItem.quantity,
          mrp: scItem.mrp,
          discountPercent: scItem.discountPercent || 0,
          discountAmount: Math.round(((scItem.mrp - scItem.unitPrice) * scItem.quantity) * 100) / 100,
          unitPrice: scItem.unitPrice, // Net Purchase Rate
          salePrice: scItem.salePrice, // Retail Selling Price for inventory
          taxRate: scItem.taxRate,
          taxableAmount: calc.taxableAmount,
          cgstAmount: calc.cgstAmount,
          sgstAmount: calc.sgstAmount,
          igstAmount: calc.igstAmount,
          cessAmount: 0,
          totalAmount: calc.totalAmount,
        });
      }

      // Apply to parent Purchase form (supports auto-creating supplier if new)
      onApplyScannedBill({
        supplierId: finalSupplierId || '__NEW_SUPP__',
        tempNewSupplier: isCreatingNewSupplier ? {
          name: newSupplierName.trim() || scannedBill.supplierName || 'New Supplier',
          gstin: newSupplierGstin.trim().toUpperCase() || scannedBill.supplierGstin || undefined,
          phone: scannedBill.supplierPhone || '9999999999',
          address: scannedBill.supplierAddress || '',
        } : undefined,
        supplierBillNo: scannedBill.billNumber,
        billDate: scannedBill.billDate,
        paymentMode: (['CASH', 'UPI', 'BANK_TRANSFER', 'CREDIT'].includes(scannedBill.paymentMode || '') 
          ? scannedBill.paymentMode 
          : 'CREDIT') as any,
        lines: finalLines,
        notes: scannedBill.notes || 'Auto-filled via Gemini Vision AI Bill Scanner',
      });

      onClose();
      showToast('बिल फॉर्म में भर दिया गया है! कृपया जांचें और सेव करें।');
    } catch (err: any) {
      console.error('Error applying scanned bill:', err);
      showToast('लागू करने में त्रुटि: ' + (err.message || 'त्रुटि हुई'), true);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-indigo-900 via-slate-900 to-blue-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-indigo-300 animate-pulse" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base flex items-center gap-2">
                <span>AI Photo Bill Scanner & Smart Mapping</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  Gemini Vision OCR
                </span>
              </h3>
              <p className="text-[11px] text-slate-300">
                फोटो से बिल ऑटो-स्कैन करें, स्मार्ट Fuzzy Matching से आइटम्स पहचानें और Aliases याद रखें
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 text-xs space-y-4">
          {scanStep === 'UPLOAD' ? (
            /* ---------------- STEP 1: UPLOAD / CAMERA ---------------- */
            <div className="space-y-4">
              {/* Hidden file inputs for Camera & File Picker */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
              />

              {/* Action Cards: Camera vs File Picker */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="p-5 rounded-2xl border-2 border-dashed border-indigo-300 hover:border-indigo-600 bg-indigo-50/50 hover:bg-indigo-50 transition flex flex-col items-center justify-center text-center cursor-pointer group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md group-hover:scale-105 transition mb-2.5">
                    <Camera className="w-6 h-6" />
                  </div>
                  <span className="font-extrabold text-sm text-indigo-950">
                    📸 Open Camera (कैमरा खोलें)
                  </span>
                  <span className="text-[11px] text-indigo-700 mt-0.5">
                    मोबाइल से तुरंत बिल की साफ फोटो खींचें
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-5 rounded-2xl border-2 border-dashed border-blue-300 hover:border-blue-600 bg-blue-50/50 hover:bg-blue-50 transition flex flex-col items-center justify-center text-center cursor-pointer group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md group-hover:scale-105 transition mb-2.5">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <span className="font-extrabold text-sm text-blue-950">
                    📂 Upload Photo / PDF (गैलरी या फाइल)
                  </span>
                  <span className="text-[11px] text-blue-700 mt-0.5">
                    डिवाइस से JPG, PNG, WEBP या PDF बिल चुनें
                  </span>
                </button>
              </div>

              {/* Selected File Preview Box */}
              {selectedFile && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-600" />
                      <span className="font-bold text-slate-800">
                        {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        setPreviewUrl(null);
                      }}
                      className="text-red-500 hover:text-red-700 font-bold"
                    >
                      हटाएं (Remove)
                    </button>
                  </div>

                  {previewUrl && (
                    <div className="max-h-60 rounded-xl overflow-hidden border border-slate-200 bg-black/5 flex items-center justify-center">
                      <img
                        src={previewUrl}
                        alt="Bill Preview"
                        className="max-h-60 w-auto object-contain"
                      />
                    </div>
                  )}

                  {/* Scan Submit Button */}
                  <button
                    type="button"
                    disabled={isScanning}
                    onClick={handleStartScan}
                    className="w-full py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 active:scale-99 text-white font-extrabold rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isScanning ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>AI बिल स्कैन हो रहा है... कृपया प्रतीक्षा करें</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-indigo-200" />
                        <span>✨ Start AI OCR Scan (स्कैन व डेटा निकालें)</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Scanning status banner */}
              {isScanning && (
                <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin shrink-0" />
                  <div>
                    <p className="font-bold text-indigo-950 text-xs">{statusMessage}</p>
                    <p className="text-[11px] text-indigo-700 mt-0.5">
                      Gemini Vision API बिल से सप्लायर, तारीख, HSN, मात्रा और टैक्स दरें निकाल रहा है।
                    </p>
                  </div>
                </div>
              )}

              {/* Instructions banner */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5 text-slate-600 text-[11px]">
                <p className="font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  स्मार्ट AI बिल स्कैनर की विशेषताएं:
                </p>
                <ul className="list-disc list-inside space-y-0.5 ml-1">
                  <li>सप्लायर का नाम, GSTIN और बिल नंबर अपने आप पहचानता है।</li>
                  <li>
                    <strong>स्मार्ट Fuzzy Matching:</strong> बिल में लिखा नाम थोड़ा अलग होने पर भी इन्वेंट्री के सही सामान से अपने आप मैच करता है।
                  </li>
                  <li>
                    <strong>Aliases (उपनाम) मेमोरी:</strong> एक बार मैप करने पर हमेशा के लिए याद रख लेता है, ताकि अगली बार 100% ऑटो-मैच हो।
                  </li>
                  <li>Tax Exclusive हिसाब: Taxable Amount + GST का सटीक गणित तुरंत तैयार करता है।</li>
                </ul>
              </div>
            </div>
          ) : (
            /* ---------------- STEP 2: REVIEW & SMART MAPPING ---------------- */
            <div className="space-y-4">
              {/* Top Banner: Re-scan or Change file */}
              <div className="flex items-center justify-between bg-indigo-50/70 p-3 rounded-2xl border border-indigo-100">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span className="font-extrabold text-indigo-950 text-xs">
                    AI ने बिल से {scannedBill?.items.length || 0} आइटम्स सफलतापूर्वक निकाले
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setScanStep('UPLOAD')}
                  className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-[11px] font-bold border border-slate-200 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3 text-slate-500" />
                  <span>दोबारा फोटो चुनें (Re-scan)</span>
                </button>
              </div>

              {/* 1. Supplier & Bill Metadata Section */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  <span>1. Supplier & Invoice Details (सप्लायर व बिल विवरण)</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Supplier Selection */}
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 mb-1">
                      सप्लायर का चयन करें (Supplier) *
                    </label>
                    <div className="space-y-1.5">
                      {!isCreatingNewSupplier ? (
                        <select
                          value={selectedSupplierId}
                          onChange={e => {
                            if (e.target.value === '__NEW__') {
                              setIsCreatingNewSupplier(true);
                              setSelectedSupplierId('');
                            } else {
                              setSelectedSupplierId(e.target.value);
                            }
                          }}
                          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none"
                        >
                          <option value="">-- सप्लायर चुनें (Choose Supplier) --</option>
                          {suppliers.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name} {s.gstin ? `(${s.gstin})` : ''} - {s.phone}
                            </option>
                          ))}
                          <option value="__NEW__">+ नया सप्लायर जोड़ें (Create New Supplier)</option>
                        </select>
                      ) : (
                        <div className="space-y-1.5 p-2 bg-blue-50/50 rounded-xl border border-blue-200">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-blue-900 text-[11px]">
                              नया सप्लायर बनाएं:
                            </span>
                            <button
                              type="button"
                              onClick={() => setIsCreatingNewSupplier(false)}
                              className="text-[10px] text-blue-600 hover:underline font-bold"
                            >
                              मौजूदा सूची से चुनें
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              placeholder="सप्लायर का नाम"
                              value={newSupplierName}
                              onChange={e => setNewSupplierName(e.target.value)}
                              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900"
                            />
                            <input
                              type="text"
                              placeholder="GSTIN (यदि हो)"
                              value={newSupplierGstin}
                              onChange={e => setNewSupplierGstin(e.target.value.toUpperCase())}
                              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900"
                            />
                          </div>
                        </div>
                      )}
                      {scannedBill?.supplierName && (
                        <p className="text-[10px] text-slate-500">
                          बिल से पहचाना गया: <strong className="text-slate-700">{scannedBill.supplierName}</strong>
                          {scannedBill.supplierGstin && ` | GSTIN: ${scannedBill.supplierGstin}`}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Bill Number & Date */}
                  <div className="grid grid-cols-2 gap-2 sm:col-span-1">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        बिल नं (Bill No)
                      </label>
                      <input
                        type="text"
                        value={scannedBill?.billNumber || ''}
                        onChange={e =>
                          scannedBill && setScannedBill({ ...scannedBill, billNumber: e.target.value })
                        }
                        className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-mono font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        तारीख (Date)
                      </label>
                      <input
                        type="date"
                        value={scannedBill?.billDate || ''}
                        onChange={e =>
                          scannedBill && setScannedBill({ ...scannedBill, billDate: e.target.value })
                        }
                        className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-900"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Smart Item Mapping & Duplicate Prevention Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    <span>2. Smart Item Mapping (स्मार्ट आइटम मैपिंग व डुप्लीकेट से बचाव)</span>
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    Fuzzy Matching द्वारा इन्वेंट्री से मिलाया गया
                  </span>
                </div>

                <div className="space-y-3">
                  {scannedBill?.items.map((scItem, idx) => {
                    const isExisting = scItem.mappingMode === 'EXISTING';
                    const hasMatch = scItem.bestMatch && scItem.bestMatch.score >= 0.35;
                    const matchPercent = scItem.bestMatch ? Math.round(scItem.bestMatch.score * 100) : 0;
                    const isExactOrAlias = scItem.bestMatch?.matchType === 'EXACT_NAME' || scItem.bestMatch?.matchType === 'EXACT_ALIAS';

                    return (
                      <div
                        key={scItem.id}
                        className={`p-3.5 rounded-2xl border transition ${
                          isExisting 
                            ? 'bg-slate-50/80 border-slate-200' 
                            : 'bg-amber-50/40 border-amber-200'
                        }`}
                      >
                        {/* Row 1: Scanned item title + Match Confidence Badge */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200/80">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="font-extrabold text-slate-900 text-xs">
                              {scItem.scannedName}
                            </span>
                            {scItem.scannedHsn && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-200 text-slate-600">
                                HSN: {scItem.scannedHsn}
                              </span>
                            )}
                          </div>

                          {/* Match Badge */}
                          <div>
                            {isExactOrAlias ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>100% सटीक मैच (उपनाम / नाम से मिला)</span>
                              </span>
                            ) : hasMatch ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300 flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-indigo-600" />
                                <span>
                                  {matchPercent}% सुझाव: {scItem.bestMatch?.item.name}
                                </span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700 flex items-center gap-1">
                                <span>नया आइटम (इन्वेंट्री में नहीं)</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Row 2: Mapping Toggle (Existing vs Create New) */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2.5 items-center">
                          {/* Choice Radios */}
                          <div className="sm:col-span-4 flex items-center gap-3">
                            <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-700 text-[11px]">
                              <input
                                type="radio"
                                name={`mode-${scItem.id}`}
                                checked={isExisting}
                                onChange={() => updateScannedItem(scItem.id, { mappingMode: 'EXISTING' })}
                                className="accent-indigo-600"
                              />
                              <span>मौजूदा से जोड़ें</span>
                            </label>

                            <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-700 text-[11px]">
                              <input
                                type="radio"
                                name={`mode-${scItem.id}`}
                                checked={!isExisting}
                                onChange={() => updateScannedItem(scItem.id, { mappingMode: 'CREATE_NEW' })}
                                className="accent-blue-600"
                              />
                              <span>+ नया बनाएं</span>
                            </label>
                          </div>

                          {/* Inventory Item Dropdown (if Existing) */}
                          <div className="sm:col-span-8">
                            {isExisting ? (
                              <div className="space-y-1">
                                <select
                                  value={scItem.mappedItemId || ''}
                                  onChange={e => updateScannedItem(scItem.id, { mappedItemId: e.target.value })}
                                  className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none"
                                >
                                  {items.map(it => (
                                    <option key={it.id} value={it.id}>
                                      {it.name} | स्टॉक: {it.currentStock} {it.unit} | ₹{it.purchasePrice}
                                    </option>
                                  ))}
                                </select>

                                {/* Learn Alias Checkbox */}
                                <label className="flex items-center gap-1.5 text-[10px] text-slate-600 cursor-pointer pt-0.5">
                                  <input
                                    type="checkbox"
                                    checked={scItem.learnAlias}
                                    onChange={e => updateScannedItem(scItem.id, { learnAlias: e.target.checked })}
                                    className="rounded text-indigo-600 accent-indigo-600"
                                  />
                                  <span>
                                    इस बिल वाले नाम (<strong>{scItem.scannedName}</strong>) को इसके <strong>Aliases (उपनाम)</strong> में याद रखें ताकि अगली बार 100% ऑटो-मैच हो
                                  </span>
                                </label>
                              </div>
                            ) : (
                              <div className="p-1.5 bg-white rounded-xl border border-amber-300 text-[11px] text-amber-900 flex items-center gap-1.5">
                                <PlusCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>
                                  यह आइटम इन्वेंट्री में नया सामान '<strong>{scItem.scannedName}</strong>' के रूप में जुड़ेगा।
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Row 3: Numeric inputs: Qty, Unit, MRP, Discount%, Net Rate, Sale Price, GST %, Total */}
                        <div className="grid grid-cols-2 sm:grid-cols-7 gap-2 pt-2.5 mt-2.5 border-t border-slate-200/60 bg-white/70 p-2.5 rounded-xl">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                              मात्रा (Qty)
                            </label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0.1"
                                step="any"
                                value={scItem.quantity}
                                onChange={e => updateScannedItem(scItem.id, { quantity: Number(e.target.value) || 0 })}
                                className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-900"
                              />
                              <span className="text-[10px] font-mono text-slate-500 font-bold">{scItem.unit}</span>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                              MRP / List ₹
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={scItem.mrp}
                              onChange={e => updateScannedItem(scItem.id, { mrp: Number(e.target.value) || 0 })}
                              className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-900"
                              title="Printed MRP or Catalogue List Price"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                              छूट (Disc %)
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="any"
                              value={scItem.discountPercent}
                              onChange={e => updateScannedItem(scItem.id, { discountPercent: Number(e.target.value) || 0 })}
                              className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-900"
                              title="Trade Discount % on MRP"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-blue-900 mb-0.5" title="Net Rate = MRP - (MRP * Disc %)">
                              नेट खरीद (Net Rate) *
                            </label>
                            <div className="relative">
                              <span className="absolute left-1.5 top-1 text-blue-400 font-bold text-[10px]">₹</span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={scItem.unitPrice}
                                onChange={e => updateScannedItem(scItem.id, { unitPrice: Number(e.target.value) || 0 })}
                                className="w-full pl-4 bg-blue-50/60 border border-blue-300 rounded-lg px-2 py-1 text-xs font-mono font-black text-blue-950"
                                title="Net Purchase Cost before tax"
                              />
                            </div>
                          </div>

                          <div className="bg-emerald-50/90 p-1 rounded-lg border border-emerald-300">
                            <label className="block text-[10px] font-extrabold text-emerald-950 mb-0.5 flex items-center justify-between" title="इन्वेंट्री में बिक्री मूल्य के रूप में सेव होगा">
                              <span>Sale Price ✨</span>
                            </label>
                            <div className="relative">
                              <span className="absolute left-1.5 top-1 text-emerald-600 font-bold text-[10px]">₹</span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={scItem.salePrice}
                                onChange={e => updateScannedItem(scItem.id, { salePrice: Number(e.target.value) || 0 })}
                                className="w-full pl-4 bg-white border border-emerald-400 rounded-md px-1.5 py-1 text-xs font-mono font-black text-emerald-900 shadow-2xs"
                                title="Retail Selling Price (auto-synced to Inventory)"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                              GST दर (%)
                            </label>
                            <select
                              value={scItem.taxRate}
                              onChange={e => updateScannedItem(scItem.id, { taxRate: Number(e.target.value) })}
                              className="w-full bg-white border border-slate-300 rounded-lg px-1.5 py-1 text-xs font-bold text-slate-900"
                            >
                              <option value={0}>0%</option>
                              <option value={5}>5%</option>
                              <option value={12}>12%</option>
                              <option value={18}>18%</option>
                              <option value={28}>28%</option>
                            </select>
                          </div>

                          <div className="text-right flex flex-col justify-between items-end">
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                              कुल (Total + GST)
                            </label>
                            <span className="font-extrabold text-xs text-indigo-950 font-mono">
                              {formatINR((scItem.unitPrice * scItem.quantity) * (1 + scItem.taxRate / 100))}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. Summary & Calculations Preview */}
              <div className="bg-slate-900 text-white p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    {scannedTotals.mrpTotal > scannedTotals.taxable && (
                      <div>
                        <span className="text-slate-400">Total MRP: </span>
                        <span className="font-mono line-through text-slate-400">{formatINR(scannedTotals.mrpTotal)}</span>
                        <span className="ml-1 text-[11px] text-emerald-400 font-bold">
                          (बचत: {formatINR(scannedTotals.discountSaved)})
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-slate-400">Net Taxable Value: </span>
                      <strong className="font-mono text-white">{formatINR(scannedTotals.taxable)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">GST Amount: </span>
                      <strong className="font-mono text-amber-400">+{formatINR(scannedTotals.tax)}</strong>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Net Rate = MRP - (MRP × Discount %) | Tax Exclusive: Grand Total = Taxable + GST
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block uppercase tracking-wider font-bold">
                    Grand Total (कुल देय राशि)
                  </span>
                  <span className="text-xl font-black text-emerald-400 font-mono">
                    {formatINR(scannedTotals.grand)}
                  </span>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 font-bold text-slate-700 text-xs transition"
                >
                  रद्द करें (Cancel)
                </button>

                <button
                  type="button"
                  disabled={isApplying || !scannedBill || scannedBill.items.length === 0}
                  onClick={handleConfirmAndApply}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-98 text-white font-extrabold rounded-xl shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isApplying ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      <span>फॉर्म में भरा जा रहा है...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 text-white" />
                      <span>✅ पुष्टि करें और परचेज बिल भरें (Confirm & Auto-Fill)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
