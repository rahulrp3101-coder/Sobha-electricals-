import React, { useState } from 'react';
import { Lock, User, Eye, EyeOff, ShieldCheck, AlertCircle, ArrowRight, Store } from 'lucide-react';
import { loginAdmin } from '../../services/adminAuth';

interface AdminLoginScreenProps {
  onLoginSuccess: (username: string) => void;
  sessionTerminatedReason?: string | null;
}

export const AdminLoginScreen: React.FC<AdminLoginScreenProps> = ({
  onLoginSuccess,
  sessionTerminatedReason,
}) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    try {
      const res = await loginAdmin(username.trim(), password);
      if (res.success && res.username) {
        onLoginSuccess(res.username);
      } else {
        setErrorMsg(res.error || 'गलत यूजरनेम या पासवर्ड।');
      }
    } catch {
      setErrorMsg('लॉगिन करने में समस्या आई। कृपया पुनः प्रयास करें।');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-900 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-emerald-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-linear-to-br from-slate-900 via-slate-800 to-blue-950 p-6 sm:p-7 text-white text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white mx-auto flex items-center justify-center font-black text-2xl shadow-lg ring-4 ring-white/10 mb-3">
            ₹
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight">Vyapar Pro</h2>
          <p className="text-xs text-slate-300 mt-1 font-medium">
            सुरक्षित सिंगल-एडमिन बिलिंग व इन्वेंट्री सिस्टम
          </p>

          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full text-[11px] text-blue-200 border border-white/10">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>सिंगल एक्टिव सेशन सुरक्षा (Single Active Session)</span>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6 sm:p-7 space-y-4">
          {/* Terminated Notice if logged out by other device */}
          {sessionTerminatedReason && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl text-xs space-y-1 animate-in fade-in">
              <div className="flex items-center gap-1.5 font-bold text-amber-950">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>सत्र समाप्त (Auto Logged Out)</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                {sessionTerminatedReason}
              </p>
            </div>
          )}

          {/* Default Credentials Hint Pill */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-900">
            <div className="font-bold flex items-center justify-between">
              <span>डिफ़ॉल्ट लॉगिन क्रेडेंशियल्स:</span>
              <span className="text-[10px] bg-blue-200/70 text-blue-950 px-1.5 py-0.5 rounded font-mono">प्रथम बार</span>
            </div>
            <div className="text-[11px] text-blue-800 font-mono mt-1 flex items-center justify-between">
              <span>यूजरनेम: <strong>admin</strong></span>
              <span>पासवर्ड: <strong>admin123</strong></span>
            </div>
            <div className="text-[10px] text-blue-600 mt-1">
              (लॉगिन के बाद आप सेटिंग्स से यूजरनेम और पासवर्ड कभी भी बदल सकते हैं)
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                एडमिन यूजरनेम (Username)
              </label>
              <div className="relative flex items-center">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                <input
                  type="text"
                  required
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 transition"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                एडमिन पासवर्ड (Password)
              </label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 p-1 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 shadow-lg transition active:scale-98"
            >
              <span>{isLoading ? 'सत्यापित हो रहा है...' : 'सुरक्षित लॉगिन करें (Login)'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Security Note */}
          <div className="pt-2 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-400">
              सुरक्षा नियम: केवल एक ही एडमिन रहेगा (पब्लिक साइन-अप बंद है)। नए डिवाइस में लॉगिन होते ही पिछला डिवाइस स्वतः लॉग आउट हो जाता है।
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
