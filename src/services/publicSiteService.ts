import { Member, MemberClaimInfo, MemberPaymentSummary, MembershipTier, PublicSiteContent, SupporterInquiry } from '../types';

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
  heroImageUrl: 'preset:hero',
  aboutTitle: 'Rooted in Passion, Driven by Discipline',
  aboutText:
    'SC Basimbuzi brings together senior squad competition, structured youth development, and an active supporter membership network. Every contribution and matchday turnout helps sustain training operations, equipment, and community football outreach.',
  clubFoundedYear: '2018',
  homeGround: 'Basimbuzi Community Ground',
  trainingSchedule: 'Tue, Thu & Sat · 4:00 PM EAT',
  membershipTargetLabel: '2026 Season Membership Contribution',
  membershipTargetUgx: 100000,
  news: [
    {
      id: 'news-1',
      title: 'First Team Opens Home Campaign With Commanding 3-1 Victory',
      category: 'Match Report',
      summary:
        'A disciplined second-half display and clinical counter-attacks sealed three vital points in front of a lively home crowd.',
      content:
        'SC Basimbuzi started the home fixture on the front foot, pressing high and controlling midfield possession from the opening whistle.\n\nAfter an even first thirty minutes, the breakthrough arrived from a sweeping wide move finished cleanly into the far corner. Two further goals after the interval put the result beyond doubt despite a late consolation from the visitors.\n\nHead Coach and technical staff praised the squad fitness and thanked supporters who turned out in full club colours.',
      coverImage: 'preset:matchday',
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
      coverImage: 'preset:supporters',
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
      coverImage: 'preset:hero',
      author: 'Academy Outreach',
      publishedAt: '2026-11-04',
      featured: false,
      status: 'PUBLISHED'
    }
  ],
  fixtures: [
    {
      id: 'fix-1',
      opponent: 'Kireka United FC',
      competition: 'Regional League',
      date: '2026-11-28',
      time: '16:00',
      venue: 'Basimbuzi Community Ground',
      isHome: true,
      status: 'UPCOMING'
    },
    {
      id: 'fix-2',
      opponent: 'Ntinda Stars',
      competition: 'District Cup',
      date: '2026-12-05',
      time: '15:30',
      venue: 'Ntinda Municipal Pitch',
      isHome: false,
      status: 'UPCOMING'
    },
    {
      id: 'fix-3',
      opponent: 'Bweyogerere Rovers',
      competition: 'Regional League',
      date: '2026-11-15',
      time: '16:00',
      venue: 'Basimbuzi Community Ground',
      isHome: true,
      status: 'COMPLETED',
      homeScore: 3,
      awayScore: 1,
      summary: 'Strong second-half display with goals in the 38th, 61st, and 77th minutes.'
    },
    {
      id: 'fix-4',
      opponent: 'Bugolobi Athletic',
      competition: 'Regional League',
      date: '2026-11-08',
      time: '16:00',
      venue: 'Bugolobi Ground',
      isHome: false,
      status: 'COMPLETED',
      homeScore: 1,
      awayScore: 2,
      summary: 'Crucial away victory secured with an 84th-minute winner.'
    }
  ],
  merch: [
    {
      id: 'merch-1',
      name: 'Official 2026 Home Jersey',
      priceUgx: 65000,
      description: 'Breathable royal blue matchday jersey with gold trim and woven SC Basimbuzi crest.',
      imageUrl: 'preset:jersey',
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      inStock: true
    }
  ]
};

