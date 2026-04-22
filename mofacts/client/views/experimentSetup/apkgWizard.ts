/**
 * Anki .apkg Import Wizard
 * Multi-step wizard for configuring and generating MoFaCTS TDFs from Anki decks
 *
 * All processing is done client-side using JSZip and sql.js (WebAssembly SQLite)
 * Only the final ZIP package is uploaded to the server
 */

import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import './apkgWizard.html';
import { Session } from 'meteor/session';
import { ReactiveVar } from 'meteor/reactive-var';
import { Tracker } from 'meteor/tracker';
import { clientConsole } from '../..';
import { getErrorMessage } from '../../lib/errorUtils';
import { getImportIndexSelectionCount, parseImportIndexSpec } from '../../lib/importRangeUtils';
import './draftEditorWorkspace';
import { buildImportPackageFromDraftLessons } from '../../lib/importPackageBuilder';

declare const $: any;
declare const DynamicAssets: any;

let apkgProcessorPromise: Promise<any> | null = null;

async function getApkgProcessor() {
  if (!apkgProcessorPromise) {
    apkgProcessorPromise = import('../../lib/apkgProcessor');
  }
  return apkgProcessorPromise;
}

// Template created hook - initialize reactive state
Template.apkgWizard.onCreated(function(this: any) {
  // Wizard state
  this.wizardStep = new ReactiveVar(1);
  this.completedSteps = new ReactiveVar([]);

  // File and metadata
  this.selectedFile = new ReactiveVar(null);
  this.selectedFileName = new ReactiveVar(null);
  this.deckMetadata = new ReactiveVar(null);

  // Analysis state
  this.analyzing = new ReactiveVar(false);
  this.analyzeError = new ReactiveVar(null);

  // Configuration state
  this.tdfConfigs = new ReactiveVar([{
    name: '',
    prompt: { field: null, fieldName: '', type: 'auto' },
    response: { field: null, fieldName: '', type: 'auto' },
    sourceRange: '',
    validationError: null,
    isValid: false
  }]);
  this.draftLessons = new ReactiveVar([]);

  // Generation state
  this.generating = new ReactiveVar(false);
  this.generationProgress = new ReactiveVar(0);
  this.currentGenerationStep = new ReactiveVar('');
  this.generateError = new ReactiveVar(null);
  this.generationComplete = new ReactiveVar(false);
  this.generationResult = new ReactiveVar(null);

  // Upload state
  this.uploadComplete = new ReactiveVar(false);
  this.uploadStatus = new ReactiveVar(null); // { message: string, progress: number, hint?: string }
  this.uploadError = new ReactiveVar(null);
});

// Template rendered hook - set select values from data attributes
Template.apkgWizard.onRendered(function(this: any) {
  // Set select values once on initial render (not reactively)
  // This allows user to change selections without them being reset
  Tracker.afterFlush(() => {
    $('.prompt-field, .response-field').each(function(this: any) {
      const selected = $(this).data('selected');
      if (selected !== null && selected !== undefined && selected !== '') {
        $(this).val(selected);
      }
    });
  });
});

