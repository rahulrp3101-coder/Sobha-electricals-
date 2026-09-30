/**
 * Thermal Print Engine - ESC/POS Raw Binary Generator & Hardware Web APIs
 * Supports:
 * - 58mm (2-inch / 32 cols) and 80mm (3-inch / 48 cols) layout formatting
 * - Web Bluetooth API (BLE Thermal POS printers)
 * - Web Serial API (USB ESC/POS receipt printers)
 * - Native browser window.print() dialog with @media print styling
 */

import { Invoice, CompanyProfile } from '../types';
import { formatINR } from './gstCalculator';

export interface PrinterDeviceStatus {
  connected: boolean;
  type: 'BLUETOOTH' | 'SERIAL' | 'NONE';
  deviceName?: string;
}

export class ThermalPrinterEngine {
  private bluetoothDevice: any = null;
  private serialPort: any = null;
  private printCharacteristic: any = null;

  /**
   * Generates raw ESC/POS binary byte array for an invoice
   */
  public generateEscPosBytes(invoice: Invoice, company: CompanyProfile, paperWidth: '58mm' | '80mm' = '80mm'): Uint8Array {
    const cols = paperWidth === '58mm' ? 32 : 48;
    const bytes: number[] = [];

    const append = (...b: number[]) => bytes.push(...b);
    const appendText = (text: string) => {
      for (let i = 0; i < text.length; i++) {
        bytes.push(text.charCodeAt(i));
      }
    };
    const appendLine = (text: string = '') => {
      appendText(text + '\n');
    };

    // ESC @ : Initialize printer
    append(0x1b, 0x40);

    // ESC a 1 : Align Center
    append(0x1b, 0x61, 0x01);

    // ESC ! 0x30 : Double Height + Double Width (Store Name)
    append(0x1b, 0x21, 0x30);
    appendLine(company.name);

    // ESC ! 0x00 : Normal Text
    append(0x1b, 0x21, 0x00);
    appendLine(company.address);
    appendLine(`${company.city} - ${company.pincode}`);
    appendLine(`Phone: ${company.phone}`);
    if (company.gstin) {
      appendLine(`GSTIN: ${company.gstin}`);
    }

    // Divider
    appendLine('-'.repeat(cols));

    // ESC a 0 : Align Left
    append(0x1b, 0x61, 0x00);
    appendLine(`INVOICE: ${invoice.invoiceNumber}`);
    appendLine(`Date: ${invoice.date}   Mode: ${invoice.paymentMode}`);
    appendLine(`Customer: ${invoice.partyName}`);
    if (invoice.partyPhone && invoice.partyPhone !== '9999999999') {
      appendLine(`Phone: ${invoice.partyPhone}`);
    }
    if (invoice.partyGstin) {
      appendLine(`GSTIN: ${invoice.partyGstin}`);
    }

    // Items Table Header
    appendLine('-'.repeat(cols));
    if (paperWidth === '58mm') {
      // 32 columns format: Item (16) Qty (4) Total (10)
      appendLine('Item             Qty     Total');
    } else {
      // 48 columns format: Item (22) Rate (8) Qty (6) Total (10)
      appendLine('Item                   Rate    Qty      Total');
    }
    appendLine('-'.repeat(cols));

    // Items rows
    for (const item of invoice.items) {
      if (paperWidth === '58mm') {
        const name = item.itemName.length > 15 ? item.itemName.substring(0, 15) : item.itemName.padEnd(16, ' ');
        const qty = item.quantity.toString().padStart(4, ' ');
        const amt = item.totalAmount.toFixed(2).padStart(10, ' ');
        appendLine(`${name}${qty}${amt}`);
      } else {
        const name = item.itemName.length > 21 ? item.itemName.substring(0, 21) : item.itemName.padEnd(22, ' ');
        const rate = item.unitPrice.toFixed(2).padStart(8, ' ');
        const qty = item.quantity.toString().padStart(6, ' ');
        const amt = item.totalAmount.toFixed(2).padStart(10, ' ');
        appendLine(`${name}${rate}${qty}${amt}`);
      }
    }

    appendLine('-'.repeat(cols));

    // Totals Section (Align Right)
    append(0x1b, 0x61, 0x02);
    appendLine(`Subtotal: Rs. ${invoice.subTotal.toFixed(2)}`);
    if (invoice.totalDiscount > 0) {
      appendLine(`Discount: (-) Rs. ${invoice.totalDiscount.toFixed(2)}`);
    }
    if (invoice.totalCgst > 0) {
      appendLine(`CGST: Rs. ${invoice.totalCgst.toFixed(2)}`);
      appendLine(`SGST: Rs. ${invoice.totalSgst.toFixed(2)}`);
    }
    if (invoice.totalIgst > 0) {
      appendLine(`IGST: Rs. ${invoice.totalIgst.toFixed(2)}`);
    }
    if (invoice.roundOff !== 0) {
      appendLine(`Round Off: ${invoice.roundOff > 0 ? '+' : ''}Rs. ${invoice.roundOff.toFixed(2)}`);
    }

    // ESC ! 0x20 : Double Width Grand Total
    append(0x1b, 0x21, 0x20);
    append(0x1b, 0x45, 0x01); // Bold On
    appendLine(`GRAND TOTAL: Rs. ${invoice.grandTotal.toFixed(2)}`);
    append(0x1b, 0x45, 0x00); // Bold Off
    append(0x1b, 0x21, 0x00); // Reset

    appendLine(`Received: Rs. ${invoice.receivedAmount.toFixed(2)}`);
    if (invoice.balanceAmount > 0) {
      appendLine(`Balance Due: Rs. ${invoice.balanceAmount.toFixed(2)}`);
    }

    // Footer Greeting
    append(0x1b, 0x61, 0x01); // Center
    appendLine('-'.repeat(cols));
    appendLine('Thank you for your business!');
    if (company.upiId) {
      appendLine(`UPI Pay: ${company.upiId}`);
    }
    appendLine('Powered by Vyapar Pro PWA');
    appendLine('\n\n\n');

    // GS V 65 3 : Paper Cut
    append(0x1d, 0x56, 0x41, 0x03);

    return new Uint8Array(bytes);
  }

