import html2canvas from 'html2canvas';
import { Transaction, AppSettings } from '../types';

/**
 * Format phone number for international WhatsApp messaging
 * Defaults to Uganda (+256) if standard 9/10 digit local format
 */
export function formatWhatsAppPhoneNumber(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  // If starts with 0 (e.g. 0772123456)
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '256' + cleaned.substring(1);
  }

  // If starts with 7 without country code (e.g. 772123456 - 9 digits)
  if (cleaned.startsWith('7') && cleaned.length === 9) {
    cleaned = '256' + cleaned;
  }

  return cleaned;
}

/**
 * Generate a professional receipt text message for WhatsApp
 */
export function generateWhatsAppMessage(tx: Transaction, settings: AppSettings): string {
  const orgName = (settings.organizationName || 'SC Basimbuzi').toUpperCase();
  const formattedAmount = `${Number(tx.amount).toLocaleString()} UGX`;

  return (
    `*${orgName} - OFFICIAL RECEIPT*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Hello *${tx.payerName}*,\n\n` +
    `Your payment of *${formattedAmount}* has been successfully received and recorded.\n\n` +
    `📄 *Receipt No:* ${tx.receiptNumber}\n` +
    `📅 *Date:* ${tx.date} (${tx.time})\n` +
    `🏷️ *Purpose:* ${tx.paymentPurpose}\n` +
    `💳 *Method:* ${tx.paymentMethod}\n` +
    (tx.paymentReference ? `🔢 *Reference:* ${tx.paymentReference}\n` : '') +
    `👤 *Issued By:* ${tx.generatedBy}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${settings.receiptFooter || 'Thank you for your payment and support.'}\n\n` +
    (settings.organizationPhone ? `📞 Tel: ${settings.organizationPhone}\n` : '') +
    (settings.organizationEmail ? `✉️ Email: ${settings.organizationEmail}\n` : '') +
    `_Official digital receipt attached above._`
  );
}

/**
 * Generate a pristine, high-resolution official receipt image for WhatsApp/Downloads
 */
