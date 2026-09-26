'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search, CheckCircle2, AlertCircle, TrendingUp, Cpu, X, Bookmark,
  LogOut, Filter, Copy, Shield, Share2, Bell, Menu, Users, Compass,
  Layers, CheckSquare, Sparkles, ExternalLink, ArrowRight, ChevronRight
} from 'lucide-react';
import axios from 'axios';
import { useUserStore } from '../store';
import { createClient } from '@/utils/supabase/client';
import { calculateWeightedMatch, calculateFullMatch, getOpportunityKey } from '../utils/score';
import { AppShell } from '@/components/layout/AppShell';
import { PathifyDome } from '@/components/visual/PathifyDome';
import { SecondaryTabs } from '@/components/layout/SecondaryTabs';

// Fallback mock data in case the API is offline
const fallbackOpportunities = [
  {
    id: 1,
    title: "Senior Full-Stack Engineer",
    organization: "Andela Global",
    location: "Remote (Africa / Global)",
    opportunity_type: "jobs_remote",
    application_url: "https://andela.com",
    skills_required: ["React", "TypeScript", "Python", "Next.js"],
    verification_status: "high",
    discovered_at: "2026-09-22",
    source_domain: "andela.com",
  },
  {
    id: 2,
    title: "AI/ML Research Fellowship",
    organization: "DeepLearning Hub",
    location: "Remote",
    opportunity_type: "fellowships",
    application_url: "https://example.com/fellowship",
    skills_required: ["Python", "Machine Learning", "Scikit-Learn", "Data Science"],
    verification_status: "high",
    discovered_at: "2026-09-22",
    source_domain: "example.com",
  },
  {
    id: 3,
    title: "Frontend Developer (Next.js)",
    organization: "AfroTech Labs",
    location: "Lagos / Remote",
    opportunity_type: "jobs_remote",
    application_url: "https://example.com/frontend",
    skills_required: ["Next.js", "Tailwind CSS", "TypeScript", "React"],
    verification_status: "review_recommended",
    discovered_at: "2026-09-22",
    source_domain: "example.com",
  },
];

const OPPORTUNITY_TYPES = [
  { value: "", label: "All" },
  { value: "jobs_remote", label: "Remote Jobs" },
  { value: "jobs_hybrid", label: "Hybrid" },
  { value: "jobs_onsite", label: "On-site" },
  { value: "internships", label: "Internships" },
  { value: "hackathons", label: "Hackathons" },
  { value: "fellowships", label: "Fellowships" },
  { value: "scholarships", label: "Scholarships" },
  { value: "grants", label: "Grants" },
  { value: "conferences", label: "Conferences" },
  { value: "events", label: "Events" },
];

