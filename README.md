# Vyapar Pro - 100% Client-Owned Offline-First PWA

व्यापार प्रो (Vyapar Pro) एक आधुनिक, सुरक्षित और पूर्णतः **क्लाइंट-ओन्ड (Client-Owned Data)** बिलिंग, GST इनवॉइसिंग, इन्वेंट्री और उधारी खाता प्रबंधन वेब ऐप्लिकेशन (PWA) है।

---

## 🌟 मुख्य विशेषताएँ (Key Highlights)

- **100% Client-Owned Data:** दुकान का सारा डेटा ग्राहक के अपने डिवाइस (IndexedDB) और ग्राहक के निजी **Google Drive** में रहता है। कोई केंद्रीय सर्वर या डेवलपर का निजी डेटाबेस नहीं है।
- **Zero Developer Dependency:** ग्राहक को किसी डेवलपर या सर्वर रखरखाव की आवश्यकता नहीं है। Vercel पर एक बार डिप्लॉय होने के बाद यह हमेशा के लिए स्वतंत्र रूप से चलता है।
- **पूर्ण ऑफ़लाइन सहायता (Offline PWA):** इंटरनेट न होने पर भी बिल बनाएँ, स्टॉक अपडेट करें और खाता संभालें।
- **बारकोड स्कैनर व जनरेटर:** मोबाइल कैमरे से बारकोड स्कैन करें (ऑडियो बीप के साथ) या 1 सेकंड में 13-अंकों का GS1 India EAN बारकोड जनरेट करें।
- **ग्राहक का निजी Google Drive सिंक:** सेटिंग्स में केवल अपनी Gmail ID जोड़कर सीधे अपने Google Drive में बैकअप सुरक्षित रखें।
- **वन-क्लिक .JSON बैकअप व रीस्टोर:** संपूर्ण दुकान का डेटा एक क्लिक में डाउनलोड करें और किसी भी नए फोन या कंप्यूटर में 1 सेकंड में रीस्टोर करें।

---

## 🚀 Vercel पर 1-क्लिक डिप्लॉयमेंट (Deployment to Vercel)

यह प्रोजेक्ट Vercel पर डिप्लॉयमेंट के लिए पहले से ही पूरी तरह कंफिगर किया गया है (`vercel.json` रूट में मौजूद है)।

### चरण:
1. इस कोड को अपने **GitHub Repository** में पुश करें।
2. **[Vercel Dashboard](https://vercel.com/)** पर जाएँ और **"Add New Project"** चुनें।
3. अपनी GitHub रिपॉजिटरी को इम्पोर्ट करें।
4. Build Settings:
   - **Framework Preset:** Vite
   - **Build Command:** `vite build`
   - **Output Directory:** `dist`
5. **Deploy** पर क्लिक करें। 
6. आपका स्थायी लाइव लिंक (जैसे `https://vyapar-pro-xxx.vercel.app`) तैयार हो जाएगा!

---

## 🔑 डिफ़ॉल्ट एडमिन लॉगिन क्रेडेंशियल्स (Default Admin Login)

- **यूजरनेम:** `admin`
- **पासवर्ड:** `admin123`

> 💡 **सुरक्षा सलाह:** लॉगिन करने के बाद सेटिंग्स टैब (`दुकान सेटिंग्स & पासवर्ड`) में जाकर तुरंत अपना व्यक्तिगत पासवर्ड बदल लें।

---

## 📂 फ़ाइल संरचना (Clean Repository Architecture)

```
├── vercel.json                 # Vercel SPA Routing Configuration
├── package.json                # Dependencies & Build Scripts
├── vite.config.ts              # Vite & PWA Configuration
├── index.html                  # HTML5 Entry Point with Service Worker
├── src/
│   ├── App.tsx                 # Main React Root Component
│   ├── components/
│   │   ├── pos/                # POS & Vyapar Billing Workflow
│   │   ├── inventory/          # Inventory & Barcode Scanner
│   │   ├── parties/            # Customers / Suppliers Khata
│   │   ├── invoices/           # Invoices, A4 & Thermal 58mm/80mm Print
│   │   ├── settings/           # Shop Profile, Password, Google Drive, Backup
│   │   └── auth/               # Single Admin Authentication Screen
│   ├── db/
│   │   ├── indexedDB.ts        # Offline-First Browser Database
│   │   └── defaultData.ts      # Seed Data (Sample Items, Parties)
│   └── services/
│       ├── googleDriveStorage.ts # 100% Client-Owned Google Drive Sync
│       ├── backupService.ts      # One-Click JSON Backup & Restore
│       ├── soundEffects.ts       # Web Audio API Barcode Beep
│       └── gstCalculator.ts      # Real-time GST / HSN Engine
```

---

## 🔒 डेटा स्वामित्व और गोपनीयता (Privacy Guarantee)

- **डेटाबेस:** ब्राउज़र का सुरक्षित IndexedDB
- **क्लाउड बैकअप:** ग्राहक का अपना Google Drive
- **डेवलपर की भूमिका:** 0% (शून्य दखलंदाज़ी)
- **लाइसेंस:** MIT
