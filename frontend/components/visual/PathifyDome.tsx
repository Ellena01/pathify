'use client';

import React from 'react';
import Link from 'next/link';
import { Compass, Sparkles, Shield, ChevronRight, Globe, Layers } from 'lucide-react';

interface PathifyDomeProps {
  totalOpportunities?: number;
  strongMatches?: number;
  userCountry?: string;
  userSkills?: string[];
  className?: string;
}

export function PathifyDome({
  totalOpportunities = 50,
  strongMatches = 12,
  userCountry = 'Nigeria',
  userSkills = ['React', 'Python', 'TypeScript'],
  className = '',
}: PathifyDomeProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#180E38]/60 via-[#0C0620]/80 to-[#080414] border border-white/[0.10] p-6 sm:p-8 backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] ${className}`}
    >
      {/* Radial Celestial Dome Arc Background */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-gradient-to-b from-[#8B5CF6]/20 via-[#6366F1]/10 to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Spatial Orbital Rings */}
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[520px] h-[520px] rounded-full border border-[#8B5CF6]/15 pointer-events-none" />
      <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full border border-dashed border-[#A78BFA]/10 pointer-events-none" />
      <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-[280px] h-[280px] rounded-full border border-[#10B981]/15 pointer-events-none" />

      {/* Floating Constellation Nodes representing opportunity types */}
      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 text-xs font-semibold text-[#A78BFA] mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-ping" />
            <span>Spatial Opportunity Intelligence Dome</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-snug">
            Calibrated for{' '}
            <span className="bg-gradient-to-r from-[#A78BFA] via-[#C084FC] to-[#8B5CF6] bg-clip-text text-transparent">
              {userCountry}
            </span>{' '}
            & your active skillset
          </h2>

          <p className="text-xs sm:text-sm text-[#A1A1AA] mt-2 leading-relaxed">
            Live multi-source constellation scanning YC Jobs, Devpost, OpportunityDesk, and remote tech ecosystems. 
            Deterministic fit calculated across {userSkills.slice(0, 4).join(', ')}.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-4">
            <Link
              href="/opportunities"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#8B5CF6] hover:bg-[#7C3AED] text-white shadow-[0_0_16px_rgba(139,92,246,0.35)] transition-all"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Explore Verified Catalog</span>
            </Link>

            <Link
              href="/navigator"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-white/[0.06] hover:bg-white/10 text-white border border-white/10 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#10B981]" />
              <span>Ask AI Navigator</span>
            </Link>
          </div>
        </div>

        {/* Live Dome Telemetry Pods */}
        <div className="grid grid-cols-2 gap-3 w-full md:w-auto shrink-0">
          <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-md flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#8B8B96] flex items-center gap-1.5">
              <Globe className="w-3 h-3 text-[#8B5CF6]" /> Total Verified
            </span>
            <span className="text-2xl font-black text-white font-mono mt-2">
              {totalOpportunities}
            </span>
            <span className="text-[10px] text-[#10B981] mt-0.5 flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-[#10B981]" /> Hourly Sync
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-[#8B5CF6]/10 border border-[#8B5CF6]/25 backdrop-blur-md flex flex-col justify-between shadow-[0_0_20px_rgba(139,92,246,0.15)]">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#A78BFA] flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-[#10B981]" /> Top Matches
            </span>
            <span className="text-2xl font-black text-[#F5F5F7] font-mono mt-2">
              {strongMatches}
            </span>
            <span className="text-[10px] text-[#A78BFA] mt-0.5">
              60%+ Fit Score
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
