'use client';

import React from 'react';
import { Target, Sparkles, Sliders, Layers } from 'lucide-react';

interface VerticalFitSliderProps {
  score: number;
  minScore: number;
  onMinScoreChange: (score: number) => void;
  className?: string;
}

export function VerticalFitSlider({
  score,
  minScore,
  onMinScoreChange,
  className = '',
}: VerticalFitSliderProps) {
  const steps = [0, 40, 60, 80];

  return (
    <div
      className={`bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl rounded-2xl p-3 flex flex-col items-center select-none shadow-[0_8px_32px_rgba(0,0,0,0.4)] ${className}`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-[#A78BFA] mb-3">
        <Target className="w-3.5 h-3.5 text-[#10B981]" />
        <span className="hidden sm:inline">Fit Gate</span>
      </div>

      {/* Vertical Track Container */}
      <div className="relative h-44 w-7 flex items-center justify-center my-1">
        {/* Track Line */}
        <div className="absolute top-2 bottom-2 w-1.5 bg-white/[0.08] rounded-full overflow-hidden">
          <div
            className="w-full bg-gradient-to-t from-[#8B5CF6] via-[#A78BFA] to-[#10B981] transition-all duration-300 rounded-full"
            style={{ height: `${minScore}%` }}
          />
        </div>

        {/* Step Notch Markers */}
        <div className="absolute inset-y-2 flex flex-col justify-between items-center pointer-events-none w-full">
          {steps.slice().reverse().map((step) => (
            <div
              key={step}
              className={`w-3 h-0.5 rounded-full transition-colors ${
                minScore >= step ? 'bg-[#A78BFA]' : 'bg-white/20'
              }`}
            />
          ))}
        </div>

        {/* Accessible Vertical Range Input */}
        <input
          type="range"
          min="0"
          max="80"
          step="20"
          value={minScore}
          onChange={(e) => onMinScoreChange(Number(e.target.value))}
          aria-label="Filter opportunities by minimum match score"
          aria-valuemin={0}
          aria-valuemax={80}
          aria-valuenow={minScore}
          aria-valuetext={`${minScore}% minimum fit`}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          style={{ appearance: 'none', WebkitAppearance: 'none' }}
        />

        {/* Visual Thumb Indicator */}
        <div
          className="absolute w-5 h-5 rounded-full bg-[#8B5CF6] border-2 border-white shadow-[0_0_12px_rgba(139,92,246,0.6)] flex items-center justify-center pointer-events-none transition-all duration-200"
          style={{
            bottom: `calc(${minScore}% - 10px)`,
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-white" />
        </div>
      </div>

      {/* Score Readout Display */}
      <div className="mt-3 text-center">
        <span className="font-mono text-xs font-bold text-white block">
          {minScore > 0 ? `${minScore}%+` : 'All'}
        </span>
        <span className="text-[9px] uppercase tracking-wider text-[#8B8B96] block leading-none">
          Threshold
        </span>
      </div>

      {/* Preset Toggles */}
      <div className="flex flex-col gap-1 mt-3 w-full">
        {steps.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onMinScoreChange(s)}
            className={`w-full py-1 text-[10px] rounded font-mono font-semibold transition-colors ${
              minScore === s
                ? 'bg-[#8B5CF6]/30 text-white border border-[#8B5CF6]/40'
                : 'text-[#8B8B96] hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            {s === 0 ? 'Any' : `${s}%`}
          </button>
        ))}
      </div>
    </div>
  );
}
