export interface CoveredGasReceiptMeta {
  receiptNumber: string;
  gasName: string;
  csvMemberId: string;
  csvName: string;
  amount: number;
  realEmail?: string;
  phone?: string;
  stripStaffEmail?: string;
}

export const KNOWN_STAFF_PLACEHOLDER_EMAILS: readonly string[] = [
  'nagabapassion@gmail.com',
  'passionwork94@gmail.com',
  'jotham.itungo@gmail.com',
  'jotham.itubgo@gmail.com', // historical typo observed on SB-2026-00018
  'hildanamy7@gmail.com'
];

const KNOWN_STAFF_SET = new Set<string>(KNOWN_STAFF_PLACEHOLDER_EMAILS);

const STAFF_OWNER_NAME_KEYWORDS: Record<string, string[]> = {
  'nagabapassion@gmail.com': ['nagaba passion', 'passion'],
  'jotham.itungo@gmail.com': ['itungo jotham', 'jotham itungo', 'jotham barigye'],
  'jotham.itubgo@gmail.com': [], // always a typo
  'passionwork94@gmail.com': [], // PR role address, never a personal member email
  'hildanamy7@gmail.com': ['hilda']
};

/**
 * Normalizes a person's name for resilient alias matching (collapses whitespace,
 * strips punctuation, lowercases).
 */
export function normalizePersonName(name: unknown): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Removes Unicode bidi control marks (e.g. U+202A/U+202C around copied phone numbers)
 * and standardizes Uganda numbers to +2567xxxxxxxx for clean WhatsApp & SMS links.
 */
export function cleanPhoneNumber(raw: unknown): string {
  const stripped = String(raw || '')
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .trim();
  if (!stripped) return '';

  const compact = stripped.replace(/[\s()-]/g, '');
  if (/^\+2567\d{8}$/.test(compact)) return compact;
  if (/^2567\d{8}$/.test(compact)) return `+${compact}`;
  if (/^07\d{8}$/.test(compact)) return `+256${compact.slice(1)}`;
  if (/^7\d{8}$/.test(compact)) return `+256${compact}`;
  if (/^\+\d{8,15}$/.test(compact)) return compact;
  return stripped;
}

/**
 * Checks if an email is empty, malformed, synthetic placeholder, or a staff/issuer email
 * accidentally typed in place of a payer's email.
 */
export function isStaffOrPlaceholderEmail(
  email: unknown,
  payerName?: unknown,
  extraStaffEmails?: Iterable<string>
): boolean {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean) return true;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return true;
  if (
    clean.includes('no-reply') ||
    clean.includes('noreply') ||
    clean.includes('whatsapp.direct')
  ) {
    return true;
  }

  const allStaff = new Set<string>(KNOWN_STAFF_SET);
  if (extraStaffEmails) {
    for (const s of extraStaffEmails) {
      const se = String(s || '').trim().toLowerCase();
      if (se) allStaff.add(se);
    }
  }

  if (!allStaff.has(clean)) {
    return false;
  }

  // If no payerName is specified (e.g. member profile update or direct check), staff email is valid
  if (!payerName) {
    return false;
  }

  const normPayer = normalizePersonName(payerName);
  const allowedOwners = STAFF_OWNER_NAME_KEYWORDS[clean] || [];
  if (
    normPayer &&
    allowedOwners.some(
      ownerKw => normPayer === ownerKw || (ownerKw.length >= 8 && normPayer.includes(ownerKw))
    )
  ) {
    return false;
  }

  return true;
}

/**
 * Exact live GAS receipts (SB-2026-*) that were already included in the uploaded
 * Mission NLL Season XVII Treasury CSV (8,385,000 UGX).
 * Excluding these 38 rows from live sum prevents double-counting 629,000 UGX,
 * while harvesting their 9 genuine member emails and 38 phone numbers.
 */
