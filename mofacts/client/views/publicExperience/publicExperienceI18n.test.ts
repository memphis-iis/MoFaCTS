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

  it('describes the expiring session without calling the demo temporary or anonymous', function() {
    const demoCopy = [
      publicExperienceText('en', 'demosCopy'),
      publicExperienceText('en', 'demoTemporary'),
      publicExperienceText('en', 'demoPrivacy'),
      publicExperienceText('en', 'demoStarting'),
      publicExperienceText('en', 'demoExpired'),
    ].join(' ');

    expect(demoCopy).not.to.match(/\btemporary\b/i);
    expect(demoCopy).not.to.match(/\banonymous\b/i);
    expect(publicExperienceText('en', 'demoTemporary')).to.equal('Interactive demo');
    expect(publicExperienceText('en', 'demosCopy')).to.contain('Demo sessions last 24 hours.');
    expect(publicExperienceText('en', 'demoPrivacy')).to.contain('learning data are deleted after 24 hours.');
  });
});
