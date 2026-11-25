import { Member, MemberClaimInfo, MemberGender, MemberPaymentSummary, PublicSiteContent, SupporterInquiry } from '../types';
import { safeFetchJson, safeFetchMutation } from '../utils/apiFetch';

export interface PublicOrgProfile {
  organizationName: string;
  organizationEmail: string;
  organizationPhone: string;
  organizationAddress: string;
  logoUrl: string;
}

export interface PublicSitePayload {
  content: PublicSiteContent;
  organization: PublicOrgProfile;
}

export interface ReceiptVerificationResult {
  found: boolean;
  receiptNumber: string;
  date?: string;
  amount?: number;
  paymentStatus?: string;
  paymentPurpose?: string;
  paymentMethod?: string;
  paymentReference?: string;
  message: string;
}

export interface MemberAuthSession {
  token: string;
  member: {
    email: string;
    name: string;
  };
}

export const DEFAULT_PUBLIC_SITE_CONTENT: PublicSiteContent = {
  heroHeadline: 'Pride of the Community. Built on Unity and Football.',
  heroSubheadline:
    'Follow SC Basimbuzi matchday updates, club announcements, youth academy milestones, and official supporter membership across the season.',
  heroImageUrl: '/src/assets/images/hero_club_pitch_1795277918886.jpg',
  aboutTitle: 'Rooted in Passion, Driven by Discipline',
  aboutText:
    'SC Basimbuzi brings together senior squad competition, structured youth development, and an active supporter membership network. Every contribution and matchday turnout helps sustain training operations, equipment, and community football outreach.',
  clubFoundedYear: '2019',
  homeGround: 'Basimbuzi Community Ground',
  trainingSchedule: 'Tue, Thu & Sat · 4:00 PM EAT',
  membershipTargetLabel: '2026 Season Membership Contribution',
  membershipTargetUgx: 50000,
  news: [
    {
      id: 'news-1',
      title: 'First Team Opens Home Campaign With Commanding 3-1 Victory',
      category: 'Match Report',
      summary:
        'A disciplined second-half display and clinical counter-attacks sealed three vital points in front of a lively home crowd.',
      content:
        'SC Basimbuzi started the home fixture on the front foot, pressing high and controlling midfield possession from the opening whistle.\n\nAfter an even first thirty minutes, the breakthrough arrived from a sweeping wide move finished cleanly into the far corner. Two further goals after the interval put the result beyond doubt despite a late consolation from the visitors.\n\nHead Coach and technical staff praised the squad fitness and thanked supporters who turned out in full club colours.',
      coverImage: '/src/assets/images/news_matchday_action_1795277903178.jpg',
      author: 'SC Basimbuzi Media Desk',
      publishedAt: '2026-11-15',
      featured: true,
      status: 'PUBLISHED'
    },
    {
      id: 'news-2',
      title: 'Season Membership Registration & Youth Academy Intake Now Open',
      category: 'Club Notice',
      summary:
        'Supporters and prospective academy players can now submit membership inquiries online ahead of the upcoming tournament cycle.',
      content:
        'The club executive committee invites returning members, new supporters, and youth prospects to register for the current season.\n\nRegistered members enjoy priority matchday updates, official digital receipts for all club contributions, and direct participation in annual club meetings and community initiatives.\n\nUse the Join Club section below to submit your contact details and our Membership Coordinator will follow up promptly.',
      coverImage: '/src/assets/images/news_community_supporters_1795277904224.jpg',
      author: 'Club Secretariat',
      publishedAt: '2026-11-10',
      featured: false,
      status: 'PUBLISHED'
    },
    {
      id: 'news-3',
      title: 'Weekend Community Cup Brings Together Local Youth Squads',
      category: 'Community',
      summary:
        'Over 120 young players participated in Saturday morning clinics and exhibition matches hosted at Basimbuzi Community Ground.',
      content:
        'Our youth development coaches hosted an open community football morning aimed at identifying emerging talent and promoting sportsmanship.\n\nSupporters and parents gathered pitchside to cheer on the under-15 and under-17 exhibition fixtures, followed by a brief club briefing on upcoming fixtures and kit distribution.',
      coverImage: '/src/assets/images/news_matchday_action_1795277903178.jpg',
      author: 'Academy Outreach',
      publishedAt: '2026-11-04',
      featured: false,
      status: 'PUBLISHED'
    }
  ],
  fixtures: [
    {
      id: 'fix-1',
      opponent: 'Akachai FC',
      competition: 'Ntare Lions League',
      date: '2026-11-28',
      time: '16:00',
      venue: 'KPA',
      isHome: true,
      status: 'UPCOMING'
    },
    {
      id: 'fix-2',
      opponent: 'TY Omujuma',
      competition: 'NLL',
      date: '2026-12-05',
      time: '15:30',
      venue: 'Home grounds',
      isHome: false,
      status: 'UPCOMING'
    },
    {
      id: 'fix-3',
      opponent: 'Mpawa Lords',
      competition: 'Friendlies',
      date: '2026-11-15',
      time: '16:00',
      venue: 'Basimbuzi Community Ground',
      isHome: true,
      status: 'COMPLETED',
      homeScore: 3,
      awayScore: 4,
      summary: 'Strong second-half display with goals in the 38th, 61st, and 77th minutes.'
    },
    {
      id: 'fix-4',
      opponent: 'Akachai FC',
      competition: 'Friendlies',
      date: '2026-11-08',
      time: '16:00',
      venue: 'KPA',
      isHome: false,
      status: 'COMPLETED',
      homeScore: 0,
      awayScore: 5,
      summary: 'Crucial away victory secured with an 84th-minute winner.'
    }
  ],
  merch: [
    {
      id: 'merch-1',
      name: 'Official 2026 Preseason Jersey',
      priceUgx: 65000,
      description: 'Breathable royal blue matchday jersey with gold trim and woven SC Basimbuzi crest.',
      imageUrl: '/src/assets/images/merch_home_jersey_1795277903802.jpg',
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      inStock: true
    }
  ]
};

