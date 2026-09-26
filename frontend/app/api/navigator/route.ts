import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { calculateFullMatch, calculateWeightedMatch } from '@/app/utils/score';
import { google } from '@ai-sdk/google';
import { streamText, generateText, tool, isStepCount } from 'ai';
import { z } from 'zod';

// Fallback mock opportunities if database is unreachable
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
  {
    id: 4,
    title: "Pan-African Tech Seed Grant",
    organization: "African Development Bank",
    location: "Pan-Africa",
    opportunity_type: "grants",
    application_url: "https://afdb.org/grants",
    skills_required: ["Product Design", "Python", "FinTech"],
    verification_status: "high",
    discovered_at: "2026-09-23",
    source_domain: "afdb.org",
  },
  {
    id: 5,
    title: "Open Source AI Hackathon 2026",
    organization: "Data Science Nigeria",
    location: "Lagos / Hybrid",
    opportunity_type: "hackathons",
    application_url: "https://datasciencenigeria.org/hackathon",
    skills_required: ["Python", "Machine Learning", "FastAPI"],
    verification_status: "high",
    discovered_at: "2026-09-24",
    source_domain: "datasciencenigeria.org",
  }
];

const TYPE_KEYWORDS: Record<string, string[]> = {
  jobs_remote: ['remote job', 'remote jobs', 'remote', 'work from home'],
  jobs_hybrid: ['hybrid job', 'hybrid'],
  jobs_onsite: ['on-site', 'onsite', 'on site job'],
  internships: ['internship', 'intern', 'internships'],
  hackathons: ['hackathon', 'hackathons', 'hack'],
  fellowships: ['fellowship', 'fellowships', 'fellow'],
  scholarships: ['scholarship', 'scholarships', 'bursary'],
  grants: ['grant', 'grants', 'funding', 'fund'],
  conferences: ['conference', 'conferences', 'summit'],
  events: ['event', 'events', 'meetup'],
  startup_funding: ['startup funding', 'startup', 'seed funding'],
};

const SKILL_ALIASES: Record<string, string[]> = {
  React: ['react', 'react.js', 'reactjs', 'next.js', 'nextjs'],
  Python: ['python', 'python3'],
  'Machine Learning': ['machine learning', 'ml', 'scikit-learn', 'sklearn'],
  'Data Science': ['data science', 'data analytics'],
  TypeScript: ['typescript', 'ts'],
  'UI/UX Design': ['ui/ux', 'ui/ux design', 'product design', 'figma'],
};

function parseSlots(message: string) {
  const lower = (message || '').toLowerCase();
  const slots: any = {};
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) { slots.opportunity_type = type; break; }
  }
  const skills: string[] = [];
  for (const [canon, aliases] of Object.entries(SKILL_ALIASES)) {
    if (aliases.some(a => lower.includes(a)) || lower.includes(canon.toLowerCase())) skills.push(canon);
  }
  if (skills.length) slots.skills = skills;
  if (lower.includes('lagos')) slots.location = 'Lagos';
  else if (lower.includes('nairobi')) slots.location = 'Nairobi';
  else if (lower.includes('kenya')) slots.location = 'Kenya';
  else if (lower.includes('nigeria')) slots.location = 'Nigeria';
  else if (lower.includes('remote')) slots.location = 'Remote';
  else if (lower.includes('global')) slots.location = 'Global';
  return slots;
}

// Fetch opportunities from Supabase with graceful fallback
async function fetchOpportunities(supabase: any) {
  try {
    const { data, error } = await supabase
      .from('opportunities_cache')
      .select('*')
      .limit(60)
      .order('discovered_at', { ascending: false });
    if (error || !data || data.length === 0) {
      return fallbackOpportunities;
    }
    return data;
  } catch {
    return fallbackOpportunities;
  }
}

