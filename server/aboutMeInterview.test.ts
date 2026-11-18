import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAboutMeFollowUpQuestion,
  isSubstantiveAboutMeAnswer,
} from '../src/utils/aboutMeInterview';

test('About Me interview asks focused questions before drafting', () => {
  assert.ok(getAboutMeFollowUpQuestion(0)?.endsWith('?'));
  assert.ok(getAboutMeFollowUpQuestion(2));
  assert.equal(getAboutMeFollowUpQuestion(3), null);
  assert.equal(
    isSubstantiveAboutMeAnswer('I need to work on about me'),
    false
  );
  assert.equal(isSubstantiveAboutMeAnswer('I like helping people.'), false);
  assert.equal(
    isSubstantiveAboutMeAnswer('I enjoy helping patients feel comfortable during dental visits.'),
    true
  );
});
