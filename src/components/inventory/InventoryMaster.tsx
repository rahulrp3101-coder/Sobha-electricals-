import React, { useState } from 'react';
import { Item, ItemBatch } from '../../types';
import { formatINR } from '../../services/gstCalculator';
import { 
  Package, Search, Plus, AlertTriangle, Clock, 
  Barcode, Check, Edit, Layers, ArrowUpDown, X, Sparkles, Filter,
  Camera, RefreshCw
} from 'lucide-react';
import { BarcodeCameraModal } from '../pos/BarcodeCameraModal';
import { playBarcodeBeep } from '../../services/soundEffects';
import { generateEAN13Barcode, generateRandomSKU } from '../../services/barcodeGenerator';

interface InventoryMasterProps {
  items: Item[];
  onSaveItem: (item: Item) => Promise<void>;
}

export const InventoryMaster: React.FC<InventoryMasterProps> = ({
  items,
  onSaveItem,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [quickStockItemId, setQuickStockItemId] = useState<string | null>(null);
  const [quickStockQty, setQuickStockQty] = useState<number>(10);
  const [isScanningBarcodeModal, setIsScanningBarcodeModal] = useState<boolean>(false);
  const [isScanningSearchModal, setIsScanningSearchModal] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Form State (New / Edit Item)
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Groceries & FMCG');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [hsn, setHsn] = useState('19053100');
  const [unit, setUnit] = useState<'PCS' | 'KG' | 'PACK' | 'BOX' | 'MTR' | 'LTR' | 'BAG'>('PCS');
  const [purchasePrice, setPurchasePrice] = useState<number>(0);
  const [wholesalePrice, setWholesalePrice] = useState<number>(0);
  const [retailPrice, setRetailPrice] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(18);
  const [currentStock, setCurrentStock] = useState<number>(0);
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(10);
  const [batchNo, setBatchNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  const lowStockItems = items.filter(i => i.currentStock <= i.lowStockThreshold);

  const openNewItemModal = () => {
    setEditingItem(null);
    setName('');
    setCategory('किराना व दैनिक सामान (Groceries)');
    setSku(generateRandomSKU());
    setBarcode(''); // Start clean so user can scan or generate
    setHsn('19053100');
    setUnit('PCS');
    setPurchasePrice(50);
    setWholesalePrice(65);
    setRetailPrice(80);
    setTaxRate(18);
    setCurrentStock(25);
    setLowStockThreshold(10);
    setBatchNo('');
    setExpiryDate('');
    setIsModalOpen(true);
  };

  const openEditModal = (item: Item) => {
    setEditingItem(item);
    setName(item.name);
    setCategory(item.category);
    setSku(item.sku);
    setBarcode(item.barcode || '');
    setHsn(item.hsn);
    setUnit(item.unit);
    setPurchasePrice(item.purchasePrice);
    setWholesalePrice(item.wholesalePrice);
    setRetailPrice(item.retailPrice);
    setTaxRate(item.taxRate);
    setCurrentStock(item.currentStock);
    setLowStockThreshold(item.lowStockThreshold);
    setBatchNo(item.batches?.[0]?.batchNumber || '');
    setExpiryDate(item.batches?.[0]?.expiryDate || '');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const batches: ItemBatch[] = batchNo && expiryDate ? [
      {
        batchNumber: batchNo,
        expiryDate,
        quantity: currentStock,
      }
    ] : (editingItem?.batches || []);

    const itemToSave: Item = {
      id: editingItem ? editingItem.id : `itm-${Date.now()}`,
      name,
      category,
      sku: sku || `SKU-${String(Date.now()).slice(-6)}`,
      barcode: barcode || undefined,
      hsn,
      unit,
      purchasePrice: Number(purchasePrice),
      wholesalePrice: Number(wholesalePrice) || Number(retailPrice),
      retailPrice: Number(retailPrice),
      taxRate: Number(taxRate),
      taxInclusive: true,
      currentStock: Number(currentStock),
      lowStockThreshold: Number(lowStockThreshold),
      batches,
      createdAt: editingItem ? editingItem.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await onSaveItem(itemToSave);
    setIsModalOpen(false);
  };

  // Quick Add Stock directly without full form
  const handleQuickAddStock = async (item: Item, addedQty: number) => {
    const updated: Item = {
      ...item,
      currentStock: item.currentStock + addedQty,
      updatedAt: new Date().toISOString(),
    };
    await onSaveItem(updated);
    setQuickStockItemId(null);
  };

  const categories = Array.from(new Set(items.map(i => i.category)));

  const filteredItems = items.filter(item => {
    const matchesSearch = 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.barcode && item.barcode.includes(searchQuery)) ||
      item.hsn.includes(searchQuery);

    const matchesCategory = selectedCategory === 'ALL' || item.category === selectedCategory;
    const matchesLowStock = !lowStockOnly || item.currentStock <= item.lowStockThreshold;

    return matchesSearch && matchesCategory && matchesLowStock;
  });

  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-7xl mx-auto pb-24 lg:pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              स्टॉक व इन्वेंट्री प्रबंधन (Stock & Inventory)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            बिल बनते ही स्टॉक अपने आप कम होगा। खरीद या रिटर्न पर स्टॉक बढ़ेगा।
          </p>
        </div>

        <button
          onClick={openNewItemModal}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-extrabold transition shadow-xs self-start sm:self-auto active:scale-98"
        >
          <Plus className="w-4 h-4" />
          <span>+ नया सामान जोड़ें (Add Item)</span>
        </button>
      </div>

      {/* Low Stock Alert Banner (If items are low) */}
      {lowStockItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-amber-950">
                कम स्टॉक अलर्ट: {lowStockItems.length} सामान खत्म होने की कगार पर हैं!
              </h4>
              <p className="text-[11px] text-amber-800">
                इन सामानों की मात्रा चेतावनी सीमा से कम हो गई है। तुरंत नया स्टॉक मंगवाएं।
              </p>
            </div>
          </div>

          <button
            onClick={() => setLowStockOnly(!lowStockOnly)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-2xs self-start sm:self-auto ${
              lowStockOnly 
                ? 'bg-amber-700 text-white' 
                : 'bg-white border border-amber-300 text-amber-900 hover:bg-amber-100'
            }`}
          >
            {lowStockOnly ? '✓ सभी सामान देखें' : 'कम स्टॉक वाले सामान देखें (' + lowStockItems.length + ')'}
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500">कुल सामान (Total Items)</div>
          <div className="text-lg sm:text-2xl font-black text-slate-900 mt-0.5">{items.length}</div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500">कुल स्टॉक मात्रा (Units)</div>
          <div className="text-lg sm:text-2xl font-black text-blue-700 mt-0.5">
            {items.reduce((s, i) => s + i.currentStock, 0)}
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500">स्टॉक मूल्यांकन (Value)</div>
          <div className="text-lg sm:text-2xl font-black text-emerald-700 mt-0.5 font-mono">
            {formatINR(items.reduce((s, i) => s + (i.currentStock * i.purchasePrice), 0))}
          </div>
        </div>

        <div className={`p-3.5 rounded-2xl border shadow-2xs ${
          lowStockItems.length > 0 ? 'bg-red-50 border-red-200 text-red-900' : 'bg-white border-slate-200'
        }`}>
          <div className="text-[11px] font-semibold text-slate-500">कम स्टॉक सामान (Low Stock)</div>
          <div className={`text-lg sm:text-2xl font-black mt-0.5 ${lowStockItems.length > 0 ? 'text-red-700' : 'text-slate-900'}`}>
            {lowStockItems.length}
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row gap-2.5 sm:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
          <input
            type="text"
            placeholder="नाम, SKU या बारकोड से खोजें..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-20 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
          />
          <button
            type="button"
            onClick={() => setIsScanningSearchModal(true)}
            className="absolute right-2 top-1.5 px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1 border border-slate-300 shadow-2xs"
            title="कैमरे से बारकोड स्कैन करके खोजें"
          >
            <Camera className="w-3.5 h-3.5 text-blue-600" />
            <span>स्कैन</span>
          </button>
        </div>

        {/* Filter Dropdown & Toggle */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 font-semibold focus:outline-none"
          >
            <option value="ALL">सभी वर्ग (All Categories)</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <button
            onClick={() => setLowStockOnly(!lowStockOnly)}
            className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition border ${
              lowStockOnly
                ? 'bg-red-600 text-white border-red-600 shadow-2xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            ⚠️ केवल कम स्टॉक
          </button>
        </div>
      </div>

      {/* Items List: Clean Cards on Mobile, Table on Desktop */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">सामान का नाम (Item)</th>
                <th className="py-3 px-3">कैटेगरी</th>
                <th className="py-3 px-3 text-right">खरीद दर (Cost)</th>
                <th className="py-3 px-3 text-right">बिक्री दर (Price)</th>
                <th className="py-3 px-3 text-center">GST%</th>
                <th className="py-3 px-3 text-center">मौजूदा स्टॉक</th>
                <th className="py-3 px-4 text-right">कार्रवाई</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.map(item => {
                const isLow = item.currentStock <= item.lowStockThreshold;
                return (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 text-sm">{item.name}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>SKU: {item.sku}</span>
                        {item.barcode && <span>बारकोड: {item.barcode}</span>}
                        <span>इकाई: {item.unit}</span>
                      </div>
                    </td>

                    <td className="py-3 px-3 text-slate-600">
                      <span className="px-2 py-0.5 bg-slate-100 rounded-md text-[11px] font-medium">
                        {item.category}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right font-mono text-slate-600">
                      {formatINR(item.purchasePrice)}
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                      {formatINR(item.retailPrice)}
                    </td>

                    <td className="py-3 px-3 text-center font-mono">
                      {item.taxRate}%
                    </td>

                    <td className="py-3 px-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-mono font-extrabold text-xs ${
                        isLow ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {item.currentStock} {item.unit}
                        {isLow && <AlertTriangle className="w-3 h-3 text-red-600" />}
                      </span>
                      {isLow && (
                        <div className="text-[10px] text-red-600 font-bold mt-0.5">
                          अलर्ट सीमा: {item.lowStockThreshold}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleQuickAddStock(item, 10)}
                          className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-[11px] font-bold transition"
                          title="तुरंत 10 मात्रा स्टॉक में जोड़ें"
                        >
                          +10 स्टॉक
                        </button>
                        <button
                          onClick={() => openEditModal(item)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition"
                          title="संपादित करें"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Touch-Friendly Card View (Zero Overlap) */}
        <div className="block md:hidden divide-y divide-slate-100">
          {filteredItems.map(item => {
            const isLow = item.currentStock <= item.lowStockThreshold;
            return (
              <div key={item.id} className="p-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-slate-900 leading-tight">
                      {item.name}
                    </h4>
                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                      <span>{item.category}</span>
                      <span>·</span>
                      <span>इकाई: {item.unit}</span>
                      {item.barcode && <span>· बारकोड: {item.barcode}</span>}
                    </div>
                  </div>

                  <button
                    onClick={() => openEditModal(item)}
                    className="p-1.5 text-slate-500 hover:text-blue-600 bg-slate-50 rounded-lg"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl text-center">
                  <div>
                    <div className="text-[10px] text-slate-400">खरीद दर</div>
                    <div className="text-xs font-mono font-bold text-slate-700">{formatINR(item.purchasePrice)}</div>
                  </div>

                  <div>
                    <div className="text-[10px] text-slate-400">बिक्री दर (Price)</div>
                    <div className="text-xs font-mono font-extrabold text-blue-700">{formatINR(item.retailPrice)}</div>
                  </div>

                  <div>
                    <div className="text-[10px] text-slate-400">मौजूदा स्टॉक</div>
                    <div className={`text-xs font-mono font-extrabold ${isLow ? 'text-red-600' : 'text-emerald-700'}`}>
                      {item.currentStock} {item.unit}
                    </div>
                  </div>
                </div>

                {/* Quick Add Stock Action Button */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  {isLow ? (
                    <span className="text-[11px] font-bold text-red-600 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                      कम स्टॉक! (अलर्ट: {item.lowStockThreshold})
                    </span>
                  ) : <div />}

                  <div className="flex items-center gap-1.5 ml-auto">
                    <button
                      onClick={() => handleQuickAddStock(item, 5)}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-2xs"
                    >
                      +5 स्टॉक
                    </button>
                    <button
                      onClick={() => handleQuickAddStock(item, 20)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition shadow-2xs"
                    >
                      +20 स्टॉक
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add / Edit Item Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-blue-600 text-white">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-white" />
                <h3 className="font-bold text-sm sm:text-base">
                  {editingItem ? 'सामान का विवरण बदलें (Edit Item)' : 'नया सामान जोड़ें (Add New Item)'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-blue-200 hover:text-white hover:bg-blue-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Fields */}
            <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  सामान का नाम (Item Name) *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="उदा. आशीर्वाद आटा (5kg) / पारले-जी बिस्कुट"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    कैटेगरी (Category)
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    placeholder="किराना, इलेक्ट्रॉनिक्स, आदि"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    इकाई (Unit)
                  </label>
                  <select
                    value={unit}
                    onChange={e => setUnit(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
                  >
                    <option value="PCS">PCS (नग / पीस)</option>
                    <option value="KG">KG (किलोग्राम)</option>
                    <option value="PACK">PACK (पैकेट)</option>
                    <option value="BOX">BOX (डिब्बा)</option>
                    <option value="LTR">LTR (लीटर)</option>
                    <option value="BAG">BAG (बोरी / कट्टा)</option>
                    <option value="MTR">MTR (मीटर)</option>
                  </select>
                </div>
              </div>

              {/* Barcode & SKU Section with Camera Scanner & Auto Generator */}
              <div className="bg-blue-50/70 p-3 sm:p-3.5 rounded-2xl border border-blue-200 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                    <Barcode className="w-4 h-4 text-blue-600" />
                    <span>बारकोड / SKU नंबर (Barcode Input)</span>
                  </label>

                  <div className="flex items-center gap-1.5">
                    {/* Camera Scan Button */}
                    <button
                      type="button"
                      onClick={() => setIsScanningBarcodeModal(true)}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs active:scale-95"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>📷 बारकोड स्कैन करें</span>
                    </button>

                    {/* Generate Barcode Button */}
                    <button
                      type="button"
                      onClick={() => {
                        const newCode = generateEAN13Barcode();
                        setBarcode(newCode);
                        playBarcodeBeep();
                        showToast(`नया बारकोड बना: ${newCode}`);
                      }}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1 active:scale-95 shadow-2xs"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>Generate Barcode</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      बारकोड नंबर (EAN / UPC / QR)
                    </label>
                    <input
                      type="text"
                      placeholder="उदा. 8901030384712 (स्कैन करें या टाइप करें)"
                      value={barcode}
                      onChange={e => setBarcode(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                    />
                    <span className="text-[10px] text-slate-500 mt-0.5 block">सामान के पैकेट पर छपा 13/12 अंकों का कोड</span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      SKU कोड (Item SKU Code)
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        placeholder="उदा. AASHIR-5KG"
                        value={sku}
                        onChange={e => setSku(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                      <button
                        type="button"
                        onClick={() => setSku(generateRandomSKU())}
                        className="p-2 bg-white border border-slate-300 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-2xs"
                        title="नया SKU कोड जनरेट करें"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">आंतरिक पहचान कोड</span>
                  </div>
                </div>
              </div>

              {/* Pricing Section */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    खरीद दर (Purchase Price ₹) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    placeholder="0.00"
                    value={purchasePrice}
                    onChange={e => setPurchasePrice(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    बिक्री दर (Selling / Retail ₹) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    placeholder="0.00"
                    value={retailPrice}
                    onChange={e => setRetailPrice(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-extrabold text-blue-700 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              {/* Stock and Tax */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    शुरुआती स्टॉक (Initial Stock) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={currentStock}
                    onChange={e => setCurrentStock(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    कम स्टॉक अलर्ट सीमा (Alert At)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={lowStockThreshold}
                    onChange={e => setLowStockThreshold(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-red-700 focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    GST दर (Tax Rate %)
                  </label>
                  <select
                    value={taxRate}
                    onChange={e => setTaxRate(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  >
                    <option value={0}>0% (Exempt)</option>
                    <option value={5}>5% GST</option>
                    <option value={12}>12% GST</option>
                    <option value={18}>18% GST</option>
                    <option value={28}>28% GST</option>
                  </select>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition"
                >
                  रद्द करें
                </button>
                <button
                  type="submit"
                  className="flex-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition shadow-xs flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingItem ? 'बदलाव सेव करें' : 'सामान जोड़ें (Save Item)'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barcode Camera Scanner Modal for Item Form */}
      <BarcodeCameraModal
        isOpen={isScanningBarcodeModal}
        onClose={() => setIsScanningBarcodeModal(false)}
        onDetected={(scannedCode) => {
          setBarcode(scannedCode);
          playBarcodeBeep();
          showToast(`बारकोड स्कैन सफल: ${scannedCode}`);
          setIsScanningBarcodeModal(false);
        }}
      />

      {/* Barcode Camera Scanner Modal for Search Bar */}
      <BarcodeCameraModal
        isOpen={isScanningSearchModal}
        onClose={() => setIsScanningSearchModal(false)}
        onDetected={(scannedCode) => {
          setSearchQuery(scannedCode);
          playBarcodeBeep();
          showToast(`सर्च बारकोड: ${scannedCode}`);
          setIsScanningSearchModal(false);
        }}
      />

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-20 right-4 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-2xl text-xs font-bold animate-in fade-in slide-in-from-bottom-2 border border-slate-700">
          {toastMsg}
        </div>
      )}
    </div>
  );
};