export const PRE_CSV_COVERED_GAS_RECEIPTS: readonly CoveredGasReceiptMeta[] = [
  { receiptNumber: 'SB-2026-00004', gasName: 'Atweta Ben', csvMemberId: 'SB-M-0098', csvName: 'Atweeta Ben', amount: 50000, realEmail: 'benatweta45@gmail.com', phone: '+256707520699' },
  { receiptNumber: 'SB-2026-00005', gasName: 'Namitala Goldie', csvMemberId: 'SB-M-0206', csvName: 'Namitala Goldie', amount: 50000, realEmail: 'namitalagoldie@gmail.com', phone: '+256780229482' },
  { receiptNumber: 'SB-2026-00006', gasName: 'Atwiine Gift', csvMemberId: 'SB-M-0101', csvName: 'Atwiine Gift', amount: 8000, realEmail: 'giftatwiine256@gmail.com', phone: '+256752818144' },
  { receiptNumber: 'SB-2026-00007', gasName: 'Asingwire Willis Junior', csvMemberId: 'SB-M-0089', csvName: 'Asingwire Willis Junior', amount: 5000, realEmail: 'asingwirewillisjunior@gmail.com', phone: '+256774669976' },
  { receiptNumber: 'SB-2026-00008', gasName: 'Tandeka Geofrey', csvMemberId: 'SB-M-0255', csvName: 'Tandeka Geoffrey', amount: 5000, realEmail: 'geofreytandeka66@gmail.com', phone: '+256781860280' },
  { receiptNumber: 'SB-2026-00009', gasName: 'Mark Matsiko', csvMemberId: 'SB-M-0159', csvName: 'Mark Matsiko', amount: 5000, realEmail: 'darrenug1111@gmail.com', phone: '+256709203211' },
  { receiptNumber: 'SB-2026-00010', gasName: 'Brason', csvMemberId: 'SB-M-0025', csvName: 'Ahamya Brason', amount: 5000, stripStaffEmail: 'passionwork94@gmail.com', phone: '+256705059374' },
  { receiptNumber: 'SB-2026-00012', gasName: 'Alvin Kamokya', csvMemberId: 'SB-M-0055', csvName: 'Alvin Kamokya', amount: 10000, stripStaffEmail: 'passionwork94@gmail.com', phone: '+256758346455' },
  { receiptNumber: 'SB-2026-00013', gasName: 'Ariho Rino Jeremiah', csvMemberId: 'SB-M-0071', csvName: 'Ariho Rino Jeremiah', amount: 6000, stripStaffEmail: 'passionwork94@gmail.com', phone: '+256700442386' },
  { receiptNumber: 'SB-2026-00014', gasName: 'Mirimo Watson', csvMemberId: 'SB-M-0169', csvName: 'Mirimo Watson', amount: 5000, stripStaffEmail: 'passionwork94@gmail.com', phone: '+256768860969' },
  { receiptNumber: 'SB-2026-00015', gasName: 'Shadrack Asiimwe', csvMemberId: 'SB-M-0087', csvName: 'Asiimwe Shadrack', amount: 5000, realEmail: 'shedrigar@gmail.com', phone: '+256706439691' },
  { receiptNumber: 'SB-2026-00017', gasName: 'Ankunda Sheila', csvMemberId: 'SB-M-0066', csvName: 'Ankunda Sheila', amount: 5000, stripStaffEmail: 'jotham.itungo@gmail.com', phone: '+256762269674' },
  { receiptNumber: 'SB-2026-00018', gasName: 'Reagan Lutakome', csvMemberId: 'SB-M-0155', csvName: 'Lutakome Reagan', amount: 5000, stripStaffEmail: 'jotham.itubgo@gmail.com', phone: '+256782430598' },
  { receiptNumber: 'SB-2026-00019', gasName: 'Ajak Achiek', csvMemberId: 'SB-M-0039', csvName: 'Ajak Achiek', amount: 85000, stripStaffEmail: 'jotham.itungo@gmail.com', phone: '+254113952273' },
  { receiptNumber: 'SB-2026-00020', gasName: 'Julian Kekihembo', csvMemberId: 'SB-M-0146', csvName: 'Kekihembo Julian', amount: 50000, stripStaffEmail: 'jotham.itungo@gmail.com', phone: '+256730975101' },
  { receiptNumber: 'SB-2026-00021', gasName: 'Danson Tugumisirize', csvMemberId: 'SB-M-0263', csvName: 'Tugume Danson', amount: 5000, stripStaffEmail: 'jotham.itungo@gmail.com', phone: '+256704317247' },
  { receiptNumber: 'SB-2026-00022', gasName: 'Ssenyange Eriya', csvMemberId: 'SB-M-0252', csvName: 'Ssenyange Eriya', amount: 20000, stripStaffEmail: 'nagabapassion@gmail.com', phone: '+256765005836' },
  { receiptNumber: 'SB-2026-00024', gasName: 'Muhereza Alvin', csvMemberId: 'SB-M-0172', csvName: 'Muhereza Alvin', amount: 10000, stripStaffEmail: 'nagabapassion@gmail.com', phone: '+256758346455' },
  { receiptNumber: 'SB-2026-00026', gasName: 'Eriya Mushaija', csvMemberId: 'SB-M-0183', csvName: 'Mushaija Elia', amount: 5000, stripStaffEmail: 'nagabapassion@gmail.com', phone: '+256780726421' },
  { receiptNumber: 'SB-2026-00028', gasName: 'Abaasa Precious', csvMemberId: 'SB-M-0003', csvName: 'Abaasa Precious', amount: 5000, stripStaffEmail: 'nagabapassion@gmail.com', phone: '+256762269674' },
  { receiptNumber: 'SB-2026-00030', gasName: 'Muhumuza Namanya Kalibala', csvMemberId: 'SB-M-0204', csvName: 'Namanya Kalibala', amount: 5000, stripStaffEmail: 'nagabapassion@gmail.com', phone: '+256785011163' },
  { receiptNumber: 'SB-2026-00032', gasName: 'Andrew Ainomugisha', csvMemberId: 'SB-M-0037', csvName: 'Ainomugisha Andrew', amount: 20000, stripStaffEmail: 'nagabapassion@gmail.com', phone: '+256759324117' },
  { receiptNumber: 'SB-2026-00033', gasName: 'Andrew Ainomugisha', csvMemberId: 'SB-M-0037', csvName: 'Ainomugisha Andrew', amount: 5000, stripStaffEmail: 'nagabapassion@gmail.com', phone: '+256759324117' },
  { receiptNumber: 'SB-2026-00035', gasName: 'Agaba Peter', csvMemberId: 'SB-M-0019', csvName: 'Agaba Peter', amount: 10000, stripStaffEmail: 'passionwork94@gmail.com', phone: '+256706168877' },
  { receiptNumber: 'SB-2026-00036', gasName: 'Agaba Paula', csvMemberId: 'SB-M-0018', csvName: 'Agaba Paula', amount: 10000, realEmail: 'agabapaula9@gmail.com', phone: '+256790913070' },
  { receiptNumber: 'SB-2026-00037', gasName: 'Ahumuza Keith', csvMemberId: 'SB-M-0029', csvName: 'Ahumuza Keith', amount: 10000, stripStaffEmail: 'passionwork94@gmail.com', phone: '+256789661858' },
  { receiptNumber: 'SB-2026-00038', gasName: 'Ahumuza Keith', csvMemberId: 'SB-M-0029', csvName: 'Ahumuza Keith', amount: 10000, stripStaffEmail: 'passionwork94@gmail.com', phone: '+256789661858' },
  { receiptNumber: 'SB-2026-00039', gasName: 'Joshua Byamugisha', csvMemberId: 'SB-M-0113', csvName: 'Byamugisha Joshua', amount: 10000, stripStaffEmail: 'nagabapassion@gmail.com', phone: '+256754250839' },
  { receiptNumber: 'SB-2026-00040', gasName: 'Natukunda Junior', csvMemberId: 'SB-M-0214', csvName: 'Natukunda Junior', amount: 50000, stripStaffEmail: 'passionwork94@gmail.com', phone: '+256760185879' },
  { receiptNumber: 'SB-2026-00042', gasName: 'Edward Mwanje', csvMemberId: 'SB-M-0194', csvName: 'Mwanje Edward', amount: 10000, stripStaffEmail: 'nagabapassion@gmail.com', phone: '+256709116835' },
  { receiptNumber: 'SB-2026-00043', gasName: 'Lynnford Mutabazi', csvMemberId: 'SB-M-0190', csvName: 'Mutabazi Lynnford', amount: 15000, stripStaffEmail: 'nagabapassion@gmail.com', phone: '+256776944825' },
  { receiptNumber: 'SB-2026-00045', gasName: 'Shukulu Bizimana', csvMemberId: 'SB-M-0249', csvName: 'Shukulu Bizimana', amount: 20000, realEmail: 'bizimanashukulu@gmail.com', phone: '+256771601701' },
  { receiptNumber: 'SB-2026-00049', gasName: 'Brian Muhwezi', csvMemberId: 'SB-M-0175', csvName: 'Muhwezi Brian', amount: 10000, stripStaffEmail: 'nagabapassion@gmail.com', phone: '+256791440828' },
  { receiptNumber: 'SB-2026-00054', gasName: 'Ariho Jeremiah Rino', csvMemberId: 'SB-M-0071', csvName: 'Ariho Rino Jeremiah', amount: 5000, stripStaffEmail: 'nagabapassion@gmail.com', phone: '+256700442386' },
  { receiptNumber: 'SB-2026-00055', gasName: 'Jonathan Naijuka', csvMemberId: 'SB-M-0203', csvName: 'Naijuka Jonathan', amount: 30000, stripStaffEmail: 'nagabapassion@gmail.com', phone: '+256704208050' },
  { receiptNumber: 'SB-2026-00056', gasName: 'Gen Enoth', csvMemberId: 'SB-M-0121', csvName: 'Enoth', amount: 25000, phone: '+256704047900' },
  { receiptNumber: 'SB-2026-00057', gasName: 'Isaiah Anyine', csvMemberId: 'SB-M-0068', csvName: 'Anyine Isaiah', amount: 10000, phone: '+256771254454' },
  { receiptNumber: 'SB-2026-00063', gasName: 'Jordan Taremwa', csvMemberId: 'SB-M-0256', csvName: 'Taremwa Jordan', amount: 30000, phone: '+256765888558' }
];

