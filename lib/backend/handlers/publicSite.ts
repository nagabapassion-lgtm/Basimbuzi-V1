import { getDb } from '../db';
import { requireStaff } from '../auth';
import { getPublicOrgProfile, sanitizeMediaUrl, logAudit } from '../store';
import { mapInquiryRow } from '../map';
import { fail, ok, errorResult, getParam } from '../types';
import type { HandlerCtx, HandlerResult, StaffUser } from '../types';

const DEFAULT_PUBLIC_SITE = {
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

const normalizeSiteShape = (parsed: any) => ({
  ...DEFAULT_PUBLIC_SITE,
  ...parsed,
  news: Array.isArray(parsed?.news) ? parsed.news : DEFAULT_PUBLIC_SITE.news,
  fixtures: Array.isArray(parsed?.fixtures) ? parsed.fixtures : DEFAULT_PUBLIC_SITE.fixtures,
  merch: Array.isArray(parsed?.merch) ? parsed.merch : DEFAULT_PUBLIC_SITE.merch
});

const loadSiteContent = async (): Promise<any> => {
  const { data } = await getDb().from('site_content').select('content').eq('id', 1).maybeSingle();
  if (data?.content && typeof data.content === 'object') {
    return normalizeSiteShape(data.content);
  }
  return { ...DEFAULT_PUBLIC_SITE };
};

const canManageWebsite = (user: StaffUser): boolean =>
  user.role === 'OWNER' || user.role === 'ADMIN' || user.role === 'MEDIA' || user.permissions.canManageWebsite === true;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/public-site (no auth)
export const getPublicSite = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    let isAdminRequest = false;
    if (ctx.query.mode === 'admin') {
      const auth = await requireStaff(ctx);
      isAdminRequest = auth.ok && canManageWebsite(auth.user);
    }

    const content = await loadSiteContent();
    const filteredNews = isAdminRequest
      ? content.news
      : content.news.filter((n: any) => n?.status === 'PUBLISHED');

    return ok(
      {
        success: true,
        data: {
          content: { ...content, news: filteredNews },
          organization: await getPublicOrgProfile()
        }
      },
      { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
    );
  } catch (err) {
    return errorResult(err);
  }
};

