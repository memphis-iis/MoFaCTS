// Cbox shift-select plugin - credit to Andrew Ray https://gist.github.com/AndrewRayCode/3784055
export {};

declare global {
  interface JQuery {
    shiftSelectable: () => void;
  }
}

$.fn.shiftSelectable = function shiftSelectable(this: JQuery): void {
  let lastChecked: HTMLInputElement | null = null;
  const $boxes = this;

  $boxes.on('click', function onClick(this: HTMLElement, evt: JQuery.ClickEvent): void {
    const currentBox = this as HTMLInputElement;

    if (!lastChecked) {
      lastChecked = currentBox;
      return;
    }

    if (evt.shiftKey) {
      const start = $boxes.index(currentBox);
      const end = $boxes.index(lastChecked);

      $boxes
        .slice(Math.min(start, end), Math.max(start, end) + 1)
        .each(function applyCheckedState(this: HTMLElement): void {
          const box = this as HTMLInputElement;
          box.checked = lastChecked?.checked ?? false;
          $(box).trigger('change');
        });
    }

    lastChecked = currentBox;
  });
};