// Helper functions
Template.apkgWizard.helpers({
  // Step navigation
  isStep(num: any) {
    return (Template.instance() as any).wizardStep.get() === num;
  },

  stepCompleted(num: any) {
    return (Template.instance() as any).completedSteps.get().includes(num);
  },

  // Step 1: Upload
  selectedFileName() {
    return (Template.instance() as any).selectedFileName.get();
  },

  analyzing() {
    return (Template.instance() as any).analyzing.get();
  },

  analyzeError() {
    return (Template.instance() as any).analyzeError.get();
  },

  // Step 2: Preview
  deckMetadata() {
    return (Template.instance() as any).deckMetadata.get();
  },

  importableNoteCount() {
    const metadata = (Template.instance() as any).deckMetadata.get();
    return getImportableNoteCount(metadata);
  },

  fieldTypeBadge(type: any) {
    const badges = {
      'text': 'text',
      'image': 'image',
      'mixed': 'mixed',
      'audio': 'audio'
    };
    return (badges as any)[type] || 'text';
  },

  joinSamples(samples: any) {
    if (!samples || samples.length === 0) return '(no samples)';
    return samples
      .map((s: any) => s.replace(/<[^>]+>/g, '').substring(0, 50))
      .join(', ');
  },

  eq(a: any, b: any) {
    return a === b;
  },

  // Step 3: Configure
  tdfConfigs() {
    return (Template.instance() as any).tdfConfigs.get();
  },

  isMultipleMode() {
    return (Template.instance() as any).tdfConfigs.get().length > 1;
  },

  isSingleMode() {
    return (Template.instance() as any).tdfConfigs.get().length === 1;
  },

  configCount() {
    return (Template.instance() as any).tdfConfigs.get().length;
  },

  totalCards() {
    const metadata = (Template.instance() as any).deckMetadata.get();
    const configs = (Template.instance() as any).tdfConfigs.get();
    if (!metadata) return 0;
    return configs.reduce((sum: number, config: any) => sum + getConfigNoteCount(config, metadata), 0);
  },

  totalMedia() {
    const metadata = (Template.instance() as any).deckMetadata.get();
    const configs = (Template.instance() as any).tdfConfigs.get();
    if (!metadata) return 0;

    let total = 0;
    configs.forEach((config: any) => {
      if (config.prompt.field !== null) {
        const field = metadata.fields[config.prompt.field];
        if (field && field.hasImages) {
          total += getConfigNoteCount(config, metadata);
        }
      }
    });
    return total;
  },

  allConfigsValid() {
    const configs = (Template.instance() as any).tdfConfigs.get();
    return configs.every((c: any) => c.isValid && !c.validationError);
  },

  deckFields() {
    const metadata = (Template.instance() as any).deckMetadata.get();
    return metadata ? metadata.fields : [];
  },

  generateButtonText() {
    const count = (Template.instance() as any).tdfConfigs.get().length;
    return count === 1 ? 'Generate TDF' : 'Generate Package';
  },

  plusOne(index: any) {
    return index + 1;
  },

  hideAddButton() {
    return (Template.instance() as any).tdfConfigs.get().length >= 10;
  },

  selectedNoteCount(config: any) {
    const metadata = (Template.instance() as any).deckMetadata.get();
    return metadata ? getConfigNoteCount(config, metadata) : 0;
  },

  usingSubset(config: any) {
    const metadata = (Template.instance() as any).deckMetadata.get();
    return metadata ? getConfigNoteCount(config, metadata) !== metadata.noteCount : false;
  },

  // Step 4: Generate
  generating() {
    return (Template.instance() as any).generating.get();
  },

  generationProgress() {
    return (Template.instance() as any).generationProgress.get();
  },

  currentGenerationStep() {
    return (Template.instance() as any).currentGenerationStep.get();
  },

  generateError() {
    return (Template.instance() as any).generateError.get();
  },

  generationComplete() {
    return (Template.instance() as any).generationComplete.get();
  },

  generationResult() {
    return (Template.instance() as any).generationResult.get();
  },

  draftLessons() {
    return (Template.instance() as any).draftLessons.get();
  },

  updateDraftLessons() {
    const instance = Template.instance() as any;
    return (lessons: any) => {
      instance.draftLessons.set(lessons);
    };
  },

  backToSourceConfig() {
    const instance = Template.instance() as any;
    return () => {
      instance.wizardStep.set(2);
    };
  },

  saveDraftAndContinue() {
    const instance = Template.instance() as any;
    return async () => {
      const lessons = instance.draftLessons.get();
      if (!Array.isArray(lessons) || lessons.length === 0) {
        return;
      }

      instance.generating.set(true);
      instance.generateError.set(null);
      instance.generationProgress.set(0);
      instance.currentGenerationStep.set('Packaging edited draft...');

      try {
        const result = await buildImportPackageFromDraftLessons(lessons);
        instance.generationProgress.set(100);
        instance.currentGenerationStep.set('Package ready.');
        instance.generationResult.set(result);
        instance.generationComplete.set(true);
        // Navigate only after the result is ready so Step 4 never shows an
        // empty/null result state.
        instance.wizardStep.set(4);
      } catch (error: unknown) {
        clientConsole(1, 'Error packaging edited APKG draft:', error);
        const reason = typeof error === 'object' && error !== null && 'reason' in error && typeof (error as { reason?: unknown }).reason === 'string'
          ? (error as { reason?: string }).reason
          : undefined;
        instance.generateError.set(reason || getErrorMessage(error));
        // Stay on Step 3 so the user can see the error and go back.
        instance.wizardStep.set(3);
      } finally {
        instance.generating.set(false);
      }
    };
  },

  mediaFileCount(mediaFiles: any) {
    return mediaFiles ? Object.keys(mediaFiles).length : 0;
  },

  uploadComplete() {
    return (Template.instance() as any).uploadComplete.get();
  },

  uploadStatus() {
    return (Template.instance() as any).uploadStatus.get();
  },

  uploadError() {
    return (Template.instance() as any).uploadError.get();
  },

  analyzeDisabled() {
    return !(Template.instance() as any).selectedFileName.get();
  }
});

