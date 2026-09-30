import React, { useState } from 'react';
import { Party, CompanyProfile, PaymentMode, PaymentTransaction } from '../../types';
import { formatINR, INDIAN_STATES } from '../../services/gstCalculator';
import { 
  Users, Search, Plus, Phone, Mail, Share2, 
  ArrowDownLeft, ArrowUpRight, DollarSign, X, Check, CreditCard, AlertCircle
} from 'lucide-react';
import { generateWhatsAppKhataReminderURL } from '../../services/whatsappShare';
import { PaymentInModal } from './PaymentInModal';

interface PartiesLedgerProps {
  parties: Party[];
  company: CompanyProfile;
  onSaveParty: (party: Party) => Promise<void>;
  onRecordPayment: (payment: PaymentTransaction) => Promise<void>;
}

export const PartiesLedger: React.FC<PartiesLedgerProps> = ({
  parties,
  company,
  onSaveParty,
  onRecordPayment,
}) => {
  const [partyTypeFilter, setPartyTypeFilter] = useState<'ALL' | 'CUSTOMER' | 'SUPPLIER'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);

  // Modals
  const [isPartyModalOpen, setIsPartyModalOpen] = useState(false);
  const [isPaymentInModalOpen, setIsPaymentInModalOpen] = useState(false);
  const [paymentInPartyId, setPaymentInPartyId] = useState<string | undefined>(undefined);

  // New Party Form
  const [name, setName] = useState('');
  const [type, setType] = useState<'CUSTOMER' | 'SUPPLIER'>('CUSTOMER');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [stateCode, setStateCode] = useState(company.stateCode || '27');
  const [address, setAddress] = useState('');
  const [creditLimit, setCreditLimit] = useState(25000);
  const [openingBalance, setOpeningBalance] = useState(0);

  const filteredParties = parties.filter(p => {
    const matchesType = partyTypeFilter === 'ALL' || p.type === partyTypeFilter;
    const matchesSearch = 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.phone.includes(searchQuery) ||
      (p.gstin && p.gstin.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesType && matchesSearch;
  });

  const totalReceivables = parties
    .filter(p => p.currentBalance > 0)
    .reduce((s, p) => s + p.currentBalance, 0);

  const totalPayables = parties
    .filter(p => p.currentBalance < 0)
    .reduce((s, p) => s + Math.abs(p.currentBalance), 0);

  const handleCreateParty = async (e: React.FormEvent) => {
    e.preventDefault();
    const newParty: Party = {
      id: `pty-${Date.now()}`,
      name,
      type,
      phone,
      email: email || undefined,
      gstin: gstin ? gstin.toUpperCase() : undefined,
      state: INDIAN_STATES[stateCode] || company.state,
      stateCode,
      address,
      creditLimit,
      currentBalance: Number(openingBalance) || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await onSaveParty(newParty);
    setIsPartyModalOpen(false);
  };

  const openPaymentInForParty = (partyId?: string) => {
    setPaymentInPartyId(partyId);
    setIsPaymentInModalOpen(true);
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-7xl mx-auto pb-24 lg:pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              ग्राहक खाता व उधारी बही (Customer Khata Ledger)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            ग्राहकों की उधारी (Debit) और सप्लायर की देनदारी (Credit) का हिसाब, WhatsApp पेमेंट रिमाइंडर व UPI लिंक
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Quick Payment In button */}
          <button
            onClick={() => openPaymentInForParty(undefined)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold transition shadow-xs active:scale-98"
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>➕ पैसे मिले (Payment In)</span>
          </button>

          {/* Add Party Button */}
          <button
            onClick={() => {
              setName('');
              setPhone('');
              setEmail('');
              setGstin('');
              setStateCode(company.stateCode || '27');
              setAddress('');
              setOpeningBalance(0);
              setIsPartyModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold transition shadow-xs active:scale-98"
          >
            <Plus className="w-4 h-4" />
            <span>+ नया ग्राहक / पार्टी</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Total Receivables / Udhar Given */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1">
              <span>बाकी उधारी (Total Receivables / लेना बाकी)</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-950 font-mono mt-1">
              {formatINR(totalReceivables)}
            </div>
            <div className="text-[11px] text-amber-700 mt-0.5">
              ग्राहकों से वसूल करने योग्य कुल उधारी राशि
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-amber-600 text-white flex items-center justify-center font-bold shrink-0">
            <ArrowDownLeft className="w-6 h-6" />
          </div>
        </div>

        {/* Total Payables / Supplier Dues */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-xs font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1">
              <span>सप्लायर देनदारी (Total Payables / देना बाकी)</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-blue-950 font-mono mt-1">
              {formatINR(totalPayables)}
            </div>
            <div className="text-[11px] text-blue-700 mt-0.5">
              थोक व्यापारियों व सप्लायर्स को देने योग्य राशि
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold shrink-0">
            <ArrowUpRight className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row gap-2.5 sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="ग्राहक का नाम, मोबाइल नंबर या GSTIN से खोजें..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          {[
            { id: 'ALL', label: 'सभी (All)' },
            { id: 'CUSTOMER', label: 'ग्राहक (Customers)' },
            { id: 'SUPPLIER', label: 'सप्लायर (Suppliers)' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setPartyTypeFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg transition ${
                partyTypeFilter === tab.id
                  ? 'bg-white text-slate-900 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Parties List: Responsive Cards on Mobile & Table on Desktop */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">पार्टी का नाम (Party Name)</th>
                <th className="py-3 px-3">प्रकार (Type)</th>
                <th className="py-3 px-3">फोन / मोबाइल</th>
                <th className="py-3 px-3">राज्य</th>
                <th className="py-3 px-4 text-right">खाता बैलेंस (Khata Balance)</th>
                <th className="py-3 px-4 text-right">कार्रवाई</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItemsList(filteredParties).map(party => {
                const isReceivable = party.currentBalance > 0;
                const isPayable = party.currentBalance < 0;
                const isSettled = party.currentBalance === 0;

                return (
                  <tr key={party.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 text-sm">{party.name}</div>
                      {party.gstin && (
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          GSTIN: {party.gstin}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        party.type === 'CUSTOMER' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {party.type === 'CUSTOMER' ? 'ग्राहक' : 'सप्लायर'}
                      </span>
                    </td>

                    <td className="py-3 px-3 font-mono text-slate-700">
                      {party.phone ? `📱 ${party.phone}` : '-'}
                    </td>

                    <td className="py-3 px-3 text-slate-600">
                      {party.state} ({party.stateCode})
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="font-mono font-black text-sm">
                        {isReceivable && (
                          <span className="text-amber-700">
                            {formatINR(party.currentBalance)} <span className="text-[10px] uppercase font-sans font-bold">बाकी</span>
                          </span>
                        )}
                        {isPayable && (
                          <span className="text-blue-700">
                            {formatINR(Math.abs(party.currentBalance))} <span className="text-[10px] uppercase font-sans font-bold">देना</span>
                          </span>
                        )}
                        {isSettled && (
                          <span className="text-slate-400">₹0.00 (चुकता)</span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Payment In button */}
                        <button
                          onClick={() => openPaymentInForParty(party.id)}
                          className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition flex items-center gap-1"
                          title="पैसे प्राप्त करने की एंट्री"
                        >
                          <ArrowDownLeft className="w-3.5 h-3.5" />
                          <span>पैसे लें</span>
                        </button>

                        {/* WhatsApp Payment Reminder */}
                        {party.phone && isReceivable && (
                          <a
                            href={generateWhatsAppKhataReminderURL(party, company)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs"
                            title="WhatsApp पर उधारी का तकादा भेजें"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            <span>रिमाइंडर</span>
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Touch Cards View (Zero Overlap) */}
        <div className="block md:hidden divide-y divide-slate-100">
          {filteredItemsList(filteredParties).map(party => {
            const isReceivable = party.currentBalance > 0;
            const isPayable = party.currentBalance < 0;
            const isSettled = party.currentBalance === 0;

            return (
              <div key={party.id} className="p-3.5 space-y-2.5 bg-white">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 leading-tight">
                      {party.name}
                    </h4>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                        party.type === 'CUSTOMER' ? 'bg-emerald-50 text-emerald-800' : 'bg-blue-50 text-blue-800'
                      }`}>
                        {party.type === 'CUSTOMER' ? 'ग्राहक' : 'सप्लायर'}
                      </span>
                      {party.phone && <span>📱 {party.phone}</span>}
                    </div>
                  </div>

                  {/* Balance badge */}
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400">खाता बैलेंस</div>
                    <div className={`text-sm font-mono font-black ${
                      isReceivable ? 'text-amber-800' : isPayable ? 'text-blue-800' : 'text-slate-400'
                    }`}>
                      {isReceivable && `${formatINR(party.currentBalance)} बाकी`}
                      {isPayable && `${formatINR(Math.abs(party.currentBalance))} देना`}
                      {isSettled && `₹0 चुकता`}
                    </div>
                  </div>
                </div>

                {/* Mobile Action Buttons Bar */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-50">
                  <button
                    onClick={() => openPaymentInForParty(party.id)}
                    className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 shadow-2xs"
                  >
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                    <span>पैसे मिले (Payment In)</span>
                  </button>

                  {party.phone && isReceivable && (
                    <a
                      href={generateWhatsAppKhataReminderURL(party, company)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition flex items-center gap-1"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment In Modal Component */}
      <PaymentInModal
        isOpen={isPaymentInModalOpen}
        onClose={() => setIsPaymentInModalOpen(false)}
        parties={parties}
        company={company}
        initialPartyId={paymentInPartyId}
        onRecordPayment={onRecordPayment}
      />

      {/* Add Party Modal */}
      {isPartyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-blue-600 text-white">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-white" />
                <h3 className="font-bold text-sm sm:text-base">नया ग्राहक / पार्टी जोड़ें</h3>
              </div>
              <button
                onClick={() => setIsPartyModalOpen(false)}
                className="p-1 rounded-lg text-blue-200 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateParty} className="p-4 sm:p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  ग्राहक या पार्टी का नाम *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="उदा. राजेश किराना स्टोर्स / सुनील कुमार"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    पार्टी का प्रकार
                  </label>
                  <select
                    value={type}
                    onChange={e => setType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  >
                    <option value="CUSTOMER">ग्राहक (Customer)</option>
                    <option value="SUPPLIER">सप्लायर (Supplier)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    मोबाइल नंबर (WhatsApp) *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="9876543210"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    राज्य (State)
                  </label>
                  <select
                    value={stateCode}
                    onChange={e => setStateCode(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  >
                    {Object.entries(INDIAN_STATES).map(([code, stateName]) => (
                      <option key={code} value={code}>
                        {code} - {stateName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    GSTIN नंबर
                  </label>
                  <input
                    type="text"
                    placeholder="27ABCDE1234F1Z5"
                    value={gstin}
                    onChange={e => setGstin(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono uppercase text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  शुरुआती पुराना बकाया (Opening Khata Balance ₹)
                </label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={openingBalance}
                  onChange={e => setOpeningBalance(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-amber-800 focus:bg-white focus:outline-none focus:border-blue-600"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">
                  यदि ग्राहक पर पहले से उधारी बाकी है तो यहाँ दर्ज करें।
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  पता (Address)
                </label>
                <input
                  type="text"
                  placeholder="पता या गांव का नाम"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
                />
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPartyModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition"
                >
                  रद्द करें
                </button>

                <button
                  type="submit"
                  className="flex-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition shadow-xs flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>ग्राहक सेव करें (Save Party)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

function filteredItemsList(list: Party[]): Party[] {
  return list;
}
