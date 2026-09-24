'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, CheckCircle2, AlertCircle, TrendingUp, Cpu, X, Bookmark, LogOut, Filter, Copy, Shield, Share2, Bell, Menu, Users } from 'lucide-react';
import axios from 'axios';
import { useUserStore } from '../store';
import { createClient } from '@/utils/supabase/client';
import { calculateWeightedMatch } from '../utils/score';

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
    application_url: "https://example.com",
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
    application_url: "https://example.com",
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

export default function PathifyDashboard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [tempSkills, setTempSkills] = useState('');
  const [savedJobs, setSavedJobs] = useState<string[]>([]);
  const [opportunities, setOpportunities] = useState<any[]>(fallbackOpportunities);
  const [isLoading, setIsLoading] = useState(false);
  const [engineStatus, setEngineStatus] = useState("Active (Mock / Fallback)");
  const [authUser, setAuthUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [passport, setPassport] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [alertOptIn, setAlertOptIn] = useState<boolean>(false);
  const [alertThreshold, setAlertThreshold] = useState<number>(70);
  const [navQuery, setNavQuery] = useState('');
  const [navResults, setNavResults] = useState<any[]|null>(null);
  const [navExplanation, setNavExplanation] = useState('');
  const [navLoading, setNavLoading] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { name, role, skills: userSkills, setProfile, setAll, country, passport_id } = useUserStore();
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
            setAll({
              name: profile.name || user.user_metadata?.name || user.email?.split('@')[0] || 'Ada',
              role: profile.role || 'Software Engineer',
              country: profile.country || 'Nigeria',
              skills: profile.skills || ["React", "TypeScript", "Next.js"],
              goals: profile.goals || ["Remote Job", "Fellowship"],
              setProfile: () => {},
              setAll: () => {},
            } as any);
          }
          // Load saved jobs
          const { data: saves } = await supabase.from('saved_jobs').select('job_url').eq('user_id', user.id);
          if (saves) setSavedJobs(saves.map((r: any) => r.job_url));
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
          setAll({
            name: profile.name, role: profile.role, country: profile.country,
            skills: profile.skills, goals: profile.goals, setProfile: () => {}, setAll: () => {},
          } as any);
        }
        const { data: saves } = await supabase.from('saved_jobs').select('job_url').eq('user_id', session.user.id);
        if (saves) setSavedJobs(saves.map((r: any) => r.job_url));
      } else {
        setSavedJobs([]);
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
        setAll({ name: d.name, role: d.role, country: d.country, skills: d.skills, goals: d.goals, passport_id: d.passport_id, passport_share_slug: d.passport_share_slug, is_passport_public: d.is_passport_public, passport_issued_at: d.passport_issued_at, setProfile: () => {}, setAll: () => {} } as any);
      }
    }).catch(() => {});
    // Alerts — use async IIFE to avoid PromiseLike catch issue
    (async () => {
      try {
        const { data } = await supabase.from('user_profiles').select('alert_opt_in, alert_threshold').eq('id', authUser.id).single();
        if (data) { setAlertOptIn(!!(data as any).alert_opt_in); setAlertThreshold((data as any).alert_threshold ?? 70); }
      } catch {}
    })();
  }, [authUser]);

  // Fetch live data via secure Next.js API route (Scheduled Actor → Dataset → Supabase cache → frontend)
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
          // Detect if cached vs live: presence of synced_at indicates Supabase cache path
          const isCached = normalizedData.some((r: any) => r.synced_at);
          setEngineStatus(isCached ? "Active (Supabase Cached · Scheduled Actor)" : "Active (Live Apify Dataset Connected)");
        } else if (response.data && response.data.error) {
          console.warn('API jobs error:', response.data.error);
        }
      } catch (error) {
        console.error("API fetch error, using fallback data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchLiveJobs();
  }, []);

  const calculateMatch = (requiredSkills: string[]) => {
    return calculateWeightedMatch(requiredSkills, userSkills).score;
  };

  const handleSaveSkills = async () => {
    const newSkills = tempSkills.split(',').map(s => s.trim()).filter(Boolean);
    setProfile({ skills: newSkills });
    setIsEditing(false);
    // Persist to Supabase if authenticated
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
    const pid = passport?.passport_id || passport_id;
    if (!pid) return;
    await navigator.clipboard.writeText(pid);
    setCopied(true); setTimeout(()=> setCopied(false), 1500);
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
    setCopied(true); setTimeout(()=> setCopied(false),1500);
  };
  const toggleAlert = async () => {
    const next = !alertOptIn;
    setAlertOptIn(next);
    if (authUser) {
      await supabase.from('user_profiles').update({ alert_opt_in: next, alert_threshold: alertThreshold }).eq('id', authUser.id);
    }
  };
  const handleNavigator = async () => {
    if (!navQuery.trim()) return;
    setNavLoading(true); setNavResults(null);
    try {
      const res = await fetch('/api/navigator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: navQuery, userSkills }) });
      const d = await res.json();
      setNavResults(d.opportunities || []); setNavExplanation(d.explanation || '');
    } catch { setNavResults([]); setNavExplanation('Navigator error'); }
    setNavLoading(false);
  };

  const toggleSaveJob = async (jobKey: string, opp?: any) => {
    const isSaved = savedJobs.includes(jobKey);
    // Optimistic
    setSavedJobs(prev => isSaved ? prev.filter(k => k !== jobKey) : [...prev, jobKey]);

    if (!authUser) return; // ephemeral only when not logged in

    try {
      if (isSaved) {
        await supabase.from('saved_jobs').delete().eq('user_id', authUser.id).eq('job_url', jobKey);
      } else {
        await supabase.from('saved_jobs').insert({
          user_id: authUser.id,
          job_url: jobKey,
          job_data: opp || null,
        });
      }
    } catch (e) {
      console.warn('Saved job sync failed', e);
      // rollback optimistic
      setSavedJobs(prev => isSaved ? [...prev, jobKey] : prev.filter(k => k !== jobKey));
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
    <div className="min-h-screen bg-[#080414] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#3b107c]/30 via-[#080414] to-[#04020a] text-[#F5F5F7] font-sans selection:bg-[#6366F1]/30">

      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#080414]/70 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' } as any}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-[64px] sm:min-h-[72px] flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 shrink-0">
            <div className="text-[#8B5CF6]"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 drop-shadow-[0_0_8px_rgba(139,92,246,0.3)]"><circle cx="6" cy="18" r="2"/><circle cx="6" cy="6" r="2"/><circle cx="18" cy="12" r="2"/><path d="M8 17.5L16 13"/><path d="M8 6.5L16 11"/></svg></div>
            <div className="flex flex-col"><h1 className="text-[20px] sm:text-[22px] font-black tracking-tighter bg-gradient-to-r from-[#F5F5F7] to-[#8B5CF6] bg-clip-text text-transparent leading-none">PATHIFY</h1><span className="text-[10px] tracking-[0.18em] uppercase text-[#A1A1AA]">By Pathfinder Labs</span></div>
          </Link>
          {/* Desktop — selective glass: header subtle, profile visible */}
          <div className="hidden sm:flex items-center gap-4">
            {authLoading ? <span className="text-xs text-[#8B8B96]">Loading…</span> : authUser ? (
              <div className="flex items-center gap-3">
                <div className="hidden lg:flex flex-col items-end">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{name}</span><span className="text-xs text-[#8B8B96]">• {role}</span>
                    {passport?.passport_id && <span className="font-mono text-[11px] text-[#A78BFA] bg-white/[0.05] border border-white/[0.10] rounded px-2 py-0.5">{passport.passport_id}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-[#A1A1AA]">{userSkills.slice(0,3).join(' · ')}</span>
                    <button onClick={()=>{ setTempSkills(userSkills.join(', ')); setIsEditing(true);}} className="text-xs text-[#8B5CF6] hover:text-[#A78BFA] font-medium">Edit skills</button>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${alertOptIn?'bg-emerald-500/20 text-emerald-400 border-emerald-500/20':'bg-white/5 text-[#8B8B96] border-white/10'}`}><Bell className="w-3 h-3 inline mr-1" />{alertOptIn?'On':'Off'}</span>
                  </div>
                </div>
                <Link href="/org" className="text-xs text-[#A1A1AA] hover:text-white border border-white/10 rounded-full px-3 py-1.5 hidden lg:block">For Organizations</Link>
                <Link href="/dashboard" className="text-xs bg-white/[0.06] border border-white/10 rounded-full px-3 py-1.5">Dashboard</Link>
                <button onClick={handleLogout} className="text-[#8B8B96] hover:text-white p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-white/5"><LogOut className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link href="/login" className="text-sm text-[#A1A1AA] hover:text-white px-4 py-2 min-h-[44px] inline-flex items-center rounded-full">Sign in</Link>
                <Link href="/signup" className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-sm font-bold px-5 py-2.5 rounded-full shadow-[0_0_20px_rgba(139,92,246,0.3)] min-h-[44px] inline-flex items-center">Create free account</Link>
              </div>
            )}
          </div>
          {/* Mobile hamburger — profile menu */}
          <button onClick={()=>setMobileOpen(!mobileOpen)} aria-label="Menu" className="sm:hidden p-2 -mr-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-white/5">
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {/* Mobile drawer — feed is primary, nav second */}
        {mobileOpen && (
          <div className="sm:hidden border-t border-white/[0.06] bg-[#080414]/95 backdrop-blur-xl px-4 py-4 space-y-4 max-h-[80vh] overflow-y-auto">
            {authUser ? (
              <>
                <div className="bg-white/[0.05] border border-white/[0.10] rounded-2xl p-4">
                  <p className="text-sm font-medium">{name} • {role}</p>
                  <p className="text-xs text-[#A1A1AA] mt-1">{userSkills.join(' · ')}</p>
                  <button onClick={()=>{ setMobileOpen(false); setTempSkills(userSkills.join(', ')); setIsEditing(true);}} className="mt-2 text-xs text-[#8B5CF6] font-medium">Edit skills →</button>
                </div>
                <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-3">
                  <p className="text-xs tracking-widest uppercase text-[#A1A1AA] flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-[#10B981]" /> My Passport — private by default</p>
                  {passport?.passport_id ? (
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-lg px-3 py-2">
                        <span className="font-mono text-sm text-[#A78BFA] flex-1 truncate">{passport.passport_id}</span>
                        <button onClick={copyPassport} className="p-1.5 min-h-[32px] min-w-[32px] flex items-center justify-center hover:bg-white/5 rounded"><Copy className="w-4 h-4" /></button>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`px-2 py-1 rounded-full border text-[11px] ${passport.is_passport_public?'bg-emerald-500/20 text-emerald-400 border-emerald-500/20':'bg-white/5 text-[#8B8B96] border-white/10'}`}>{passport.is_passport_public?'Public':'Private'}</span>
                        <button onClick={togglePublic} className="text-[#8B5CF6] font-medium">{passport.is_passport_public?'Make private':'Share'}</button>
                        {passport.is_passport_public && passport.passport_share_slug && <button onClick={copyShareLink} className="ml-auto text-[#A78BFA] flex items-center gap-1"><Share2 className="w-3.5 h-3.5" /> Copy link</button>}
                      </div>
                      {copied && <p className="text-xs text-[#10B981]">✓ Copied</p>}
                      <p className="text-xs text-[#8B8B96] leading-relaxed">Share with mentors or employers when you choose. Revoke anytime at <span className="text-[#A78BFA]">pathify.app/p/{passport.passport_share_slug || 'helen-oyiza'}</span></p>
                    </div>
                  ) : <p className="text-xs text-[#8B8B96] mt-2">Creating your passport — just a moment…</p>}
                </div>
                <div className="flex items-center justify-between bg-black/20 border border-white/5 rounded-xl p-3">
                  <span className="text-sm flex items-center gap-2"><Bell className="w-4 h-4 text-[#8B5CF6]" /> Email alerts ≥{alertThreshold}%</span>
                  <button onClick={toggleAlert} className={`px-3 py-1.5 rounded-full text-xs font-bold border min-h-[32px] ${alertOptIn?'bg-emerald-500/20 text-emerald-400 border-emerald-500/20':'bg-white/5 text-[#8B8B96] border-white/10'}`}>{alertOptIn?'On':'Off'}</button>
                </div>
                <nav className="space-y-1">
                  <Link href="/dashboard" onClick={()=>setMobileOpen(false)} className="flex items-center justify-between py-3 border-b border-white/5"><span>My Profile · Saved {savedJobs.length}</span><span className="text-[#8B5CF6]">→</span></Link>
                  <Link href="/org" onClick={()=>setMobileOpen(false)} className="flex items-center justify-between py-3 border-b border-white/5">For Organizations — Preview<Users className="w-4 h-4 text-[#8B8B96]" /></Link>
                  <Link href="/api/alerts/preview?threshold=70" target="_blank" className="flex items-center justify-between py-3 border-b border-white/5">Preview email<TrendingUp className="w-4 h-4" /></Link>
                  <button onClick={handleLogout} className="w-full text-left py-3 text-[#8B8B96]">Sign out</button>
                </nav>
              </>
            ) : (
              <div className="space-y-3">
                <Link href="/dashboard" onClick={()=>setMobileOpen(false)} className="block py-3 border-b border-white/5">Dashboard</Link>
                <Link href="/org" onClick={()=>setMobileOpen(false)} className="block py-3 border-b border-white/5">For Organizations</Link>
                <Link href="/login" onClick={()=>setMobileOpen(false)} className="block text-center py-3 rounded-full bg-white/5 border border-white/10">Sign in</Link>
                <Link href="/signup" onClick={()=>setMobileOpen(false)} className="block text-center py-3 rounded-full bg-[#8B5CF6] font-bold">Create free account</Link>
              </div>
            )}
          </div>
        )}
      </header>

      <div className="bg-white/[0.04] border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] leading-none text-[#A1A1AA]">
          <span className="flex items-center gap-2 font-medium tabular-nums"><span className="w-1.5 h-1.5 bg-[#10B981] rounded-full animate-pulse" /> Live · {opportunities.length} opportunities updated hourly</span>
          <span className="opacity-30 hidden sm:inline">·</span>
          <span className="text-[#A78BFA] font-medium">{opportunities.filter(o => calculateMatch(o.skills_required) >= 60).length} strong matches for you</span>
          <span className="opacity-30">·</span><span>{savedJobs.length} saved</span>
          {!authUser ? <span className="text-[#A1A1AA]">· <Link href="/signup" className="text-[#8B5CF6] hover:text-[#A78BFA]">Create free account to save & sync</Link></span> : <span className="hidden sm:inline text-[#8B8B96] ml-auto" title={engineStatus}>Updated {engineStatus.includes('Cached')?'from cache':'live'} · {new Date().toLocaleDateString()}</span>}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
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
                className={`shrink-0 snap-start px-3.5 py-1.5 rounded-full text-[13px] font-medium border min-h-8 transition-all ${selectedType === t.value ? 'bg-[#8B5CF6] border-[#8B5CF6] text-white shadow-[0_0_12px_rgba(139,92,246,0.35)]' : 'bg-white/[0.03] border-white/[0.08] text-[#A1A1AA] hover:text-white hover:border-white/15 hover:bg-white/[0.06]'}`}
              >
                {t.label}
              </button>
            ))}
            <span className="text-xs text-[#8B8B96] ml-2 shrink-0">{filteredOpportunities.length} opportunities found</span>
          </div>
        </div>

        {/* Navigator — warm coach, concise premium */}
        <div className="bg-white/[0.05] border border-white/[0.10] backdrop-blur-lg rounded-2xl p-6 md:p-6 mb-8 shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
          <p className="text-sm font-semibold flex items-center gap-2"><span className="w-2 h-2 bg-[#10B981] rounded-full animate-pulse" /> Ask in plain English — your smart finder</p>
          <p className="text-sm text-[#A1A1AA] leading-relaxed mt-1 max-w-prose">Find matches faster. Try: <span className="text-[#F5F5F7]">“Remote fellowship for Python” · “React hackathon Lagos” · “Design internship Nairobi”</span></p>
          <div className="flex gap-3 mt-4">
            <input value={navQuery} onChange={e=>setNavQuery(e.target.value)} onKeyDown={e=> e.key==='Enter' && handleNavigator()} placeholder="e.g., Nigerian designer looking for remote fellowships" className="flex-1 min-w-0 h-11 bg-black/30 border border-white/10 rounded-full px-4 text-sm text-[#F5F5F7] placeholder-[#8B8B96] focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/20" />
            <button onClick={handleNavigator} disabled={navLoading} className="bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-60 text-white text-sm font-bold px-6 h-11 rounded-full shrink-0 shadow-[0_0_16px_rgba(139,92,246,0.25)]">{navLoading?'Searching…':'Find opportunities'}</button>
          </div>
          {navExplanation && <p className="text-sm text-[#A78BFA] mt-3 bg-black/20 rounded-lg p-3 border border-white/5 leading-relaxed">{navExplanation}</p>}
          {navResults !== null && (
            <div className="mt-4">
              <p className="text-xs text-[#A1A1AA]">{navResults.length} {navResults.length===1?'opportunity':'opportunities'} found {navResults.length>0?'— sorted by your skills':''}</p>
              {navResults.length>0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                  {navResults.slice(0,4).map((opp:any, i:number) => (
                    <div key={i} className="bg-black/20 border border-white/5 hover:border-white/10 rounded-xl p-4 transition-colors">
                      <p className="text-sm font-medium line-clamp-1">{opp.title}</p>
                      <p className="text-xs text-[#A1A1AA]">{opp.organization} · {opp.location}</p>
                      <p className="text-xs text-[#A78BFA] mt-1">{opp._navigator_score ? `${opp._navigator_score}% your match` : `${opp.match_score ?? 0}% your match` } · <a href={opp.application_url} target="_blank" className="underline hover:text-white">View opportunity →</a></p>
                    </div>
                  ))}
                </div>
              )}
              {navResults.length===0 && <p className="text-sm text-[#A1A1AA] mt-2">No exact matches. Try broader: “fellowship remote” or “Python Lagos”. You can also browse all below.</p>}
              <button onClick={()=>{ setNavResults(null); setNavExplanation(''); setNavQuery(''); }} className="text-xs text-[#8B8B96] hover:text-white mt-4 py-1.5">Reset search</button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="text-center py-20 text-[#A1A1AA]">Finding fresh opportunities — one moment…</div>
        ) : filteredOpportunities.length === 0 ? (
          <div className="text-center py-20 max-w-xl mx-auto">
            <p className="text-[#F5F5F7] font-medium">No matches for these filters yet</p>
            <p className="text-sm text-[#A1A1AA] mt-2 leading-relaxed">Broaden your search or add a skill to discover more — e.g., add “Figma” or “Python”. Your matches update instantly.</p>
            <div className="flex justify-center gap-3 mt-4">
              {(searchTerm || selectedType) && <button onClick={() => { setSearchTerm(''); setSelectedType(''); }} className="bg-white/10 border border-white/10 rounded-full px-4 py-2 text-sm hover:bg-white/15">Reset search</button>}
              <a href="#navigator" onClick={(e)=>{ e.preventDefault(); document.querySelector('input[placeholder*=\"Nigerian designer\"]')?.scrollIntoView({behavior:'smooth'}); }} className="bg-[#8B5CF6] rounded-full px-4 py-2 text-sm font-bold">Ask Navigator →</a>
            </div>
            <p className="text-xs text-[#8B8B96] mt-3">Tip: Save your skills and get email alerts when new ≥70% matches appear.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {filteredOpportunities.map((opp, index) => {
              const matchScore = opp.match_score !== undefined ? opp.match_score : calculateMatch(opp.skills_required);
              const isHighMatch = matchScore >= 60;
              const jobKey = String(opp.application_url || opp.id || index);
              const isSaved = savedJobs.includes(jobKey);
              const displayType = (opp.opportunity_type?.replace(/_/g,' ') || "Remote Job").replace(/\b\w/g, (m:string)=>m.toUpperCase());
              const orgDomain = opp.source_domain || (opp.application_url ? (()=>{ try{ return new URL(opp.application_url).hostname.replace('www.',''); } catch{ return ''; }})() : '');
              const total = opp.skills_required?.length || 0;
              const matchedArr = opp.matched_skills && opp.matched_skills.length ? opp.matched_skills : opp.skills_required?.filter((s: string) => userSkills.map(us => us.toLowerCase()).includes(s.toLowerCase())) || [];
              const matchedCount = matchedArr.length;
              const gapCount = Math.max(0, total - matchedCount);
              let alignmentText = '';
              if (matchScore >= 80) alignmentText = `Strong match — you already cover ${matchedCount} of ${total} core skills.`;
              else if (matchScore >= 60) alignmentText = `Strong match — you cover most core skills.`;
              else if (matchScore >= 30) alignmentText = `Growing match — ${gapCount} skills to boost to 80%`;
              else alignmentText = `Starting point — add skills to boost your match`;

              return (
                <div key={jobKey} className="bg-white/[0.05] backdrop-blur-lg border border-white/[0.10] rounded-2xl flex flex-col justify-between overflow-hidden group hover:border-white/15 transition-colors shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
                  <div className="p-6 border-b border-white/[0.08] flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <span className="text-[11px] font-bold tracking-widest uppercase text-[#A1A1AA]">
                        {displayType}
                      </span>
                      <h3 className="text-[16px] font-semibold text-[#F5F5F7] mt-1 leading-tight group-hover:text-[#A78BFA] transition-colors line-clamp-2">{opp.title}</h3>
                      <p className="text-[13px] text-[#A1A1AA] mt-1 truncate">{opp.organization} · {opp.location || 'Remote'}</p>
                      {orgDomain && <p className="text-xs text-[#A78BFA]/80 mt-0.5">{orgDomain}</p>}
                    </div>
                    {opp.verification_status === 'high' ? (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-[#10B981] uppercase tracking-wider shrink-0" title="Verified — source looks trustworthy">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-[#F59E0B] uppercase tracking-wider shrink-0" title="Check details before applying — we haven't verified this listing yet.">
                        <AlertCircle className="w-3.5 h-3.5" /> Check details
                      </span>
                    )}
                  </div>

                  <div className="p-6 bg-white/[0.01]">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="relative w-12 h-12 flex items-center justify-center bg-black/40 rounded-full border border-white/10 shrink-0">
                        <svg viewBox="0 0 48 48" className="absolute inset-0 w-full h-full -rotate-90">
                          <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
                          <circle
                            cx="24" cy="24" r="20" fill="none"
                            stroke={isHighMatch ? "#A78BFA" : "#8B5CF6"}
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
                        <p className="text-[11px] uppercase tracking-widest text-[#A1A1AA] font-semibold mb-1" title="How your skills align with this opportunity">Your match</p>
                        <p className="text-sm text-[#F5F5F7] font-medium leading-tight">{alignmentText}</p>
                        {opp.match_breakdown?.by_category && (
                          <p className="text-[11px] text-[#8B8B96] mt-0.5">
                            {Object.entries(opp.match_breakdown.by_category).map(([cat, v]: any) => `${cat} ${v.pct}%`).join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3.5">
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-[#A1A1AA] w-16 shrink-0 mt-1">You have:</span>
                        <div className="flex flex-wrap gap-2">
                          {(matchedArr).slice(0, 4).map((skill: string) => (
                            <span key={skill} className="px-2.5 py-1 text-xs leading-none rounded-full bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/20">✓ {skill}</span>
                          ))}
                          {matchedArr.length === 0 && (
                            <span className="text-xs text-[#A1A1AA] italic">Add skills to see your fit → <button onClick={()=>{ setTempSkills(userSkills.join(', ')); setIsEditing(true);}} className="text-[#8B5CF6] underline">Edit skills</button></span>
                          )}
                          {matchedArr.length > 4 && <span className="text-xs text-[#8B8B96] self-center">+{matchedArr.length-4} more</span>}
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-[#A1A1AA] w-16 shrink-0 mt-1">Next to learn:</span>
                        <div className="flex flex-wrap gap-2">
                          {(opp.skill_gap && opp.skill_gap.length ? opp.skill_gap : opp.skills_required?.filter((s: string) => !userSkills.map(us => us.toLowerCase()).includes(s.toLowerCase())) || []).slice(0, 4).map((skill: string) => (
                            <span key={skill} className="px-2.5 py-1 text-xs leading-none rounded-full bg-white/[0.06] text-[#A1A1AA] border border-white/10">○ {skill}</span>
                          ))}
                          {(opp.skill_gap?.length === 0 || !opp.skill_gap) && matchedArr.length === total && total>0 && <span className="text-xs text-[#10B981]">You cover all listed skills</span>}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-6 py-4 border-t border-white/[0.08] flex items-center justify-between bg-black/20">
                    <div className="flex items-center gap-4 text-xs text-[#A1A1AA]">
                      <button
                        onClick={() => toggleSaveJob(jobKey, opp)}
                        title={isSaved ? 'Remove' : 'Save'}
                        className={`p-2 -m-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-white/5 transition-colors ${isSaved ? 'text-[#8B5CF6]' : 'text-[#A1A1AA] hover:text-white'}`}
                      >
                        <Bookmark className="w-4 h-4" fill={isSaved ? "currentColor" : "none"} />
                      </button>
                      <span>Found {opp.discovered_at || "today"} {orgDomain ? `· via ${orgDomain}` : ''}</span>
                    </div>
                    <a href={opp.application_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs font-bold text-[#F5F5F7] hover:text-[#A78BFA] transition-colors">
                      View opportunity <span className="inline-flex w-3.5 h-3.5 items-center justify-center">→</span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-12 pt-8 border-t border-white/[0.06] text-center text-[13px] leading-relaxed text-[#A1A1AA]">
          <p>Curated from trusted sources — YC Jobs, Devpost, OpportunityDesk & more. Updated hourly.</p>
          <p className="text-xs text-[#8B8B96] mt-1">Your profile stays private. Opportunities are scored against your skills. <Link href="/" className="text-[#8B5CF6] hover:text-[#A78BFA]">How we source →</Link></p>
        </div>
      </main>
    </div>
  );
}
