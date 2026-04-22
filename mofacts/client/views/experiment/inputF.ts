import { DeliveryParamsStore } from '../../lib/state/deliveryParamsStore';
import { UiSettingsStore } from '../../lib/state/uiSettingsStore';
import './inputF.html';

type ForceCorrectTemplateInstance = {
  $(selector: string): { focus(): void };
};

declare const Template: {
  inputF: {
    helpers(map: Record<string, () => unknown>): void;
  };
  inputForceCorrect: {
    rendered: (this: ForceCorrectTemplateInstance) => void;
    helpers(map: Record<string, () => unknown>): void;
  };
};

Template.inputF.helpers({
  'UISettings': function() {
    return UiSettingsStore.get();
  }
});

Template.inputForceCorrect.rendered = function(this: ForceCorrectTemplateInstance) {
  this.$('input').focus();
};

Template.inputForceCorrect.helpers({
  'getFontSizeStyle': function() {
    const fontsize = DeliveryParamsStore.get() && Number(DeliveryParamsStore.get().fontsize);
    if (Number.isFinite(fontsize) && fontsize > 0) {
      return 'font-size: ' + fontsize + 'px;';
    }
    return 'font-size: 24px;';
  },
});