// Event handlers
Template.apkgWizard.events({
  // Step 1: Upload & Analyze
  'change #apkg-file-input': function(event: any, template: any) {
    const file = event.target.files[0];
    if (file) {
      template.selectedFile.set(file);
      template.selectedFileName.set(file.name);
      template.analyzeError.set(null);
    }
  },

  'click #analyze-deck': async function(event: any, template: any) {
    const file = template.selectedFile.get();
    if (!file) return;

    template.analyzing.set(true);
    template.analyzeError.set(null);

    try {
      const { analyzeApkg } = await getApkgProcessor();
      // Analyze file entirely client-side (no upload needed)
      const metadata = await analyzeApkg(file, (_progress: any) => {
        // Could update a progress bar here if desired
        
      });

      // Store metadata for later use
      template.deckMetadata.set(metadata);

      // Mark step 1 complete and advance
      const completed = template.completedSteps.get();
      if (!completed.includes(1)) {
        template.completedSteps.set([...completed, 1]);
      }
      template.wizardStep.set(2);

    } catch (error: unknown) {
      clientConsole(1, 'Error analyzing .apkg:', error);
      const reason = typeof error === 'object' && error !== null && 'reason' in error && typeof (error as { reason?: unknown }).reason === 'string'
        ? (error as { reason?: string }).reason
        : undefined;
      template.analyzeError.set(reason || getErrorMessage(error));
    } finally {
      template.analyzing.set(false);
    }
  },

  'click #cancel-wizard': function(event: any, template: any) {
    if (confirm('Cancel import? All progress will be lost.')) {
      // Reset wizard
      template.wizardStep.set(1);
      template.completedSteps.set([]);
      template.selectedFile.set(null);
      template.selectedFileName.set(null);
      template.deckMetadata.set(null);
    }
  },

  // Step 2: Preview
  'click #back-to-upload': function(event: any, template: any) {
    template.wizardStep.set(1);
  },

  // Step 2: Configure
  'input .tdf-name': function(event: any, template: any) {
    const index = parseInt(event.target.dataset.index);
    const name = event.target.value;
    const configs = template.tdfConfigs.get();
    configs[index].name = name;
    validateConfig(configs[index], template.deckMetadata.get());
    template.tdfConfigs.set(configs);
  },

  'input .source-range': function(event: any, template: any) {
    const index = parseInt(event.target.dataset.index);
    const configs = template.tdfConfigs.get();
    configs[index].sourceRange = event.target.value;
    validateConfig(configs[index], template.deckMetadata.get());
    template.tdfConfigs.set(configs);
  },

  'change .prompt-field': function(event: any, template: any) {
    const index = parseInt(event.target.dataset.index);
    const fieldIndex = parseInt(event.target.value);
    const configs = template.tdfConfigs.get();
    const metadata = template.deckMetadata.get();

    if (!isNaN(fieldIndex) && metadata) {
      const field = metadata.fields[fieldIndex];
      configs[index].prompt = {
        field: fieldIndex,
        fieldName: field.name,
        type: field.type
      };
    } else {
      configs[index].prompt = { field: null, fieldName: '', type: 'auto' };
    }

    validateConfig(configs[index], metadata);
    template.tdfConfigs.set(configs);
  },

  'change .response-field': function(event: any, template: any) {
    const index = parseInt(event.target.dataset.index);
    const fieldIndex = parseInt(event.target.value);
    const configs = template.tdfConfigs.get();
    const metadata = template.deckMetadata.get();

    if (!isNaN(fieldIndex) && metadata) {
      const field = metadata.fields[fieldIndex];
      configs[index].response = {
        field: fieldIndex,
        fieldName: field.name,
        type: field.type
      };
    } else {
      configs[index].response = { field: null, fieldName: '', type: 'auto' };
    }

    validateConfig(configs[index], metadata);
    template.tdfConfigs.set(configs);
  },

  'click #add-tdf-config': function(event: any, template: any) {
    const configs = template.tdfConfigs.get();
    const newConfig = {
      name: '',
      prompt: { field: null, fieldName: '', type: 'auto' },
      response: { field: null, fieldName: '', type: 'auto' },
      sourceRange: '',
      validationError: null,
      isValid: false
    };
    configs.push(newConfig);
    template.tdfConfigs.set(configs);
  },

  'click .remove-config': function(event: any, template: any) {
    const index = parseInt(event.currentTarget.dataset.index);
    const configs = template.tdfConfigs.get();

    if (configs.length === 1) {
      alert('You must have at least one TDF configuration');
      return;
    }

    if (confirm('Remove this TDF configuration?')) {
      configs.splice(index, 1);
      template.tdfConfigs.set(configs);
    }
  },

  'click #open-draft-editor': async function(event: any, template: any) {
    const configs = template.tdfConfigs.get();
    const metadata = template.deckMetadata.get();

    if (!metadata || !configs.every((c: any) => c.isValid)) return;

    template.generating.set(true);
    template.generateError.set(null);
    template.generationProgress.set(0);
    template.currentGenerationStep.set('Preparing generation...');

    try {
      // Prepare configs for processing
      const processConfigs = configs.map((c: any) => ({
        name: c.name,
        sourceRange: c.sourceRange,
        prompt: {
          field: c.prompt.field,
          type: c.prompt.type
        },
        response: {
          field: c.response.field,
          type: c.response.type
        }
      }));

      template.currentGenerationStep.set('Generating TDF(s)...');

      const { buildDraftLessonsFromApkg } = await getApkgProcessor();
      const result = await buildDraftLessonsFromApkg(metadata, processConfigs, (progress: any) => {
        template.generationProgress.set(progress);
      });

      template.generationProgress.set(100);
      template.currentGenerationStep.set('Draft ready.');

      template.draftLessons.set(result);

      // Mark step complete and advance; clear any stale packaging error from
      // a previous Save and Continue attempt.
      template.generateError.set(null);
      template.wizardStep.set(3);

    } catch (error: unknown) {
      clientConsole(1, 'Error generating APKG draft lessons:', error);
      const reason = typeof error === 'object' && error !== null && 'reason' in error && typeof (error as { reason?: unknown }).reason === 'string'
        ? (error as { reason?: string }).reason
        : undefined;
      template.generateError.set(reason || getErrorMessage(error));
    } finally {
      template.generating.set(false);
    }
  },

  'click #back-to-config-error': function(event: any, template: any) {
    template.wizardStep.set(2);
    template.generateError.set(null);
  },

  // Step 4: Generate & Upload
  'click #download-package': async function(event: any, template: any) {
    const result = template.generationResult.get();
    if (!result?.zipBlob) return;

    try {
      // Trigger download
      const url = URL.createObjectURL(result.zipBlob);
      const a = document.createElement('a');
      a.href = url;
      const firstManifest = Array.isArray(result.manifest) && result.manifest.length > 0 ? result.manifest[0] : null;
      a.download = result.mode === 'single' && firstManifest
        ? `${firstManifest.tdfName}.zip`
        : 'MoFaCTS_Package.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (error: unknown) {
      clientConsole(1, 'Error downloading package:', error);
      alert('Error creating download: ' + getErrorMessage(error));
    }
  },

  'click #upload-to-mofacts': async function(event: any, template: any) {
    const result = template.generationResult.get();
    if (!result?.zipBlob) return;

    // Clear any previous error
    template.uploadError.set(null);

    try {
      const firstManifest = Array.isArray(result.manifest) && result.manifest.length > 0 ? result.manifest[0] : null;
      const filename = result.mode === 'single' && firstManifest
        ? `${firstManifest.tdfName}.zip`
        : 'MoFaCTS_Package.zip';

      // Create File object from blob
      const file = new File([result.zipBlob], filename, { type: 'application/zip' });

      // Upload using DynamicAssets (same pattern as doPackageUpload)
      const existingFile = await DynamicAssets.findOne({ name: file.name, userId: Meteor.userId() });
      if (existingFile) {
        if (confirm(`Uploading this file will overwrite existing data. Continue?`)) {
          
          await (Meteor as any).callAsync('removeAssetById', existingFile._id);
        } else {
          return;
        }
      }

      const upload = DynamicAssets.insert({
        file: file,
        chunkSize: 'dynamic'
      }, false);

      upload.on('start', function () {
        template.uploadStatus.set({
          message: 'Uploading package...',
          progress: 0
        });
      });

      upload.on('progress', function (progress: any) {
        // Upload is 0-50% of total progress
        template.uploadStatus.set({
          message: 'Uploading package...',
          progress: Math.round(progress * 0.5)
        });
      });

      upload.on('end', async function (error: any, fileObj: any) {
        if (error) {
          template.uploadStatus.set(null);
          template.uploadError.set(`Error during upload: ${error}`);
        } else {
          const link = DynamicAssets.link({...fileObj});
          if (fileObj.ext === "zip") {
            

            try {
              // Processing is 50-100% of total progress
              template.uploadStatus.set({
                message: 'Processing package...',
                progress: 55,
                hint: 'This may take a moment for packages with many media files...'
              });

              const emailToggle = false; // Not using email notification for wizard uploads

              template.uploadStatus.set({
                message: 'Extracting and validating TDFs...',
                progress: 65,
                hint: 'This may take a moment for packages with many media files...'
              });

              const processResult = await (Meteor as any).callAsync('processPackageUpload', fileObj._id, Meteor.userId(), link, emailToggle);

              

              template.uploadStatus.set({
                message: 'Finalizing upload...',
                progress: 85
              });

              // Handle confirmation dialogs for overwrites
              for (const res of processResult.results) {
                if (res.data && res.data.res === 'awaitClientTDF') {
                  const reasons = Array.isArray(res.data.reason) ? res.data.reason : [];
                  if (reasons.includes('breakingVersionRequired')) {
                    template.uploadStatus.set(null);
                    template.uploadError.set(
                      `Breaking change detected for ${res.data.TDF.content.fileName}. Publish a new version (vN+1) instead of overwrite.`
                    );
                    return;
                  }
                  let reason = [];
                  if (res.data.reason.includes('prevTDFExists'))
                    reason.push(`Previous ${res.data.TDF.content.fileName} already exists, continuing the upload will overwrite the old file. Continue?`);
                  if (res.data.reason.includes('prevStimExists'))
                    reason.push(`Previous ${res.data.TDF.content.tdfs.tutor.setspec.stimulusfile} already exists, continuing the upload will overwrite the old file. Continue?`);

                  if (confirm(reason.join('\n'))) {
                    template.uploadStatus.set({
                      message: 'Confirming TDF update...',
                      progress: 95
                    });
                    await (Meteor as any).callAsync('tdfUpdateConfirmed', res.data.TDF, false, reasons);
                  }
                } else if (!res.result) {
                  template.uploadStatus.set(null);
                  template.uploadError.set("Package upload failed: " + res.errmsg);
                  return;
                }
              }

              // Clear status and mark complete
              template.uploadStatus.set(null);
              template.uploadComplete.set(true);
              Session.set('assetsRefreshTrigger', Date.now());

            } catch (err: unknown) {
              template.uploadStatus.set(null);
              template.uploadError.set('Error processing package: ' + getErrorMessage(err));
            }
          }
        }
      });

      upload.start();

    } catch (error: unknown) {
      clientConsole(1, 'Error uploading package:', error);
      template.uploadError.set('Error uploading package: ' + getErrorMessage(error));
    }
  },

  'click #close-wizard': function() {
    // Reset wizard and close
    if (confirm('Close wizard? You can find your uploaded files in the content list.')) {
      location.reload();
    }
  }
});

