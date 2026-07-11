import { Session } from 'meteor/session';
import { legacyTrim } from '../../common/underscoreCompat';
import { clientConsole } from './userSessionHelpers';
import { resolveCurrentDeliverySettings } from './deliverySettingsResolver';
import { deliverySettingsStore } from './state/deliverySettingsStore';

export function getTestType(): string {
  return legacyTrim(Session.get('testType')).toLowerCase();
}

export function getCurrentDeliverySettings(): Record<string, unknown> {
  let currentUnit = Session.get('currentTdfUnit');
  const currentTdfFile = Session.get('currentTdfFile');
  const currentUnitNumber = Number(Session.get('currentUnitNumber') || 0);
  const tutor = currentTdfFile?.tdfs?.tutor;
  if (!currentUnit && Array.isArray(tutor?.unit)) {
    const restoredUnit = tutor.unit[currentUnitNumber];
    if (restoredUnit) {
      currentUnit = restoredUnit;
      Session.set('currentTdfUnit', restoredUnit);
      clientConsole(1, '[DeliverySettings] currentTdfUnit missing; restored from currentTdfFile/currentUnitNumber', {
        currentUnitNumber,
        unitname: restoredUnit.unitname,
      });
    }
  }
  const resolved = resolveCurrentDeliverySettings({
    tdfFile: currentTdfFile,
    tutor,
    unit: currentUnit,
    unitIndex: currentUnitNumber,
    experimentXCond: Session.get('experimentXCond'),
    unitType: Session.get('unitType'),
  });
  clientConsole(2, 'getCurrentDeliverySettings:', currentUnit ? 'unit found' : 'no unit', resolved.settings.scoringEnabled);
  return resolved.settings;
}

export function refreshCurrentDeliverySettingsStore(): Record<string, unknown> {
  const settings = getCurrentDeliverySettings();
  deliverySettingsStore.set(settings);
  return settings;
}
