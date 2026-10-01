import QRCode from 'qrcode';

/**
 * Generates official NPCI-compliant UPI payment deep-link URL
 */
export function generateUpiPaymentUrl(
  upiId: string,
  payeeName: string,
  amount: number,
  invoiceNumber: string = ''
): string {
  const cleanUpi = (upiId || '').trim();
  const cleanName = (payeeName || 'Vyapar Pro Merchant').trim();
  const cleanAmount = Number(amount || 0).toFixed(2);
  const note = invoiceNumber ? `Bill ${invoiceNumber}` : 'Vyapar Pro Bill';

  // Format: upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...
  const params = new URLSearchParams({
    pa: cleanUpi,
    pn: cleanName,
    am: cleanAmount,
    cu: 'INR',
    tn: note,
  });

  return `upi://pay?${params.toString()}`;
}

/**
 * Generates high-resolution base64 PNG data URL of the Dynamic UPI QR Code
 */
export async function generateUpiQrDataUrl(
  upiId: string,
  payeeName: string,
  amount: number,
  invoiceNumber: string = '',
  size: number = 240
): Promise<string> {
  const upiUrl = generateUpiPaymentUrl(upiId, payeeName, amount, invoiceNumber);

  try {
    const dataUrl = await QRCode.toDataURL(upiUrl, {
      width: size,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    });
    return dataUrl;
  } catch (err) {
    console.error('Failed to generate QR code data URL:', err);
    // Return simple fallback SVG if qrcode generation fails
    return '';
  }
}
