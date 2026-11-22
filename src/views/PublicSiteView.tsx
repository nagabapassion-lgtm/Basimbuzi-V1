import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { HARDCODED_LOGO_URL } from '../assets/brandLogo';
import { resolveClubImageUrl } from '../assets/clubImages';
import {
  DEFAULT_PUBLIC_SITE_CONTENT,
  PublicOrgProfile,
  publicSiteService
} from '../services/publicSiteService';
import { ClubNewsPost, NewsCategory, PublicSiteContent, SupporterInquiry } from '../types';
import { openWhatsAppChat } from '../utils/whatsappReceipt';
import { FixturesPage } from './public/FixturesPage';
import { MerchandisePage } from './public/MerchandisePage';
import { MemberPortalPage } from './public/MemberPortalPage';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Copy,
  Lock,
  Mail,
  MapPin,
  Menu,
  Moon,
  Newspaper,
  Phone,
  Share2,
  ShoppingBag,
  Sun,
  Trophy,
  User,
  X
} from 'lucide-react';

interface PublicSiteViewProps {
  onNavigateAdmin: () => void;
}

type PublicPageRoute =
  | { page: 'home' }
  | { page: 'news-detail'; articleId: string }
  | { page: 'fixtures' }
  | { page: 'merchandise' }
  | { page: 'me' };

const NEWS_FILTERS: Array<'All' | NewsCategory> = [
  'All',
  'Match Report',
  'Club Notice',
  'Community',
  'Academy',
  'Transfer'
];

const getPublicRouteFromPath = (): PublicPageRoute => {
  if (typeof window === 'undefined') return { page: 'home' };
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const newsMatch = path.match(/^\/news\/([^/]+)$/i);
  if (newsMatch) {
    return { page: 'news-detail', articleId: decodeURIComponent(newsMatch[1]) };
  }
  if (/^\/fixtures$/i.test(path)) {
    return { page: 'fixtures' };
  }
  if (/^\/merchandise$/i.test(path)) {
    return { page: 'merchandise' };
  }
  if (/^\/me$/i.test(path)) {
    return { page: 'me' };
  }
  return { page: 'home' };
};

