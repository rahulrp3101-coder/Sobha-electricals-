import React, { useState } from 'react';
import { CompanyProfile } from '../../types';
import { INDIAN_STATES } from '../../services/gstCalculator';
import { 
  Store, Building2, Phone, Mail, MapPin, Hash, 
  CreditCard, QrCode, FileText, Check, Save, RotateCcw, AlertCircle
} from 'lucide-react';

interface ShopProfileSettingsProps {
  company: CompanyProfile;
  onSaveCompany: (updated: CompanyProfile) => Promise<void>;
  onBackToBilling?: () => void;
}

export const ShopProfileSettings: React.FC<ShopProfileSettingsProps> = ({
  company,
  onSaveCompany,
  onBackToBilling,
}) => {
  const [formData, setFormData] = useState<CompanyProfile>({ ...company });
  const [isSavedToast, setIsSavedToast] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleStateChange = (code: string) => {
    const stateName = INDIAN_STATES[code] || 'Maharashtra';
    setFormData(prev => ({
      ...prev,
      stateCode: code,
      state: stateName,
      // If GSTIN starts with 2 digits, update GSTIN state prefix if user wants
      gstin: prev.gstin.length >= 2 ? code + prev.gstin.slice(2) : prev.gstin,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSaveCompany(formData);
      setIsSavedToast(true);
      setTimeout(() => setIsSavedToast(false), 3500);
    } catch (err) {
      console.error('Failed to save company settings', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              दुकान प्रोफाइल व GST सेटिंग्स (Shop Profile & GST)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            यहाँ से अपनी दुकान का नाम, राज्य, मोबाइल नंबर, GSTIN व बैंक/UPI विवरण सेट करें। यह सभी बिलों और रसीदों पर प्रिंट होगा।
          </p>
        </div>

        {onBackToBilling && (
          <button
            type="button"
            onClick={onBackToBilling}
            className="self-start sm:self-auto px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
          >
            ← बिलिंग पर लौटें
          </button>
        )}
      </div>

      {/* Success Toast */}
      {isSavedToast && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 p-3.5 rounded-xl flex items-center gap-2.5 text-xs sm:text-sm font-semibold shadow-xs animate-in fade-in duration-200">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>दुकान की जानकारी और GST सेटिंग्स सफलतापूर्वक सेव हो गई हैं!</span>
        </div>
      )}

      {/* Settings Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Basic Shop Details */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Store className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">दुकान / व्यापार का विवरण (Shop Information)</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                दुकान का नाम (Shop Name) *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="उदा. श्री गणेश सुपरमार्ट & किराना स्टोर्स"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                कानूनी / व्यापारिक नाम (Legal / Trade Name)
              </label>
              <input
                type="text"
                value={formData.legalTradeName || ''}
                onChange={e => setFormData({ ...formData, legalTradeName: e.target.value })}
                placeholder="उदा. Shri Ganesh Traders Pvt Ltd"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                मोबाइल / फोन नंबर (Phone / WhatsApp) *
              </label>
              <input
                type="text"
                required
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+91 98765 43210"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ईमेल (Email Address)
              </label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="billing@shriganeshtraders.com"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
              />
            </div>
          </div>
        </div>

        {/* Section 2: State & GST Settings */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Building2 className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">राज्य और GST सेटिंग्स (State & GST Details)</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                दुकान का राज्य (Shop State & GST Code) *
              </label>
              <select
                value={formData.stateCode}
                onChange={e => handleStateChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
              >
                {Object.entries(INDIAN_STATES).map(([code, stateName]) => (
                  <option key={code} value={code}>
                    {code} - {stateName}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                ग्राहक भी इसी राज्य का होने पर <strong className="text-slate-800">CGST + SGST</strong> लगेगा। दूसरे राज्य के ग्राहक पर <strong className="text-slate-800">IGST</strong> लगेगा।
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                GSTIN नंबर (15-Digit GST Number)
              </label>
              <input
                type="text"
                maxLength={15}
                value={formData.gstin}
                onChange={e => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                placeholder="उदा. 27AABCV1234F1Z5"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-mono font-bold uppercase"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                यदि GST पंजीकरण नहीं है तो खाली छोड़ें या COMPOSITION दर्ज करें।
              </p>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                दुकान का पूरा पता (Shop Address)
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
                placeholder="दुकान न. 12, मेन मार्केट, गांधी चौक..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                शहर / जिला (City)
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={e => setFormData({ ...formData, city: e.target.value })}
                placeholder="शहर का नाम"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                पिनकोड (Pincode)
              </label>
              <input
                type="text"
                maxLength={6}
                value={formData.pincode}
                onChange={e => setFormData({ ...formData, pincode: e.target.value })}
                placeholder="411037"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Section 3: UPI & Bank Details */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <QrCode className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">UPI और बैंक विवरण (Payment QR & Bank Details)</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                दुकान की UPI ID (GooglePay / PhonePe / Paytm / BHIM)
              </label>
              <input
                type="text"
                value={formData.upiId || ''}
                onChange={e => setFormData({ ...formData, upiId: e.target.value })}
                placeholder="उदा. 9876543210@paytm या shop@okhdfcbank"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600 font-mono font-medium"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                इस UPI ID का QR कोड और पेमेंट लिंक WhatsApp बिलों में अपने आप जुड़ जाएगा।
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                बैंक का नाम (Bank Name)
              </label>
              <input
                type="text"
                value={formData.bankName || ''}
                onChange={e => setFormData({ ...formData, bankName: e.target.value })}
                placeholder="उदा. State Bank of India / HDFC Bank"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                बैंक खाता संख्या (Account Number)
              </label>
              <input
                type="text"
                value={formData.bankAccountNo || ''}
                onChange={e => setFormData({ ...formData, bankAccountNo: e.target.value })}
                placeholder="उदा. 50200088991122"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                बैंक IFSC कोड (IFSC Code)
              </label>
              <input
                type="text"
                maxLength={11}
                value={formData.bankIfsc || ''}
                onChange={e => setFormData({ ...formData, bankIfsc: e.target.value.toUpperCase() })}
                placeholder="उदा. SBIN0001234"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-mono uppercase"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Bill Greeting & Terms */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileText className="w-4 h-4 text-purple-600" />
            <h3 className="text-sm font-bold text-slate-900">बिल नियम व शर्तें (Invoice Terms & Greetings)</h3>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              बिल के नीचे प्रिंट होने वाली शर्तें (प्रत्येक लाइन अलग)
            </label>
            <textarea
              rows={3}
              value={formData.terms.join('\n')}
              onChange={e => setFormData({ ...formData, terms: e.target.value.split('\n').filter(Boolean) })}
              placeholder="1. बिका हुआ सामान वापस नहीं होगा।&#10;2. बिल के साथ ही एक्सचेंज संभव है।&#10;3. धन्यवाद, फिर पधारें!"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-purple-600 font-medium"
            />
          </div>
        </div>

        {/* Submit Bar */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold transition shadow-xs flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'सेव हो रहा है...' : 'दुकान की जानकारी सेव करें (Save Settings)'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