export async function renderReceiptToImage(
  receipt: Transaction, 
  settings: AppSettings
): Promise<{
  blob: Blob;
  dataUrl: string;
  file: File;
}> {
  // Create isolated pure-white container for pixel-perfect rendering
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-9999px';
  container.style.left = '-9999px';
  container.style.width = '600px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#0f172a';
  container.style.fontFamily = '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  container.style.padding = '32px';
  container.style.boxSizing = 'border-box';
  container.style.zIndex = '-9999';

  const orgName = settings.organizationName || 'SC Basimbuzi';
  const orgEmail = settings.organizationEmail || 'info@scbasimbuzi.org';
  const orgPhone = settings.organizationPhone || '+256 700 123456';
  const orgAddress = settings.organizationAddress || 'Lugogo Bypass, Kampala, Uganda';
  const formattedAmount = `${Number(receipt.amount).toLocaleString()} UGX`;
  const logoHtml = settings.logoUrl
    ? `<img src="${settings.logoUrl}" alt="${orgName}" style="height: 48px; max-width: 140px; object-fit: contain; margin-bottom: 8px;" crossOrigin="anonymous" />`
    : `<div style="display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; background-color: #2563eb; color: #ffffff; font-weight: 900; font-size: 18px; border-radius: 12px; margin-bottom: 8px;">SB</div>`;

  container.innerHTML = `
    <div style="border: 2px solid #e2e8f0; border-radius: 20px; padding: 28px; background-color: #ffffff; box-shadow: 0 4px 20px rgba(0,0,0,0.04);">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 20px;">
        <div>
          ${logoHtml}
          <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">${orgName}</h1>
          <p style="margin: 2px 0 0 0; font-size: 11px; color: #64748b;">${orgAddress}</p>
          <p style="margin: 2px 0 0 0; font-size: 11px; color: #64748b;">${orgEmail} | ${orgPhone}</p>
        </div>
        <div style="text-align: right;">
          <span style="display: inline-block; background-color: #eff6ff; color: #1d4ed8; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; border: 1px solid #bfdbfe;">
            Official Receipt
          </span>
          <div style="font-family: monospace; font-size: 14px; font-weight: 700; color: #0f172a;">${receipt.receiptNumber}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${receipt.date} &bull; ${receipt.time}</div>
        </div>
      </div>

      <!-- Amount Highlight Banner -->
      <div style="background: linear-gradient(135deg, #1e40af, #2563eb); border-radius: 16px; padding: 20px 24px; color: #ffffff; display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <div>
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #bfdbfe;">Amount Paid</div>
          <div style="font-size: 26px; font-weight: 900; margin-top: 2px; letter-spacing: -0.5px;">${formattedAmount}</div>
        </div>
        <div style="text-align: right;">
          <span style="display: inline-block; background-color: #10b981; color: #ffffff; font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px;">
            Payment Completed
          </span>
        </div>
      </div>

      <!-- Payer & Payment Details -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px;">
          <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">Received From</div>
          <div style="font-size: 14px; font-weight: 700; color: #0f172a;">${receipt.payerName}</div>
          <div style="font-size: 11px; color: #475569; margin-top: 2px;">${receipt.phone || 'No phone provided'}</div>
          <div style="font-size: 11px; color: #475569; margin-top: 1px;">${receipt.email}</div>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px;">
          <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">Payment Information</div>
          <div style="font-size: 12px; font-weight: 600; color: #0f172a;"><span style="color: #64748b; font-weight: normal;">Purpose:</span> ${receipt.paymentPurpose}</div>
          <div style="font-size: 12px; font-weight: 600; color: #0f172a; margin-top: 3px;"><span style="color: #64748b; font-weight: normal;">Method:</span> ${receipt.paymentMethod}</div>
          ${receipt.paymentReference ? `<div style="font-size: 12px; font-weight: 600; color: #0f172a; margin-top: 3px;"><span style="color: #64748b; font-weight: normal;">Ref:</span> <span style="font-family: monospace;">${receipt.paymentReference}</span></div>` : ''}
        </div>
      </div>

      <!-- Verification Footer -->
      <div style="border-top: 1px dashed #cbd5e1; padding-top: 16px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 11px; font-weight: 600; color: #334155;">Issued by: ${receipt.generatedBy}</div>
          <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">${settings.receiptFooter || 'Thank you for your payment and support.'}</div>
        </div>
        <div style="text-align: right;">
          <div style="display: inline-flex; align-items: center; gap: 4px; background-color: #ecfdf5; border: 1px solid #a7f3d0; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #065f46;">
            <span>VERIFIED DIGITAL LEDGER</span>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: 600
    });

    const dataUrl = canvas.toDataURL('image/png', 1.0);

    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to generate receipt image.'));
          return;
        }
        const file = new File([blob], `Receipt-${receipt.receiptNumber}.png`, { type: 'image/png' });
        resolve({ blob, dataUrl, file });
      }, 'image/png', 1.0);
    });
  } catch (err) {
    // Fallback: 2D Canvas Drawing
    console.warn('html2canvas render error, using Canvas 2D fallback:', err);
    return createReceiptImageCanvas2D(receipt, settings);
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}

/**
 * High-performance Canvas 2D fallback renderer (100% reliable in all environments)
 */
function createReceiptImageCanvas2D(
  receipt: Transaction, 
  settings: AppSettings
): Promise<{ blob: Blob; dataUrl: string; file: File }> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas context not available'));
      return;
    }

    // White Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1200, 800);

    // Border Card
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 4;
    ctx.strokeRect(40, 40, 1120, 720);

    // Blue Top Banner
    ctx.fillStyle = '#1e40af';
    ctx.fillRect(80, 80, 1040, 160);

    // Header Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText(settings.organizationName || 'SC BASIMBUZI', 110, 140);
    ctx.font = '20px sans-serif';
    ctx.fillStyle = '#bfdbfe';
    ctx.fillText('OFFICIAL DIGITAL PAYMENT RECEIPT', 110, 180);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(receipt.receiptNumber, 1080, 140);
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#bfdbfe';
    ctx.fillText(`${receipt.date} ${receipt.time}`, 1080, 180);
    ctx.textAlign = 'left';

    // Amount Box
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(80, 270, 1040, 120);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.strokeRect(80, 270, 1040, 120);

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('AMOUNT RECEIVED', 110, 310);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(`${Number(receipt.amount).toLocaleString()} UGX`, 110, 365);

    // Status Pill
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.roundRect(900, 305, 180, 50, [25]);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('COMPLETED', 990, 337);
    ctx.textAlign = 'left';

    // Payer Info Box
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(80, 420, 500, 200);
    ctx.strokeRect(80, 420, 500, 200);
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('RECEIVED FROM', 110, 460);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(receipt.payerName, 110, 500);
    ctx.fillStyle = '#475569';
    ctx.font = '18px sans-serif';
    ctx.fillText(receipt.phone || 'Phone: N/A', 110, 540);
    ctx.fillText(receipt.email, 110, 575);

    // Purpose & Method Box
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(620, 420, 500, 200);
    ctx.strokeRect(620, 420, 500, 200);
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('PAYMENT DETAILS', 650, 460);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`Purpose: ${receipt.paymentPurpose}`, 650, 500);
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText(`Method: ${receipt.paymentMethod}`, 650, 540);
    if (receipt.paymentReference) {
      ctx.fillText(`Ref: ${receipt.paymentReference}`, 650, 575);
    }

    // Footer
    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px sans-serif';
    ctx.fillText(`Issued by: ${receipt.generatedBy} | ${settings.receiptFooter || 'Thank you for your payment.'}`, 80, 680);

    const dataUrl = canvas.toDataURL('image/png', 1.0);
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas to blob failed'));
        return;
      }
      const file = new File([blob], `Receipt-${receipt.receiptNumber}.png`, { type: 'image/png' });
      resolve({ blob, dataUrl, file });
    }, 'image/png', 1.0);
  });
}

/**
 * Capture an HTML receipt element into a high-definition PNG image blob (fallback helper)
 */
export async function captureReceiptAsImage(element: HTMLElement): Promise<{
  blob: Blob;
  dataUrl: string;
  file: File;
}> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false
  });

  const dataUrl = canvas.toDataURL('image/png', 1.0);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to generate receipt image.'));
        return;
      }
      const file = new File([blob], `Receipt-${Date.now()}.png`, { type: 'image/png' });
      resolve({ blob, dataUrl, file });
    }, 'image/png', 1.0);
  });
}

/**
 * Copy image directly to system clipboard (supported in Chrome/Edge/Safari)
 */
export async function copyReceiptImageToClipboard(blob: Blob): Promise<boolean> {
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const item = new ClipboardItem({ 'image/png': blob });
      await navigator.clipboard.write([item]);
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Clipboard copy failed:', err);
    return false;
  }
}

/**
 * Trigger browser download of the receipt image
 */
export function downloadReceiptImage(blob: Blob, receiptNumber: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Receipt_${receiptNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Open WhatsApp chat with prefilled text message
 */
export function openWhatsAppChat(phone: string, message: string): void {
  const cleanPhone = formatWhatsAppPhoneNumber(phone);
  const encodedText = encodeURIComponent(message);
  
  if (cleanPhone) {
    window.open(`https://wa.me/${cleanPhone}?text=${encodedText}`, '_blank', 'noopener,noreferrer');
  } else {
    window.open(`https://api.whatsapp.com/send?text=${encodedText}`, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Attempt Native Web Share with image file & message (iOS/Android WhatsApp integration)
 */
export async function shareReceiptViaWebShare(
  file: File,
  message: string,
  receiptNumber: string
): Promise<boolean> {
  if (navigator.share) {
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Receipt #${receiptNumber}`,
          text: message
        });
        return true;
      }
    } catch (err) {
      // User cancelled or share dismissed
      console.warn('Native share dismissed or not supported:', err);
    }
  }
  return false;
}
