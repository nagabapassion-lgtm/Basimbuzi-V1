/**
 * Security and Data Validation Utilities for SC Basimbuzi Receipt System
 */

/**
 * Escapes HTML special characters to prevent XSS and template injection
 * in generated emails, receipts, and user interfaces.
 */
export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Validates an email address against standard RFC-compliant patterns
 */
export function isValidEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length > 254) return false;
  const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return regex.test(trimmed);
}

/**
 * Validates telephone numbers (supports Ugandan formats: +256..., 07..., 03... as well as international)
 */
export function isValidPhone(phone: unknown): boolean {
  if (!phone) return true; // Optional field
  if (typeof phone !== 'string') return false;
  const trimmed = phone.trim();
  if (trimmed === '') return true;
  // Must only contain digits, plus sign, spaces, hyphens, periods, or parentheses
  if (!/^[+]?[-. ()0-9]+$/.test(trimmed)) return false;
  // Must have between 7 and 15 digits (ITU-T E.164 international standard)
  const digitsOnly = trimmed.replace(/\D/g, '');
  return digitsOnly.length >= 7 && digitsOnly.length <= 15;
}

/**
 * Validates a payment amount: must be positive number within realistic range
 */
export function isValidAmount(amount: unknown): boolean {
  const num = Number(amount);
  if (isNaN(num)) return false;
  // SC Basimbuzi uses UGX. Minimum 100 UGX, Maximum 10,000,000,000 UGX
  return num > 0 && num <= 10_000_000_000 && Number.isFinite(num);
}

/**
 * Validates receipt number format: PREFIX-YYYY-00001
 */
export function isValidReceiptNumber(receiptNum: unknown, expectedPrefix: string = 'SB'): boolean {
  if (typeof receiptNum !== 'string') return false;
  const regex = new RegExp(`^${expectedPrefix}-\\d{4}-\\d{5}$`, 'i');
  return regex.test(receiptNum.trim());
}

/**
 * Validates a Google Apps Script Web App URL
 */
export function isValidGasUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return true; // Empty is valid (disconnected)
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(\?.*)?$/.test(trimmed);
}
