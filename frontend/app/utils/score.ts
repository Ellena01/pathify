// Weighted scoring — mirrors actor/src/enrichment.py
export function calculateWeightedMatch(requiredSkills: string[], userSkills: string[], weights?: Record<string, number>) {
  if (!requiredSkills || requiredSkills.length === 0) return { score: 0, matched: [] as string[], gap: [] as string[] };
  const lowerUser = userSkills.map(s => s.toLowerCase());
  const matched: string[] = [];
  const gap: string[] = [];
  let totalWeight = 0;
  let matchedWeight = 0;
  for (const skill of requiredSkills) {
    const w = weights?.[skill] ?? weights?.[skill.toLowerCase()] ?? 1;
    totalWeight += w;
    if (lowerUser.includes(skill.toLowerCase())) {
      matched.push(skill);
      matchedWeight += w;
    } else {
      gap.push(skill);
    }
  }
  const score = totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0;
  return { score, matched, gap };
}

export function legacyScore(required: string[], userSkills: string[]) {
  return calculateWeightedMatch(required, userSkills).score;
}