// POST /api/public-site {content}
export const savePublicSite = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const operator = auth.user;
    if (!canManageWebsite(operator)) {
      return fail(403, {
        success: false,
        error: 'Unauthorized: Only active Owners, Admins, or Media Officers can update public club content.'
      });
    }

    const incoming = ctx.body?.content;
    if (!incoming || typeof incoming !== 'object') {
      return fail(400, { success: false, error: 'Invalid website content payload' });
    }

    const allowedCategories = new Set(['Match Report', 'Club Notice', 'Community', 'Academy', 'Transfer']);
    const allowedFixtureStatus = new Set(['UPCOMING', 'COMPLETED', 'POSTPONED']);

    const sanitizedNews = Array.isArray(incoming.news)
      ? incoming.news.slice(0, 60).map((item: any, idx: number) => ({
          id: String(item?.id || `news-${Date.now()}-${idx}`).slice(0, 64),
          title: String(item?.title || 'Club Update').trim().slice(0, 160),
          category: allowedCategories.has(item?.category) ? item.category : 'Club Notice',
          summary: String(item?.summary || '').trim().slice(0, 400),
          content: String(item?.content || '').trim().slice(0, 8000),
          coverImage: sanitizeMediaUrl(item?.coverImage, 'preset:matchday'),
          author: String(item?.author || operator.name).trim().slice(0, 80),
          publishedAt: String(item?.publishedAt || new Date().toISOString().slice(0, 10)).slice(0, 20),
          featured: Boolean(item?.featured),
          status: item?.status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED'
        }))
      : DEFAULT_PUBLIC_SITE.news;

    const sanitizedFixtures = Array.isArray(incoming.fixtures)
      ? incoming.fixtures.slice(0, 60).map((fix: any, idx: number) => ({
          id: String(fix?.id || `fix-${Date.now()}-${idx}`).slice(0, 64),
          opponent: String(fix?.opponent || 'TBD').trim().slice(0, 100),
          competition: String(fix?.competition || 'Club Friendly').trim().slice(0, 80),
          date: String(fix?.date || '').trim().slice(0, 20),
          time: String(fix?.time || '16:00').trim().slice(0, 20),
          venue: String(fix?.venue || 'Basimbuzi Community Ground').trim().slice(0, 120),
          isHome: Boolean(fix?.isHome),
          status: allowedFixtureStatus.has(fix?.status) ? fix.status : 'UPCOMING',
          homeScore: fix?.homeScore !== undefined && fix?.homeScore !== '' ? Math.max(0, Number(fix.homeScore) || 0) : undefined,
          awayScore: fix?.awayScore !== undefined && fix?.awayScore !== '' ? Math.max(0, Number(fix.awayScore) || 0) : undefined,
          summary: fix?.summary ? String(fix.summary).trim().slice(0, 400) : undefined
        }))
      : DEFAULT_PUBLIC_SITE.fixtures;

    const sanitizedMerch = Array.isArray(incoming.merch)
      ? incoming.merch.slice(0, 20).map((m: any, idx: number) => ({
          id: String(m?.id || `merch-${Date.now()}-${idx}`).slice(0, 64),
          name: String(m?.name || 'Club Jersey').trim().slice(0, 100),
          priceUgx: Math.max(0, Number(m?.priceUgx) || 0),
          description: String(m?.description || '').trim().slice(0, 400),
          imageUrl: sanitizeMediaUrl(m?.imageUrl, 'preset:jersey'),
          sizes: Array.isArray(m?.sizes) && m.sizes.length > 0
            ? m.sizes.map((s: any) => String(s).trim().slice(0, 12)).filter(Boolean)
            : ['S', 'M', 'L', 'XL'],
          inStock: m?.inStock !== false
        }))
      : DEFAULT_PUBLIC_SITE.merch;

    const sanitizedContent = {
      heroHeadline: String(incoming.heroHeadline || DEFAULT_PUBLIC_SITE.heroHeadline).trim().slice(0, 180),
      heroSubheadline: String(incoming.heroSubheadline || DEFAULT_PUBLIC_SITE.heroSubheadline).trim().slice(0, 450),
      heroImageUrl: sanitizeMediaUrl(incoming.heroImageUrl, 'preset:hero'),
      aboutTitle: String(incoming.aboutTitle || DEFAULT_PUBLIC_SITE.aboutTitle).trim().slice(0, 160),
      aboutText: String(incoming.aboutText || DEFAULT_PUBLIC_SITE.aboutText).trim().slice(0, 2000),
      clubFoundedYear: String(incoming.clubFoundedYear || '2019').trim().slice(0, 10),
      homeGround: String(incoming.homeGround || 'Basimbuzi Community Ground').trim().slice(0, 120),
      trainingSchedule: String(incoming.trainingSchedule || 'Tue, Thu & Sat · 4:00 PM EAT').trim().slice(0, 120),
      membershipTargetLabel: String(incoming.membershipTargetLabel || '2026 Season Membership Contribution').trim().slice(0, 120),
      membershipTargetUgx: Math.max(0, Math.min(100000000, Number(incoming.membershipTargetUgx) || 0)),
      news: sanitizedNews,
      fixtures: sanitizedFixtures,
      merch: sanitizedMerch,
      updatedAt: new Date().toISOString(),
      updatedBy: operator.email
    };

    const { error } = await getDb().from('site_content').upsert(
      {
        id: 1,
        content: sanitizedContent,
        updated_at: sanitizedContent.updatedAt,
        updated_by: operator.email
      },
      { onConflict: 'id' }
    );
    if (error) throw new Error(error.message);

    await logAudit({
      user: operator.name,
      userEmail: operator.email,
      action: 'CHANGE_SETTINGS',
      description: `${operator.name} updated the public club website content.`
    });

    return ok({ success: true, data: sanitizedContent });
  } catch (err) {
    return errorResult(err);
  }
};

