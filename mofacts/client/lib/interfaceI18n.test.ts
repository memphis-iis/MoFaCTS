import { expect } from 'chai';
import {
  assertCompletePlatformLocaleResources,
  getPlatformTextDirection,
  translatePlatformString,
} from './interfaceI18n';
import {
  PLATFORM_LOCALE_RESOURCES,
  type LocaleResource,
  type PlatformStringKey,
} from './interfaceI18nResources';
import type { TargetUiLocale } from '../../common/lib/interfaceLocales';

describe('interfaceI18n', function() {
  function requireResourceString(resource: LocaleResource, key: PlatformStringKey, label: string): string {
    const value = resource[key];
    expect(value, label).to.be.a('string');
    return value as string;
  }

  const manualCreatorAudioKeys = [
    'manualCreator.buttonOrder',
    'manualCreator.speechRecognition',
    'manualCreator.speechLanguage',
    'manualCreator.textToSpeech',
    'manualCreator.practiceTimingLimits',
  ] as const;
  const themeEditorKeys = [
    'theme.settingsTitle',
    'theme.cancel',
    'theme.library',
    'theme.activeServerTheme',
    'theme.duplicate',
    'theme.rename',
    'theme.delete',
    'theme.export',
    'theme.import',
    'theme.themeNameLabel',
    'theme.active',
    'theme.activate',
    'theme.customHelpPage',
    'theme.mainLayoutText',
    'theme.pageBackgroundColor',
    'theme.buttonsInteractiveElements',
    'theme.buttonHeight',
    'theme.menusSecondaryElements',
    'theme.alertColorHelp',
    'theme.audioIconColorDisabled',
    'theme.audioControlColor',
    'theme.cardSurfacesOverlays',
    'theme.videoOverlaySurface',
    'theme.videoOverlayBackdrop',
    'theme.surfaceShadow',
    'theme.performanceDividerColor',
    'theme.loadingOverlayColor',
    'theme.borderRadiusCorners',
    'theme.smallBorderRadius',
    'theme.smallUiElements',
    'theme.usedForLabel',
    'theme.smallRadiusUsedFor',
    'theme.largeBorderRadius',
    'theme.largeContainers',
    'theme.largeRadiusUsedFor',
    'theme.animationSpeeds',
    'theme.transitionSpeedInstant',
    'theme.transitionSpeedFast',
    'theme.quickTransitions',
    'theme.transitionSpeedSmooth',
    'theme.mainContentTransitions',
  ] as const;
  const themeWizardKeys = [
    'themeWizard.description',
    'themeWizard.themeName',
    'themeWizard.baseTheme',
    'themeWizard.sourcePalette',
    'themeWizard.labelPlaceholder',
    'themeWizard.remove',
    'themeWizard.addColor',
    'themeWizard.extractActiveTheme',
    'themeWizard.pasteColors',
    'themeWizard.fillPalette',
    'themeWizard.uploadPaletteJson',
    'themeWizard.polarity',
    'themeWizard.light',
    'themeWizard.dark',
    'themeWizard.contrastPriority',
    'themeWizard.density',
    'themeWizard.paletteExpansion',
    'themeWizard.allowTints',
    'themeWizard.allowShades',
    'themeWizard.allowMutedVariants',
    'themeWizard.allowGeneratedCompanions',
    'themeWizard.colors',
    'themeWizard.darkest',
    'themeWizard.lightest',
    'themeWizard.medianLuminance',
    'themeWizard.chromatic',
    'themeWizard.neutral',
    'themeWizard.navigation',
    'themeWizard.stimulus',
    'themeWizard.primary',
    'themeWizard.error',
    'themeWizard.readability',
    'themeWizard.surfaceSeparation',
    'themeWizard.feedback',
    'themeWizard.paletteFidelity',
    'themeWizard.advancedDiagnostics',
    'themeWizard.luminanceProfile',
    'themeWizard.colorRoles',
    'themeWizard.previewGeneratedTheme',
    'themeWizard.defaultName',
    'themeWizard.defaultSlotAccent',
    'themeWizard.defaultSlotSurface',
    'themeWizard.defaultSlotText',
    'themeWizard.defaultSlotFeedback',
    'themeWizard.defaultThemeUnavailable',
    'themeWizard.baseThemeRequired',
    'themeWizard.baseThemeUnavailable',
    'themeWizard.colorNumber',
    'themeWizard.paletteJsonColorUnsupported',
    'themeWizard.paletteJsonNeedsTwo',
    'themeWizard.moreThanEightColors',
    'themeWizard.needsTwoColors',
    'themeWizard.noActiveTheme',
    'themeWizard.loadedPaletteColors',
    'themeWizard.pasteNeedsTwo',
    'themeWizard.skippedUnsupportedCss',
    'themeWizard.previewGenerated',
    'themeWizard.generatedAndActivated',
  ] as const;
  const sparcEditorKeys = [
    'sparc.advancedEditors',
    'sparc.page',
    'sparc.editorSections',
    'sparc.visualEditor',
    'sparc.productionRules',
    'sparc.nodePalette',
    'sparc.palette',
    'sparc.richTextToolbar',
    'sparc.inlineFormatting',
    'sparc.bold',
    'sparc.italic',
    'sparc.underline',
    'sparc.strikethrough',
    'sparc.highlight',
    'sparc.subscript',
    'sparc.superscript',
    'sparc.paragraph',
    'sparc.bullets',
    'sparc.numbers',
    'sparc.tasks',
    'sparc.quote',
    'sparc.code',
    'sparc.rule',
    'sparc.alignment',
    'sparc.alignLeft',
    'sparc.alignCenter',
    'sparc.alignRight',
    'sparc.alignJustify',
    'sparc.color',
    'sparc.clear',
    'sparc.linkUrl',
    'sparc.link',
    'sparc.unlink',
    'sparc.imageUrl',
    'sparc.imageAltText',
    'sparc.image',
    'sparc.embedUrl',
    'sparc.embed',
    'sparc.tableControls',
    'sparc.table',
    'sparc.addRow',
    'sparc.addColumn',
    'sparc.deleteRow',
    'sparc.deleteColumn',
  ] as const;
  const coreLearnerPromptKeys = [
    'response.typeCorrectAnswer',
    'instructions.goBackToPreviousQuestion',
    'stimulus.replayAudio',
  ] as const;
  const autoTutorLearnerPromptKeys = [
    'autoTutor.typeYourAnswer',
    'autoTutor.introPrompt',
  ] as const;
  const autoTutorRuntimeKeys = [
    'autoTutor.progress',
    'autoTutor.expectations',
    'autoTutor.misconceptions',
    'autoTutor.coveredIdeas',
    'autoTutor.coveredExpectations',
    'autoTutor.activeMisconceptions',
    'autoTutor.misconceptionScore',
    'autoTutor.unavailable',
    'autoTutor.conversationComplete',
    'autoTutor.loading',
    'autoTutor.serviceError',
    'autoTutor.continueControls',
    'autoTutor.conversation',
    'autoTutor.niceWorkComplete',
    'autoTutor.costCapReached',
    'autoTutor.turnLimitReached',
    'autoTutor.sessionEnded',
    'autoTutor.oneTurn',
    'autoTutor.turnCount',
  ] as const;
  const learnerProgressKeys = [
    'performance.sessionStats',
    'performance.time',
    'performance.minutesAbbrev',
    'performance.correct',
    'performance.timeRemaining',
    'performance.continuingIn',
    'learningProgress.label',
    'learningProgress.progress',
    'learningProgress.closePanel',
    'learningProgress.summary',
    'learningProgress.graphicLabel',
    'learningProgress.notReady',
    'learningProgress.atTarget',
    'learningProgress.below',
    'learningProgress.mean',
    'learningProgress.targetPercent',
    'learningProgress.meanPercent',
  ] as const;
  const classSelectionKeys = [
    'classSelection.courseEnrollment',
    'classSelection.currentCourse',
    'classSelection.noCourseSelected',
    'classSelection.instructor',
    'classSelection.selectInstructor',
    'classSelection.course',
    'classSelection.selectCourse',
    'classSelection.save',
    'classSelection.backToPracticeMenu',
    'classSelection.noAvailableCourses',
    'classSelection.none',
    'classSelection.selected',
    'classSelection.selectBoth',
    'classSelection.invalidSelection',
    'classSelection.saved',
    'classSelection.saveFailed',
  ] as const;
  const adminTestsKeys = [
    'adminTests.deploymentReadiness',
    'adminTests.description',
    'adminTests.runReadinessChecks',
    'adminTests.runningReadinessChecks',
    'adminTests.readinessPassed',
    'adminTests.readinessFailed',
    'adminTests.check',
    'adminTests.status',
    'adminTests.message',
    'adminTests.pass',
    'adminTests.fail',
  ] as const;
  const aiCreatorModeKeys = [
    'aiCreator.sourceAriaLabel',
    'aiCreator.characterCount',
    'aiCreator.modeGroupLabel',
    'aiCreator.learningLabel',
    'aiCreator.learningShortLabel',
    'aiCreator.learningDescription',
    'aiCreator.assessmentLabel',
    'aiCreator.assessmentShortLabel',
    'aiCreator.assessmentDescription',
    'aiCreator.autoTutorShortLabel',
  ] as const;
  const courseAssignmentKeys = [
    'courseAssignments.title',
    'courseAssignments.syllabus',
    'courseAssignments.course',
    'courseAssignments.selectCourse',
    'courseAssignments.addLesson',
    'courseAssignments.searchPlaceholder',
    'courseAssignments.selectedAssignments',
    'courseAssignments.unsavedChanges',
    'courseAssignments.saved',
    'courseAssignments.loadingAssignments',
    'courseAssignments.dragHandle',
    'courseAssignments.moveUp',
    'courseAssignments.moveDown',
    'courseAssignments.required',
    'courseAssignments.visibleOn',
    'courseAssignments.clear',
    'courseAssignments.dueOn',
    'courseAssignments.remove',
    'courseAssignments.noAssignments',
    'courseAssignments.reset',
    'courseAssignments.saveAssignments',
    'courseAssignments.pleaseSelectCourse',
    'courseAssignments.duplicateLesson',
    'courseAssignments.invalidVisibleDate',
    'courseAssignments.invalidDueDate',
    'courseAssignments.dueAfterVisibleDate',
  ] as const;
  const courseManagementKeys = [
    'courseManagement.title',
    'courseManagement.addOrEditCourse',
    'courseManagement.selectExistingCourse',
    'courseManagement.addCourse',
    'courseManagement.courseName',
    'courseManagement.courseNamePlaceholder',
    'courseManagement.visibility',
    'courseManagement.private',
    'courseManagement.public',
    'courseManagement.visibilityHelp',
    'courseManagement.beginDate',
    'courseManagement.endDate',
    'courseManagement.courseTimezone',
    'courseManagement.sectionNames',
    'courseManagement.sectionNamesPlaceholder',
    'courseManagement.cancel',
    'courseManagement.delete',
    'courseManagement.saveCourse',
    'courseManagement.deleteCourse',
    'courseManagement.sectionLinks',
    'courseManagement.noSections',
    'courseManagement.easternTime',
    'courseManagement.centralTime',
    'courseManagement.mountainTime',
    'courseManagement.arizonaTime',
    'courseManagement.pacificTime',
    'courseManagement.alaskaTime',
    'courseManagement.hawaiiTime',
    'courseManagement.courseCannotBeBlank',
    'courseManagement.selectedCourseNotFound',
    'courseManagement.chooseTimezone',
    'courseManagement.courseSaved',
    'courseManagement.errorSavingCourse',
    'courseManagement.selectCourseToDelete',
    'courseManagement.deleteCourseTitle',
    'courseManagement.deleteCourseMessage',
    'courseManagement.courseDeleted',
    'courseManagement.errorDeletingCourse',
  ] as const;
  const contentEditorKeys = [
    'contentEditor.editTitle',
    'contentEditor.stimFileInfo',
    'contentEditor.noStimulusData',
    'contentEditor.generateIncorrectResponses',
    'contentEditor.removeAllIncorrectResponses',
    'contentEditor.removeIncorrectTitle',
    'contentEditor.removeIncorrectMessage',
    'contentEditor.remove',
    'contentEditor.distractorCountLabel',
    'contentEditor.distractorHelp',
    'contentEditor.generate',
    'contentEditor.previousCluster',
    'contentEditor.prev',
    'contentEditor.nextCluster',
    'contentEditor.next',
    'contentEditor.clusterCounter',
    'contentEditor.show',
    'contentEditor.clustersAtATime',
    'contentEditor.noClusters',
    'contentEditor.clusterRange',
    'contentEditor.noClustersToEdit',
    'contentEditor.clusterRangeStatus',
    'contentEditor.windowedEditingInfo',
    'contentEditor.initDraftControlsFailed',
    'contentEditor.editProperties',
    'contentEditor.incorrectGeneratedTitle',
    'contentEditor.incorrectGeneratedText',
    'contentEditor.incorrectRemovedTitle',
    'contentEditor.incorrectRemovedText',
    'contentEditor.errorSavingStimuli',
    'contentEditor.errorLoadingSchema',
    'contentEditor.tdfDataUnavailable',
    'contentEditor.invalidMediaFile',
    'contentEditor.invalidMediaFileText',
    'contentEditor.uploadingFile',
    'contentEditor.uploadFailed',
    'contentEditor.uploaded',
    'contentEditor.previewAlt',
    'contentEditor.imageFailedToLoad',
  ] as const;
  const tdfEditorKeys = [
    'tdfEditor.editTitle',
    'tdfEditor.conditionInfo',
    'tdfEditor.notFound',
    'tdfEditor.unsavedChanges',
    'tdfEditor.descriptions',
    'tdfEditor.none',
    'tdfEditor.brief',
    'tdfEditor.verbose',
    'tdfEditor.saveChanges',
    'tdfEditor.schemaValidationErrors',
    'tdfEditor.validationAttentionTitle',
    'tdfEditor.validationAttentionText',
    'tdfEditor.savedReturning',
    'tdfEditor.errorSavingTdf',
    'tdfEditor.errorLoadingSchema',
    'tdfEditor.refreshPage',
    'tdfEditor.editorLibraryNotLoaded',
    'tdfEditor.refreshContactSupport',
    'tdfEditor.unknownLesson',
  ] as const;
  const helpPageKeys = [
    'help.studentHelpGuide',
    'help.contactAdministrator',
    'help.loadFailedPrefix',
    'help.onlineHelpGuide',
  ] as const;
  const smallVisibleChromeKeys = [
    'debug.menu',
    'admin.googleTtsKey',
    'admin.googleSrKey',
    'content.errorLabel',
    'reporting.rootConditions',
  ] as const;
  const urduVisibleChromeKeys = [
    'h5p.activityTitle',
    'h5p.invalidDisplayConfiguration',
    'admin.manifest',
    'manualCreator.cancel',
    'manualCreator.status',
    'manualCreator.setup',
    'manualCreator.starterContentStatus',
    'manualCreator.lesson',
    'manualCreator.contentTab',
    'manualCreator.items',
    'manualCreator.cards',
    'manualCreator.media',
    'manualCreator.skipped',
    'manualCreator.basicsIntro',
    'manualCreator.cardFormatIntro',
    'manualCreator.audioDisplayIntro',
    'manualCreator.finalizeError',
    'manualCreator.packageStatus',
    'manualCreator.structure',
    'manualCreator.prompt',
    'manualCreator.response',
    'manualCreator.visibility',
    'manualCreator.link',
    'manualCreator.topBar',
    'manualCreator.pendingName',
    'manualCreator.off',
    'manualCreator.text',
    'manualCreator.image',
    'manualCreator.audio',
    'manualCreator.video',
    'manualCreator.typedResponse',
    'manualCreator.multipleChoice',
    'manualCreator.learningOnly',
    'manualCreator.assessmentOnly',
    'manualCreator.time',
    'manualCreator.score',
    'manualCreator.neither',
    'manualCreator.random',
    'manualCreator.fixed',
    'manualCreator.prompts',
    'manualCreator.feedback',
    'reporting.link',
    'reporting.missing',
    'reporting.student',
    'reporting.count',
    'reporting.exceptions',
    'reporting.actions',
    'reporting.totals',
  ] as const;
  const imsccKeys = Object.keys(PLATFORM_LOCALE_RESOURCES.en)
    .filter((key) => key.startsWith('imscc.')) as Array<keyof LocaleResource>;
  const apkgKeys = Object.keys(PLATFORM_LOCALE_RESOURCES.en)
    .filter((key) => key.startsWith('apkg.')) as Array<keyof LocaleResource>;

  it('keeps all starter platform translations complete for every target locale', function() {
    expect(() => assertCompletePlatformLocaleResources()).not.to.throw();
  });

  it('keeps Manual Content Creator audio labels localized for non-English target locales', function() {
    const english = PLATFORM_LOCALE_RESOURCES.en;
    for (const [locale, resource] of Object.entries(PLATFORM_LOCALE_RESOURCES)) {
      if (locale === 'en') {
        continue;
      }
      for (const key of manualCreatorAudioKeys) {
        expect(resource[key], `${locale} ${key}`).to.not.equal(english[key]);
      }
    }
  });

  it('keeps Theme editor labels localized for Hindi, Bengali, and Urdu draft resources', function() {
    const english = PLATFORM_LOCALE_RESOURCES.en;
    const englishFragments = /\bTheme Settings\b|\bCancel\b|\bTheme Library\b|\bActive Server Theme\b|\bIncorrect feedback\b|\bAudio Icon Color\b|\bAudio Control Color\b|\bVideo Overlay\b|\bSurface Shadow\b|\bPerformance Divider Color\b|\bLoading Overlay Color\b|\bBorder Radius\b|\bSmall UI elements\b|\bUsed for\b|\bButtons, inputs\b|\bLarge containers\b|\bAnimation Speeds\b|\bTransition Speed\b|\bQuick transitions\b|\bMain content transitions\b/;
    for (const locale of ['hi', 'bn', 'ur'] as const) {
      const resource = PLATFORM_LOCALE_RESOURCES[locale];
      for (const key of themeEditorKeys) {
        expect(resource[key], `${locale} ${key}`).to.not.equal(english[key]);
        expect(resource[key], `${locale} ${key}`).to.not.match(englishFragments);
      }
    }
  });

  it('keeps Theme Generation Wizard labels localized for Hindi, Bengali, and Urdu draft resources', function() {
    const english = PLATFORM_LOCALE_RESOURCES.en;
    const englishFragments = /\bAdvanced diagnostics\b|\bBase theme\b|\bSource palette\b|\bLabel\b|\bActive theme\b|\bpaste\b|\bfill\b|\bupload\b|\bPolarity\b|\bLight\b|\bDark\b|\bContrast priority\b|\bDensity\b|\bPalette expansion\b|\bTints\b|\bShades\b|\bMuted variants\b|\bGenerated companions\b|\bColors\b|\bMedian luminance\b|\bChromatic\b|\bNeutral\b|\bNavigation\b|\bStimulus\b|\bPrimary\b|\bError\b|\bReadability\b|\bSurface separation\b|\bFeedback\b|\bPalette fidelity\b|\bGenerated Theme\b|\bAccent\b|\bSurface\b|\bText\b|\bavailable\b|\bvalid colors\b|\bpalette colors\b|\bPreview generated\b/;
    for (const locale of ['hi', 'bn', 'ur'] as const) {
      const resource = PLATFORM_LOCALE_RESOURCES[locale];
      for (const key of themeWizardKeys) {
        expect(resource[key], `${locale} ${key}`).to.not.equal(english[key]);
        expect(resource[key], `${locale} ${key}`).to.not.match(englishFragments);
      }
    }
  });

  it('keeps SPARC editor labels localized for Hindi, Bengali, and Urdu draft resources', function() {
    const english = PLATFORM_LOCALE_RESOURCES.en;
    for (const locale of ['hi', 'bn', 'ur'] as const) {
      const resource = PLATFORM_LOCALE_RESOURCES[locale];
      for (const key of sparcEditorKeys) {
        expect(resource[key], `${locale} ${key}`).to.not.equal(english[key]);
      }
    }
  });

  it('keeps core learner prompts localized for Hindi, Bengali, and Urdu draft resources', function() {
    const englishFragments = /Correct answer|question|Audio/;
    for (const locale of ['hi', 'bn', 'ur'] as const) {
      const resource = PLATFORM_LOCALE_RESOURCES[locale];
      for (const key of coreLearnerPromptKeys) {
        expect(resource[key], `${locale} ${key}`).to.not.equal(PLATFORM_LOCALE_RESOURCES.en[key]);
        expect(resource[key], `${locale} ${key}`).to.not.match(englishFragments);
      }
    }
  });

  it('keeps AutoTutor learner prompts localized for Hindi, Bengali, and Urdu draft resources', function() {
    const englishFragments = /\banswer\b|\btype\b/;
    for (const locale of ['hi', 'bn', 'ur'] as const) {
      const resource = PLATFORM_LOCALE_RESOURCES[locale];
      for (const key of autoTutorLearnerPromptKeys) {
        expect(resource[key], `${locale} ${key}`).to.not.equal(PLATFORM_LOCALE_RESOURCES.en[key]);
        expect(resource[key], `${locale} ${key}`).to.not.match(englishFragments);
      }
    }
  });

  it('keeps AutoTutor runtime labels localized for Hindi, Bengali, and Urdu draft resources', function() {
    const english = PLATFORM_LOCALE_RESOURCES.en;
    for (const locale of ['hi', 'bn', 'ur'] as const) {
      const resource = PLATFORM_LOCALE_RESOURCES[locale];
      for (const key of autoTutorRuntimeKeys) {
        expect(resource[key], `${locale} ${key}`).to.not.equal(english[key]);
      }
    }
  });

  it('keeps learner performance and progress labels localized for Hindi, Bengali, and Urdu draft resources', function() {
    const english = PLATFORM_LOCALE_RESOURCES.en;
    for (const locale of ['hi', 'bn', 'ur'] as const) {
      const resource = PLATFORM_LOCALE_RESOURCES[locale];
      for (const key of learnerProgressKeys) {
        expect(resource[key], `${locale} ${key}`).to.not.equal(english[key]);
      }
    }
  });

  it('keeps course selection labels localized for Hindi, Bengali, and Urdu draft resources', function() {
    const english = PLATFORM_LOCALE_RESOURCES.en;
    for (const locale of ['hi', 'bn', 'ur'] as const) {
      const resource = PLATFORM_LOCALE_RESOURCES[locale];
      for (const key of classSelectionKeys) {
        expect(resource[key], `${locale} ${key}`).to.not.equal(english[key]);
      }
    }
  });

  it('keeps Admin Tests labels localized for Hindi, Bengali, and Urdu draft resources', function() {
    const english = PLATFORM_LOCALE_RESOURCES.en;
    for (const locale of ['hi', 'bn', 'ur'] as const) {
      const resource = PLATFORM_LOCALE_RESOURCES[locale];
      for (const key of adminTestsKeys) {
        expect(resource[key], `${locale} ${key}`).to.not.equal(english[key]);
      }
    }
  });

  it('keeps AI Content Creator mode labels localized for Hindi, Bengali, and Urdu draft resources', function() {
    const english = PLATFORM_LOCALE_RESOURCES.en;
    const englishFragments = /\bContent input\b|\bcharacter\b|\bSession type\b|\bLearning session\b|\bLearn it\b|\bAssessment session\b|\bTest me\b|\bChat tutor\b/;
    for (const locale of ['hi', 'bn', 'ur'] as const) {
      const resource = PLATFORM_LOCALE_RESOURCES[locale];
      for (const key of aiCreatorModeKeys) {
        expect(resource[key], `${locale} ${key}`).to.not.equal(english[key]);
        expect(resource[key], `${locale} ${key}`).to.not.match(englishFragments);
      }
    }
  });

  it('keeps Course Assignments labels localized for Hindi, Bengali, and Urdu draft resources', function() {
    const english = PLATFORM_LOCALE_RESOURCES.en;
    const englishFragments = /\bAssignments?\b|\bLesson\b|\bSelected\b|\bUnsaved\b|\bSaved\b|\bRequired\b|\bVisible\b|\bClear\b|\bDue\b|\bRemove\b|\bReset\b|\binvalid\b|\bdate\b|\bload\b|\bCourse assignments\b/;
    for (const locale of ['hi', 'bn', 'ur'] as const) {
      const resource = PLATFORM_LOCALE_RESOURCES[locale];
      for (const key of courseAssignmentKeys) {
        expect(resource[key], `${locale} ${key}`).to.not.equal(english[key]);
        expect(resource[key], `${locale} ${key}`).to.not.match(englishFragments);
      }
    }
  });

  it('keeps Course Management labels localized for Hindi, Bengali, and Urdu draft resources', function() {
    const english = PLATFORM_LOCALE_RESOURCES.en;
    const englishFragments = /\bCourse\b|\bClass data\b|\bEdit\b|\bexisting\b|\bVisibility\b|\bPrivate\b|\bPublic\b|\benrolled students\b|\bsigned-in learners\b|\bBegin date\b|\bEnd date\b|\btimezone\b|\bSection\b|\bDefault\b|\bCancel\b|\bDelete\b|\bSave\b|\bEastern Time\b|\bCentral Time\b|\bMountain Time\b|\bArizona Time\b|\bPacific Time\b|\bAlaska Time\b|\bHawaii Time\b|\bSelected course\b|\bLearner history\b|\bassignment rows\b|\benrollments\b/;
    for (const locale of ['hi', 'bn', 'ur'] as const) {
      const resource = PLATFORM_LOCALE_RESOURCES[locale];
      for (const key of courseManagementKeys) {
        expect(resource[key], `${locale} ${key}`).to.not.equal(english[key]);
        expect(resource[key], `${locale} ${key}`).to.not.match(englishFragments);
      }
    }
  });

  it('keeps Content Editor labels localized for Hindi, Bengali, and Urdu draft resources', function() {
    const english = PLATFORM_LOCALE_RESOURCES.en;
    const englishFragments = /\bStimuli\b|\bStim file\b|\bContent\b|\bstimulus data\b|\bedit permission\b|\bEditor\b|\bIncorrect responses?\b|\bmultiple-choice\b|\btext input\b|\bRemove\b|\bquestion\b|\bdistractors\b|\bGenerate\b|\bPrevious cluster\b|\bPrev\b|\bNext cluster\b|\bNext\b|\bCluster\b|\bShow\b|\bclusters at a time\b|\bNo clusters\b|\bEdit\b|\bPerformance\b|\bDraft content editor\b|\bProperties\b|\bInvalid media file\b|\bUpload failed\b|\bUploaded\b|\bPreview\b|\bImage load failed\b/;
    for (const locale of ['hi', 'bn', 'ur'] as const) {
      const resource = PLATFORM_LOCALE_RESOURCES[locale];
      for (const key of contentEditorKeys) {
        expect(resource[key], `${locale} ${key}`).to.not.equal(english[key]);
        expect(resource[key], `${locale} ${key}`).to.not.match(englishFragments);
      }
    }
  });

  it('keeps TDF Editor labels localized for Hindi, Bengali, and Urdu draft resources', function() {
    const english = PLATFORM_LOCALE_RESOURCES.en;
    const englishFragments = /\bEditing\b|\bCondition\b|\bloading\b|\bedit permission\b|\bUnsaved changes\b|\bDescriptions\b|\bNone\b|\bBrief\b|\bVerbose\b|\bChanges\b|\bSchema validation errors\b|\bValidation errors\b|\bSaved\b|\bContent Manager\b|\bsave\b|\bload\b|\bPage refresh\b|\bEditor library\b|\bsupport\b|\bUnknown\b/;
    for (const locale of ['hi', 'bn', 'ur'] as const) {
      const resource = PLATFORM_LOCALE_RESOURCES[locale];
      for (const key of tdfEditorKeys) {
        expect(resource[key], `${locale} ${key}`).to.not.equal(english[key]);
        expect(resource[key], `${locale} ${key}`).to.not.match(englishFragments);
      }
    }
  });

  it('keeps Help page chrome localized for Hindi, Bengali, and Urdu draft resources', function() {
    const english = PLATFORM_LOCALE_RESOURCES.en;
    const englishFragments = /\bStudent Help Guide\b|\bweb administrator\b|\bHelp content\b|\bload\b|\bonline help guide\b/;
    for (const locale of ['hi', 'bn', 'ur'] as const) {
      const resource = PLATFORM_LOCALE_RESOURCES[locale];
      for (const key of helpPageKeys) {
        expect(resource[key], `${locale} ${key}`).to.not.equal(english[key]);
        expect(resource[key], `${locale} ${key}`).to.not.match(englishFragments);
      }
    }
  });

  it('keeps small visible chrome leftovers localized for Hindi, Bengali, and Urdu draft resources', function() {
    const english = PLATFORM_LOCALE_RESOURCES.en;
    for (const locale of ['hi', 'bn', 'ur'] as const) {
      const resource = PLATFORM_LOCALE_RESOURCES[locale];
      for (const key of smallVisibleChromeKeys) {
        expect(resource[key], `${locale} ${key}`).to.not.equal(english[key]);
      }
    }
    for (const key of urduVisibleChromeKeys) {
      expect(PLATFORM_LOCALE_RESOURCES.ur[key], `ur ${key}`).to.not.equal(english[key]);
    }
  });

  it('keeps Canvas IMSCC import wizard chrome localized for Hindi, Bengali, and Urdu draft resources', function() {
    const english = PLATFORM_LOCALE_RESOURCES.en;
    const englishFragments = /\bimport\b|\bexport package\b|\bquiz content\b|\bbrowser\b|\blocally\b|\bconversion\b|\boriginal\b|\bfile\b|\bgenerate\b|\bUpload\b|\bSetup\b|\bDraft edit\b|\bPackage\b|\bSelected\b|\banalyze\b|\bQuizzes\b|\bselect\b|\bconfigure\b|\bOutput mode\b|\bSeparate\b|\bJoin\b|\bCurrent\b|\bsystem\b|\bcombined\b|\bpractice system\b|\bFile\b|\bSelect\b|\bQuiz title\b|\bDue date\b|\bQuestions\b|\bSupported\b|\bUnsupported\b|\bsupported questions\b|\bIncluded quizzes\b|\bInstructions\b|\bConversion summary\b|\bvalidation errors\b|\bEditable draft\b|\bNo due date\b|\bNone\b|\bGeneration\b|\bPackaging error\b|\bPackage Summary\b|\bGeneration Summary\b|\bTotal cards\b|\bTotal skipped\b|\bcards\b|\bskipped\b|\bmedia files\b|\bUpload complete\b|\bdownload\b|\bWizard\b|\boverwrite confirmation\b|\bregular package uploader\b|\bunknown error\b|\bPackage processing failed\b/;
    for (const locale of ['hi', 'bn', 'ur'] as const) {
      const resource = PLATFORM_LOCALE_RESOURCES[locale];
      for (const key of imsccKeys) {
        expect(resource[key], `${locale} ${key}`).to.not.equal(english[key]);
        expect(resource[key], `${locale} ${key}`).to.not.match(englishFragments);
      }
    }
  });

  it('keeps Anki APKG import wizard chrome localized for Hindi, Bengali, and Urdu draft resources', function() {
    const english = PLATFORM_LOCALE_RESOURCES.en;
    const englishFragments = /\bimport\b|\bflashcard decks\b|\blearning modules\b|\bfields\b|\btargeted\b|\bUpload\b|\bSetup\b|\bEdit Draft\b|\bPackage\b|\bCancel\b|\bStep\b|\bdeck\b|\bcomputer\b|\bDeck structure\b|\bdatabase\b|\bparse\b|\bFields\b|\bcard templates\b|\bMedia files\b|\bError\b|\bAnalyze Deck\b|\bLesson sources\b|\bNotes\b|\bCards\b|\bMedia\b|\bModel\b|\bPrimary model\b|\bimportable notes\b|\bAvailable fields\b|\bPreview\b|\bImage field\b|\bText field\b|\bSamples\b|\bno samples\b|\bunnamed\b|\bRemove\b|\bTDF name\b|\be\.g\.\b|\bstudents\b|\bcorrect answer\b|\bSelect field\b|\bNote range\b|\bDeck order\b|\bzero-based\b|\bConfiguration\b|\blearning module\b|\bSummary\b|\bconfigured\b|\btotal cards\b|\bmedia files\b|\bBack\b|\bDraft Editor\b|\bPackaging error\b|\bMetadata\b|\bPrompt field\b|\bResponse field\b|\bGeneration complete\b|\bImported lessons\b|\bGenerated files\b|\bcards\b|\bskipped\b|\bDownload\b|\bWizard\b|\bEdited draft\b|\bPackage ready\b|\bDraft ready\b|\boverwrite\b|\bexisting data\b|\bProcessing package\b|\bFinalizing upload\b|\bUploaded files\b|\bcontent list\b/;
    for (const locale of ['hi', 'bn', 'ur'] as const) {
      const resource = PLATFORM_LOCALE_RESOURCES[locale];
      for (const key of apkgKeys) {
        const value = requireResourceString(resource, key, `${locale} ${key}`);
        const valueWithoutPlaceholders = value.replace(/\{[^}]+\}/g, '');
        expect(value, `${locale} ${key}`).to.not.equal(english[key]);
        expect(valueWithoutPlaceholders, `${locale} ${key}`).to.not.match(englishFragments);
      }
    }
  });

  it('fails clearly when a target locale resource is missing', function() {
    const incompleteResources = { ...PLATFORM_LOCALE_RESOURCES } as Record<TargetUiLocale, LocaleResource>;
    delete (incompleteResources as Partial<Record<TargetUiLocale, LocaleResource>>).ur;

    expect(() => assertCompletePlatformLocaleResources(incompleteResources))
      .to.throw('Missing platform locale resource for "ur"');
  });

  it('fails clearly when a target locale translation is missing', function() {
    const incompleteResources = {
      ...PLATFORM_LOCALE_RESOURCES,
      es: {
        ...PLATFORM_LOCALE_RESOURCES.es,
        'common.submit': '',
      },
    };

    expect(() => assertCompletePlatformLocaleResources(incompleteResources))
      .to.throw('Missing platform translation "common.submit" for locale "es"');
  });

  it('translates platform strings for target locales', function() {
    expect(translatePlatformString('en', 'common.submit')).to.equal('Submit');
    expect(translatePlatformString('zh-Hans', 'common.submit')).to.equal('提交');
    expect(translatePlatformString('ur', 'common.submit')).to.equal('جمع کریں');
  });

  it('fails clearly for unsupported locales instead of falling back', function() {
    expect(() => translatePlatformString('de-DE', 'common.submit')).to.throw(/Unsupported UI locale/);
  });

  it('interpolates account strings and fails clearly when values are missing', function() {
    expect(translatePlatformString('en', 'auth.passwordMinLength', { min: 8 })).to.equal('Use at least 8 characters.');
    expect(() => translatePlatformString('en', 'auth.passwordMinLength')).to.throw(/Missing interpolation value "min"/);
  });

  it('keeps localized range grammar outside preformatted English fragments', function() {
    expect(translatePlatformString('es', 'admin.showingUsers', {
      start: 1,
      end: 23,
      total: 23,
    })).to.equal('Mostrando 1-23 de 23 usuarios');
  });

  it('reports right-to-left direction for Arabic and Urdu', function() {
    expect(getPlatformTextDirection('ar')).to.equal('rtl');
    expect(getPlatformTextDirection('ur')).to.equal('rtl');
    expect(getPlatformTextDirection('fr')).to.equal('ltr');
  });
});