const TRACKER_STAGES = [
  { key: 'wishlist', label: 'Wishlist', color: 'bg-white/10 text-white/80 border-white/15' },
  { key: 'applied', label: 'Applied', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  { key: 'interviewing', label: 'Interviewing', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { key: 'offer', label: 'Offer', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  { key: 'accepted', label: 'Accepted', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  { key: 'rejected', label: 'Rejected', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
];

export default function PathifyDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'feed' | 'tracker'>('feed');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [tempSkills, setTempSkills] = useState('');
  
  // Saved jobs & Application Tracker state
  const [savedJobs, setSavedJobs] = useState<string[]>([]);
  const [savedRecords, setSavedRecords] = useState<any[]>([]);
  
  const [opportunities, setOpportunities] = useState<any[]>(fallbackOpportunities);
  const [isLoading, setIsLoading] = useState(false);
  const [engineStatus, setEngineStatus] = useState("Active (Mock / Fallback)");
  const [authUser, setAuthUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [passport, setPassport] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [alertOptIn, setAlertOptIn] = useState<boolean>(false);
  const [alertThreshold, setAlertThreshold] = useState<number>(70);
  
  const [mobileOpen, setMobileOpen] = useState(false);

  const { name, role, skills: userSkills, setProfile, hydrate, country, goals } = useUserStore();
  const supabase = createClient();

  // Auth + profile + saved jobs hydration
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setAuthUser(user);
        if (user) {
          // Load profile
          const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', user.id).single();
          if (profile) {
            hydrate({
              name: profile.name || user.user_metadata?.name || user.email?.split('@')[0] || 'Ada',
              role: profile.role || 'Software Engineer',
              country: profile.country || 'Nigeria',
              skills: profile.skills || ["React", "TypeScript", "Next.js"],
              goals: profile.goals || ["Remote Job", "Fellowship"],
            });
          }
          // Load saved jobs with job_data (contains stage)
          const { data: saves } = await supabase.from('saved_jobs').select('*').eq('user_id', user.id);
          if (saves) {
            setSavedRecords(saves);
            setSavedJobs(saves.map((r: any) => r.job_url));
          }
        }
      } catch (e) {
        console.warn('Auth init fallback (Supabase not configured):', e);
      } finally {
        setAuthLoading(false);
      }
    };
    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setAuthUser(session?.user ?? null);
      if (session?.user) {
        const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', session.user.id).single();
        if (profile) {
          hydrate({
            name: profile.name, role: profile.role, country: profile.country,
            skills: profile.skills, goals: profile.goals,
          });
        }
        const { data: saves } = await supabase.from('saved_jobs').select('*').eq('user_id', session.user.id);
        if (saves) {
          setSavedRecords(saves);
          setSavedJobs(saves.map((r: any) => r.job_url));
        }
      } else {
        setSavedJobs([]);
        setSavedRecords([]);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Passport fetch for private-first display + alerts
  useEffect(() => {
    if (!authUser) { setPassport(null); setAlertOptIn(false); return; }
    fetch('/api/passport').then(r => r.json()).then(d => {
      if (!d.error) {
        setPassport(d);
        hydrate({ name: d.name, role: d.role, country: d.country, skills: d.skills, goals: d.goals, passport_id: d.passport_id, passport_share_slug: d.passport_share_slug, is_passport_public: d.is_passport_public, passport_issued_at: d.passport_issued_at } );
      }
    }).catch(() => {});
    
    (async () => {
      try {
        const { data } = await supabase.from('user_profiles').select('alert_opt_in, alert_threshold').eq('id', authUser.id).single();
        if (data) { setAlertOptIn(!!(data as any).alert_opt_in); setAlertThreshold((data as any).alert_threshold ?? 70); }
      } catch {}
    })();
  }, [authUser]);

  // Fetch live opportunities
  useEffect(() => {
    const fetchLiveJobs = async () => {
      try {
        setIsLoading(true);
        const response = await axios.get('/api/jobs');
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          const normalizedData = response.data.map((item: any, idx: number) => ({
            ...item,
            id: item.application_url || item.id || idx,
            skills_required: item.skills_required || ["Python", "React"],
            matched_skills: item.matched_skills || [],
            source_domain: item.source_domain || (item.application_url ? new URL(item.application_url).hostname : undefined),
          }));
          setOpportunities(normalizedData);
          const isCached = normalizedData.some((r: any) => r.synced_at);
          setEngineStatus(isCached ? "Active (Supabase Cached · Scheduled Actor)" : "Active (Live Apify Dataset Connected)");
        }
      } catch (error) {
        console.error("API fetch error, using fallback data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchLiveJobs();
  }, []);

  const calculateMatch = (opp: any) => {
    return calculateFullMatch(opp, userSkills, country || 'Nigeria', goals || ['Remote Job', 'Fellowship']).score;
  };

  const handleSaveSkills = async () => {
    const newSkills = tempSkills.split(',').map(s => s.trim()).filter(Boolean);
    setProfile({ skills: newSkills });
    setIsEditing(false);
    if (authUser) {
      try {
        await supabase.from('user_profiles').upsert({
          id: authUser.id,
          name, role, country,
          skills: newSkills,
          updated_at: new Date().toISOString(),
        });
      } catch (e) { console.warn('Profile save failed', e); }
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAuthUser(null);
  };

  const copyPassport = async () => {
    const pid = passport?.passport_id;
    if (!pid) return;
    await navigator.clipboard.writeText(pid);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  const togglePublic = async () => {
    const res = await fetch('/api/passport', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle_public' }) });
    const d = await res.json();
    if (!d.error) setPassport((p: any) => ({ ...p, ...d, is_passport_public: d.is_passport_public, passport_share_slug: d.passport_share_slug }));
  };

  const copyShareLink = async () => {
    const slug = passport?.passport_share_slug;
    if (!slug) return;
    const url = `${window.location.origin}/p/${slug}`;
    await navigator.clipboard.writeText(url);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  const toggleAlert = async () => {
    const next = !alertOptIn;
    setAlertOptIn(next);
    if (authUser) {
      await supabase.from('user_profiles').update({ alert_opt_in: next, alert_threshold: alertThreshold }).eq('id', authUser.id);
    }
  };

  // Navigator — redirect to dedicated page
  const handleNavigator = () => {
    router.push('/navigator');
  };

  // Application Tracker stage update
  const handleUpdateStage = async (jobKey: string, newStage: string) => {
    const canonicalKey = getOpportunityKey(jobKey);
    setSavedRecords(prev => prev.map(r => getOpportunityKey(r.job_url) === canonicalKey ? { ...r, job_data: { ...(r.job_data || {}), stage: newStage } } : r));
    if (authUser) {
      const existing = savedRecords.find(r => getOpportunityKey(r.job_url) === canonicalKey);
      const updatedData = { ...(existing?.job_data || {}), stage: newStage };
      try {
        await supabase.from('saved_jobs').update({ job_data: updatedData }).eq('user_id', authUser.id).eq('job_url', canonicalKey);
      } catch (err) {
        console.warn('Failed to update stage in Supabase:', err);
      }
    }
  };

  const toggleSaveJob = async (rawKey: string, opp?: any) => {
    const jobKey = getOpportunityKey(opp || rawKey);
    const isSaved = savedJobs.includes(jobKey);
    if (isSaved) {
      setSavedJobs(prev => prev.filter(k => k !== jobKey));
      setSavedRecords(prev => prev.filter(r => getOpportunityKey(r.job_url) !== jobKey));
      if (authUser) {
        await supabase.from('saved_jobs').delete().eq('user_id', authUser.id).eq('job_url', jobKey);
      }
    } else {
      setSavedJobs(prev => [...prev, jobKey]);
      const newRecord = {
        user_id: authUser?.id,
        job_url: jobKey,
        job_data: { ...(opp || {}), stage: 'wishlist' },
        created_at: new Date().toISOString()
      };
      setSavedRecords(prev => [...prev, newRecord]);
      if (authUser) {
        await supabase.from('saved_jobs').insert({
          user_id: authUser.id,
          job_url: jobKey,
          job_data: { ...(opp || {}), stage: 'wishlist' },
        });
      }
    }
  };

  const filteredOpportunities = opportunities.filter(opp => {
    const matchesSearch = !searchTerm ||
      opp.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      opp.organization?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (opp.skills_required && opp.skills_required.some((skill: string) => skill.toLowerCase().includes(searchTerm.toLowerCase()))) ||
      opp.source_domain?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = !selectedType || opp.opportunity_type === selectedType || opp.opportunity_type?.includes(selectedType);
    return matchesSearch && matchesType;
  });

  return (
    <AppShell title="Dashboard" subtitle="Personalized Opportunity Intelligence & Application Tracker">


      {/* Live status bar */}
      <div className="bg-white/[0.04] border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-y-2 text-[13px] text-[#A1A1AA]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-2 font-medium tabular-nums">
              <span className="w-1.5 h-1.5 bg-[#10B981] rounded-full animate-pulse" /> Live · {opportunities.length} opportunities verified
            </span>
            <span className="opacity-30 hidden sm:inline">·</span>
            <span className="text-[#A78BFA] font-medium">{opportunities.filter(o => calculateMatch(o) >= 60).length} strong matches for your skills</span>
            <span className="opacity-30">·</span>
            <span className="text-white">{savedJobs.length} in your tracker</span>
          </div>

          <div className="flex items-center gap-3 ml-auto text-xs">
            <Link href="/opportunities" className="text-[#8B5CF6] hover:text-[#A78BFA] font-medium flex items-center gap-1">
              Browse full catalog <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Main Workspace */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 relative z-10 space-y-8">
        {/* Spatial Opportunity Dome */}
        <PathifyDome
          totalOpportunities={opportunities.length}
          strongMatches={opportunities.filter((o) => calculateMatch(o) >= 60).length}
          userCountry={country || 'Nigeria'}
          userSkills={userSkills || ['React', 'TypeScript']}
        />

        {/* View Switcher Tabs using SecondaryTabs primitive */}
        <div className="flex items-center justify-between border-b border-white/[0.10] pb-2">
          <SecondaryTabs
            tabs={[
              { id: 'feed', label: 'Opportunities Feed', icon: Layers },
              {
                id: 'tracker',
                label: 'Application Tracker',
                icon: CheckSquare,
                badge: savedRecords.length > 0 ? savedRecords.length : undefined,
              },
            ]}
            activeTab={activeTab}
            onTabChange={(tabId) => setActiveTab(tabId as 'feed' | 'tracker')}
          />

          <Link
            href="/opportunities"
            className="hidden md:flex items-center gap-1 text-xs text-[#A78BFA] hover:text-white transition-colors"
          >
            Open Advanced Catalog View →
          </Link>
        </div>

        {/* TAB 1: OPPORTUNITIES FEED */}
        {activeTab === 'feed' && (
          <div>
            <div className="flex flex-col gap-6 mb-8">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B8B96] z-10" />
                <input
                  type="text"
                  placeholder="Search by role, skill, or organization — e.g., “React”, “Fellowship Lagos”"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="relative w-full h-12 bg-white/[0.05] border border-white/[0.10] rounded-full pl-11 pr-4 text-[15px] text-[#F5F5F7] placeholder-[#8B8B96] focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/20 transition-all shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
                />
              </div>

              <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar flex-nowrap sm:flex-wrap -mx-4 sm:mx-0 px-4 sm:px-0 pb-2 snap-x">
                <Filter className="w-4 h-4 text-[#8B8B96] shrink-0" />
                <span className="text-[11px] tracking-[0.14em] uppercase text-[#A1A1AA] mr-2 shrink-0">Filter:</span>
                {OPPORTUNITY_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setSelectedType(t.value)}
                    className={`shrink-0 snap-start px-3.5 py-1.5 rounded-full text-[13px] font-medium border min-h-8 transition-all ${
                      selectedType === t.value
                        ? 'bg-[#8B5CF6] border-[#8B5CF6] text-white shadow-[0_0_12px_rgba(139,92,246,0.35)]'
                        : 'bg-white/[0.03] border-white/[0.08] text-[#A1A1AA] hover:text-white hover:border-white/15 hover:bg-white/[0.06]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
                <span className="text-xs text-[#8B8B96] ml-2 shrink-0">{filteredOpportunities.length} opportunities</span>
              </div>
            </div>

            {isLoading ? (
              <div className="text-center py-20 text-[#A1A1AA]">Finding fresh opportunities — one moment…</div>
            ) : filteredOpportunities.length === 0 ? (
              <div className="text-center py-20 max-w-xl mx-auto">
                <p className="text-[#F5F5F7] font-medium">No matches for these filters yet</p>
                <p className="text-sm text-[#A1A1AA] mt-2 leading-relaxed">Try broadening your search or clear active filters.</p>
                <button
                  onClick={() => { setSearchTerm(''); setSelectedType(''); }}
                  className="mt-4 bg-white/10 border border-white/10 rounded-full px-5 py-2 text-sm hover:bg-white/15"
                >
                  Reset filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredOpportunities.map((opp, index) => {
                  const matchScore = calculateMatch(opp);
                  const isHighMatch = matchScore >= 60;
                  const jobKey = String(opp.application_url || opp.id || index);
                  const isSaved = savedJobs.includes(jobKey);
                  const savedRecord = savedRecords.find(r => r.job_url === jobKey);
                  const currentStage = savedRecord?.job_data?.stage || 'wishlist';
                  const displayType = (opp.opportunity_type?.replace(/_/g, ' ') || "Remote Job").replace(/\b\w/g, (m: string) => m.toUpperCase());
                  const orgDomain = opp.source_domain || (opp.application_url ? (() => { try { return new URL(opp.application_url).hostname.replace('www.', ''); } catch { return ''; } })() : '');
                  const total = opp.skills_required?.length || 0;
                  const matchedArr = opp.matched_skills && opp.matched_skills.length
                    ? opp.matched_skills
                    : opp.skills_required?.filter((s: string) => userSkills.map(us => us.toLowerCase()).includes(s.toLowerCase())) || [];
                  const matchedCount = matchedArr.length;
                  const detailHref = `/opportunities/${encodeURIComponent(jobKey)}`;

                  return (
                    <div key={jobKey} className="bg-white/[0.05] backdrop-blur-lg border border-white/[0.10] rounded-2xl flex flex-col justify-between overflow-hidden group hover:border-[#8B5CF6]/40 transition-all shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
                      <div className="p-6 border-b border-white/[0.08]">
                        <div className="flex justify-between items-start gap-3">
                          <div className="min-w-0">
                            <span className="text-[11px] font-bold tracking-widest uppercase text-[#A1A1AA]">
                              {displayType}
                            </span>
                            <Link href={detailHref} className="block mt-1">
                              <h3 className="text-[16px] font-semibold text-[#F5F5F7] leading-tight group-hover:text-[#A78BFA] transition-colors line-clamp-2">
                                {opp.title}
                              </h3>
                            </Link>
                            <p className="text-[13px] text-[#A1A1AA] mt-1 truncate">{opp.organization} · {opp.location || 'Remote'}</p>
                            {orgDomain && <p className="text-xs text-[#A78BFA]/80 mt-0.5">{orgDomain}</p>}
                          </div>

                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            {opp.verification_status === 'high' ? (
                              <span className="flex items-center gap-1 text-[11px] font-bold text-[#10B981] uppercase tracking-wider">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[11px] font-bold text-[#F59E0B] uppercase tracking-wider">
                                <AlertCircle className="w-3.5 h-3.5" /> Unverified
                              </span>
                            )}

                            {isSaved && (
                              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-purple-500/20 text-[#A78BFA] border border-purple-500/30">
                                {currentStage}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="p-6 bg-white/[0.01]">
                        <div className="flex items-center gap-4 mb-4">
                          <div className="relative w-12 h-12 flex items-center justify-center bg-black/40 rounded-full border border-white/10 shrink-0">
                            <svg viewBox="0 0 48 48" className="absolute inset-0 w-full h-full -rotate-90">
                              <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
                              <circle
                                cx="24" cy="24" r="20" fill="none"
                                stroke={isHighMatch ? "#10B981" : "#8B5CF6"}
                                strokeWidth="4"
                                strokeDasharray="126"
                                strokeDashoffset={126 - (126 * matchScore) / 100}
                                strokeLinecap="round"
                                className="transition-all duration-1000 ease-out"
                              />
                            </svg>
                            <span className="relative z-10 text-xs font-bold text-[#F5F5F7]">{matchScore}%</span>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-widest text-[#A1A1AA] font-semibold mb-0.5">Match Rating</p>
                            <p className="text-xs text-[#F5F5F7] font-medium leading-tight">
                              {matchScore >= 70 ? `Strong match — covers ${matchedCount} of ${total} skills` : `Good foundation — growth potential`}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2.5">
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-[#A1A1AA] w-14 shrink-0 mt-0.5">Matched:</span>
                            <div className="flex flex-wrap gap-1.5">
                              {matchedArr.slice(0, 3).map((skill: string) => (
                                <span key={skill} className="px-2 py-0.5 text-xs rounded-full bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/25">
                                  ✓ {skill}
                                </span>
                              ))}
                              {matchedArr.length === 0 && (
                                <span className="text-xs text-[#8B8B96] italic">None yet</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-start gap-2">
                            <span className="text-xs text-[#A1A1AA] w-14 shrink-0 mt-0.5">Gaps:</span>
                            <div className="flex flex-wrap gap-1.5">
                              {(opp.skills_required?.filter((s: string) => !userSkills.map(us => us.toLowerCase()).includes(s.toLowerCase())) || []).slice(0, 2).map((skill: string) => (
                                <span key={skill} className="px-2 py-0.5 text-xs rounded-full bg-white/[0.06] text-[#A1A1AA] border border-white/10">
                                  ○ {skill}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="px-6 py-4 border-t border-white/[0.08] flex items-center justify-between bg-black/20">
                        <button
                          onClick={() => toggleSaveJob(jobKey, opp)}
                          title={isSaved ? 'Remove from Tracker' : 'Save to Tracker'}
                          className={`p-2 -m-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-white/5 transition-colors ${
                            isSaved ? 'text-[#8B5CF6]' : 'text-[#A1A1AA] hover:text-white'
                          }`}
                        >
                          <Bookmark className="w-4 h-4" fill={isSaved ? "currentColor" : "none"} />
                        </button>

                        <div className="flex items-center gap-3">
                          <Link href={detailHref} className="text-xs font-medium text-[#A78BFA] hover:text-white transition-colors">
                            Details & Fit →
                          </Link>
                          <a
                            href={opp.application_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-bold text-white bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-full transition-colors"
                          >
                            Apply <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: APPLICATION TRACKER */}
        {activeTab === 'tracker' && (
          <div className="space-y-6">
            <div className="bg-white/[0.05] border border-white/[0.10] rounded-2xl p-6 backdrop-blur-lg">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <CheckSquare className="w-5 h-5 text-[#8B5CF6]" />
                    Application Tracker
                  </h2>
                  <p className="text-sm text-[#A1A1AA] mt-1">
                    Manage your active opportunities from initial discovery to offers. Stored in your private profile.
                  </p>
                </div>
                <Link
                  href="/opportunities"
                  className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-[0_0_16px_rgba(139,92,246,0.3)] transition-all"
                >
                  Discover more to save →
                </Link>
              </div>
            </div>

            {savedRecords.length === 0 ? (
              <div className="text-center py-20 bg-white/[0.02] border border-dashed border-white/10 rounded-2xl p-8">
                <Bookmark className="w-10 h-10 text-[#8B8B96] mx-auto mb-3 opacity-60" />
                <h3 className="text-base font-semibold">No saved opportunities yet</h3>
                <p className="text-sm text-[#A1A1AA] max-w-md mx-auto mt-2">
                  Bookmark opportunities from the feed or catalog to organize them across wishlist, applied, interviewing, and offer stages.
                </p>
                <button
                  onClick={() => setActiveTab('feed')}
                  className="mt-6 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-sm font-bold px-6 py-2.5 rounded-full"
                >
                  Browse opportunities now
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {savedRecords.map((record: any, idx: number) => {
                  const opp = record.job_data || {};
                  const jobKey = record.job_url || opp.application_url || String(idx);
                  const currentStage = opp.stage || 'wishlist';
                  const matchScore = calculateMatch(opp);
                  const detailHref = `/opportunities/${encodeURIComponent(jobKey)}`;

                  return (
                    <div
                      key={jobKey}
                      className="bg-white/[0.05] border border-white/[0.10] rounded-2xl p-5 flex flex-col justify-between backdrop-blur-lg hover:border-white/20 transition-all shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-[10px] tracking-widest uppercase text-[#A1A1AA] font-semibold">
                            {opp.opportunity_type?.replace(/_/g, ' ') || 'Opportunity'}
                          </span>
                          <span className="text-xs font-mono text-[#10B981] font-bold">
                            {matchScore}% match
                          </span>
                        </div>

                        <Link href={detailHref} className="block group">
                          <h4 className="text-base font-semibold group-hover:text-[#A78BFA] transition-colors line-clamp-2">
                            {opp.title || 'Untitled Opportunity'}
                          </h4>
                        </Link>
                        <p className="text-xs text-[#A1A1AA] mt-1">
                          {opp.organization || 'Organization'} · {opp.location || 'Remote'}
                        </p>

                        {/* Stage Selector */}
                        <div className="mt-4 pt-4 border-t border-white/[0.08]">
                          <label className="text-[11px] font-semibold uppercase tracking-wider text-[#A1A1AA] block mb-1.5">
                            Status Stage
                          </label>
                          <select
                            value={currentStage}
                            onChange={(e) => handleUpdateStage(jobKey, e.target.value)}
                            className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#8B5CF6]"
                          >
                            {TRACKER_STAGES.map(s => (
                              <option key={s.key} value={s.key} className="bg-[#080414] text-white">
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="mt-5 pt-3 border-t border-white/[0.08] flex items-center justify-between text-xs">
                        <button
                          onClick={() => toggleSaveJob(jobKey, opp)}
                          className="text-[#8B8B96] hover:text-rose-400 transition-colors"
                        >
                          Remove
                        </button>

                        <div className="flex items-center gap-2">
                          <Link href={detailHref} className="text-[#A78BFA] hover:underline font-medium">
                            Details
                          </Link>
                          {opp.application_url && (
                            <a
                              href={opp.application_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded-full font-medium inline-flex items-center gap-1"
                            >
                              Apply <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </main>

      {/* Edit Skills Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-[#0C071E] border border-white/15 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Edit Your Skills</h3>
              <button onClick={() => setIsEditing(false)} className="text-[#8B8B96] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-[#A1A1AA] leading-relaxed">
              Comma-separated skills (e.g. React, Python, Machine Learning, TypeScript). Matches update automatically.
            </p>
            <textarea
              value={tempSkills}
              onChange={(e) => setTempSkills(e.target.value)}
              rows={3}
              className="w-full bg-black/40 border border-white/15 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 rounded-full text-xs text-[#A1A1AA] hover:text-white hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSkills}
                className="px-5 py-2 rounded-full text-xs font-bold bg-[#8B5CF6] hover:bg-[#7C3AED] text-white shadow-[0_0_12px_rgba(139,92,246,0.3)]"
              >
                Save Skills
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
