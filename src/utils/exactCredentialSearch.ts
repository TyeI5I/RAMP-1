export interface ExactCredentialCriteria {
  roles: string[];
  degrees: string[];
  institutions: string[];
  skills: string[];
  location: string;
  minimumYearsExperience: number | null;
}

export const parseExactCriteriaList = (value: string) =>
  value.split(',').filter((item) => item.trim().length > 0);

export const isExactCredentialCriteria = (value: unknown): value is ExactCredentialCriteria => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const criteria = value as Record<string, unknown>;
  const stringLists = ['roles', 'degrees', 'institutions', 'skills'];
  return (
    stringLists.every((key) => {
      const items = criteria[key];
      return (
        Array.isArray(items) &&
        items.length <= 10 &&
        items.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 120)
      );
    }) &&
    typeof criteria.location === 'string' &&
    criteria.location.length <= 120 &&
    (criteria.minimumYearsExperience === null ||
      (typeof criteria.minimumYearsExperience === 'number' &&
        Number.isInteger(criteria.minimumYearsExperience) &&
        criteria.minimumYearsExperience >= 0 &&
        criteria.minimumYearsExperience <= 80))
  );
};

interface CandidateCredentials {
  targetCategories?: unknown;
  degreeType?: unknown;
  degreeTitle?: unknown;
  institution?: unknown;
  skills?: unknown;
  location?: unknown;
  yearsOfExperience?: unknown;
}

const normalize = (value: string) =>
  value.normalize('NFKC').replace(/[’‘]/g, "'").trim().replace(/\s+/g, ' ').toLowerCase();

const stringValue = (value: unknown) => typeof value === 'string' ? value : '';
const stringList = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const matchesAnyExact = (requested: string[], available: string[]) =>
  requested.length === 0 || requested.some((value) => available.some((item) => normalize(item) === normalize(value)));

export const matchesExactCredentialCriteria = (
  candidate: CandidateCredentials,
  criteria: ExactCredentialCriteria
) => {
  const hasCriteria =
    criteria.roles.length > 0 ||
    criteria.degrees.length > 0 ||
    criteria.institutions.length > 0 ||
    criteria.skills.length > 0 ||
    criteria.location.length > 0 ||
    criteria.minimumYearsExperience !== null;
  if (!hasCriteria) return false;

  return (
    matchesAnyExact(criteria.roles, stringList(candidate.targetCategories)) &&
    matchesAnyExact(criteria.degrees, [stringValue(candidate.degreeType), stringValue(candidate.degreeTitle)]) &&
    matchesAnyExact(criteria.institutions, [stringValue(candidate.institution)]) &&
    criteria.skills.every((skill) =>
      stringList(candidate.skills).some((candidateSkill) => normalize(candidateSkill) === normalize(skill))
    ) &&
    (!criteria.location || normalize(stringValue(candidate.location)) === normalize(criteria.location)) &&
    (criteria.minimumYearsExperience === null ||
      (typeof candidate.yearsOfExperience === 'number' && Number.isFinite(candidate.yearsOfExperience) &&
        candidate.yearsOfExperience >= criteria.minimumYearsExperience))
  );
};
