import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { google } from '@ai-sdk/google';
import { streamText, generateText, tool, isStepCount } from 'ai';
import { z } from 'zod';
import { calculateMatch, normalizeOpportunityType, type MatchResult } from '@/lib/matching';
import { yearsFromMetadata, type ProfileRow } from '@/lib/profile-subject';
import { canonicalizeSkillList } from '@/lib/taxonomy';

/**
 * POST /api/navigator — the AI Navigator.
 *
 * Two paths: Gemini with tools (when `GEMINI_API_KEY` is set), and a
 * deterministic keyword fallback when it is not or when the model errors.
 *
 * ## What changed and why
 *
 * - **No `fallbackOpportunities`.** When the cache was empty or unreachable the
 *   route answered with five hardcoded records — "Andela Global",
 *   "African Development Bank", "Data Science Nigeria" — carrying
 *   `https://example.com/fellowship` as an application URL. Those were returned
 *   to the model as if they were real catalog rows, and the model's own
 *   instructions say it must never invent opportunities. It now gets an empty
 *   list and says so.
 * - **Catalog hygiene.** `is_active = false` and
 *   `verification_status = 'rejected'` rows are excluded here too, so a retired
 *   or moderator-rejected listing can no longer be recommended by an LLM or
 *   ranked by the fallback.
 * - **One scoring engine.** `calculateFullMatch` (a client-shaped positional
 *   shim that never forwards `yearsExperience` / `preferredLocations` /
 *   `preferredTypes`) is replaced by `calculateMatch` with a full subject, so
 *   Navigator's percentages agree with `/api/match` and the digest email.
 * - **Server-side profile.** The subject is read from the signed-in
 *   `user_profiles` row when there is a session. Previously the browser
 *   supplied `userSkills` / `userCountry` / `userGoals` in the request body,
 *   which meant both an anonymous caller and a signed-in user with a stale body
 *   got a different score for the same listing.
 */

const NO_STORE = { 'Cache-Control': 'no-store, private' } as const;

const CATALOG_LIMIT = 200;
const RESULT_LIMIT = 10;

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

interface Slots {
  opportunity_type?: string;
  skills?: string[];
  location?: string;
}

function parseSlots(message: string): Slots {
  const lower = (message || '').toLowerCase();
  const slots: Slots = {};
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) {
      slots.opportunity_type = type;
      break;
    }
  }
  const skills: string[] = [];
  for (const [canon, aliases] of Object.entries(SKILL_ALIASES)) {
    if (aliases.some((a) => lower.includes(a)) || lower.includes(canon.toLowerCase())) skills.push(canon);
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

/** Flatten `skills_required` (strings or rich `{canonical}` objects) to names. */
function skillNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim()) out.push(entry.trim());
    else if (entry && typeof entry === 'object') {
      const canonical = (entry as { canonical?: unknown }).canonical;
      if (typeof canonical === 'string' && canonical.trim()) out.push(canonical.trim());
    }
    if (out.length >= 40) break;
  }
  return out;
}

/**
 * Read the visible catalog. Returns `[]` rather than inventing data — an empty
 * result is a legitimate answer the UI and the model both handle.
 */
async function fetchOpportunities(supabase: Awaited<ReturnType<typeof createClient>>): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('opportunities_cache')
      .select('*')
      .eq('is_active', true)
      .neq('verification_status', 'rejected')
      .order('first_seen_at', { ascending: false })
      .limit(CATALOG_LIMIT);
    if (error) {
      console.warn('Navigator catalog read failed:', error.message);
      return [];
    }
    return data ?? [];
  } catch (e) {
    console.warn('Navigator catalog unavailable:', e);
    return [];
  }
}