const PUBLIC_SITE_CACHE_KEY = 'scb_public_site_public_v1';
const ADMIN_SITE_CACHE_KEY = 'scb_public_site_admin_v1';

const parseValidTimestampMs = (raw?: string): number => {
  if (!raw || typeof raw !== 'string') return 0;
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return 0;
  const yr = Number(trimmed.slice(0, 4));
  if (yr < 2020 || yr > 2035) return 0;
  const ms = Date.parse(trimmed);
  return Number.isNaN(ms) ? 0 : ms;
};

const readCachedSiteFromStorage = (key: string): PublicSiteContent | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.news) && Array.isArray(parsed.fixtures)) {
      return parsed as PublicSiteContent;
    }
  } catch {}
  return null;
};

const writeCachedSiteToStorage = (content: PublicSiteContent, isAdminPayload: boolean) => {
  if (typeof window === 'undefined' || !content) return;
  try {
    const publishedOnly: PublicSiteContent = {
      ...content,
      news: (content.news || []).filter(n => n?.status === 'PUBLISHED')
    };
    window.localStorage.setItem(PUBLIC_SITE_CACHE_KEY, JSON.stringify(publishedOnly));
    if (isAdminPayload) {
      window.localStorage.setItem(ADMIN_SITE_CACHE_KEY, JSON.stringify(content));
    }
  } catch {}
};