export const PublicSiteView: React.FC<PublicSiteViewProps> = ({ onNavigateAdmin }) => {
  const { theme, toggleTheme, settings } = useApp();

  const [siteContent, setSiteContent] = useState<PublicSiteContent>(DEFAULT_PUBLIC_SITE_CONTENT);
  const [orgProfile, setOrgProfile] = useState<PublicOrgProfile>({
    organizationName: settings.organizationName || 'SC Basimbuzi',
    organizationEmail: settings.organizationEmail || 'info@scbasimbuzi.org',
    organizationPhone: settings.organizationPhone || '+256 700 000000',
    organizationAddress: settings.organizationAddress || 'Kampala, Uganda',
    logoUrl: settings.logoUrl || HARDCODED_LOGO_URL
  });
  const [isLoadingSite, setIsLoadingSite] = useState(true);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [newsCategory, setNewsCategory] = useState<'All' | NewsCategory>('All');
  const [route, setRoute] = useState<PublicPageRoute>(() => getPublicRouteFromPath());
  const [copiedArticleId, setCopiedArticleId] = useState<string | null>(null);

  // Join Club Inquiry Form
  const [inquiryName, setInquiryName] = useState('');
  const [inquiryPhone, setInquiryPhone] = useState('');
  const [inquiryEmail, setInquiryEmail] = useState('');
  const [inquiryInterest, setInquiryInterest] = useState<SupporterInquiry['interest']>('Membership');
  const [inquiryMessage, setInquiryMessage] = useState('');
  const [inquirySubmitting, setInquirySubmitting] = useState(false);
  const [inquiryError, setInquiryError] = useState<string | null>(null);
  const [inquirySuccess, setInquirySuccess] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setIsLoadingSite(true);
      const payload = await publicSiteService.fetchPublicSite(false);
      if (mounted) {
        setSiteContent(payload.content);
        setOrgProfile(payload.organization);
        setIsLoadingSite(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Sync browser Back/Forward for public routes & secretive Ctrl/Cmd+Shift+A staff shortcut
  useEffect(() => {
    const handlePopState = () => {
      setRoute(getPublicRouteFromPath());
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        onNavigateAdmin();
      }
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onNavigateAdmin]);

  const publishedNews = useMemo(() => {
    return (siteContent.news || [])
      .filter(n => n.status === 'PUBLISHED')
      .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  }, [siteContent.news]);

  const activeArticle = useMemo(() => {
    if (route.page !== 'news-detail') return null;
    return publishedNews.find(n => n.id === route.articleId) || null;
  }, [publishedNews, route]);

  // Synchronize document title across public pages
  useEffect(() => {
    const clubName = orgProfile.organizationName || 'SC Basimbuzi';
    if (route.page === 'news-detail' && activeArticle) {
      document.title = `${activeArticle.title} | ${clubName}`;
    } else if (route.page === 'fixtures') {
      document.title = `Fixtures & Results | ${clubName}`;
    } else if (route.page === 'merchandise') {
      document.title = `Official Merchandise | ${clubName}`;
    } else if (route.page === 'me') {
      document.title = `Me — Member Login | ${clubName}`;
    } else {
      document.title = `${clubName} — Official Club News, Fixtures & Supporter Hub`;
    }
  }, [orgProfile.organizationName, route, activeArticle]);

  const filteredNews = useMemo(() => {
    if (newsCategory === 'All') return publishedNews;
    return publishedNews.filter(n => n.category === newsCategory);
  }, [publishedNews, newsCategory]);

  const leadArticle = useMemo(() => {
    return filteredNews.find(n => n.featured) || filteredNews[0] || null;
  }, [filteredNews]);

  const secondaryArticles = useMemo(() => {
    if (!leadArticle) return [];
    return filteredNews.filter(n => n.id !== leadArticle.id);
  }, [filteredNews, leadArticle]);

  const upcomingFixtures = useMemo(() => {
    return (siteContent.fixtures || [])
      .filter(f => f.status === 'UPCOMING' || f.status === 'POSTPONED')
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [siteContent.fixtures]);

  const nextMatch = upcomingFixtures[0] || null;

  const formatReadableDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const parsed = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateStr;
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const navigateToPublicPath = (path: string, anchor?: string) => {
    setMobileMenuOpen(false);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
    }
    setRoute(getPublicRouteFromPath());

    if (anchor) {
      setTimeout(() => {
        const el = document.getElementById(anchor);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 60);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const openArticlePage = (article: ClubNewsPost) => {
    navigateToPublicPath(`/news/${encodeURIComponent(article.id)}`);
  };

  const handleNavSectionClick = (e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    setMobileMenuOpen(false);
    if (route.page !== 'home') {
      e.preventDefault();
      navigateToPublicPath('/', sectionId);
    }
  };

  const handleCopyArticle = async (article: ClubNewsPost) => {
    const articleUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/news/${encodeURIComponent(article.id)}`
        : '';
    const text = `${article.title}\n\n${article.summary}${articleUrl ? `\n\nRead full story: ${articleUrl}` : ''}\n— ${orgProfile.organizationName}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedArticleId(article.id);
      setTimeout(() => setCopiedArticleId(null), 2000);
    } catch {}
  };

  const handleShareArticleWhatsApp = (article: ClubNewsPost) => {
    const articleUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/news/${encodeURIComponent(article.id)}`
        : '';
    const msg = `*${article.title}*\n_${article.category} · ${formatReadableDate(article.publishedAt)} · By ${article.author}_\n\n${article.summary}${articleUrl ? `\n\nRead full story: ${articleUrl}` : ''}`;
    openWhatsAppChat('', msg);
  };

  const handleSubmitInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setInquiryError(null);
    setInquirySuccess(false);

    if (inquiryName.trim().length < 2) {
      setInquiryError('Please enter your full name.');
      return;
    }
    if (inquiryPhone.trim().length < 7) {
      setInquiryError('Please enter a valid phone or WhatsApp number.');
      return;
    }

    setInquirySubmitting(true);
    const res = await publicSiteService.submitInquiry({
      fullName: inquiryName.trim(),
      phone: inquiryPhone.trim(),
      email: inquiryEmail.trim(),
      interest: inquiryInterest,
      message: inquiryMessage.trim()
    });
    setInquirySubmitting(false);

    if (res.success) {
      setInquirySuccess(true);
      setInquiryName('');
      setInquiryPhone('');
      setInquiryEmail('');
      setInquiryMessage('');
    } else {
      setInquiryError(res.error || 'Could not submit inquiry. Please try again.');
    }
  };

  const clubName = orgProfile.organizationName || 'SC Basimbuzi';
  const clubLogo = orgProfile.logoUrl || HARDCODED_LOGO_URL;

  return (
    <div className="public-site-root min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased selection:bg-blue-700 selection:text-white transition-colors duration-200 flex flex-col">
      {/* Top Navigation Bar (Strict 3-Zone Contract: Brand Wordmark — 5 Nav Links — 1 Primary Action) */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Title */}
          <a
            href="/"
            onClick={e => {
              e.preventDefault();
              navigateToPublicPath('/');
            }}
            className="flex items-center gap-3 text-lg font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            <img
              src={clubLogo}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = HARDCODED_LOGO_URL;
              }}
              alt={clubName}
              className="w-8 h-8 object-contain rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-0.5 shrink-0"
            />
            <span>{clubName}</span>
          </a>

          {/* Zone 2: Clean Single-Line Text Navigation Links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a
              href="/#news"
              onClick={e => handleNavSectionClick(e, 'news')}
              className="hover:text-slate-950 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              News
            </a>
            <a
              href="/fixtures"
              onClick={e => {
                e.preventDefault();
                navigateToPublicPath('/fixtures');
              }}
              className={`hover:text-slate-950 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
                route.page === 'fixtures' ? 'text-blue-700 dark:text-blue-400 font-semibold' : ''
              }`}
            >
              Fixtures
            </a>
            <a
              href="/#about"
              onClick={e => handleNavSectionClick(e, 'about')}
              className="hover:text-slate-950 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              About
            </a>
            <a
              href="/merchandise"
              onClick={e => {
                e.preventDefault();
                navigateToPublicPath('/merchandise');
              }}
              className={`hover:text-slate-950 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
                route.page === 'merchandise' ? 'text-blue-700 dark:text-blue-400 font-semibold' : ''
              }`}
            >
              Merchandise
            </a>
            <a
              href="/me"
              onClick={e => {
                e.preventDefault();
                navigateToPublicPath('/me');
              }}
              className={`hover:text-slate-950 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
                route.page === 'me' ? 'text-blue-700 dark:text-blue-400 font-semibold' : ''
              }`}
            >
              Me
            </a>
          </nav>

          {/* Zone 3: Single Public Primary CTA (+ mobile menu trigger on <md) */}
          <div className="flex items-center gap-3 shrink-0">
            <a
              href="/#join-club"
              onClick={e => handleNavSectionClick(e, 'join-club')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <span>Join Club</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(prev => !prev)}
              aria-label="Toggle navigation menu"
              className="md:hidden p-2 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 py-3 space-y-1">
            <a
              href="/#news"
              onClick={e => handleNavSectionClick(e, 'news')}
              className="block py-2.5 px-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-blue-700 dark:hover:text-blue-400"
            >
              News
            </a>
            <a
              href="/fixtures"
              onClick={e => {
                e.preventDefault();
                navigateToPublicPath('/fixtures');
              }}
              className="block py-2.5 px-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-blue-700 dark:hover:text-blue-400"
            >
              Fixtures &amp; Results
            </a>
            <a
              href="/#about"
              onClick={e => handleNavSectionClick(e, 'about')}
              className="block py-2.5 px-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-blue-700 dark:hover:text-blue-400"
            >
              About Club
            </a>
            <a
              href="/merchandise"
              onClick={e => {
                e.preventDefault();
                navigateToPublicPath('/merchandise');
              }}
              className="block py-2.5 px-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-blue-700 dark:hover:text-blue-400"
            >
              Merchandise
            </a>
            <a
              href="/me"
              onClick={e => {
                e.preventDefault();
                navigateToPublicPath('/me');
              }}
              className="block py-2.5 px-2 text-sm font-medium text-blue-700 dark:text-blue-400 font-semibold"
            >
              Me (Member Login)
            </a>
            <a
              href="/#join-club"
              onClick={e => handleNavSectionClick(e, 'join-club')}
              className="block py-2.5 px-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-blue-700 dark:hover:text-blue-400"
            >
              Join Club
            </a>
          </div>
        )}
      </header>

      <div className="flex-1">
        {/* ROUTE 1: DEDICATED FIXTURES PAGE (/fixtures) */}
        {route.page === 'fixtures' && (
          <FixturesPage
            clubName={clubName}
            fixtures={siteContent.fixtures || []}
            onBackHome={() => navigateToPublicPath('/')}
            onGoJoinClub={() => navigateToPublicPath('/', 'join-club')}
          />
        )}

        {/* ROUTE 2: DEDICATED MERCHANDISE STORE (/merchandise) */}
        {route.page === 'merchandise' && (
          <MerchandisePage
            clubName={clubName}
            clubPhone={orgProfile.organizationPhone}
            merch={siteContent.merch || []}
            onBackHome={() => navigateToPublicPath('/')}
          />
        )}

        {/* ROUTE 3: DEDICATED MEMBER LOGIN PORTAL (/me) */}
        {route.page === 'me' && (
          <MemberPortalPage
            clubName={clubName}
            clubEmail={orgProfile.organizationEmail}
            clubPhone={orgProfile.organizationPhone}
            onBackHome={() => navigateToPublicPath('/')}
          />
        )}

        {/* ROUTE 4: DEDICATED FULL-PAGE ARTICLE READER (/news/:id) */}
        {route.page === 'news-detail' && (
          <main className="max-w-4xl mx-auto px-4 sm:px-8 py-10 sm:py-14">
            <button
              type="button"
              onClick={() => navigateToPublicPath('/', 'news')}
              className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline mb-8 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to All Club News</span>
            </button>

            {isLoadingSite && !activeArticle ? (
              <div className="py-16 text-center text-sm text-slate-500">Loading story...</div>
            ) : !activeArticle ? (
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-10 text-center space-y-3">
                <Newspaper className="w-10 h-10 text-slate-400 mx-auto" />
                <h1 className="text-xl font-bold text-slate-950 dark:text-white">Story Not Found</h1>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  This club update may have been moved or saved as a draft.
                </p>
                <button
                  type="button"
                  onClick={() => navigateToPublicPath('/', 'news')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Return to Club News
                </button>
              </div>
            ) : (
              <article className="space-y-8">
                <header className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-blue-700 dark:text-blue-400">{activeArticle.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{formatReadableDate(activeArticle.publishedAt)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-200">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      Published by {activeArticle.author}
                    </span>
                  </div>

                  <h1
                    className="font-extrabold tracking-tight text-slate-950 dark:text-white leading-[1.1] text-balance"
                    style={{ fontSize: 'clamp(1.85rem, 3.6vw, 3rem)' }}
                  >
                    {activeArticle.title}
                  </h1>

                  <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                    {activeArticle.summary}
                  </p>
                </header>

                <div className="aspect-[16/9] w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-200 dark:bg-slate-800">
                  <img
                    src={resolveClubImageUrl(activeArticle.coverImage, 'preset:matchday')}
                    alt={activeArticle.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-10 space-y-6">
                  <div className="text-base sm:text-[17px] text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line max-w-3xl">
                    {activeArticle.content || activeArticle.summary}
                  </div>

                  <div className="pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleShareArticleWhatsApp(activeArticle)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>Share on WhatsApp</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyArticle(activeArticle)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{copiedArticleId === activeArticle.id ? 'Link & Summary Copied' : 'Copy Story Link'}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => navigateToPublicPath('/', 'news')}
                      className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Browse All News
                    </button>
                  </div>
                </div>

                {publishedNews.filter(n => n.id !== activeArticle.id).length > 0 && (
                  <section className="pt-8 border-t border-slate-200 dark:border-slate-800 space-y-5">
                    <h2 className="text-lg font-bold text-slate-950 dark:text-white">More from {clubName}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                      {publishedNews
                        .filter(n => n.id !== activeArticle.id)
                        .slice(0, 3)
                        .map(other => (
                          <article
                            key={other.id}
                            onClick={() => openArticlePage(other)}
                            className="group cursor-pointer border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                          >
                            <div className="aspect-[16/10] bg-slate-200 dark:bg-slate-800 overflow-hidden">
                              <img
                                src={resolveClubImageUrl(other.coverImage, 'preset:hero')}
                                alt={other.title}
                                className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                              />
                            </div>
                            <div className="p-4 space-y-1.5">
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                <span className="font-semibold text-blue-700 dark:text-blue-400">{other.category}</span>
                                <span className="mx-1.5">·</span>
                                <span className="tabular-nums">{formatReadableDate(other.publishedAt)}</span>
                              </div>
                              <h3 className="text-sm font-bold text-slate-950 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-400 leading-snug">
                                {other.title}
                              </h3>
                            </div>
                          </article>
                        ))}
                    </div>
                  </section>
                )}
              </article>
            )}
          </main>
        )}

        {/* ROUTE 5: HOME PAGE (/) */}
        {route.page === 'home' && (
          <main id="top">
            {/* 1. HERO SECTION (Asymmetric 2-Column Editorial Split + Next Match Spotlight) */}
            <section className="max-w-7xl mx-auto px-4 sm:px-8 pt-10 pb-8 lg:pt-14 lg:pb-10">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
                {/* Left Proposition */}
                <div className="lg:col-span-6 flex flex-col justify-between py-2">
                  <div className="space-y-5">
                    <p className="text-xs font-semibold tracking-wide text-blue-700 dark:text-blue-400">
                      Official Supporter Hub · Est. {siteContent.clubFoundedYear || '2018'}
                    </p>

                    <h1
                      className="font-extrabold tracking-tight text-slate-950 dark:text-white leading-[1.08] text-balance"
                      style={{ fontSize: 'clamp(2.25rem, 4vw, 3.65rem)' }}
                    >
                      {siteContent.heroHeadline}
                    </h1>

                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                      {siteContent.heroSubheadline}
                    </p>
                  </div>

                  <div className="mt-8 flex flex-wrap items-center gap-5">
                    <a
                      href="#join-club"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <span>Join {clubName}</span>
                      <ArrowRight className="w-4 h-4" />
                    </a>

                    <button
                      type="button"
                      onClick={() => navigateToPublicPath('/me')}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200 hover:text-blue-700 dark:hover:text-blue-400 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Member Login (Me)</span>
                    </button>
                  </div>
                </div>

                {/* Right Dominant Focal Media + Next Match Scrim */}
                <div className="lg:col-span-6">
                  <div
                    onClick={() => navigateToPublicPath('/fixtures')}
                    className="relative h-full min-h-[300px] sm:min-h-[360px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 cursor-pointer group"
                  >
                    <img
                      src={resolveClubImageUrl(siteContent.heroImageUrl, 'preset:hero')}
                      alt={`${clubName} home pitch`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full lg:h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent" />

                    {nextMatch ? (
                      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-7 text-white">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-xs font-medium text-blue-300">
                            Next Fixture · {nextMatch.competition} · {formatReadableDate(nextMatch.date)}
                          </span>
                          <span className="text-xs font-semibold text-white/90 group-hover:text-blue-300 inline-flex items-center gap-1">
                            All Fixtures <ArrowRight className="w-3.5 h-3.5" />
                          </span>
                        </div>
                        <div className="text-xl sm:text-2xl font-bold tracking-tight">
                          {nextMatch.isHome ? `${clubName} vs ${nextMatch.opponent}` : `${nextMatch.opponent} vs ${clubName}`}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-200 tabular-nums">
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-blue-300" />
                            {nextMatch.time} EAT
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-blue-300" />
                            {nextMatch.venue}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-7 text-white">
                        <div className="text-xs font-medium text-blue-300 mb-1">Home Ground</div>
                        <div className="text-xl font-bold">{siteContent.homeGround}</div>
                        <div className="text-xs text-slate-200 mt-1">{siteContent.trainingSchedule}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* 2. CLUB NEWS & STORIES */}
            <section id="news" className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 pt-9 pb-14 sm:pt-10 sm:pb-16">
              <div className="max-w-7xl mx-auto px-4 sm:px-8">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
                  <div>
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-2">
                      Club Updates &amp; Match Reports
                    </p>
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
                      Latest SC Basimbuzi News
                    </h2>
                  </div>

                  {/* Interactive Category Segmented Filter */}
                  <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
                    {NEWS_FILTERS.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setNewsCategory(cat)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          newsCategory === cat
                            ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {isLoadingSite && publishedNews.length === 0 ? (
                  <div className="py-12 text-center text-sm text-slate-500">Loading club news...</div>
                ) : !leadArticle ? (
                  <div className="py-12 px-6 border border-slate-200 dark:border-slate-800 rounded-xl text-center">
                    <Newspaper className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      No published stories found in the {newsCategory} category yet.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {/* Asymmetric Featured + Secondary Split */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                      {/* Lead Story */}
                      <article
                        onClick={() => openArticlePage(leadArticle)}
                        className="lg:col-span-7 group cursor-pointer border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                      >
                        <div className="aspect-[16/9] w-full overflow-hidden bg-slate-200 dark:bg-slate-800">
                          <img
                            src={resolveClubImageUrl(leadArticle.coverImage, 'preset:matchday')}
                            alt={leadArticle.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                          />
                        </div>
                        <div className="p-6 sm:p-7 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2.5">
                              <span className="font-semibold text-blue-700 dark:text-blue-400">{leadArticle.category}</span>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">{formatReadableDate(leadArticle.publishedAt)}</span>
                              <span aria-hidden="true">·</span>
                              <span>{leadArticle.author}</span>
                            </div>
                            <h3 className="text-xl sm:text-2xl font-bold text-slate-950 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors leading-snug text-balance">
                              {leadArticle.title}
                            </h3>
                            <p className="mt-2.5 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                              {leadArticle.summary}
                            </p>
                          </div>
                          <div className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400">
                            <span>Read full story</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      </article>

                      {/* Secondary Stack */}
                      <div className="lg:col-span-5 flex flex-col gap-5">
                        {secondaryArticles.slice(0, 2).map(article => (
                          <article
                            key={article.id}
                            onClick={() => openArticlePage(article)}
                            className="flex-1 group cursor-pointer border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row lg:flex-col xl:flex-row gap-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                          >
                            <div className="sm:w-36 lg:w-full xl:w-36 aspect-[4/3] rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-800 shrink-0">
                              <img
                                src={resolveClubImageUrl(article.coverImage, 'preset:supporters')}
                                alt={article.title}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                              />
                            </div>
                            <div className="flex flex-col justify-between min-w-0">
                              <div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                                  <span className="font-semibold text-blue-700 dark:text-blue-400">{article.category}</span>
                                  <span aria-hidden="true">·</span>
                                  <span className="tabular-nums">{formatReadableDate(article.publishedAt)}</span>
                                </div>
                                <h3 className="text-base font-bold text-slate-950 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors leading-snug">
                                  {article.title}
                                </h3>
                                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
                                  {article.summary}
                                </p>
                              </div>
                              <span className="mt-3 text-xs font-semibold text-blue-700 dark:text-blue-400 inline-flex items-center gap-1">
                                Read story <ArrowRight className="w-3 h-3" />
                              </span>
                            </div>
                          </article>
                        ))}

                        {secondaryArticles.length === 0 && (
                          <div className="flex-1 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-center bg-slate-50 dark:bg-slate-900">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              More updates coming soon
                            </p>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                              Club officials publish match reports and announcements regularly via the Media Desk.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Additional Stories Grid if > 3 */}
                    {secondaryArticles.length > 2 && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                        {secondaryArticles.slice(2).map(article => (
                          <article
                            key={article.id}
                            onClick={() => openArticlePage(article)}
                            className="group cursor-pointer border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                          >
                            <div className="aspect-[4/3] w-full overflow-hidden bg-slate-200 dark:bg-slate-800">
                              <img
                                src={resolveClubImageUrl(article.coverImage, 'preset:hero')}
                                alt={article.title}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                              />
                            </div>
                            <div className="p-5">
                              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                                <span className="font-semibold text-blue-700 dark:text-blue-400">{article.category}</span>
                                <span aria-hidden="true">·</span>
                                <span className="tabular-nums">{formatReadableDate(article.publishedAt)}</span>
                              </div>
                              <h3 className="text-base font-bold text-slate-950 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors leading-snug">
                                {article.title}
                              </h3>
                              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
                                {article.summary}
                              </p>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* 3. DEDICATED CLUB SECTIONS DIRECTORY (Fixtures, Merchandise, Member Portal) */}
            <section className="border-t border-slate-200 dark:border-slate-800 py-14 sm:py-16">
              <div className="max-w-7xl mx-auto px-4 sm:px-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                <button
                  type="button"
                  onClick={() => navigateToPublicPath('/fixtures')}
                  className="text-left group border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-6 sm:p-7 hover:border-blue-300 dark:hover:border-blue-700 transition-colors flex flex-col justify-between gap-4 cursor-pointer"
                >
                  <div className="space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-700 dark:text-blue-300">
                      <Trophy className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-950 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-400">
                      Fixtures &amp; Results
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      View upcoming match kickoff times, competition filters, venues, and full-time scorelines.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400">
                    Open Matchday Center <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => navigateToPublicPath('/merchandise')}
                  className="text-left group border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-6 sm:p-7 hover:border-blue-300 dark:hover:border-blue-700 transition-colors flex flex-col justify-between gap-4 cursor-pointer"
                >
                  <div className="space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-700 dark:text-blue-300">
                      <ShoppingBag className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-950 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-400">
                      Official Merchandise
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      Browse official {clubName} jerseys and supporter gear with sizes and direct WhatsApp ordering.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400">
                    Visit Club Store <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => navigateToPublicPath('/me')}
                  className="text-left group border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-6 sm:p-7 hover:border-blue-300 dark:hover:border-blue-700 transition-colors flex flex-col justify-between gap-4 cursor-pointer"
                >
                  <div className="space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-700 dark:text-blue-300">
                      <Lock className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-950 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-400">
                      Me · Member Login
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      Registered members sign in securely by email code to check contributions, balance, and personal receipts.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400">
                    Sign In to My Account <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>
              </div>
            </section>

            {/* 4. ABOUT THE CLUB & JOIN CLUB INQUIRY */}
            <section id="about" className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 py-14 sm:py-16">
              <div className="max-w-7xl mx-auto px-4 sm:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                {/* About Club */}
                <div className="lg:col-span-5 space-y-5">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                    About {clubName}
                  </p>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white text-balance">
                    {siteContent.aboutTitle}
                  </h2>
                  <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                    {siteContent.aboutText}
                  </p>

                  <dl className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">Training Ground</dt>
                      <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">{siteContent.homeGround}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">Training Days</dt>
                      <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">{siteContent.trainingSchedule}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">Club Office</dt>
                      <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">{orgProfile.organizationAddress}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">Direct Contact</dt>
                      <dd className="font-semibold text-slate-900 dark:text-white mt-0.5 space-y-0.5">
                        <div className="flex items-center gap-1.5 text-xs">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{orgProfile.organizationPhone}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span>{orgProfile.organizationEmail}</span>
                        </div>
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Join Club Inquiry Form */}
                <div id="join-club" className="lg:col-span-7 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-6 sm:p-8">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                    Membership &amp; Supporter Desk
                  </p>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white mt-1">
                    Join {clubName} or Send an Inquiry
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5">
                    Leave your contact details below to register as a supporter, inquire about youth academy trials, or partner with the club.
                  </p>

                  {inquirySuccess ? (
                    <div className="mt-6 p-5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                          Inquiry Received
                        </div>
                        <p className="text-sm text-emerald-800 dark:text-emerald-300 mt-1">
                          Thank you for reaching out to {clubName}. Our administration desk will contact you shortly.
                        </p>
                        <button
                          type="button"
                          onClick={() => setInquirySuccess(false)}
                          className="mt-3 text-xs font-semibold text-emerald-800 dark:text-emerald-200 underline cursor-pointer"
                        >
                          Send another message
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmitInquiry} className="mt-6 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="inq-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                            Full Name *
                          </label>
                          <input
                            id="inq-name"
                            type="text"
                            required
                            value={inquiryName}
                            onChange={e => setInquiryName(e.target.value)}
                            placeholder="e.g. Sarah Namubiru"
                            className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        </div>
                        <div>
                          <label htmlFor="inq-phone" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                            Phone / WhatsApp *
                          </label>
                          <input
                            id="inq-phone"
                            type="tel"
                            required
                            value={inquiryPhone}
                            onChange={e => setInquiryPhone(e.target.value)}
                            placeholder="+256 7XX XXX XXX"
                            className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="inq-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                            Email Address (Optional)
                          </label>
                          <input
                            id="inq-email"
                            type="email"
                            value={inquiryEmail}
                            onChange={e => setInquiryEmail(e.target.value)}
                            placeholder="name@example.com"
                            className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        </div>
                        <div>
                          <label htmlFor="inq-interest" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                            Area of Interest
                          </label>
                          <select
                            id="inq-interest"
                            value={inquiryInterest}
                            onChange={e => setInquiryInterest(e.target.value as SupporterInquiry['interest'])}
                            className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                          >
                            <option value="Membership">Club Membership</option>
                            <option value="Academy">Youth Academy</option>
                            <option value="Sponsorship">Sponsorship &amp; Partnerships</option>
                            <option value="Merchandise">Kit &amp; Merchandise</option>
                            <option value="General">General Inquiry</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="inq-msg" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          Message (Optional)
                        </label>
                        <textarea
                          id="inq-msg"
                          rows={3}
                          value={inquiryMessage}
                          onChange={e => setInquiryMessage(e.target.value)}
                          placeholder="Tell us how you would like to participate or support the club..."
                          className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>

                      {inquiryError && (
                        <p className="text-xs font-medium text-red-600 dark:text-red-400">{inquiryError}</p>
                      )}

                      <button
                        type="submit"
                        disabled={inquirySubmitting}
                        className="px-6 py-2.5 bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
                      >
                        {inquirySubmitting ? 'Submitting...' : 'Submit Inquiry'}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </section>
          </main>
        )}
      </div>

      {/* Quiet Footer (Secretive admin portal access via Ctrl+Shift+A, /admin URL, or double-clicking footer emblem) */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/70 dark:bg-slate-900/70 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
            <div className="p-4 sm:p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Home Ground</div>
              <div className="mt-1 text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                {siteContent.homeGround}
              </div>
            </div>
            <div className="p-4 sm:p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Training Sessions</div>
              <div className="mt-1 text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                {siteContent.trainingSchedule}
              </div>
            </div>
            <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Member Portal</div>
                <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                  Personal Ledger
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigateToPublicPath('/me')}
                className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign In (/me)
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2 border-t border-slate-100 dark:border-slate-900">
            <div className="flex items-center gap-3">
              <img
                src={clubLogo}
                onDoubleClick={onNavigateAdmin}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = HARDCODED_LOGO_URL;
                }}
                alt={clubName}
                className="w-8 h-8 object-contain rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-white dark:bg-slate-900 select-none"
              />
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">{clubName}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  &copy; {new Date().getFullYear()} {clubName}. All rights reserved.
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
