import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { CLUB_PRESET_IMAGES, resolveClubImageUrl } from '../assets/clubImages';
import { DEFAULT_PUBLIC_SITE_CONTENT, publicSiteService } from '../services/publicSiteService';
import { ClubFixture, ClubMerchItem, ClubNewsPost, NewsCategory, PublicSiteContent, SupporterInquiry } from '../types';
import { openWhatsAppChat } from '../utils/whatsappReceipt';
import {
  Calendar,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Globe,
  Loader2,
  Mail,
  MessageSquare,
  Newspaper,
  Phone,
  Plus,
  Save,
  ShoppingBag,
  Sparkles,
  Trash2,
  Trophy,
  Upload,
  User as UserIcon,
  Wallet,
  X
} from 'lucide-react';

interface WebsiteCmsViewProps {
  onPreviewPublicSite?: () => void;
}

type CmsSection = 'news' | 'fixtures' | 'merch' | 'profile' | 'inquiries';

const NEWS_CATEGORIES: NewsCategory[] = ['Match Report', 'Club Notice', 'Community', 'Academy', 'Transfer'];

const CMS_SECTION_STORAGE_KEY = 'scb_cms_active_section_v1';
const VALID_CMS_SECTIONS: CmsSection[] = ['news', 'fixtures', 'merch', 'profile', 'inquiries'];

