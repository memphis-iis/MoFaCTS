import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { meteorCallAsync } from './meteorAsync';
import { applyLearnerTdfConfig, type LearnerTdfConfig } from '../../common/lib/learnerTdfConfig';
import { hasExperimentTag, type LessonAudioSetSpec } from './lessonAudioSettings';

// This cache supports reactive editor/audio indicators. Every launch and editor
// opening refreshes the exact lesson from the server, not from a dashboard visit.
export function getLearnerTdfConfig(tdfId: string): LearnerTdfConfig | undefined {
  return Session.get('learnerTdfConfigOverrides')?.[tdfId];
}

export function setLocalLearnerTdfConfig(tdfId: string, config: LearnerTdfConfig | null | undefined): void {
  const configs = { ...Session.get('learnerTdfConfigOverrides') };
  if (config) configs[tdfId] = config;
  else delete configs[tdfId];
  Session.set('learnerTdfConfigOverrides', configs);
}

export async function loadLearnerTdfConfig(tdfId: string): Promise<LearnerTdfConfig | undefined> {
  if (!Meteor.userId()) return undefined;
  const config = await meteorCallAsync<LearnerTdfConfig | null>('getLearnerTdfConfig', tdfId);
  setLocalLearnerTdfConfig(tdfId, config);
  return config ?? undefined;
}

export async function applyLearnerSettingsForLaunch<T>(content: T, tdfId: string): Promise<T> {
  let config = await loadLearnerTdfConfig(tdfId);
  const setspec = (content as { tdfs?: { tutor?: { setspec?: LessonAudioSetSpec } } })?.tdfs?.tutor?.setspec;
  if (hasExperimentTag(setspec) && config?.overrides?.setspec) {
    const audioOverrides = { ...config.overrides.setspec };
    delete audioOverrides.audioInputEnabled;
    delete audioOverrides.audioPromptMode;
    delete audioOverrides.audioInputSensitivity;
    config = { ...config, overrides: { ...config.overrides, setspec: audioOverrides } };
  }
  return applyLearnerTdfConfig(content, config).tdf;
}

export function learnerConfigHasSetSpecAudioOverride(tdfId: string, key: 'audioPromptMode' | 'audioInputEnabled' | 'audioInputSensitivity'): boolean {
  return getLearnerTdfConfig(tdfId)?.overrides?.setspec?.[key] !== undefined;
}
