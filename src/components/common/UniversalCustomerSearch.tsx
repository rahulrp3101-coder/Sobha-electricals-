import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Party } from '../../types';
import { formatINR } from '../../services/gstCalculator';
import { 
  Search, Users, Phone, MapPin, Plus, X, 
  Check, ArrowRight, Ban, UserPlus, AlertCircle
} from 'lucide-react';

export interface UniversalCustomerSearchProps {
  parties: Party[];
  selectedParty?: Party | null;
  onSelectParty: (party: Party) => void;
  onQuickAddParty?: (name: string, phone: string) => Promise<Party>;
  placeholder?: string;
  shortcutHint?: string; // e.g. "Alt + C"
  isPOSMode?: boolean; // if true, excludes blacklisted customers from POS selection
  filterType?: 'ALL' | 'CUSTOMER' | 'SUPPLIER';
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  onSearchChange?: (query: string) => void;
  showSelectedBadge?: boolean;
}

/**
 * Omni-Search Matcher:
 * Matches phone (full or last 4-5 digits), name (English/Hindi), shop/firm name, address/city/village, and GSTIN.
 */
export function matchPartyOmni(party: Party, query: string): boolean {
  if (!query || !query.trim()) return true;
  const q = query.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');

  // 1. Mobile Number: full, partial, or last 4-5 digits
  const phoneClean = (party.phone || '').replace(/\D/g, '');
  const matchesPhone = Boolean(
    (party.phone && party.phone.toLowerCase().includes(q)) ||
    (digits.length >= 3 && (phoneClean.includes(digits) || phoneClean.endsWith(digits)))
  );

  // 2. Customer Name (English / Hindi substring)
  const matchesName = Boolean(party.name && party.name.toLowerCase().includes(q));

  // 3. Shop Name / Firm Name / Trade Name
  const matchesFirm = Boolean(
    (party.shopName && party.shopName.toLowerCase().includes(q)) ||
    ((party as any).firmName && (party as any).firmName.toLowerCase().includes(q)) ||
    ((party as any).tradeName && (party as any).tradeName.toLowerCase().includes(q)) ||
    ((party as any).legalTradeName && (party as any).legalTradeName.toLowerCase().includes(q))
  );

  // 4. City / Village / Address / State
  const matchesAddress = Boolean(
    (party.address && party.address.toLowerCase().includes(q)) ||
    (party.city && party.city.toLowerCase().includes(q)) ||
    (party.village && party.village.toLowerCase().includes(q)) ||
    (party.state && party.state.toLowerCase().includes(q))
  );

  // 5. GSTIN
  const matchesGstin = Boolean(party.gstin && party.gstin.toLowerCase().includes(q));

  return matchesPhone || matchesName || matchesFirm || matchesAddress || matchesGstin;
}