  /**
   * Connect to thermal printer via Web Bluetooth API
   */
  public async connectBluetooth(): Promise<{ success: boolean; deviceName?: string; error?: string }> {
    if (!('bluetooth' in navigator)) {
      return { success: false, error: 'Web Bluetooth API is not supported in this browser. Please use Chrome/Edge on Desktop/Android.' };
    }

    try {
      // Common thermal printer BLE service UUIDs
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb', // Standard POS Printer Service
          '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent
          '0000e0ff-0000-1000-8000-00805f9b34fb',
          '0000ff00-0000-1000-8000-00805f9b34fb',
        ],
      });

      const server = await device.gatt.connect();
      const services = await server.getPrimaryServices();
      
      let targetChar: any = null;
      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            targetChar = char;
            break;
          }
        }
        if (targetChar) break;
      }

      if (!targetChar) {
        return { success: false, error: 'Connected to device, but no writable print characteristic found.' };
      }

      this.bluetoothDevice = device;
      this.printCharacteristic = targetChar;

      return { success: true, deviceName: device.name || 'Bluetooth Thermal Printer' };
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        return { success: false, error: 'Bluetooth scan cancelled by user.' };
      }
      return { success: false, error: err.message || 'Bluetooth connection failed.' };
    }
  }

  /**
   * Print via Web Bluetooth
   */
  public async printViaBluetooth(bytes: Uint8Array): Promise<{ success: boolean; error?: string }> {
    if (!this.printCharacteristic) {
      const conn = await this.connectBluetooth();
      if (!conn.success) return { success: false, error: conn.error };
    }

    try {
      // Send in chunks of 512 bytes to prevent GATT buffer overflow
      const chunkSize = 512;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.slice(i, i + chunkSize);
        if (this.printCharacteristic.writeValueWithoutResponse) {
          await this.printCharacteristic.writeValueWithoutResponse(chunk);
        } else {
          await this.printCharacteristic.writeValue(chunk);
        }
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to send data to Bluetooth printer.' };
    }
  }

  /**
   * Connect and print via Web Serial API (USB Thermal Printers)
   */
  public async printViaSerial(bytes: Uint8Array): Promise<{ success: boolean; error?: string }> {
    if (!('serial' in navigator)) {
      return { success: false, error: 'Web Serial API is not supported in this browser. Please use Chrome/Edge on Desktop.' };
    }

    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 9600 });
      const writer = port.writable.getWriter();
      await writer.write(bytes);
      writer.releaseLock();
      await port.close();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Serial communication failed.' };
    }
  }

  /**
   * Native browser print with styled template
   */
  public printBrowser(): void {
    window.print();
  }
}

export const thermalPrinter = new ThermalPrinterEngine();