export async function POST(request: Request) {
  let body: any = {};
  try { body = await request.json(); } catch { body = {}; }

  const message =
    body.message ||
    body.query ||
    (Array.isArray(body.messages) ? body.messages[body.messages.length - 1]?.content : '') ||
    '';
  const wantsStream =
    body.stream === true || request.headers.get('accept')?.includes('text/event-stream');

  const supabase = await createClient();
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  // --- Subject: server-side profile wins over anything the browser sent ----
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: ProfileRow | null = null;
  if (user) {
    const { data } = await supabase
      .from('user_profiles')
      .select('country, role, skills, goals, metadata')
      .eq('id', user.id)
      .maybeSingle();
    if (data) profile = data as ProfileRow;
  }

  const metadata = profile?.metadata ?? {};
  const preferences = (metadata.preferences ?? {}) as Record<string, unknown>;

  // Anonymous callers have no stored profile, so fall back to the body — but
  // only when there is no session, so a signed-in user can never be scored
  // against a body-supplied skill list.
  const bodySkills = Array.isArray(body.userSkills) ? body.userSkills : [];
  const rawSkills = profile?.skills?.length ? profile.skills : bodySkills;
  const userSkills = canonicalizeSkillList(rawSkills);
  const userCountry = profile?.country || body.userCountry || 'Global / Remote';
  const userGoals = profile?.goals?.length ? profile.goals : (Array.isArray(body.userGoals) ? body.userGoals : []);

  const subject = {
    skills: userSkills,
    country: userCountry,
    goals: userGoals,
    currentRole: profile?.role ?? null,
    yearsExperience: yearsFromMetadata(metadata),
    preferredLocations: Array.isArray(preferences.locations) ? (preferences.locations as string[]) : null,
    preferredTypes: Array.isArray(preferences.opportunityTypes)
      ? (preferences.opportunityTypes as string[])
      : null,
  };

  // Track results so tool calls can populate the client response.
  const matchedOpportunities: any[] = [];

  const score = (opp: any): MatchResult =>
    calculateMatch(opp as Record<string, unknown>, subject);

  const shape = (opp: any, result: MatchResult) => ({
    ...opp,
    match_score: result.score,
    matched_skills: result.matched,
    skill_gap: result.gap,
    breakdown: result.breakdown,
    explanation: result.explanation,
  });

  // ==========================================
  // PATH A: Gemini
  // ==========================================
  if (apiKey) {
    try {
      const tools: any = {
        search_opportunities: tool({
          description:
            'Search real, verified opportunities in the database by keyword, role type, or location. Returns an empty list when nothing matches — NEVER invent opportunities.',
          parameters: z.object({
            query: z.string().optional().describe('Search keyword like "frontend", "python", "machine learning"'),
            opportunity_type: z.string().optional().describe('Type filter like "jobs_remote", "fellowships", "hackathons", "grants"'),
            location: z.string().optional().describe('Location filter like "Remote", "Lagos", "Nairobi"'),
            min_score: z.number().optional().describe('Minimum match score (0-100)'),
          }),
          execute: async ({
            query,
            opportunity_type,
            location,
            min_score,
          }: {
            query?: string;
            opportunity_type?: string;
            location?: string;
            min_score?: number;
          }) => {
            const allOpps = await fetchOpportunities(supabase);
            if (allOpps.length === 0) return { count: 0, results: [], catalogEmpty: true };

            const wantedType = opportunity_type ? normalizeOpportunityType(opportunity_type) : null;
            const filtered = allOpps.filter((opp: any) => {
              if (wantedType && normalizeOpportunityType(opp.opportunity_type) !== wantedType) return false;
              if (location && !String(opp.location ?? '').toLowerCase().includes(location.toLowerCase())) {
                return false;
              }
              if (query) {
                const q = query.toLowerCase();
                const titleMatch = String(opp.title ?? '').toLowerCase().includes(q);
                const orgMatch = String(opp.organization ?? '').toLowerCase().includes(q);
                const skillsMatch = skillNames(opp.skills_required).some((s) =>
                  s.toLowerCase().includes(q)
                );
                if (!titleMatch && !orgMatch && !skillsMatch) return false;
              }
              return true;
            });

            const scored = filtered.map((opp: any) => {
              const fit = score(opp);
              const shaped = shape(opp, fit);
              matchedOpportunities.push(shaped);
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
            const finalMatches = scored
              .filter((s: any) => s.match_score >= min)
              .sort((a: any, b: any) => b.match_score - a.match_score)
              .slice(0, RESULT_LIMIT);
            return { count: finalMatches.length, results: finalMatches };
          },
        } as any),

        calculate_fit: tool({
          description:
            'Calculates the 4-factor match score (skills 60%, location 20%, goals 10%, experience 10%) between an opportunity and the user profile.',
          parameters: z.object({
            opportunity_title: z.string(),
            required_skills: z.array(z.string()),
            location: z.string().optional(),
          }),
          execute: async ({
            opportunity_title,
            required_skills,
            location,
          }: {
            opportunity_title: string;
            required_skills: string[];
            location?: string;
          }) => {
            return score({
              title: opportunity_title,
              location: location || 'Remote',
              skills_required: required_skills,
            });
          },
        } as any),

        get_user_skills: tool({
          description: 'Retrieves the candidate skills, country, and career goals from the session profile.',
          parameters: z.object({}),
          execute: async () => ({
            skills: userSkills,
            country: userCountry,
            goals: userGoals,
          }),
        } as any),

        save_to_tracker: tool({
          description: 'Saves an opportunity to the candidate application tracker with a specific stage.',
          parameters: z.object({
            job_url: z.string().url().describe('The application URL of the opportunity'),
            stage: z
              .enum(['wishlist', 'applied', 'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn'])
              .default('wishlist'),
            notes: z.string().optional(),
          }),
          execute: async ({ job_url, stage, notes }: { job_url: string; stage: any; notes?: string }) => {
            if (!user) {
              return { success: false, message: 'User not signed in. Log in to persist to tracker.' };
            }
            const allOpps = await fetchOpportunities(supabase);
            const opp = allOpps.find((o: any) => o.application_url === job_url) || { application_url: job_url };
            const { error: writeError } = await supabase.from('saved_jobs').upsert({
              user_id: user.id,
              job_url,
              job_data: { ...opp, notes: notes || '' },
              stage,
            });
            if (writeError) return { success: false, error: writeError.message };
            return { success: true, message: `Saved to tracker in "${stage}" stage.` };
          },
        } as any),
      };

      const systemPrompt = `You are Pathify AI Navigator, an elite, empowering career copilot and opportunity advisor for African and emerging-market tech talent.
Your mission is to help candidates discover and land tech jobs, fellowships, hackathons, scholarships, and grants.

STRICT INSTRUCTIONS:
1. NEVER hallucinate or invent opportunities, URLs, or organizations. You must call search_opportunities to find real listings.
2. If search_opportunities returns an empty list, say plainly that nothing in the catalog matches right now and suggest different keywords. Do not fill the gap from memory.
3. Personalize recommendations to the candidate's actual skills (${userSkills.join(', ') || 'General tech'}), country (${userCountry}), and goals (${userGoals.join(', ') || 'not set'}).
4. If opportunities are found, summarize them clearly with match score %, why they fit, and skills to highlight or prepare.
5. Keep answers concise, high-energy, encouraging, and directly actionable.`;

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

      const textResult = await generateText({
        model: google('gemini-2.5-flash'),
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
        tools,
        stopWhen: isStepCount(5),
      });

      const explanation =
        textResult.text ||
        (matchedOpportunities.length > 0
          ? `Found ${matchedOpportunities.length} opportunities matching your query. Top results ranked by your profile fit.`
          : 'Nothing in the catalog matches that yet. Try broader keywords like "remote fellowship", "React developer", or "Python machine learning".');

      return NextResponse.json(
        {
          model: 'gemini-2.5-flash',
          explanation,
          opportunities: matchedOpportunities.slice(0, RESULT_LIMIT),
          count: matchedOpportunities.length,
        },
        { headers: NO_STORE }
      );
    } catch (geminiError: any) {
      console.warn('Gemini Navigator error, falling back to deterministic engine:', geminiError?.message || geminiError);
      // Fall through to the deterministic engine.
    }
  }

  // ==========================================
  // PATH B: Deterministic engine
  // ==========================================
  const slots: Slots = { ...parseSlots(message), ...(body.filters || {}) };
  const allOpps = await fetchOpportunities(supabase);

  let filtered = allOpps;

  if (slots.opportunity_type) {
    const wanted = normalizeOpportunityType(slots.opportunity_type);
    filtered = filtered.filter((opp: any) => normalizeOpportunityType(opp.opportunity_type) === wanted);
  }

  if (slots.location) {
    const loc = slots.location.toLowerCase();
    filtered = filtered.filter((opp: any) => String(opp.location ?? '').toLowerCase().includes(loc));
  }

  if (slots.skills && slots.skills.length) {
    const lowerWanted = slots.skills.map((s: string) => s.toLowerCase());
    filtered = filtered.filter((opp: any) => {
      const req = skillNames(opp.skills_required).map((s) => s.toLowerCase());
      return lowerWanted.some((w: string) => req.some((r: string) => r.includes(w) || w.includes(r)));
    });
  }

  const ranked = filtered
    .map((opp: any) => {
      const result = score(opp);
      return { ...shape(opp, result), _navigator_score: result.score };
    })
    .sort((a: any, b: any) => b.match_score - a.match_score)
    .slice(0, RESULT_LIMIT);

  const explanation = ranked.length
    ? `Found ${ranked.length} verified opportunities for "${message}" ${slots.opportunity_type ? `[${slots.opportunity_type}]` : ''} ${slots.location ? `in ${slots.location}` : ''}. Ranked using your skills (${userSkills.join(', ') || 'default profile'}).`
    : allOpps.length === 0
      ? 'The opportunity catalog is empty or unreachable right now. Try again after the next sync.'
      : `No exact matches for "${message}" in the current catalog. Try broader keywords like "remote fellowship", "React Lagos", or "Python machine learning".`;

  return NextResponse.json(
    {
      model: 'deterministic-fallback',
      slots,
      explanation,
      opportunities: ranked,
      count: ranked.length,
    },
    { headers: NO_STORE }
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || searchParams.get('message') || '';
  return POST(
    new Request(request.url, {
      method: 'POST',
      body: JSON.stringify({ message: q }),
      headers: { 'Content-Type': 'application/json' },
    })
  );
}
