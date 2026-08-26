import { expect } from 'chai';
import { TARGET_UI_LOCALES } from '../../../common/lib/interfaceLocales';
import { publicExperienceText, type PublicExperienceKey } from './publicExperienceI18n';

const KEYS: PublicExperienceKey[] = [
  'brandTagline', 'navStudents', 'navTeachers', 'navResearchers', 'signIn', 'createAccount',
  'eyebrow', 'heroTitle', 'heroCopy', 'tryMofacts', 'capabilitiesTitle', 'capabilitiesCopy',
  'demosTitle', 'demosCopy', 'studentTitle', 'studentCopy', 'studentAction', 'teacherTitle',
  'teacherCopy', 'teacherAction', 'researcherTitle', 'researcherCopy', 'researcherAction', 'source',
  'project', 'terms', 'demoTemporary', 'demoEnglish', 'demoPrivacy', 'demoStart', 'demoStarting',
  'demoResume', 'demoExpired', 'demoFailed', 'demoExit', 'demoSignedIn', 'researchDesign', 'liveAi',
];

describe('publicExperienceI18n', function() {
  it('provides every public/auth/demo key in all ten target locales', function() {
    for (const locale of TARGET_UI_LOCALES) {
      for (const key of KEYS) {
        expect(publicExperienceText(locale, key).trim(), `${locale}.${key}`).not.to.equal('');
      }
    }
  });

  it('keeps the Arabic and Urdu demo states localized', function() {
    for (const locale of ['ar', 'ur'] as const) {
      expect(publicExperienceText(locale, 'demoExpired')).not.to.equal(publicExperienceText('en', 'demoExpired'));
      expect(publicExperienceText(locale, 'demoResume')).not.to.equal(publicExperienceText('en', 'demoResume'));
    }
  });
});
