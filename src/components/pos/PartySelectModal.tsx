import React, { useState } from 'react';
import { Party, CompanyProfile } from '../../types';
import { formatINR, INDIAN_STATES } from '../../services/gstCalculator';
import { Users, Search, Plus, X, Phone, MapPin, Check, ArrowLeft, Building2 } from 'lucide-react';

interface PartySelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  parties: Party[];
  selectedPartyId?: string;
  company: CompanyProfile;
  onSelectParty: (party: Party) => void;
  onSaveNewParty: (party: Party) => Promise<void>;
}

export const PartySelectModal: React.FC<PartySelectModalProps> = ({
  isOpen,
  onClose,
  parties,
  selectedPartyId,
  company,
  onSelectParty,
  onSaveNewParty,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);

  // New Party Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [stateCode, setStateCode] = useState(company.stateCode || '27');
  const [openingBalance, setOpeningBalance] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const filteredParties = parties.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.phone && p.phone.includes(q)) ||
      (p.address && p.address.toLowerCase().includes(q))
    );
  });

  const handleAddNewPartySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      const newParty: Party = {
        id: `pty-${Date.now()}`,
        name: name.trim(),
        type: 'CUSTOMER',
        phone: phone.trim(),
        address: address.trim(),
        gstin: gstin.trim().toUpperCase() || undefined,
        state: INDIAN_STATES[stateCode] || company.state,
        stateCode,
        creditLimit: 50000,
        currentBalance: Number(openingBalance) || 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await onSaveNewParty(newParty);
      onSelectParty(newParty);
      setIsAddingNew(false);
      onClose();
    } catch (err) {
      console.error('Failed to create party:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-3 sm:p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            {isAddingNew ? (
              <button
                type="button"
                onClick={() => setIsAddingNew(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                <Users className="w-4 h-4" />
              </div>
            )}
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-900">
                {isAddingNew ? '+ Add New Customer (नया ग्राहक जोड़ें)' : 'Select Customer / Party (ग्राहक चुनें)'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {isAddingNew ? 'Enter customer details to add and select for active bill' : 'Choose customer or walk-in to attach to active bill'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body: List vs New Form */}
        {!isAddingNew ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Search Bar & Action Buttons */}
            <div className="p-3 bg-white border-b border-slate-100 space-y-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search customer by name or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
                />
              </div>

              <div className="flex items-center gap-2">
                {/* Cash Walk-in quick button */}
                <button
                  type="button"
                  onClick={() => {
                    const walkIn: Party = parties.find(p => p.id === 'pty-001' || p.name.includes('Walk-in')) || {
                      id: 'pty-walkin',
                      name: 'Walk-in Customer (नकद ग्राहक)',
                      phone: '',
                      address: '',
                      creditLimit: 0,
                      type: 'CUSTOMER',
                      currentBalance: 0,
                      state: company.state,
                      stateCode: company.stateCode,
                      createdAt: '',
                      updatedAt: '',
                    };
                    onSelectParty(walkIn);
                    onClose();
                  }}
                  className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border border-slate-300 active:scale-98"
                >
                  <span>💵 Walk-in Customer (नकद ग्राहक)</span>
                </button>

                {/* Add New Party Button */}
                <button
                  type="button"
                  onClick={() => setIsAddingNew(true)}
                  className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs active:scale-98"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ New Customer (नया ग्राहक)</span>
                </button>
              </div>
            </div>

            {/* Parties List */}
            <div className="p-3 divide-y divide-slate-100 overflow-y-auto flex-1 space-y-1">
              {filteredParties.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <p className="text-sm font-bold text-slate-600">No customer found (कोई ग्राहक नहीं मिला)</p>
                  <p className="text-xs text-slate-400 mt-1">
                    No customer matches &quot;{searchQuery}&quot;. Click below to create.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setName(searchQuery);
                      setIsAddingNew(true);
                    }}
                    className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add &quot;{searchQuery}&quot; as Customer</span>
                  </button>
                </div>
              ) : (
                filteredParties.map((p) => {
                  const isSelected = p.id === selectedPartyId;
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        onSelectParty(p);
                        onClose();
                      }}
                      className={`p-3 rounded-2xl cursor-pointer flex items-center justify-between transition border ${
                        isSelected
                          ? 'bg-blue-50 border-blue-400 text-blue-950 font-semibold shadow-xs'
                          : 'bg-white border-transparent hover:border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                            {p.name}
                          </span>
                          {isSelected && (
                            <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.2 rounded font-bold">
                              Selected (चुना गया)
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 mt-1">
                          {p.phone && (
                            <span className="flex items-center gap-1 font-mono">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {p.phone}
                            </span>
                          )}
                          {p.address && (
                            <span className="flex items-center gap-1 truncate max-w-[180px]">
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                              {p.address}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Khata Balance */}
                      <div className="text-right shrink-0">
                        <div className="text-[10px] text-slate-400 font-medium">खाता बैलेंस:</div>
                        <div
                          className={`text-xs font-mono font-black ${
                            p.currentBalance > 0
                              ? 'text-amber-700'
                              : p.currentBalance < 0
                              ? 'text-purple-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {p.currentBalance > 0
                            ? `${formatINR(p.currentBalance)} Due (बाकी)`
                            : p.currentBalance < 0
                            ? `${formatINR(Math.abs(p.currentBalance))} Adv (एडवांस)`
                            : '₹0 Settled (चुकता)'}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          /* Add New Party Inline Form */
          <form onSubmit={handleAddNewPartySubmit} className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Customer Name (ग्राहक का नाम) *
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="e.g. Rajesh Kumar"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-semibold"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mobile Phone (मोबाइल नंबर)
                </label>
                <input
                  type="tel"
                  placeholder="9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  GSTIN (वैकल्पिक)
                </label>
                <input
                  type="text"
                  maxLength={15}
                  placeholder="27AAAAA0000A1Z5"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-mono uppercase"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Address (दुकान / मकान का पता)
              </label>
              <textarea
                rows={2}
                placeholder="Shop / House No., Street, City, Pincode"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  State (राज्य)
                </label>
                <select
                  value={stateCode}
                  onChange={(e) => setStateCode(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 font-semibold focus:outline-none"
                >
                  {Object.entries(INDIAN_STATES).map(([code, stName]) => (
                    <option key={code} value={code}>
                      {code} - {stName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Opening Balance ₹ (शुरुआती बकाया)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={openingBalance || ''}
                  onChange={(e) => setOpeningBalance(Number(e.target.value) || 0)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-mono font-bold"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddingNew(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                Cancel (रद्द करें)
              </button>
              <button
                type="submit"
                disabled={isSaving || !name.trim()}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-extrabold transition shadow-xs flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{isSaving ? 'Saving...' : 'Save & Select (सेव करें व चुनें)'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