export const publicSiteService = {
  getCachedPublicSite(includeDrafts: boolean = false): PublicSiteContent | null {
    if (includeDrafts) {
      return readCachedSiteFromStorage(ADMIN_SITE_CACHE_KEY) || readCachedSiteFromStorage(PUBLIC_SITE_CACHE_KEY);
    }
    return readCachedSiteFromStorage(PUBLIC_SITE_CACHE_KEY);
  },

  hasNewerLocalCacheThan(serverContent: PublicSiteContent, includeDrafts: boolean = false): boolean {
    const cached = this.getCachedPublicSite(includeDrafts);
    if (!cached) return false;
    const cachedTs = parseValidTimestampMs(cached.updatedAt);
    const serverTs = parseValidTimestampMs(serverContent?.updatedAt);
    return cachedTs > 0 && cachedTs > serverTs;
  },

  async fetchPublicSite(includeDrafts: boolean = false, operatorEmail?: string): Promise<PublicSitePayload & { restoredFromLocalCache?: boolean }> {
    const cached = this.getCachedPublicSite(includeDrafts);
    const defaultOrg: PublicOrgProfile = {
      organizationName: 'SC Basimbuzi',
      organizationEmail: 'info@scbasimbuzi.org',
      organizationPhone: '+256703643759',
      organizationAddress: 'Kampala, Uganda',
      logoUrl: '/logo.png'
    };

    try {
      const headers: Record<string, string> = {};
      if (includeDrafts && operatorEmail) {
        headers['X-Operator-Email'] = operatorEmail;
      }
      const url = includeDrafts ? '/api/public-site?mode=admin' : '/api/public-site';
      const json = await safeFetchJson<any>(url, { headers, cache: 'no-store' });
      if (json && json.success && json.data && json.data.content) {
        const serverPayload = json.data as PublicSitePayload;
        const serverTs = parseValidTimestampMs(serverPayload.content?.updatedAt);
        const cachedTs = parseValidTimestampMs(cached?.updatedAt);

        if (includeDrafts && cached && cachedTs > 0 && cachedTs > serverTs) {
          return {
            content: cached,
            organization: serverPayload.organization || defaultOrg,
            restoredFromLocalCache: true
          };
        }

        writeCachedSiteToStorage(serverPayload.content, includeDrafts);
        return serverPayload;
      }
    } catch {
      // Fallback to local cache or default seed content if offline
    }
    return {
      content: cached || DEFAULT_PUBLIC_SITE_CONTENT,
      organization: defaultOrg
    };
  },

  async savePublicSite(
    content: PublicSiteContent,
    operatorEmail: string
  ): Promise<{ success: boolean; data?: PublicSiteContent; error?: string; sheetsSynced?: boolean }> {
    const stampedContent: PublicSiteContent = {
      ...content,
      updatedAt: new Date().toISOString(),
      updatedBy: operatorEmail
    };
    const res = await safeFetchMutation('/api/public-site', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Operator-Email': operatorEmail
      },
      body: JSON.stringify({ content: stampedContent })
    });
    if (res && res.success && res.data) {
      writeCachedSiteToStorage(res.data as PublicSiteContent, true);
    }
    return res;
  },

  async submitInquiry(payload: {
    fullName: string;
    phone: string;
    email: string;
    interest: SupporterInquiry['interest'];
    message: string;
  }): Promise<{ success: boolean; error?: string }> {
    return safeFetchMutation('/api/public-inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },

  async fetchInquiries(operatorEmail: string): Promise<{ success: boolean; data?: SupporterInquiry[]; error?: string }> {
    const json = await safeFetchJson<any>('/api/public-inquiries', {
      headers: { 'X-Operator-Email': operatorEmail }
    });
    return json || { success: false, error: 'Static hosting mode or service unavailable' };
  },

  async updateInquiryStatus(
    id: string,
    status: 'NEW' | 'CONTACTED',
    operatorEmail: string
  ): Promise<{ success: boolean; data?: SupporterInquiry; error?: string }> {
    return safeFetchMutation(`/api/public-inquiries/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Operator-Email': operatorEmail
      },
      body: JSON.stringify({ status })
    });
  },

  async sendMemberLoginCode(email: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const res = await safeFetchMutation('/api/me/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    return res;
  },

  async verifyMemberLoginCode(
    email: string,
    code: string
  ): Promise<{ success: boolean; token?: string; member?: MemberAuthSession['member']; error?: string }> {
    const res = await safeFetchMutation('/api/me/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    });
    if (!res.success && res.error?.includes('unavailable')) {
      return { success: false, error: 'Member login requires the backend server.' };
    }
    return res;
  },

  async fetchMyPayments(token: string): Promise<MemberPaymentSummary & { unauthorized?: boolean }> {
    const json = await safeFetchJson<any>('/api/me/payments', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!json) {
      return {
        found: false,
        unauthorized: true,
        query: '',
        expectedTargetUgx: 0,
        totalPaidUgx: 0,
        pendingUgx: 0,
        remainingUgx: 0,
        progressPercent: 0,
        overallStatus: 'NOT_FOUND',
        payments: [],
        message: 'Backend session service unavailable.'
      };
    }
    return json;
  },

  async fetchClaimProfile(
    token: string
  ): Promise<{ success: boolean; data?: MemberClaimInfo; error?: string }> {
    const json = await safeFetchJson<any>(`/api/me/claim/${encodeURIComponent(token)}`);
    return json || { success: false, error: 'Unable to load profile claim link.' };
  },

  async submitClaimProfile(
    token: string,
    payload: {
      fullName: string;
      email: string;
      phone: string;
      address: string;
      gender?: MemberGender | '';
      school?: string;
      house?: string;
    }
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    return safeFetchMutation(`/api/me/claim/${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },

  async updateMyProfile(
    token: string,
    payload: {
      fullName: string;
      phone: string;
      address: string;
      gender?: MemberGender | '';
      school?: string;
      house?: string;
    }
  ): Promise<{ success: boolean; message?: string; data?: Member; error?: string; unauthorized?: boolean }> {
    const res = await safeFetchMutation('/api/me/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    return res;
  },

  async verifyMyReceipt(token: string, receiptNumber: string): Promise<ReceiptVerificationResult & { unauthorized?: boolean }> {
    const json = await safeFetchJson<any>('/api/me/verify-receipt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ receiptNumber })
    });
    if (!json) {
      return {
        found: false,
        receiptNumber,
        message: 'Unable to verify receipt in static hosting mode.'
      };
    }
    return json;
  },

  async uploadImage(
    file: File,
    operatorEmail: string
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
    const mime = file.type.toLowerCase();
    if (!allowedTypes.has(mime)) {
      return { success: false, error: 'Please choose a PNG, JPG, WEBP, or GIF photo.' };
    }
    if (file.size > 5 * 1024 * 1024) {
      return { success: false, error: 'Photo size must be 5 MB or smaller.' };
    }

    try {
      const readFileAsDataUrl = (target: File): Promise<string> =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('Could not read selected file.'));
          reader.readAsDataURL(target);
        });

      let dataUrl = await readFileAsDataUrl(file);

      // Compress non-GIF photos cleanly via Canvas so uploaded images embed durably inside
      // public_site.json & Google Sheets (~40-150 KB) without relying on ephemeral container disk
      if (mime !== 'image/gif' && typeof document !== 'undefined') {
        try {
          const compressed = await new Promise<string>((resolve) => {
            const img = new Image();
            img.onload = () => {
              const maxDim = 1280;
              const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
              const targetW = Math.max(1, Math.round((img.width || maxDim) * scale));
              const targetH = Math.max(1, Math.round((img.height || maxDim) * scale));
              const canvas = document.createElement('canvas');
              canvas.width = targetW;
              canvas.height = targetH;
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                resolve(dataUrl);
                return;
              }
              ctx.drawImage(img, 0, 0, targetW, targetH);
              let candidate = canvas.toDataURL('image/webp', 0.82);
              if (!candidate.startsWith('data:image/webp')) {
                candidate = canvas.toDataURL('image/jpeg', 0.82);
              }
              if (candidate.length > 600_000) {
                candidate = canvas.toDataURL('image/jpeg', 0.68);
              }
              resolve(candidate.length < dataUrl.length ? candidate : dataUrl);
            };
            img.onerror = () => resolve(dataUrl);
            img.src = dataUrl;
          });
          dataUrl = compressed;
        } catch {
          // Keep original dataUrl if Canvas compression isn't supported
        }
      }

      return safeFetchMutation('/api/public-site/upload-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Operator-Email': operatorEmail
        },
        body: JSON.stringify({ dataUrl, filename: file.name })
      });
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Photo upload failed.'
      };
    }
  }
};