export const publicSiteService = {
  async fetchPublicSite(includeDrafts: boolean = false, operatorEmail?: string): Promise<PublicSitePayload> {
    try {
      const headers: Record<string, string> = {};
      if (includeDrafts && operatorEmail) {
        headers['X-Operator-Email'] = operatorEmail;
      }
      const url = includeDrafts ? '/api/public-site?mode=admin' : '/api/public-site';
      const res = await fetch(url, { headers });
      const json = await res.json();
      if (json && json.success && json.data) {
        return json.data as PublicSitePayload;
      }
    } catch {
      // Fallback to default seed content if offline
    }
    return {
      content: DEFAULT_PUBLIC_SITE_CONTENT,
      organization: {
        organizationName: 'SC Basimbuzi',
        organizationEmail: 'info@scbasimbuzi.org',
        organizationPhone: '+256 700 000000',
        organizationAddress: 'Kampala, Uganda',
        logoUrl: '/logo.png'
      }
    };
  },

  async savePublicSite(
    content: PublicSiteContent,
    operatorEmail: string
  ): Promise<{ success: boolean; data?: PublicSiteContent; error?: string }> {
    try {
      const res = await fetch('/api/public-site', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Operator-Email': operatorEmail
        },
        body: JSON.stringify({ content })
      });
      return await res.json();
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to save website content'
      };
    }
  },

  async submitInquiry(payload: {
    fullName: string;
    phone: string;
    email: string;
    interest: SupporterInquiry['interest'];
    message: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/public-inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to send inquiry'
      };
    }
  },

  async fetchInquiries(operatorEmail: string): Promise<{ success: boolean; data?: SupporterInquiry[]; error?: string }> {
    try {
      const res = await fetch('/api/public-inquiries', {
        headers: { 'X-Operator-Email': operatorEmail }
      });
      return await res.json();
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to load inquiries'
      };
    }
  },

  async updateInquiryStatus(
    id: string,
    status: 'NEW' | 'CONTACTED',
    operatorEmail: string
  ): Promise<{ success: boolean; data?: SupporterInquiry; error?: string }> {
    try {
      const res = await fetch(`/api/public-inquiries/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Operator-Email': operatorEmail
        },
        body: JSON.stringify({ status })
      });
      return await res.json();
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update inquiry'
      };
    }
  },

  async sendMemberLoginCode(email: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const res = await fetch('/api/me/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      return await res.json();
    } catch {
      return {
        success: false,
        error: 'Unable to send sign-in code right now. Please check your connection and try again.'
      };
    }
  },

  async verifyMemberLoginCode(
    email: string,
    code: string
  ): Promise<{ success: boolean; token?: string; member?: MemberAuthSession['member']; error?: string }> {
    try {
      const res = await fetch('/api/me/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code })
      });
      return await res.json();
    } catch {
      return {
        success: false,
        error: 'Unable to verify sign-in code right now. Please try again.'
      };
    }
  },

  async fetchMyPayments(token: string): Promise<MemberPaymentSummary & { unauthorized?: boolean }> {
    try {
      const res = await fetch('/api/me/payments', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const json = await res.json();
      if (res.status === 401) {
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
          message: json?.message || 'Your session expired. Please sign in again.'
        };
      }
      return json;
    } catch {
      return {
        found: false,
        query: '',
        expectedTargetUgx: 0,
        totalPaidUgx: 0,
        pendingUgx: 0,
        remainingUgx: 0,
        progressPercent: 0,
        overallStatus: 'NOT_FOUND',
        payments: [],
        message: 'Unable to load your payments right now. Please try again shortly.'
      };
    }
  },

  async fetchClaimProfile(
    token: string
  ): Promise<{ success: boolean; data?: MemberClaimInfo; error?: string }> {
    try {
      const res = await fetch(`/api/me/claim/${encodeURIComponent(token)}`);
      return await res.json();
    } catch {
      return {
        success: false,
        error: 'Unable to load your profile completion link right now.'
      };
    }
  },

  async submitClaimProfile(
    token: string,
    payload: {
      fullName: string;
      email: string;
      phone: string;
      address: string;
      tier: MembershipTier;
    }
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const res = await fetch(`/api/me/claim/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch {
      return {
        success: false,
        error: 'Unable to submit your details right now. Please try again.'
      };
    }
  },

  async updateMyProfile(
    token: string,
    payload: {
      fullName: string;
      phone: string;
      address: string;
      tier: MembershipTier;
    }
  ): Promise<{ success: boolean; message?: string; data?: Member; error?: string; unauthorized?: boolean }> {
    try {
      const res = await fetch('/api/me/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (res.status === 401) {
        return {
          success: false,
          unauthorized: true,
          error: json?.error || 'Your session expired. Please sign in again.'
        };
      }
      return json;
    } catch {
      return {
        success: false,
        error: 'Unable to save your profile changes right now.'
      };
    }
  },

  async verifyMyReceipt(token: string, receiptNumber: string): Promise<ReceiptVerificationResult & { unauthorized?: boolean }> {
    try {
      const res = await fetch('/api/me/verify-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ receiptNumber })
      });
      const json = await res.json();
      if (res.status === 401) {
        return {
          found: false,
          unauthorized: true,
          receiptNumber,
          message: json?.message || 'Your session expired. Please sign in again.'
        };
      }
      return json;
    } catch {
      return {
        found: false,
        receiptNumber,
        message: 'Unable to verify receipt right now. Please try again shortly.'
      };
    }
  },

  async uploadImage(
    file: File,
    operatorEmail: string
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
    if (!allowedTypes.has(file.type.toLowerCase())) {
      return { success: false, error: 'Please choose a PNG, JPG, WEBP, or GIF photo.' };
    }
    if (file.size > 5 * 1024 * 1024) {
      return { success: false, error: 'Photo size must be 5 MB or smaller.' };
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read selected file.'));
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/public-site/upload-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Operator-Email': operatorEmail
        },
        body: JSON.stringify({ dataUrl, filename: file.name })
      });
      return await res.json();
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Photo upload failed.'
      };
    }
  }
};