// POST /api/public-site/upload-image {dataUrl, filename}
export const uploadImage = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const operator = auth.user;
    if (!canManageWebsite(operator)) {
      return fail(403, {
        success: false,
        error: 'Unauthorized: Only active Owners, Admins, or Media Officers can upload club images.'
      });
    }

    const dataUrl = String(ctx.body?.dataUrl || '').trim();
    const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) {
      return fail(400, {
        success: false,
        error: 'Please upload a valid PNG, JPG, WEBP, or GIF image.'
      });
    }

    const rawExt = match[1].toLowerCase();
    const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
      return fail(400, {
        success: false,
        error: 'Image must be smaller than 5 MB.'
      });
    }

    const safeName = `club-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const { error: uploadErr } = await getDb()
      .storage.from('site-media')
      .upload(safeName, buffer, {
        contentType: `image/${rawExt === 'svg' ? 'png' : rawExt}`,
        upsert: false
      });
    if (uploadErr) throw new Error(uploadErr.message);

    const { data } = getDb().storage.from('site-media').getPublicUrl(safeName);

    return ok({ success: true, url: data?.publicUrl || '' });
  } catch (err) {
    return errorResult(err);
  }
};

// POST /api/public-inquiries (public)
export const submitInquiry = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const { fullName, phone, email, interest, message } = ctx.body || {};
    const cleanName = String(fullName || '').trim();
    const cleanPhone = String(phone || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanMessage = String(message || '').trim();
    const allowedInterests = new Set(['Membership', 'Academy', 'Sponsorship', 'Merchandise', 'General']);

    if (cleanName.length < 2 || cleanName.length > 100) {
      return fail(400, { success: false, error: 'Please enter your full name.' });
    }
    if (cleanPhone.length < 7 || cleanPhone.length > 25) {
      return fail(400, { success: false, error: 'Please provide a valid phone or WhatsApp number.' });
    }
    if (cleanEmail && !EMAIL_REGEX.test(cleanEmail)) {
      return fail(400, { success: false, error: 'Please provide a valid email address.' });
    }

    const id = `inq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const row = {
      id,
      full_name: cleanName,
      phone: cleanPhone,
      email: cleanEmail,
      interest: allowedInterests.has(interest) ? interest : 'Membership',
      message: cleanMessage.slice(0, 1000),
      status: 'NEW',
      created_at: new Date().toISOString()
    };
    const { data, error } = await getDb().from('inquiries').insert(row).select().single();
    if (error) throw new Error(error.message);

    return ok({ success: true, data: mapInquiryRow(data) });
  } catch (err) {
    return errorResult(err);
  }
};

// GET /api/public-inquiries
export const listInquiries = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    if (!canManageWebsite(auth.user)) {
      return fail(403, { success: false, error: 'Unauthorized' });
    }

    const { data, error } = await getDb()
      .from('inquiries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    return ok({ success: true, data: (data || []).map(mapInquiryRow) });
  } catch (err) {
    return errorResult(err);
  }
};

// PATCH /api/public-inquiries/:id {status}
export const updateInquiryStatus = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    if (!canManageWebsite(auth.user)) {
      return fail(403, { success: false, error: 'Unauthorized' });
    }

    const targetId = getParam(ctx, 'id').trim();
    const nextStatus = ctx.body?.status === 'CONTACTED' ? 'CONTACTED' : 'NEW';

    const { data, error } = await getDb()
      .from('inquiries')
      .update({ status: nextStatus })
      .eq('id', targetId)
      .select()
      .single();
    if (error || !data) {
      return fail(404, { success: false, error: 'Inquiry not found' });
    }

    return ok({ success: true, data: mapInquiryRow(data) });
  } catch (err) {
    return errorResult(err);
  }
};
