'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Sparkles, Send, ExternalLink, Bookmark, ArrowLeft,
  User, Loader2, Search, Zap, Globe, Target,
  ChevronRight, RefreshCw, CheckCircle2
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useUserStore } from '../store';
import { getOpportunityKey } from '../utils/score';
import { AppShell } from '@/components/layout/AppShell';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  opportunities?: any[];
  model?: string;
  loading?: boolean;
}

const SUGGESTIONS = [
  'Find remote fellowships for Nigerian developers',
  'Best hackathons for React engineers',
  'Machine learning grants in Africa',
  'Internships for UI/UX designers in Lagos',
  'Remote jobs requiring Python and FastAPI',
  'Scholarships for African tech students',
];

export default function NavigatorPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [savedJobs, setSavedJobs] = useState<string[]>([]);
  const [authUser, setAuthUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [saveToast, setSaveToast] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const { name, skills: userSkills, country, goals, hydrate } = useUserStore();

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setAuthUser(user);
        if (user) {
          const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', user.id).single();
          if (profile) {
            hydrate({
              name: profile.name || user.user_metadata?.name || user.email?.split('@')[0] || 'User',
              role: profile.role || 'Software Engineer',
              country: profile.country || 'Nigeria',
              skills: profile.skills || ['React', 'TypeScript'],
              goals: profile.goals || ['Remote Job', 'Fellowship'],
            });
          }
          const { data: saves } = await supabase.from('saved_jobs').select('job_url').eq('user_id', user.id);
          if (saves) setSavedJobs(saves.map((r: any) => r.job_url));
        }
      } catch (e) {
        console.warn('Auth init error:', e);
      } finally {
        setAuthLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (query?: string) => {
    const q = (query ?? input).trim();
    if (!q || isLoading) return;
    setInput('');

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: q };
    const loadingMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: '', loading: true };
    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/navigator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: q,
          userSkills: userSkills || [],
          userCountry: country || 'Nigeria',
          userGoals: goals || ['Remote Job', 'Fellowship'],
        }),
      });
      const data = await res.json();
      const assistantMsg: Message = {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: data.explanation || 'Here are the best matches I found for you.',
        opportunities: data.opportunities || [],
        model: data.model,
      };
      setMessages(prev => prev.map(m => m.loading ? assistantMsg : m));
    } catch {
      setMessages(prev => prev.map(m => m.loading ? { ...m, loading: false, content: 'Unable to reach Navigator service. Please try again.' } : m));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const saveOpportunity = async (opp: any) => {
    if (!authUser) {
      setSaveToast('Sign in to save opportunities');
      setTimeout(() => setSaveToast(''), 2500);
      return;
    }
    const jobKey = getOpportunityKey(opp);
    if (savedJobs.includes(jobKey)) return;
    try {
      await supabase.from('saved_jobs').insert({ user_id: authUser.id, job_url: jobKey, job_data: { ...opp, stage: 'wishlist' } });
      setSavedJobs(prev => [...prev, jobKey]);
      setSaveToast(`Saved "${opp.title}" to tracker`);
      setTimeout(() => setSaveToast(''), 2500);
    } catch (e) { console.warn('Save failed:', e); }
  };

  const clearChat = () => { setMessages([]); setInput(''); inputRef.current?.focus(); };

  return (
    <AppShell
      title="AI Opportunity Navigator"
      subtitle="Interactive opportunity discovery powered by Gemini 2.5 Flash"
      requireAuth={true}
    >
      <div className="max-w-4xl mx-auto flex flex-col min-h-[calc(100vh-12rem)] space-y-4">
        {/* Profile Context Banner & Reset */}
        <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1.5 text-white font-medium">
              <User className="w-3.5 h-3.5 text-[#8B5CF6]" />
              {name || 'User'} ({country || 'Nigeria'})
            </span>
            <span className="opacity-30">·</span>
            <span className="flex items-center gap-1.5 text-[#A78BFA]">
              <Target className="w-3.5 h-3.5 text-[#10B981]" />
              {userSkills?.slice(0, 4).join(', ') || 'No skills set'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearChat}
                className="flex items-center gap-1.5 text-xs text-[#8B8B96] hover:text-white border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-full transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> New Chat
              </button>
            )}
            <Link
              href="/settings"
              className="text-[#8B5CF6] hover:text-[#A78BFA] font-medium"
            >
              Edit skills →
            </Link>
          </div>
        </div>

      {/* Chat Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4 overflow-y-auto">

        {/* Welcome screen */}
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12 space-y-8">
            <div>
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#8B5CF6]/20 to-[#6366F1]/10 border border-[#8B5CF6]/20 flex items-center justify-center mx-auto mb-5 shadow-[0_0_40px_rgba(139,92,246,0.15)]">
                <Sparkles className="w-7 h-7 text-[#A78BFA]" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight">Your AI Opportunity Advisor</h2>
              <p className="text-[#A1A1AA] mt-3 max-w-xl mx-auto text-sm leading-relaxed">
                Ask in plain English. I search real, verified opportunities from the Pathify database and rank them against your skills and goals — no hallucinations, only grounded results.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {[
                { icon: Search, label: 'Real database search' },
                { icon: Zap, label: 'Instant match scoring' },
                { icon: Globe, label: 'Africa-first opportunities' },
                { icon: Bookmark, label: 'Save to tracker' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs text-[#A1A1AA]">
                  <Icon className="w-3 h-3 text-[#8B5CF6]" />{label}
                </div>
              ))}
            </div>
            <div className="w-full max-w-2xl">
              <p className="text-xs text-[#8B8B96] mb-3 uppercase tracking-widest font-semibold">Try asking</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => sendMessage(s)} className="text-left px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-[#8B5CF6]/40 hover:bg-[#8B5CF6]/[0.06] text-sm text-[#A1A1AA] hover:text-white transition-all group">
                    <span className="flex items-center justify-between gap-2">
                      <span className="line-clamp-1">"{s}"</span>
                      <ChevronRight className="w-3.5 h-3.5 shrink-0 text-[#8B5CF6] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Message thread */}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#6366F1] flex items-center justify-center shrink-0 mt-0.5 shadow-[0_0_12px_rgba(139,92,246,0.3)]">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
            )}
            <div className={`max-w-[85%] sm:max-w-[78%] space-y-4 ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
              <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-[#8B5CF6] text-white rounded-tr-sm shadow-[0_0_20px_rgba(139,92,246,0.25)]' : 'bg-white/[0.06] border border-white/[0.10] text-[#F5F5F7] rounded-tl-sm'}`}>
                {msg.loading ? (
                  <div className="flex items-center gap-2 text-[#A1A1AA]">
                    <Loader2 className="w-4 h-4 animate-spin text-[#8B5CF6]" />
                    <span>Searching verified opportunities…</span>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>

              {msg.model && !msg.loading && (
                <span className="text-[10px] font-mono text-[#8B8B96] px-2 py-0.5 rounded bg-white/[0.03] border border-white/[0.06]">
                  {msg.model === 'gemini-2.5-flash' ? '✦ Gemini 2.5 Flash' : '⚡ Smart Fallback'}
                </span>
              )}

              {msg.opportunities && msg.opportunities.length > 0 && (
                <div className="w-full space-y-2">
                  <p className="text-[11px] uppercase tracking-widest text-[#A1A1AA] font-bold">
                    {msg.opportunities.length} Grounded {msg.opportunities.length === 1 ? 'Match' : 'Matches'}
                  </p>
                  {msg.opportunities.map((opp: any, idx: number) => {
                    const score = opp.match_score ?? opp._navigator_score ?? 0;
                    const jobKey = opp.application_url || opp.id || String(idx);
                    const isSaved = savedJobs.includes(jobKey);
                    const detailHref = `/opportunities/${encodeURIComponent(jobKey)}`;
                    return (
                      <div key={idx} className="bg-black/40 border border-white/[0.10] hover:border-[#8B5CF6]/30 rounded-xl p-4 transition-all">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-bold tracking-widest uppercase text-[#A1A1AA]">{opp.opportunity_type?.replace(/_/g, ' ') || 'Opportunity'}</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${score >= 70 ? 'bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/20' : score >= 50 ? 'bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/20' : 'bg-white/5 text-[#A1A1AA] border border-white/10'}`}>{score}% match</span>
                            </div>
                            <Link href={detailHref}><h4 className="text-sm font-semibold hover:text-[#A78BFA] transition-colors line-clamp-1">{opp.title}</h4></Link>
                            <p className="text-xs text-[#A1A1AA] mt-0.5 truncate">{opp.organization} · {opp.location || 'Remote'}</p>
                            {opp.matched_skills && opp.matched_skills.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {opp.matched_skills.slice(0, 4).map((skill: string) => (
                                  <span key={skill} className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/15">✓ {skill}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <button onClick={() => saveOpportunity(opp)} disabled={isSaved} title={isSaved ? 'Already saved' : 'Save to tracker'} className={`p-1.5 rounded-lg transition-colors shrink-0 ${isSaved ? 'text-[#8B5CF6] bg-[#8B5CF6]/10' : 'text-[#8B8B96] hover:text-[#8B5CF6] hover:bg-[#8B5CF6]/10'}`}>
                            {isSaved ? <CheckCircle2 className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                          </button>
                        </div>
                        <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between">
                          <Link href={detailHref} className="text-xs text-[#8B5CF6] hover:text-[#A78BFA] font-medium flex items-center gap-1">View full analysis <ChevronRight className="w-3 h-3" /></Link>
                          {opp.application_url && (
                            <a href={opp.application_url} target="_blank" rel="noopener noreferrer" className="text-xs text-white bg-white/[0.08] hover:bg-white/[0.14] px-3 py-1 rounded-full font-medium flex items-center gap-1 transition-colors">Apply <ExternalLink className="w-3 h-3" /></a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!msg.loading && msg.opportunities !== undefined && msg.opportunities.length === 0 && (
                <div className="text-xs text-[#8B8B96] italic">No exact matches found. Try broader keywords — e.g., "remote fellowship" or "Python developer".</div>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-white/[0.08] border border-white/[0.12] flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5 text-[#A1A1AA]" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <div className="sticky bottom-0 border-t border-white/[0.08] bg-[#080414]/90 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex gap-3 items-end">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder={authUser ? `Ask about opportunities for ${name || 'you'}…` : 'Ask about jobs, fellowships, hackathons, grants…'}
              disabled={isLoading}
              className="flex-1 h-12 bg-white/[0.06] border border-white/[0.12] focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/20 rounded-full pl-5 pr-4 text-sm text-[#F5F5F7] placeholder-[#8B8B96] focus:outline-none transition-all disabled:opacity-60"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              className="w-12 h-12 bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-40 disabled:cursor-not-allowed rounded-full flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(139,92,246,0.35)] transition-all"
            >
              {isLoading ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
            </button>
          </div>
          <p className="text-center text-[10px] text-[#8B8B96] mt-2">Results grounded in verified Pathify database · Never hallucinated</p>
        </div>
      </div>

      {/* Save Toast */}
      {saveToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-[#0C071E] border border-[#8B5CF6]/30 text-white text-xs px-4 py-2.5 rounded-full shadow-xl flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />{saveToast}
        </div>
      )}
      </div>
    </AppShell>
  );
}
