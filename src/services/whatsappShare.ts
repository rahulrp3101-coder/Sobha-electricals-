import { Invoice, CompanyProfile, Party } from '../types';
import { formatINR } from './gstCalculator';

/**
 * Builds UPI payment deep link
 */
export function buildUPILink(upiId: string, payeeName: string, amount: number, invoiceNumber: string): string {
  const cleanUpi = encodeURIComponent(upiId.trim());
  const cleanName = encodeURIComponent(payeeName.trim());
  const cleanNote = encodeURIComponent(`Bill ${invoiceNumber}`);
  return `upi://pay?pa=${cleanUpi}&pn=${cleanName}&am=${amount.toFixed(2)}&cu=INR&tn=${cleanNote}`;
}

/**
 * Generates WhatsApp Invoice Share URL
 */
export function generateWhatsAppInvoiceURL(invoice: Invoice, company: CompanyProfile): string {
  const upiLink = company.upiId 
    ? buildUPILink(company.upiId, company.name, invoice.balanceAmount > 0 ? invoice.balanceAmount : invoice.grandTotal, invoice.invoiceNumber)
    : '';

  const lines = [
    `*TAX INVOICE - ${company.name}*`,
    `Invoice No: *${invoice.invoiceNumber}*`,
    `Date: ${invoice.date}`,
    `Customer: ${invoice.partyName}`,
    `--------------------------------`,
    `*Items Summary:*`,
    ...invoice.items.map((i, idx) => `${idx + 1}. ${i.itemName} (x${i.quantity}) - ${formatINR(i.totalAmount)}`),
    `--------------------------------`,
    `Subtotal: ${formatINR(invoice.subTotal)}`,
    invoice.totalTax > 0 ? `GST Tax: ${formatINR(invoice.totalTax)}` : '',
    `*Grand Total: ${formatINR(invoice.grandTotal)}*`,
    `Received: ${formatINR(invoice.receivedAmount)}`,
    invoice.balanceAmount > 0 ? `*Balance Due: ${formatINR(invoice.balanceAmount)}*` : `*Status: FULLY PAID*`,
  ].filter(Boolean);

  if (invoice.balanceAmount > 0 && company.upiId) {
    lines.push(
      `--------------------------------`,
      `💳 *Quick UPI Payment Link:*`,
      upiLink,
      `UPI ID: ${company.upiId}`,
      `Bank: ${company.bankName} | A/C: ${company.bankAccountNo} | IFSC: ${company.bankIfsc}`
    );
  }

  lines.push(
    `--------------------------------`,
    `Thank you for your business! 🙏`
  );

  const cleanPhone = (invoice.partyPhone || '').replace(/\D/g, '');
  const phoneParam = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  const encodedText = encodeURIComponent(lines.join('\n'));

  return phoneParam ? `https://api.whatsapp.com/send?phone=${phoneParam}&text=${encodedText}` : `https://api.whatsapp.com/send?text=${encodedText}`;
}

/**
 * Generates WhatsApp Payment Reminder for Khata Ledger
 */
export function generateWhatsAppKhataReminderURL(party: Party, company: CompanyProfile): string {
  const balance = Math.abs(party.currentBalance);
  const upiLink = company.upiId 
    ? buildUPILink(company.upiId, company.name, balance, 'Khata Dues')
    : '';

  const lines = [
    `*Payment Reminder - ${company.name}*`,
    `Dear ${party.name},`,
    ``,
    `This is a gentle reminder regarding your outstanding balance of *${formatINR(balance)}* with *${company.name}*.`,
    ``,
    `Kindly settle the pending dues at your earliest convenience.`,
    ``,
  ];

  if (company.upiId) {
    lines.push(
      `💳 *Click to Pay directly via UPI:*`,
      upiLink,
      ``,
      `UPI ID: *${company.upiId}*`,
      `Bank Details:`,
      `Bank: ${company.bankName}`,
      `A/C No: ${company.bankAccountNo}`,
      `IFSC: ${company.bankIfsc}`,
      ``
    );
  }

  lines.push(
    `If you have already made the payment, kindly ignore this message.`,
    `For any query, contact us at ${company.phone}.`,
    `Thank you!`
  );

  const cleanPhone = (party.phone || '').replace(/\D/g, '');
  const phoneParam = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  const encodedText = encodeURIComponent(lines.join('\n'));

  return phoneParam ? `https://api.whatsapp.com/send?phone=${phoneParam}&text=${encodedText}` : `https://api.whatsapp.com/send?text=${encodedText}`;
}

/**
 * Generates Email Bill link
 */
export function generateEmailInvoiceMailto(invoice: Invoice, company: CompanyProfile): string {
  const subject = encodeURIComponent(`Tax Invoice ${invoice.invoiceNumber} from ${company.name}`);
  const body = encodeURIComponent(
    `Dear ${invoice.partyName},\n\nPlease find the invoice summary below:\nInvoice: ${invoice.invoiceNumber}\nDate: ${invoice.date}\nAmount: ${formatINR(invoice.grandTotal)}\nBalance Due: ${formatINR(invoice.balanceAmount)}\n\nThank you for shopping with ${company.name}!`
  );
  return `mailto:${invoice.partyAddress || ''}?subject=${subject}&body=${body}`;
}
