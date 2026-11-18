import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesExactCredentialCriteria } from '../src/utils/exactCredentialSearch';

const candidate = {
  targetCategories: ['Software Engineer'],
  degreeType: "Master's Degree",
  degreeTitle: 'Master of Science in Computer Science',
  institution: 'Stanford University',
  skills: ['Python', 'Distributed Systems'],
};

test('matches explicit credential values exactly, ignoring case and whitespace', () => {
  assert.equal(
    matchesExactCredentialCriteria(candidate, {
      roles: [' software engineer '],
      degrees: ["MASTER'S DEGREE"],
      institutions: ['Stanford University'],
      skills: ['Python', 'Distributed Systems'],
      location: '',
      minimumYearsExperience: null,
    }),
    true
  );
});

test('requires every requested credential dimension and skill', () => {
  assert.equal(
    matchesExactCredentialCriteria(candidate, {
      roles: [],
      degrees: ["Master's Degree"],
      institutions: ['Harvard University'],
      skills: ['Python'],
      location: '',
      minimumYearsExperience: null,
    }),
    false
  );
  assert.equal(
    matchesExactCredentialCriteria(candidate, {
      roles: [],
      degrees: [],
      institutions: [],
      skills: ['Python', 'Rust'],
      location: '',
      minimumYearsExperience: null,
    }),
    false
  );
});

test('does not broaden partial or empty criteria into matches', () => {
  assert.equal(
    matchesExactCredentialCriteria(candidate, {
      roles: [],
      degrees: ['Master'],
      institutions: [],
      skills: [],
      location: '',
      minimumYearsExperience: null,
    }),
    false
  );
  assert.equal(
    matchesExactCredentialCriteria(candidate, {
      roles: [],
      degrees: [],
      institutions: [],
      skills: [],
      location: '',
      minimumYearsExperience: null,
    }),
    false
  );
});

test('requires the minimum experience and exact requested location', () => {
  const criteria = {
    roles: [],
    degrees: [],
    institutions: [],
    skills: [],
    location: 'San Francisco, CA',
    minimumYearsExperience: 5,
  };
  assert.equal(matchesExactCredentialCriteria({ ...candidate, location: 'san francisco, ca', yearsOfExperience: 7 }, criteria), true);
  assert.equal(matchesExactCredentialCriteria({ ...candidate, location: 'San Francisco', yearsOfExperience: 7 }, criteria), false);
  assert.equal(matchesExactCredentialCriteria({ ...candidate, location: 'San Francisco, CA', yearsOfExperience: 4 }, criteria), false);
});

test('does not treat malformed profile values as matching credentials', () => {
  assert.equal(
    matchesExactCredentialCriteria(
      {
        targetCategories: 'Software Engineer',
        degreeType: 42,
        institution: null,
        skills: [null, 7],
      },
      {
        roles: ['Software Engineer'],
        degrees: [],
        institutions: [],
        skills: [],
        location: '',
        minimumYearsExperience: null,
      }
    ),
    false
  );
});