export const UniversalCustomerSearch: React.FC<UniversalCustomerSearchProps> = ({
  parties,
  selectedParty,
  onSelectParty,
  onQuickAddParty,
  placeholder = 'ग्राहक खोजें (नाम, मोबाइल अंतिम अंक, गाँव, दुकान)... [F2 / Alt+C]',
  shortcutHint = 'F2 / Alt+C',
  isPOSMode = true,
  filterType = 'ALL',
  className = '',
  inputClassName = '',
  autoFocus = false,
  onSearchChange,
  showSelectedBadge = true,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Quick Add Customer 2-line popup state
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [isSavingQuick, setIsSavingQuick] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const quickNameInputRef = useRef<HTMLInputElement>(null);

  // Synchronize external search change if needed
  const handleInputChange = (val: string) => {
    setSearchQuery(val);
    setIsOpen(true);
    setHighlightedIndex(0);
    onSearchChange?.(val);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Global Keyboard Shortcut: F2 or Alt + C (Requirement 3)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check F2 or Alt+C (both uppercase and lowercase)
      if (e.key === 'F2' || (e.altKey && (e.key === 'c' || e.key === 'C'))) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setIsOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter parties based on Omni-search logic (Requirement 1 & 2)
  const filteredResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return parties
      .filter(p => {
        if (isPOSMode && p.isBlacklisted) return false;
        if (filterType !== 'ALL' && p.type !== filterType) return false;
        return matchPartyOmni(p, searchQuery);
      })
      .slice(0, 8); // Top 8 immediate candidates
  }, [parties, searchQuery, isPOSMode, filterType]);

  // Total selectable items = filteredResults + 1 (the Quick Add row)
  const totalOptions = filteredResults.length + 1;

  // Handle keyboard navigation (Requirement 3: Down arrow, Up arrow, Enter)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsOpen(true);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % totalOptions);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + totalOptions) % totalOptions);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex < filteredResults.length) {
        // Select highlighted party
        const chosen = filteredResults[highlightedIndex];
        onSelectParty(chosen);
        setSearchQuery('');
        setIsOpen(false);
      } else {
        // Selected "+ Quick Add Customer" row
        openQuickAddModal();
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const openQuickAddModal = () => {
    const q = searchQuery.trim();
    const digitsOnly = q.replace(/\D/g, '');
    if (digitsOnly.length >= 5 && /^\d+$/.test(q)) {
      setQuickPhone(q);
      setQuickName('');
    } else {
      setQuickName(q);
      setQuickPhone('');
    }
    setIsOpen(false);
    setIsQuickAddOpen(true);
    setTimeout(() => quickNameInputRef.current?.focus(), 100);
  };

  const handleSaveQuickCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickName.trim()) return;

    setIsSavingQuick(true);
    try {
      if (onQuickAddParty) {
        const created = await onQuickAddParty(quickName.trim(), quickPhone.trim());
        onSelectParty(created);
      } else {
        const newParty: Party = {
          id: `pty-${Date.now()}`,
          name: quickName.trim(),
          type: 'CUSTOMER',
          phone: quickPhone.trim(),
          address: '',
          state: 'Maharashtra',
          stateCode: '27',
          creditLimit: 25000,
          currentBalance: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        onSelectParty(newParty);
      }
      setIsQuickAddOpen(false);
      setSearchQuery('');
    } catch (err) {
      console.error('Failed to quick add customer:', err);
    } finally {
      setIsSavingQuick(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Omni-Search Input Field */}
      <div className="relative flex items-center">
        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none flex items-center">
          <Search className="w-4 h-4 text-blue-600" />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => {
            if (searchQuery.trim().length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={`w-full pl-9 pr-16 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 font-semibold focus:bg-white focus:outline-none focus:border-blue-600 transition shadow-2xs ${inputClassName}`}
        />

        {/* Shortcut Hint & Clear button */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {searchQuery ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setIsOpen(false);
                onSearchChange?.('');
                inputRef.current?.focus();
              }}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
              title="Clear Search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            shortcutHint && (
              <span className="hidden sm:inline text-[10px] font-mono font-bold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded border border-slate-300">
                {shortcutHint}
              </span>
            )
          )}
        </div>
      </div>

      {/* Live Auto-suggestion Dropdown (Requirement 2 & 3) */}
      {isOpen && searchQuery.trim().length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden divide-y divide-slate-100 max-h-80 overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
          {/* Header indicator */}
          <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
            <span>सर्च परिणाम ({filteredResults.length})</span>
            <span className="text-slate-400">↑↓ से चुनें, Enter से सेलेक्ट करें</span>
          </div>

          {filteredResults.length > 0 ? (
            filteredResults.map((party, idx) => {
              const isSelected = selectedParty?.id === party.id;
              const isHighlighted = highlightedIndex === idx;
              const hasBalanceDue = party.currentBalance > 0;
              const isAdvance = party.currentBalance < 0;

              return (
                <div
                  key={party.id}
                  onClick={() => {
                    onSelectParty(party);
                    setSearchQuery('');
                    setIsOpen(false);
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`p-3 cursor-pointer transition flex items-center justify-between gap-3 ${
                    isHighlighted ? 'bg-blue-50/90 border-l-4 border-blue-600' : 'hover:bg-slate-50'
                  }`}
                >
                  {/* Left: Customer Info Card (Requirement 2) */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-sm sm:text-base text-slate-900 tracking-tight">
                        {party.name}
                      </span>
                      {party.shopName && (
                        <span className="text-xs font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200">
                          🏪 {party.shopName}
                        </span>
                      )}
                      {isSelected && (
                        <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.2 rounded">
                          ✓ वर्तमान बिल में
                        </span>
                      )}
                      {party.isBlacklisted && (
                        <span className="text-[10px] bg-red-100 text-red-800 font-bold px-1.5 py-0.2 rounded flex items-center gap-0.5">
                          <Ban className="w-2.5 h-2.5" />
                          लेन-देन बंद
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                      {party.phone && (
                        <span className="flex items-center gap-1 font-mono text-slate-800 font-bold bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-200">
                          <Phone className="w-3 h-3 text-emerald-600" />
                          <span>{party.phone}</span>
                        </span>
                      )}
                      {(party.city || party.village || party.address || party.state) && (
                        <span className="flex items-center gap-1 text-slate-600 font-medium truncate max-w-[220px]">
                          <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="truncate">{party.city || party.village || party.address || party.state}</span>
                        </span>
                      )}
                      {party.gstin && (
                        <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                          GST: {party.gstin}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Outstanding Balance (Requirement 2 - bright red glow if dues pending) */}
                  <div className="text-right shrink-0">
                    <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-tight mb-0.5">
                      बकाया राशि (Outstanding)
                    </div>
                    {hasBalanceDue ? (
                      <div className="text-xs sm:text-sm font-mono font-black text-white bg-red-600 border border-red-700 px-2.5 py-1 rounded-xl whitespace-nowrap shadow-sm animate-pulse flex items-center gap-1 justify-end">
                        <span>⚠️ {formatINR(party.currentBalance)} बाकी</span>
                      </div>
                    ) : isAdvance ? (
                      <div className="text-xs sm:text-sm font-mono font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-lg whitespace-nowrap">
                        {formatINR(Math.abs(party.currentBalance))} जमा (Advance)
                      </div>
                    ) : (
                      <div className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
                        ✓ ₹0.00 (बेबाक)
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-4 text-center space-y-1">
              <p className="text-xs font-medium text-slate-500">
                कोई ग्राहक नहीं मिला: &quot;<strong className="text-slate-800">{searchQuery}</strong>&quot;
              </p>
              <p className="text-[11px] text-slate-400">
                नीचे दिए गए बटन से इसे 2 सेकंड में नया ग्राहक जोड़ें।
              </p>
            </div>
          )}

          {/* Quick Add Customer Button Option (Requirement 4) */}
          <div
            onClick={openQuickAddModal}
            onMouseEnter={() => setHighlightedIndex(filteredResults.length)}
            className={`p-2.5 bg-blue-50/90 hover:bg-blue-100 text-blue-900 font-extrabold flex items-center justify-between text-xs cursor-pointer transition border-t border-blue-200 ${
              highlightedIndex === filteredResults.length ? 'bg-blue-100 ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-md bg-blue-600 text-white flex items-center justify-center font-black">
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
              </div>
              <span>
                + नया ग्राहक जोड़ें (+ Add &quot;{searchQuery.trim()}&quot;)
              </span>
            </div>
            <span className="text-[10px] bg-blue-200 text-blue-900 px-2 py-0.5 rounded-full font-bold">
              2 सेकंड में जोड़ें ↵
            </span>
          </div>
        </div>
      )}

      {/* Quick Add Customer Rapid 2-Line Modal (Requirement 4) */}
      {isQuickAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            {/* Header */}
            <div className="bg-blue-600 text-white p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
                  <UserPlus className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm leading-tight">
                    + तुरंत नया ग्राहक जोड़ें
                  </h3>
                  <p className="text-[10px] text-blue-100">
                    नाम व मोबाइल डालें और तुरंत बिलिंग जारी रखें
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickAddOpen(false)}
                className="p-1 rounded-lg text-blue-200 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 2-Line Simple Form */}
            <form onSubmit={handleSaveQuickCustomer} className="p-4 space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  ग्राहक का नाम (Customer Name) *
                </label>
                <input
                  ref={quickNameInputRef}
                  type="text"
                  required
                  placeholder="उदा. शर्मा किराना / Rahul Sharma"
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  मोबाइल नंबर (Mobile Number)
                </label>
                <input
                  type="tel"
                  placeholder="10 अंकों का नंबर (उदा. 9826012345)"
                  value={quickPhone}
                  onChange={(e) => setQuickPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsQuickAddOpen(false)}
                  disabled={isSavingQuick}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  रद्द करें
                </button>
                <button
                  type="submit"
                  disabled={isSavingQuick || !quickName.trim()}
                  className="flex-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{isSavingQuick ? 'सेव हो रहा है...' : '💾 सेव व बिल में जोड़ें'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
