export const ABOUT_ME_INTERVIEW_QUESTIONS = [
  'What kind of work or problems do you genuinely enjoy, and what draws you to them?',
  'How do you like to work with other people? Can you share a specific example?',
  'What is something outside work, or a value or experience, that you would want a recruiter to know?',
] as const;

export const getAboutMeFollowUpQuestion = (answerCount: number): string | null =>
  ABOUT_ME_INTERVIEW_QUESTIONS[answerCount] ?? null;

export const isSubstantiveAboutMeAnswer = (text: string): boolean => {
  const normalized = text.trim().replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
  const words = normalized.split(' ').filter(Boolean);
  const requestOnlyPatterns = [
    /^(?:(?:i\s+)?(?:need|want|would like|would love)\s+)?(?:(?:to\s+)?(?:work on|write|create|draft|build|start|begin|help with)\s+)?(?:my\s+)?about me(?:\s+section)?$/i,
    /^(?:can|could) you help me (?:with )?(?:my )?about me(?: section)?$/i,
  ];

  return words.length >= 5 && !requestOnlyPatterns.some((pattern) => pattern.test(normalized));
};