// Helper function to validate a config
function validateConfig(config: any, metadata: any) {
  if (!metadata) {
    config.validationError = 'Metadata not loaded';
    config.isValid = false;
    return;
  }

  // Check name
  if (!config.name || config.name.trim() === '') {
    config.validationError = 'TDF name is required';
    config.isValid = false;
    return;
  }

  // Check prompt field
  if (config.prompt.field === null || config.prompt.field === undefined) {
    config.validationError = 'Prompt field is required';
    config.isValid = false;
    return;
  }

  // Check response field
  if (config.response.field === null || config.response.field === undefined) {
    config.validationError = 'Response field is required';
    config.isValid = false;
    return;
  }

  // Check they're different
  if (config.prompt.field === config.response.field) {
    config.validationError = 'Prompt and response must use different fields';
    config.isValid = false;
    return;
  }

  const parsedRange = parseImportIndexSpec(config.sourceRange, getImportableNoteCount(metadata));
  if (!parsedRange.valid) {
    config.validationError = parsedRange.errorMessage || 'Invalid note range';
    config.isValid = false;
    return;
  }

  if (parsedRange.indexes && parsedRange.indexes.length === 0) {
    config.validationError = 'Note range does not select any notes';
    config.isValid = false;
    return;
  }

  // All valid
  config.validationError = null;
  config.isValid = true;

  // Set media info
  const promptField = metadata.fields[config.prompt.field];
  config.hasMedia = promptField && promptField.hasImages;
  config.mediaType = promptField ? promptField.type : 'unknown';
}

function getConfigNoteCount(config: any, metadata: any) {
  const totalCount = getImportableNoteCount(metadata);
  if (!totalCount) return 0;
  return getImportIndexSelectionCount(config?.sourceRange, totalCount);
}

function getImportableNoteCount(metadata: any) {
  return Number(metadata?._primaryModelNoteCount || metadata?.importableNoteCount || metadata?.noteCount || 0);
}





