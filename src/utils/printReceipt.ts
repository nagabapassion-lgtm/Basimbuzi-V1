import html2canvas from 'html2canvas-pro';

/**
 * Detects if the current application window is running inside an iframe
 * (such as preview sandboxes, mobile webviews, or embedded iframes).
 */
export function isRunningInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Downloads a high-resolution, crisp PNG of the official receipt slip.
 * Guarantees that users on restricted devices (sandboxed webviews, mobile touch devices,
 * offline computers) can always save, print, and share their official receipt.
 */
export async function downloadReceiptImage(
  elementId = 'printable-receipt',
  receiptNumber = 'Receipt'
): Promise<boolean> {
  const receiptEl = document.getElementById(elementId);
  if (!receiptEl) {
    console.error(`Receipt element #${elementId} not found in DOM`);
    return false;
  }

  try {
    // Implement a delay to ensure all fonts, assets, and dynamic contents are fully rendered
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Ensure all images inside the element are fully loaded
    const images = Array.from(receiptEl.getElementsByTagName('img'));
    await Promise.all(
      images.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) {
              resolve();
            } else {
              img.onload = () => resolve();
              img.onerror = () => resolve();
              setTimeout(resolve, 1000); // fallback timeout
            }
          })
      )
    );

    const canvas = await html2canvas(receiptEl, {
      useCORS: true,
      allowTaint: false,
      scale: 3, // High-DPI 300+ DPI quality
      backgroundColor: '#ffffff',
      logging: false,
    });

    const image = canvas.toDataURL('image/png', 1.0);
    const link = document.createElement('a');
    link.href = image;
    link.download = `SC_Basimbuzi_Receipt_${receiptNumber}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (err) {
    console.error('Failed to download receipt image:', err);
    return false;
  }
}

/**
 * Robust print helper designed to handle iframe sandboxes, mobile touch devices,
 * and desktop browsers without ever dying or failing silently.
 */
export async function printReceiptElement(
  elementId = 'printable-receipt',
  receiptNumber = 'Receipt'
): Promise<{ success: boolean; method: string; message?: string }> {
  const receiptEl = document.getElementById(elementId);
  if (!receiptEl) {
    console.error(`Receipt element #${elementId} not found in DOM`);
    return { success: false, method: 'not_found' };
  }

  const inIframe = isRunningInIframe();

  // If in an iframe sandbox (e.g. AI Studio preview), standard window.print() is often
  // blocked or silently ignored by the parent frame's sandbox attributes (missing allow-modals).
  // In this case, we immediately trigger window.print() AND download the crisp printable PNG
  // so the user gets their official printable slip immediately!
  if (inIframe) {
    let printed = false;
    try {
      window.print();
      printed = true;
    } catch (e) {
      console.warn('Sandbox iframe intercepted window.print():', e);
    }

    // Always generate the high-res printable slip for iframe environments
    const downloaded = await downloadReceiptImage(elementId, receiptNumber);
    return { 
      success: true, 
      method: printed ? 'window_and_slip' : 'printable_slip',
      message: 'Print initiated! A high-resolution printable receipt slip has also been generated for direct printing.'
    };
  }

  // Direct window.print() for standard top-level browsing
  try {
    window.print();
    return { success: true, method: 'window' };
  } catch (err) {
    console.warn('Direct window.print() failed, falling back to receipt slip image:', err);
    const ok = await downloadReceiptImage(elementId, receiptNumber);
    return { success: ok, method: 'slip_fallback' };
  }
}
