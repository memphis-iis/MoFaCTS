import { parseSparcStudentPersona, type SparcStudentPersona } from '../../../../learning-components/runtime/sparcPersonas';

export const LEARNING_PROFILE_FIELDS = [
  { key: 'traits', label: 'profile.learningTraits', example: 'profile.learningTraitsExample' },
  { key: 'abilities', label: 'profile.learningAbilities', example: 'profile.learningAbilitiesExample' },
  { key: 'experiences', label: 'profile.learningExperiences', example: 'profile.learningExperiencesExample' },
  { key: 'personalInterests', label: 'profile.learningInterests', example: 'profile.learningInterestsExample' },
] as const;
export type LearningProfileDraft = Record<keyof SparcStudentPersona, string>;

export function learningProfileDraft(persona: unknown): LearningProfileDraft {
  const parsed = parseSparcStudentPersona(persona === undefined ? {} : persona);
  return { traits: parsed.traits.join('\n'), abilities: parsed.abilities.join('\n'),
    experiences: parsed.experiences.join('\n'), personalInterests: parsed.personalInterests.join('\n') };
}

export function learningProfilePersona(draft: LearningProfileDraft): SparcStudentPersona {
  return parseSparcStudentPersona(Object.fromEntries(LEARNING_PROFILE_FIELDS.map(({ key }) =>
    [key, draft[key].split(/\r?\n/).map(line => line.trim()).filter(Boolean)])));
}
