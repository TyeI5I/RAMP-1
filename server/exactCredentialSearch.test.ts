import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesExactCredentialCriteria, parseExactCriteriaList } from '../src/utils/exactCredentialSearch';

const candidate = {
  targetCategories: ['Software Engineer'],
  degreeType: "Master's Degree",
  degreeTitle: 'Master of Science in Computer Science',
  institution: 'Stanford University',
  skills: ['Python', 'Distributed Systems'],
};

test('preserves spaces in multiword criteria while ignoring empty comma-separated entries', () => {
  assert.deepEqual(parseExactCriteriaList('Dental Assistant, Registered Dental Hygienist, '), [
    'Dental Assistant',
    ' Registered Dental Hygienist',
  ]);
});

test('matches explicit credential values exactly, ignoring case and whitespace', () => {
  assert.equal(
    matchesExactCredentialCriteria(candidate, {
      roles: [' software engineer '],
      degrees: ["MASTER'S DEGREE"],
      skills: ['Python', 'Distributed Systems'],
      location: '',
      minimumYearsExperience: null,
    }),
    true
  );
});

test('requires every requested role and skill', () => {
  assert.equal(
    matchesExactCredentialCriteria(candidate, {
      roles: ['Dental Assistant'],
      degrees: ["Master's Degree"],
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
    skills: [],
    location: 'San Francisco, CA',
    minimumYearsExperience: 5,
  };
  assert.equal(matchesExactCredentialCriteria({ ...candidate, location: 'san francisco, ca', yearsOfExperience: 7 }, criteria), true);
  assert.equal(matchesExactCredentialCriteria({ ...candidate, location: 'San Francisco', yearsOfExperience: 7 }, criteria), false);
  assert.equal(matchesExactCredentialCriteria({ ...candidate, location: 'San Francisco, CA', yearsOfExperience: 4 }, criteria), false);
});

test('legacy saved institution filters do not restrict employer matches', () => {
  const legacyCriteria = {
    roles: [],
    degrees: [],
    institutions: ['Harvard University'],
    skills: ['Python'],
    location: '',
    minimumYearsExperience: null,
  };
  assert.equal(matchesExactCredentialCriteria(candidate, legacyCriteria), true);
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
        skills: [],
        location: '',
        minimumYearsExperience: null,
      }
    ),
    false
  );
});