export async function POST(request: Request) {
  let body: any = {};
  try { body = await request.json(); } catch {}

  const message = body.message || body.query || (Array.isArray(body.messages) ? body.messages[body.messages.length - 1]?.content : '') || '';
  const userSkills: string[] = Array.isArray(body.userSkills) ? body.userSkills : [];
  const userCountry: string = body.userCountry || 'Nigeria';
  const userGoals: string[] = Array.isArray(body.userGoals) ? body.userGoals : ['Remote Job', 'Fellowship'];
  const wantsStream = body.stream === true || request.headers.get('accept')?.includes('text/event-stream');

  const supabase = await createClient();
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  // Track discovered opportunities in closure so tools can populate them for client
  const matchedOpportunities: any[] = [];

  // ==========================================
  // PATH A: Real Gemini API Available
  // ==========================================
  if (apiKey) {
    try {
      const tools: any = {
        search_opportunities: tool({
          description: 'Search real, verified opportunities in the database by keyword, role type, or location. NEVER invent opportunities.',
          parameters: z.object({
            query: z.string().optional().describe('Search keyword like "frontend", "python", "machine learning"'),
            opportunity_type: z.string().optional().describe('Type filter like "jobs_remote", "fellowships", "hackathons", "grants"'),
            location: z.string().optional().describe('Location filter like "Remote", "Lagos", "Nairobi"'),
            min_score: z.number().optional().describe('Minimum match score (0-100)'),
          }),
          execute: async ({ query, opportunity_type, location, min_score }: { query?: string; opportunity_type?: string; location?: string; min_score?: number }) => {
            const allOpps = await fetchOpportunities(supabase);
            let filtered = allOpps.filter((opp: any) => {
              if (opportunity_type && opp.opportunity_type !== opportunity_type && !opp.opportunity_type?.includes(opportunity_type)) {
                return false;
              }
              if (location && !opp.location?.toLowerCase().includes(location.toLowerCase())) {
                return false;
              }
              if (query) {
                const q = query.toLowerCase();
                const titleMatch = opp.title?.toLowerCase().includes(q);
                const orgMatch = opp.organization?.toLowerCase().includes(q);
                const skillsMatch = (opp.skills_required || []).some((s: any) => {
                  const name = typeof s === 'string' ? s : s.canonical || '';
                  return name.toLowerCase().includes(q);
                });
                if (!titleMatch && !orgMatch && !skillsMatch) return false;
              }
              return true;
            });

            // Score against candidate skills using 4-factor scoring
            const scored = filtered.map((opp: any) => {
              const fit = calculateFullMatch(opp, userSkills, userCountry, userGoals);
              const resultItem = {
                ...opp,
                match_score: fit.score,
                matched_skills: fit.matched,
                skill_gap: fit.gap,
                breakdown: fit.breakdown,
                explanation: fit.explanation,
              };
              matchedOpportunities.push(resultItem);
              return {
                title: opp.title,
                organization: opp.organization,
                location: opp.location,
                opportunity_type: opp.opportunity_type,
                application_url: opp.application_url,
                match_score: fit.score,
                matched_skills: fit.matched,
                skill_gap: fit.gap,
                breakdown: fit.breakdown,
              };
            });

            const min = min_score || 0;
            const finalMatches = scored.filter((s: any) => s.match_score >= min).sort((a: any, b: any) => b.match_score - a.match_score).slice(0, 10);
            return {
              count: finalMatches.length,
              results: finalMatches,
            };
          },
        } as any),

        calculate_fit: tool({
          description: 'Calculates the 4-factor match score (skills 60%, location 20%, goals 10%, experience 10%) between an opportunity and the user profile.',
          parameters: z.object({
            opportunity_title: z.string(),
            required_skills: z.array(z.string()),
            location: z.string().optional(),
          }),
          execute: async ({ opportunity_title, required_skills, location }: { opportunity_title: string; required_skills: string[]; location?: string }) => {
            const fit = calculateFullMatch({ title: opportunity_title, location: location || 'Remote', skills_required: required_skills }, userSkills, userCountry, userGoals);
            return fit;
          },
        } as any),

        get_user_skills: tool({
          description: 'Retrieves the candidate skills, country, and career goals from the session profile.',
          parameters: z.object({}),
          execute: async () => {
            return {
              skills: userSkills,
              country: userCountry,
              goals: userGoals,
            };
          },
        } as any),

        save_to_tracker: tool({
          description: 'Saves an opportunity to the candidate application tracker with a specific stage.',
          parameters: z.object({
            job_url: z.string().url().describe('The application URL of the opportunity'),
            stage: z.enum(['wishlist', 'applied', 'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn']).default('wishlist'),
            notes: z.string().optional(),
          }),
          execute: async ({ job_url, stage, notes }: { job_url: string; stage: any; notes?: string }) => {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) {
                return { success: false, message: 'User not signed in. Log in to persist to tracker.' };
              }
              const allOpps = await fetchOpportunities(supabase);
              const opp = allOpps.find((o: any) => o.application_url === job_url) || { application_url: job_url };
              await supabase.from('saved_jobs').upsert({
                user_id: user.id,
                job_url,
                job_data: { ...opp, stage, notes: notes || '' },
              });
              return { success: true, message: `Saved to tracker in "${stage}" stage.` };
            } catch (err: any) {
              return { success: false, error: err.message };
            }
          },
        } as any),
      };

      const systemPrompt = `You are Pathify AI Navigator, an elite, empowering career copilot and opportunity advisor for African and emerging-market tech talent.
Your mission is to help candidates discover and land tech jobs, fellowships, hackathons, scholarships, and grants.

STRICT INSTRUCTIONS:
1. NEVER hallucinate or invent opportunities, URLs, or organizations. You must call search_opportunities to find real listings.
2. Personalize recommendations to the candidate's actual skills (${userSkills.join(', ') || 'General tech'}), country (${userCountry}), and goals (${userGoals.join(', ')}).
3. If opportunities are found, summarize them clearly with match score %, why they fit, and skills to highlight or prepare.
4. Keep answers concise, high-energy, encouraging, and directly actionable.`;

      if (wantsStream) {
        const streamResult = streamText({
          model: google('gemini-2.5-flash'),
          system: systemPrompt,
          messages: [{ role: 'user', content: message }],
          tools,
          // ai@7: stopWhen replaces maxSteps — allows tool call + final text response
          stopWhen: isStepCount(5),
        });
        return streamResult.toTextStreamResponse();
      }

      // Non-streaming / structured JSON request
      // stopWhen: isStepCount(5) allows multiple steps:
      //   step 1 = tool call, step 2 = receive results + generate final text
      // Without this, Gemini returns only tool calls with no text (empty output error)
      const textResult = await generateText({
        model: google('gemini-2.5-flash'),
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
        tools,
        stopWhen: isStepCount(5),
      });

      // Fallback explanation if model returned only tool results with no final text
      const explanation = textResult.text ||
        (matchedOpportunities.length > 0
          ? `Found ${matchedOpportunities.length} opportunities matching your query. Top results ranked by your profile fit.`
          : `No exact matches found. Try broader keywords like "remote fellowship", "React developer", or "Python machine learning"`);

      return NextResponse.json({
        model: 'gemini-2.5-flash',
        explanation,
        opportunities: matchedOpportunities.slice(0, 10),
        count: matchedOpportunities.length,
      });
    } catch (geminiError: any) {
      console.warn('Gemini Navigator error, falling back to deterministic engine:', geminiError?.message || geminiError);
      // Fall through to deterministic engine
    }
  }

  // ==========================================
  // PATH B: Deterministic Engine (Offline / Fallback)
  // ==========================================
  const slots = { ...parseSlots(message), ...(body.filters || {}) };
  const allOpps = await fetchOpportunities(supabase);

  let filtered = allOpps;

  if (slots.opportunity_type) {
    filtered = filtered.filter((opp: any) =>
      opp.opportunity_type === slots.opportunity_type ||
      opp.opportunity_type?.includes(slots.opportunity_type)
    );
  }

  if (slots.location) {
    const loc = slots.location.toLowerCase();
    filtered = filtered.filter((opp: any) =>
      opp.location?.toLowerCase().includes(loc)
    );
  }

  if (slots.skills && slots.skills.length) {
    const lowerWanted = slots.skills.map((s: string) => s.toLowerCase());
    filtered = filtered.filter((opp: any) => {
      const req = (opp.skills_required || []).map((s: any) =>
        (typeof s === 'string' ? s : s.canonical || '').toLowerCase()
      );
      return lowerWanted.some((w: string) => req.some((r: string) => r.includes(w) || w.includes(r)));
    });
  }

  // Rank by 4-factor scoring
  const ranked = filtered.map((opp: any) => {
    const fit = calculateFullMatch(opp, userSkills, userCountry, userGoals);
    return {
      ...opp,
      match_score: fit.score,
      matched_skills: fit.matched,
      skill_gap: fit.gap,
      breakdown: fit.breakdown,
      _navigator_score: fit.score,
    };
  }).sort((a: any, b: any) => (b.match_score || 0) - (a.match_score || 0)).slice(0, 10);

  const explanation = ranked.length
    ? `Found ${ranked.length} verified opportunities for "${message}" ${slots.opportunity_type ? `[${slots.opportunity_type}]` : ''} ${slots.location ? `in ${slots.location}` : ''}. Ranked using your skills (${userSkills.join(', ') || 'default profile'}).`
    : `No exact matches for "${message}". Try broader keywords like "remote fellowship", "React Lagos", or "Python machine learning".`;

  return NextResponse.json({
    model: 'deterministic-fallback',
    slots,
    explanation,
    opportunities: ranked,
    count: ranked.length,
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || searchParams.get('message') || '';
  return POST(new Request(request.url, {
    method: 'POST',
    body: JSON.stringify({ message: q }),
    headers: { 'Content-Type': 'application/json' },
  }));
}