export const WebsiteCmsView: React.FC<WebsiteCmsViewProps> = ({ onPreviewPublicSite }) => {
  const { currentUser, userPermissions, users, addToast } = useApp();

  const canManageWebsite =
    currentUser?.role === 'OWNER' ||
    currentUser?.role === 'ADMIN' ||
    currentUser?.role === 'MEDIA' ||
    Boolean(userPermissions.canManageWebsite);

  const [section, setSection] = useState<CmsSection>(() => {
    if (typeof window === 'undefined') return 'news';
    try {
      const saved = window.localStorage.getItem(CMS_SECTION_STORAGE_KEY) as CmsSection | null;
      return saved && VALID_CMS_SECTIONS.includes(saved) ? saved : 'news';
    } catch {
      return 'news';
    }
  });
  const [content, setContent] = useState<PublicSiteContent>(
    () => publicSiteService.getCachedPublicSite(true) || DEFAULT_PUBLIC_SITE_CONTENT
  );
  const [inquiries, setInquiries] = useState<SupporterInquiry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingTarget, setUploadingTarget] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(CMS_SECTION_STORAGE_KEY, section);
    } catch {}
  }, [section]);

  // News Editor Modal State
  const [editingPost, setEditingPost] = useState<ClubNewsPost | null>(null);
  const [isNewPost, setIsNewPost] = useState(false);

  // Fixture Editor Modal State
  const [editingFixture, setEditingFixture] = useState<ClubFixture | null>(null);
  const [isNewFixture, setIsNewFixture] = useState(false);

  const operatorEmail = currentUser?.email || '';

  const handleUploadPhoto = async (
    targetKey: string,
    file: File | undefined,
    onSuccess: (url: string) => void
  ) => {
    if (!file || !operatorEmail) return;
    setUploadingTarget(targetKey);
    const res = await publicSiteService.uploadImage(file, operatorEmail);
    setUploadingTarget(null);
    if (res.success && res.url) {
      onSuccess(res.url);
      addToast('Photo uploaded and attached. Remember to save changes.', 'success');
    } else {
      addToast(res.error || 'Could not upload photo', 'error');
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setIsLoading(true);
      const [siteRes, inqRes] = await Promise.all([
        publicSiteService.fetchPublicSite(true, operatorEmail),
        operatorEmail ? publicSiteService.fetchInquiries(operatorEmail) : Promise.resolve({ success: false, data: [] })
      ]);
      if (mounted) {
        setContent(siteRes.content);
        if (inqRes.success && Array.isArray(inqRes.data)) {
          setInquiries(inqRes.data);
        }
        setIsLoading(false);
        if (siteRes.restoredFromLocalCache && operatorEmail && canManageWebsite) {
          const syncRes = await publicSiteService.savePublicSite(siteRes.content, operatorEmail);
          if (mounted && syncRes.success && syncRes.data) {
            setContent(syncRes.data);
          }
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [operatorEmail, canManageWebsite]);

  const persistContent = async (nextContent: PublicSiteContent, successMsg = 'Public club website updated') => {
    if (!operatorEmail) return;
    setIsSaving(true);
    const res = await publicSiteService.savePublicSite(nextContent, operatorEmail);
    setIsSaving(false);

    if (res.success && res.data) {
      setContent(res.data);
      addToast(successMsg, 'success');
    } else {
      addToast(res.error || 'Failed to save changes', 'error');
    }
  };

  // --- News Actions ---
  const handleOpenNewPost = () => {
    setIsNewPost(true);
    setEditingPost({
      id: `news-${Date.now()}`,
      title: '',
      category: 'Club Notice',
      summary: '',
      content: '',
      coverImage: 'preset:matchday',
      author: currentUser?.name || 'SC Basimbuzi Media',
      publishedAt: new Date().toISOString().slice(0, 10),
      featured: false,
      status: 'PUBLISHED'
    });
  };

  const handleSavePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPost || !editingPost.title.trim()) return;

    let nextNews = [...(content.news || [])];
    if (editingPost.featured) {
      nextNews = nextNews.map(n => ({ ...n, featured: false }));
    }

    if (isNewPost) {
      nextNews = [editingPost, ...nextNews];
    } else {
      nextNews = nextNews.map(n => (n.id === editingPost.id ? editingPost : n));
    }

    const nextContent = { ...content, news: nextNews };
    setEditingPost(null);
    await persistContent(nextContent, isNewPost ? 'News article published' : 'News article updated');
  };

  const handleDeletePost = async (id: string) => {
    const nextContent = {
      ...content,
      news: (content.news || []).filter(n => n.id !== id)
    };
    await persistContent(nextContent, 'Article removed from public site');
  };

  const handleTogglePostStatus = async (post: ClubNewsPost) => {
    const nextStatus: 'PUBLISHED' | 'DRAFT' = post.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    const nextNews = (content.news || []).map(n => (n.id === post.id ? { ...n, status: nextStatus } : n));
    await persistContent({ ...content, news: nextNews }, `Article marked as ${nextStatus.toLowerCase()}`);
  };

  // --- Fixture Actions ---
  const handleOpenNewFixture = () => {
    setIsNewFixture(true);
    setEditingFixture({
      id: `fix-${Date.now()}`,
      opponent: '',
      competition: 'Regional League',
      date: new Date().toISOString().slice(0, 10),
      time: '16:00',
      venue: content.homeGround || 'Basimbuzi Community Ground',
      isHome: true,
      status: 'UPCOMING'
    });
  };

  const handleSaveFixture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFixture || !editingFixture.opponent.trim()) return;

    const currentFixtures = content.fixtures || [];
    const nextFixtures = isNewFixture
      ? [editingFixture, ...currentFixtures]
      : currentFixtures.map(f => (f.id === editingFixture.id ? editingFixture : f));

    setEditingFixture(null);
    await persistContent({ ...content, fixtures: nextFixtures }, isNewFixture ? 'Fixture added' : 'Fixture updated');
  };

  const handleDeleteFixture = async (id: string) => {
    const nextFixtures = (content.fixtures || []).filter(f => f.id !== id);
    await persistContent({ ...content, fixtures: nextFixtures }, 'Fixture removed');
  };

  // --- Merchandise Actions ---
  const handleUpdateMerchField = (id: string, patch: Partial<ClubMerchItem>) => {
    setContent(prev => ({
      ...prev,
      merch: (prev.merch || []).map(m => (m.id === id ? { ...m, ...patch } : m))
    }));
  };

  const handleAddMerchItem = () => {
    const newItem: ClubMerchItem = {
      id: `merch-${Date.now()}`,
      name: 'Away Jersey',
      priceUgx: 65000,
      description: 'Official SC Basimbuzi supporter kit.',
      imageUrl: 'preset:jersey',
      sizes: ['S', 'M', 'L', 'XL'],
      inStock: true
    };
    setContent(prev => ({
      ...prev,
      merch: [...(prev.merch || []), newItem]
    }));
  };

  const handleRemoveMerchItem = (id: string) => {
    setContent(prev => ({
      ...prev,
      merch: (prev.merch || []).filter(m => m.id !== id)
    }));
  };

  // --- Inquiry Actions ---
  const handleToggleInquiryStatus = async (inq: SupporterInquiry) => {
    const nextStatus = inq.status === 'NEW' ? 'CONTACTED' : 'NEW';
    const res = await publicSiteService.updateInquiryStatus(inq.id, nextStatus, operatorEmail);
    if (res.success && res.data) {
      setInquiries(prev => prev.map(item => (item.id === inq.id ? res.data! : item)));
      addToast(`Marked inquiry as ${nextStatus.toLowerCase()}`, 'success');
    } else {
      addToast(res.error || 'Could not update inquiry status', 'error');
    }
  };

  if (!canManageWebsite) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8">
          <Globe className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Website CMS Restricted</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Only Owners, Admins, and Media Officers have permission to edit public club news and fixtures.
          </p>
        </div>
      </div>
    );
  }

  const newInquiriesCount = inquiries.filter(i => i.status === 'NEW').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
            <Globe className="w-4 h-4" />
            <span>Public Website Content Manager</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">
            Club News, Fixtures &amp; Supporter Webface
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Publish updates directly to the SC Basimbuzi public homepage without leaving the admin portal.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {onPreviewPublicSite && (
            <button
              type="button"
              onClick={onPreviewPublicSite}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>View Public Site</span>
            </button>
          )}
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-fit">
        {[
          { id: 'news' as CmsSection, label: `Club News (${content.news?.length || 0})`, icon: Newspaper },
          { id: 'fixtures' as CmsSection, label: `Fixtures & Results (${content.fixtures?.length || 0})`, icon: Trophy },
          { id: 'merch' as CmsSection, label: `Merchandise Store (${content.merch?.length || 0})`, icon: ShoppingBag },
          { id: 'profile' as CmsSection, label: 'Hero, About & Fee Targets', icon: Sparkles },
          {
            id: 'inquiries' as CmsSection,
            label: newInquiriesCount > 0 ? `Supporter Inquiries (${newInquiriesCount} new)` : `Supporter Inquiries (${inquiries.length})`,
            icon: MessageSquare
          }
        ].map(tab => {
          const Icon = tab.icon;
          const active = section === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSection(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                active
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="py-16 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading club website content...</span>
        </div>
      ) : (
        <>
          {/* TAB 1: CLUB NEWS */}
          {section === 'news' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Published &amp; Draft Articles</h2>
                <button
                  type="button"
                  onClick={handleOpenNewPost}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Article</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {(content.news || []).map(post => (
                  <div
                    key={post.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col justify-between"
                  >
                    <div>
                      <div className="aspect-[16/9] bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
                        <img
                          src={resolveClubImageUrl(post.coverImage, 'preset:matchday')}
                          alt={post.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-4 space-y-2">
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-semibold text-blue-600 dark:text-blue-400">{post.category}</span>
                          <span>
                            {post.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                            {post.featured ? ' · Featured' : ''}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">{post.title}</h3>
                        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{post.summary}</p>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          {post.publishedAt} · {post.author}
                        </div>
                      </div>
                    </div>

                    <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleTogglePostStatus(post)}
                        disabled={isSaving}
                        className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                      >
                        {post.status === 'PUBLISHED' ? 'Move to Draft' : 'Publish Now'}
                      </button>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setIsNewPost(false);
                            setEditingPost({ ...post });
                          }}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                          title="Edit article"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePost(post.id)}
                          disabled={isSaving}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 cursor-pointer"
                          title="Delete article"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: FIXTURES & RESULTS */}
          {section === 'fixtures' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Match Schedule &amp; Scorelines</h2>
                <button
                  type="button"
                  onClick={handleOpenNewFixture}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Fixture / Result</span>
                </button>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
                {(content.fixtures || []).map(fix => (
                  <div key={fix.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        <span className="font-semibold text-blue-600 dark:text-blue-400">{fix.status}</span>
                        <span className="mx-2">·</span>
                        <span>{fix.competition}</span>
                        <span className="mx-2">·</span>
                        <span>{fix.date} at {fix.time}</span>
                      </div>
                      <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                        {fix.isHome ? `SC Basimbuzi vs ${fix.opponent}` : `${fix.opponent} vs SC Basimbuzi`}
                        {fix.status === 'COMPLETED' && fix.homeScore !== undefined && fix.awayScore !== undefined && (
                          <span className="ml-2 font-mono text-blue-600 dark:text-blue-400">
                            ({fix.homeScore} – {fix.awayScore})
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{fix.venue}</div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setIsNewFixture(false);
                          setEditingFixture({ ...fix });
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteFixture(fix.id)}
                        disabled={isSaving}
                        className="p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                        title="Delete fixture"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: MERCHANDISE STORE */}
          {section === 'merch' && (
            <form
              onSubmit={e => {
                e.preventDefault();
                persistContent(content, 'Official merchandise catalog updated');
              }}
              className="space-y-6"
            >
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-blue-600" />
                      <span>Official Club Merchandise Catalog</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Items here appear on the dedicated public Merchandise page (/merchandise) with size selectors and WhatsApp ordering.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddMerchItem}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Kit Item</span>
                  </button>
                </div>

                {(content.merch || []).length === 0 ? (
                  <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                    No merchandise items added yet. Click &ldquo;Add Kit Item&rdquo; to publish official jerseys, scarves, or training wear.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(content.merch || []).map(item => (
                      <div
                        key={item.id}
                        className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                          <div className="md:col-span-4">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Item Name</label>
                            <input
                              type="text"
                              value={item.name}
                              onChange={e => handleUpdateMerchField(item.id, { name: e.target.value })}
                              className="w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Price (UGX)</label>
                            <input
                              type="number"
                              min={0}
                              value={item.priceUgx}
                              onChange={e => handleUpdateMerchField(item.id, { priceUgx: Math.max(0, Number(e.target.value) || 0) })}
                              className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                            />
                          </div>
                          <div className="md:col-span-4">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Description</label>
                            <input
                              type="text"
                              value={item.description}
                              onChange={e => handleUpdateMerchField(item.id, { description: e.target.value })}
                              className="w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                            />
                          </div>
                          <div className="md:col-span-2 flex items-end justify-between gap-2 pt-5">
                            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={item.inStock}
                                onChange={e => handleUpdateMerchField(item.id, { inStock: e.target.checked })}
                              />
                              <span>In Stock</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => handleRemoveMerchItem(item.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer"
                              title="Remove item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700/70 items-center">
                          <div className="md:col-span-4">
                            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                              Available Sizes (comma-separated)
                            </label>
                            <input
                              type="text"
                              value={(item.sizes || []).join(', ')}
                              onChange={e =>
                                handleUpdateMerchField(item.id, {
                                  sizes: e.target.value
                                    .split(',')
                                    .map(s => s.trim())
                                    .filter(Boolean)
                                })
                              }
                              placeholder="S, M, L, XL, XXL"
                              className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                            />
                          </div>
                          <div className="md:col-span-8 flex flex-wrap items-center gap-3 pt-4 md:pt-0">
                            <img
                              src={resolveClubImageUrl(item.imageUrl, 'preset:jersey')}
                              alt={item.name}
                              className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0"
                            />
                            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer shrink-0">
                              {uploadingTarget === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                              <span>{uploadingTarget === item.id ? 'Uploading...' : 'Upload Kit Photo'}</span>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/gif"
                                className="hidden"
                                disabled={uploadingTarget === item.id}
                                onChange={e => {
                                  const file = e.target.files?.[0];
                                  e.target.value = '';
                                  handleUploadPhoto(item.id, file, url => handleUpdateMerchField(item.id, { imageUrl: url }));
                                }}
                              />
                            </label>
                            <input
                              type="text"
                              value={item.imageUrl}
                              onChange={e => handleUpdateMerchField(item.id, { imageUrl: e.target.value })}
                              placeholder="preset:jersey, /uploads/..., or https://..."
                              className="flex-1 min-w-[180px] px-3 py-1.5 text-xs font-mono rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition cursor-pointer disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>Save Merchandise Catalog</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 4: HERO, ABOUT & MEMBER FEE TARGETS */}
          {section === 'profile' && (
            <form
              onSubmit={e => {
                e.preventDefault();
                persistContent(content, 'Homepage hero, about & fee targets saved');
              }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Hero Banner Settings */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <span>Homepage Hero Banner</span>
                  </h3>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Hero Headline
                    </label>
                    <input
                      type="text"
                      value={content.heroHeadline}
                      onChange={e => setContent(prev => ({ ...prev, heroHeadline: e.target.value }))}
                      className="w-full px-3.5 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Hero Subheadline
                    </label>
                    <textarea
                      rows={3}
                      value={content.heroSubheadline}
                      onChange={e => setContent(prev => ({ ...prev, heroSubheadline: e.target.value }))}
                      className="w-full px-3.5 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Hero Cover Photo
                    </label>
                    <div className="flex flex-col sm:flex-row gap-3 items-start mb-2">
                      <img
                        src={resolveClubImageUrl(content.heroImageUrl, 'preset:hero')}
                        alt="Hero preview"
                        className="w-28 h-18 object-cover rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shrink-0"
                      />
                      <div className="flex-1 w-full space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <select
                            value={content.heroImageUrl.startsWith('preset:') ? content.heroImageUrl : 'custom'}
                            onChange={e => {
                              if (e.target.value !== 'custom') {
                                setContent(prev => ({ ...prev, heroImageUrl: e.target.value }));
                              }
                            }}
                            className="flex-1 min-w-[160px] px-3.5 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                          >
                            {CLUB_PRESET_IMAGES.map(img => (
                              <option key={img.key} value={img.key}>{img.label}</option>
                            ))}
                            <option value="custom">Uploaded / Custom URL</option>
                          </select>
                          <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer shrink-0">
                            {uploadingTarget === 'hero' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                            <span>{uploadingTarget === 'hero' ? 'Uploading...' : 'Upload Photo'}</span>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              className="hidden"
                              disabled={uploadingTarget === 'hero'}
                              onChange={e => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                handleUploadPhoto('hero', file, url =>
                                  setContent(prev => ({ ...prev, heroImageUrl: url }))
                                );
                              }}
                            />
                          </label>
                        </div>
                        <input
                          type="text"
                          value={content.heroImageUrl}
                          onChange={e => setContent(prev => ({ ...prev, heroImageUrl: e.target.value }))}
                          placeholder="preset:hero, /uploads/..., or https://..."
                          className="w-full px-3.5 py-2 text-xs font-mono rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* About Club */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <span>Club Profile &amp; Training Details</span>
                  </h3>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      About Section Title
                    </label>
                    <input
                      type="text"
                      value={content.aboutTitle}
                      onChange={e => setContent(prev => ({ ...prev, aboutTitle: e.target.value }))}
                      className="w-full px-3.5 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      About Story
                    </label>
                    <textarea
                      rows={4}
                      value={content.aboutText}
                      onChange={e => setContent(prev => ({ ...prev, aboutText: e.target.value }))}
                      className="w-full px-3.5 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Founded Year
                      </label>
                      <input
                        type="text"
                        value={content.clubFoundedYear}
                        onChange={e => setContent(prev => ({ ...prev, clubFoundedYear: e.target.value }))}
                        className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Home Ground
                      </label>
                      <input
                        type="text"
                        value={content.homeGround}
                        onChange={e => setContent(prev => ({ ...prev, homeGround: e.target.value }))}
                        className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Training Schedule
                      </label>
                      <input
                        type="text"
                        value={content.trainingSchedule}
                        onChange={e => setContent(prev => ({ ...prev, trainingSchedule: e.target.value }))}
                        className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Season Contribution Target (for Member Portal /me Balance Tracker) */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-blue-600" />
                    <span>Member Contribution Target (/me Member Portal)</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Standard member targets are assigned automatically once gender is filled (Male: 50,000 UGX · Female: 30,000 UGX).
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Target Label
                    </label>
                    <input
                      type="text"
                      value={content.membershipTargetLabel || '2026 Season Membership Contribution'}
                      onChange={e => setContent(prev => ({ ...prev, membershipTargetLabel: e.target.value }))}
                      placeholder="e.g. 2026 Season Membership Contribution"
                      className="w-full px-3.5 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Standard Male / Base Target (UGX)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={content.membershipTargetUgx ?? 50000}
                      onChange={e => setContent(prev => ({ ...prev, membershipTargetUgx: Math.max(0, Number(e.target.value) || 0) }))}
                      className="w-full px-3.5 py-2 text-sm font-mono rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition cursor-pointer disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>Save Site Profile &amp; Targets</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 4: SUPPORTER INQUIRIES */}
          {section === 'inquiries' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
              {inquiries.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  No supporter or membership inquiries submitted yet. Inquiries from the public &ldquo;Join Club&rdquo; form will appear here.
                </div>
              ) : (
                inquiries.map(inq => (
                  <div key={inq.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className={`font-bold ${inq.status === 'NEW' ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {inq.status}
                        </span>
                        <span>·</span>
                        <span>{inq.interest}</span>
                        <span>·</span>
                        <span className="tabular-nums">{new Date(inq.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">{inq.fullName}</div>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Phone className="w-3.5 h-3.5 text-emerald-600" />
                          {inq.phone}
                        </span>
                        {inq.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5 text-blue-600" />
                            {inq.email}
                          </span>
                        )}
                      </div>
                      {inq.message && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 pt-1">{inq.message}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          openWhatsAppChat(
                            inq.phone,
                            `Hello ${inq.fullName}, thank you for contacting SC Basimbuzi regarding ${inq.interest}. How can we assist you?`
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                      >
                        WhatsApp Reply
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleInquiryStatus(inq)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{inq.status === 'NEW' ? 'Mark Contacted' : 'Reopen'}</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Article Editor Modal */}
      {editingPost && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSavePost}
            className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 my-8"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {isNewPost ? 'Publish New Club Article' : 'Edit Club Article'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingPost(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Title *</label>
              <input
                type="text"
                required
                value={editingPost.title}
                onChange={e => setEditingPost({ ...editingPost, title: e.target.value })}
                className="w-full px-3.5 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Category</label>
                <select
                  value={editingPost.category}
                  onChange={e => setEditingPost({ ...editingPost, category: e.target.value as NewsCategory })}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  {NEWS_CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Publish Date</label>
                <input
                  type="date"
                  value={editingPost.publishedAt}
                  onChange={e => setEditingPost({ ...editingPost, publishedAt: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Status</label>
                <select
                  value={editingPost.status}
                  onChange={e => setEditingPost({ ...editingPost, status: e.target.value as 'PUBLISHED' | 'DRAFT' })}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  <option value="PUBLISHED">Published</option>
                  <option value="DRAFT">Draft</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Published By (Author) *
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  list="cms-author-suggestions"
                  value={editingPost.author}
                  onChange={e => setEditingPost({ ...editingPost, author: e.target.value })}
                  placeholder="e.g. SC Basimbuzi Media Desk or Staff Name"
                  className="w-full pl-9 pr-3.5 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
                <datalist id="cms-author-suggestions">
                  <option value="SC Basimbuzi Media Desk" />
                  <option value="Club Secretariat" />
                  <option value="Head Coach" />
                  <option value="Academy Outreach" />
                  {users
                    .filter(u => u.status === 'ACTIVE' && u.name)
                    .map(u => (
                      <option key={u.email} value={u.name} />
                    ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Cover Photo</label>
              <div className="flex flex-col sm:flex-row gap-3 items-start">
                <img
                  src={resolveClubImageUrl(editingPost.coverImage, 'preset:matchday')}
                  alt="Article cover preview"
                  className="w-24 h-16 object-cover rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shrink-0"
                />
                <div className="flex-1 w-full space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={editingPost.coverImage.startsWith('preset:') ? editingPost.coverImage : 'custom'}
                      onChange={e => {
                        if (e.target.value !== 'custom') {
                          setEditingPost({ ...editingPost, coverImage: e.target.value });
                        }
                      }}
                      className="flex-1 min-w-[150px] px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    >
                      {CLUB_PRESET_IMAGES.map(img => (
                        <option key={img.key} value={img.key}>{img.label}</option>
                      ))}
                      <option value="custom">Uploaded / Custom URL</option>
                    </select>
                    <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer shrink-0">
                      {uploadingTarget === 'article' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      <span>{uploadingTarget === 'article' ? 'Uploading...' : 'Upload Photo'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        disabled={uploadingTarget === 'article'}
                        onChange={e => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          handleUploadPhoto('article', file, url =>
                            setEditingPost(prev => (prev ? { ...prev, coverImage: url } : null))
                          );
                        }}
                      />
                    </label>
                  </div>
                  <input
                    type="text"
                    value={editingPost.coverImage}
                    onChange={e => setEditingPost({ ...editingPost, coverImage: e.target.value })}
                    placeholder="preset:matchday, /uploads/..., or https://..."
                    className="w-full px-3 py-1.5 text-xs font-mono rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Short Summary *</label>
              <textarea
                rows={2}
                required
                value={editingPost.summary}
                onChange={e => setEditingPost({ ...editingPost, summary: e.target.value })}
                className="w-full px-3.5 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Full Story Content</label>
              <textarea
                rows={5}
                value={editingPost.content}
                onChange={e => setEditingPost({ ...editingPost, content: e.target.value })}
                className="w-full px-3.5 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(editingPost.featured)}
                  onChange={e => setEditingPost({ ...editingPost, featured: e.target.checked })}
                />
                <span>Feature as lead homepage story</span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingPost(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl cursor-pointer"
                >
                  {isSaving ? 'Saving...' : 'Save Article'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Fixture Editor Modal */}
      {editingFixture && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveFixture}
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 my-8"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {isNewFixture ? 'Add Match Fixture' : 'Edit Fixture / Result'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingFixture(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Opponent *</label>
                <input
                  type="text"
                  required
                  value={editingFixture.opponent}
                  onChange={e => setEditingFixture({ ...editingFixture, opponent: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Competition</label>
                <input
                  type="text"
                  value={editingFixture.competition}
                  onChange={e => setEditingFixture({ ...editingFixture, competition: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Date</label>
                <input
                  type="date"
                  value={editingFixture.date}
                  onChange={e => setEditingFixture({ ...editingFixture, date: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Kickoff Time</label>
                <input
                  type="text"
                  value={editingFixture.time}
                  onChange={e => setEditingFixture({ ...editingFixture, time: e.target.value })}
                  placeholder="16:00"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Match Status</label>
                <select
                  value={editingFixture.status}
                  onChange={e =>
                    setEditingFixture({
                      ...editingFixture,
                      status: e.target.value as ClubFixture['status']
                    })
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  <option value="UPCOMING">Upcoming</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="POSTPONED">Postponed</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Venue</label>
                <input
                  type="text"
                  value={editingFixture.venue}
                  onChange={e => setEditingFixture({ ...editingFixture, venue: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 pt-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingFixture.isHome}
                  onChange={e => setEditingFixture({ ...editingFixture, isHome: e.target.checked })}
                />
                <span>SC Basimbuzi is Home Team</span>
              </label>
            </div>

            {editingFixture.status === 'COMPLETED' && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Home Score
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editingFixture.homeScore ?? 0}
                      onChange={e => setEditingFixture({ ...editingFixture, homeScore: Number(e.target.value) || 0 })}
                      className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Away Score
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editingFixture.awayScore ?? 0}
                      onChange={e => setEditingFixture({ ...editingFixture, awayScore: Number(e.target.value) || 0 })}
                      className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Match Summary (Optional)
                  </label>
                  <input
                    type="text"
                    value={editingFixture.summary || ''}
                    onChange={e => setEditingFixture({ ...editingFixture, summary: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingFixture(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                {isSaving ? 'Saving...' : 'Save Fixture'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