export const PRE_CSV_COVERED_RECEIPT_SET = new Set<string>(
  PRE_CSV_COVERED_GAS_RECEIPTS.map(r => r.receiptNumber.toUpperCase())
);

/**
 * Unrecorded live GAS receipts that are mathematically absent from or exceed the CSV row totals
 * (total = 156,000 UGX), so they remain active and are summed ONCE on top of 8,385,000 UGX.
 */
export interface UnrecordedGasMemberEnrichment {
  receiptNumber: string;
  gasName: string;
  targetCsvMemberId?: string;
  targetCanonicalName: string;
  amount: number;
  phone: string;
  stripStaffEmail?: string;
}

export const UNRECORDED_LIVE_GAS_RECEIPTS: readonly UnrecordedGasMemberEnrichment[] = [
  { receiptNumber: 'SB-2026-00011', gasName: 'Anglin Ankunda', targetCanonicalName: 'Anglin Ankunda', amount: 10000, phone: '+256708257078', stripStaffEmail: 'passionwork94@gmail.com' },
  { receiptNumber: 'SB-2026-00058', gasName: 'Armstrong Butaahobweishe', targetCanonicalName: 'Armstrong Butaahobweishe', amount: 30000, phone: '+256780184070', stripStaffEmail: 'nagabapassion@gmail.com' },
  { receiptNumber: 'SB-2026-00059', gasName: 'Grace Mpora', targetCsvMemberId: 'SB-M-0171', targetCanonicalName: 'Mpora Grace', amount: 20000, phone: '+256794037123', stripStaffEmail: 'nagabapassion@gmail.com' },
  { receiptNumber: 'SB-2026-00061', gasName: 'Ahumuza Martha Joy', targetCsvMemberId: 'SB-M-0162', targetCanonicalName: 'Martha Joy', amount: 30000, phone: '+256768145339' },
  { receiptNumber: 'SB-2026-00062', gasName: 'Mwesigwa Alvin', targetCsvMemberId: 'SB-M-0057', targetCanonicalName: 'Alvin Mwesigwa', amount: 25000, phone: '+256782410956' },
  { receiptNumber: 'SB-2026-00064', gasName: 'Atukunda Blessed Pearl', targetCanonicalName: 'Atukunda Blessed Pearl', amount: 30000, phone: '+256791342030' }
];

