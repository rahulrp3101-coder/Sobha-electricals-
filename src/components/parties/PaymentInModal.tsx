import React, { useState } from 'react';
import { Party, PaymentMode, PaymentTransaction, CompanyProfile } from '../../types';
import { formatINR } from '../../services/gstCalculator';
import { 
  ArrowDownLeft, X, Check, DollarSign, Smartphone, 
  CreditCard, Banknote, Share2, UserCheck, AlertCircle 
} from 'lucide-react';
import { buildUPILink } from '../../services/whatsappShare';

interface PaymentInModalProps {
  isOpen: boolean;
  onClose: () => void;
  parties: Party[];
  company: CompanyProfile;
  initialPartyId?: string;
  onRecordPayment: (payment: PaymentTransaction) => Promise<void>;
}

export const PaymentInModal: React.FC<PaymentInModalProps> = ({
  isOpen,
  onClose,
  parties,
  company,
  initialPartyId,
  onRecordPayment,
}) => {
  const customerParties = parties.filter(p => p.type === 'CUSTOMER');
  const [selectedPartyId, setSelectedPartyId] = useState<string>(
    initialPartyId || (customerParties[0]?.id || parties[0]?.id || '')
  );
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [completedPayment, setCompletedPayment] = useState<PaymentTransaction | null>(null);

  const selectedParty = parties.find(p => p.id === selectedPartyId);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!selectedParty || !numAmount || numAmount <= 0) return;

    setIsSubmitting(true);
    try {
      const payment: PaymentTransaction = {
        id: `pay-${Date.now()}`,
        receiptNumber: `REC-${String(Date.now()).slice(-6)}`,
        partyId: selectedParty.id,
        partyName: selectedParty.name,
        amount: numAmount,
        paymentMode,
        type: 'PAYMENT_IN',
        date: new Date().toISOString().split('T')[0],
        notes: notes || 'Payment In / उधारी वसूली',
        createdAt: new Date().toISOString(),
      };

      await onRecordPayment(payment);
      setCompletedPayment(payment);
    } catch (err) {
      console.error('Failed to record payment', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const generateWhatsAppAcknowledgementURL = () => {
    if (!completedPayment || !selectedParty) return '#';
    const cleanPhone = (selectedParty.phone || '').replace(/\D/g, '');
    const phoneParam = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    
    // Remaining balance after this payment
    const newBalance = Math.max(0, (selectedParty.currentBalance || 0) - completedPayment.amount);

    const message = [
      `*भुगतान रसीद (Payment Receipt)*`,
      `*${company.name}*`,
      `रसीद सं.: ${completedPayment.receiptNumber}`,
      `दिनांक: ${completedPayment.date}`,
      `ग्राहक: ${selectedParty.name}`,
      `--------------------------------`,
      `प्राप्त राशि: *${formatINR(completedPayment.amount)}*`,
      `भुगतान माध्यम: ${completedPayment.paymentMode}`,
      `शेष बकाया खाता: *${formatINR(newBalance)}*`,
      `--------------------------------`,
      `आपके भुगतान के लिए धन्यवाद! 🙏`,
      `संपर्क: ${company.phone}`,
    ].join('\n');

    return phoneParam 
      ? `https://api.whatsapp.com/send?phone=${phoneParam}&text=${encodeURIComponent(message)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-emerald-600 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center font-bold">
              <ArrowDownLeft className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">Payment In (पैसे मिले / जमा)</h3>
              <p className="text-[11px] text-emerald-100">ग्राहक से उधार या बकाया राशि प्राप्त करने की एंट्री</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-emerald-200 hover:text-white hover:bg-emerald-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Screen after recording payment */}
        {completedPayment ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
              <Check className="w-8 h-8" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 text-base">भुगतान सफलतापूर्वक दर्ज हो गया!</h4>
              <p className="text-xs text-slate-500 mt-1">
                {selectedParty?.name} के खाते से {formatINR(completedPayment.amount)} की उधारी कम कर दी गई है।
              </p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1 text-left">
              <div className="flex justify-between">
                <span className="text-slate-500">रसीद सं.:</span>
                <span className="font-mono font-bold text-slate-800">{completedPayment.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">प्राप्त राशि:</span>
                <span className="font-bold text-emerald-700">{formatINR(completedPayment.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">माध्यम:</span>
                <span className="font-semibold text-slate-700">{completedPayment.paymentMode}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <a
                href={generateWhatsAppAcknowledgementURL()}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 shadow-xs"
              >
                <Share2 className="w-4 h-4" />
                <span>WhatsApp पर रसीद भेजें (Share Receipt)</span>
              </a>

              <button
                onClick={() => {
                  setCompletedPayment(null);
                  onClose();
                }}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
              >
                बंद करें (Done)
              </button>
            </div>
          </div>
        ) : (
          /* Payment Form */
          <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
            {/* Customer Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ग्राहक चुनें (Select Customer) *
              </label>
              <select
                value={selectedPartyId}
                onChange={e => setSelectedPartyId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600 font-medium"
              >
                {customerParties.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.phone ? `(${p.phone})` : ''} - बकाया: {formatINR(p.currentBalance)}
                  </option>
                ))}
              </select>
            </div>

            {/* Current Khata Balance Card */}
            {selectedParty && (
              <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                selectedParty.currentBalance > 0
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}>
                <div>
                  <div className="text-[11px] font-medium text-slate-500">वर्तमान कुल बकाया (Outstanding Khata):</div>
                  <div className="font-extrabold text-sm sm:text-base">
                    {selectedParty.currentBalance > 0 ? (
                      <span className="text-amber-700">{formatINR(selectedParty.currentBalance)} (उधार बाकी)</span>
                    ) : (
                      <span className="text-emerald-700">₹0 (हिसाब चुकता)</span>
                    )}
                  </div>
                </div>
                {selectedParty.currentBalance > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmount(selectedParty.currentBalance)}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold transition shadow-2xs"
                  >
                    पूरा हिसाब भरें
                  </button>
                )}
              </div>
            )}

            {/* Amount Received Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                प्राप्त राशि (Amount Received ₹) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-base font-bold text-slate-400">₹</span>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  autoFocus
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-lg font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600 font-mono"
                />
              </div>
            </div>

            {/* Payment Mode Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                भुगतान का माध्यम (Payment Mode)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'CASH', label: 'नकद (Cash)', icon: Banknote },
                  { id: 'UPI', label: 'UPI / QR', icon: Smartphone },
                  { id: 'BANK_TRANSFER', label: 'बैंक / Net', icon: CreditCard },
                ].map(mode => {
                  const Icon = mode.icon;
                  const isSelected = paymentMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setPaymentMode(mode.id as PaymentMode)}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs font-bold transition ${
                        isSelected
                          ? 'bg-emerald-50 border-emerald-600 text-emerald-800 shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className={`w-4 h-4 mb-1 ${isSelected ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <span>{mode.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Note / Remarks */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                रिमार्क / विवरण (Note / Remarks)
              </label>
              <input
                type="text"
                placeholder="उदा. GooglePay से प्राप्त / दुकान पर कैश दिया"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600 font-medium"
              />
            </div>

            {/* Submit Buttons */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                रद्द करें
              </button>

              <button
                type="submit"
                disabled={isSubmitting || !amount || Number(amount) <= 0}
                className="flex-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold transition shadow-xs flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{isSubmitting ? 'दर्ज हो रहा है...' : 'पैसे जमा करें (Save Payment)'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