/**
 * Maps inverted / abbreviated / variant payer names from live receipts onto their
 * authoritative Member Directory canonical name.
 */
export const PAYER_NAME_ALIASES: Record<string, string> = {
  'atweta ben': 'atweeta ben',
  'tandeka geofrey': 'tandeka geoffrey',
  'brason': 'ahamya brason',
  'shadrack asiimwe': 'asiimwe shadrack',
  'reagan lutakome': 'lutakome reagan',
  'julian kekihembo': 'kekihembo julian',
  'danson tugumisirize': 'tugume danson',
  'eriya mushaija': 'mushaija elia',
  'muhumuza namanya kalibala': 'namanya kalibala',
  'andrew ainomugisha': 'ainomugisha andrew',
  'joshua byamugisha': 'byamugisha joshua',
  'edward mwanje': 'mwanje edward',
  'lynnford mutabazi': 'mutabazi lynnford',
  'brian muhwezi': 'muhwezi brian',
  'ariho jeremiah rino': 'ariho rino jeremiah',
  'jonathan naijuka': 'naijuka jonathan',
  'gen enoth': 'enoth',
  'isaiah anyine': 'anyine isaiah',
  'jordan taremwa': 'taremwa jordan',
  'grace mpora': 'mpora grace',
  'ahumuza martha joy': 'martha joy',
  'mwesigwa alvin': 'alvin mwesigwa'
};

export function resolveCanonicalMemberNameKey(rawName: unknown): string {
  const norm = normalizePersonName(rawName);
  return PAYER_NAME_ALIASES[norm] || norm;
}
