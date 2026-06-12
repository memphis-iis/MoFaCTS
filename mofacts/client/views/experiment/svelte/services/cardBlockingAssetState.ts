export type BlockingAssetSlot = 'active' | 'incoming';
export type BlockingAssetOwner = 'stimulus' | 'feedback';

export type BlockingAssetUpdate = {
  owner: BlockingAssetOwner;
  slot: BlockingAssetSlot;
  ready: boolean;
};

export function resolveBlockingAssetUpdate({
  detail,
  expectedFeedbackSrc,
  expectedStimulusSrc,
  slot,
}: {
  detail: {
    owner?: unknown;
    blocking?: unknown;
    ready?: unknown;
    src?: unknown;
  } | null | undefined;
  expectedFeedbackSrc: string;
  expectedStimulusSrc: string;
  slot: BlockingAssetSlot;
}): BlockingAssetUpdate | null {
  const owner = detail?.owner;
  const blocking = detail?.blocking === true;
  const ready = detail?.ready !== false;
  const src = String(detail?.src || '');

  if (owner === 'stimulus') {
    if (blocking && src !== expectedStimulusSrc) {
      return null;
    }
    if (!blocking && expectedStimulusSrc) {
      return null;
    }
    return {
      owner,
      ready,
      slot,
    };
  }

  if (owner === 'feedback') {
    if (blocking && src !== expectedFeedbackSrc) {
      return null;
    }
    if (!blocking && expectedFeedbackSrc) {
      return null;
    }
    return {
      owner,
      ready,
      slot,
    };
  }

  return null;
}

export function createCardBlockingAssetController({
  getExpectedFeedbackSrc,
  getExpectedStimulusSrc,
  setReady,
}: {
  getExpectedFeedbackSrc: (slot: BlockingAssetSlot) => string;
  getExpectedStimulusSrc: (slot: BlockingAssetSlot) => string;
  setReady: (update: BlockingAssetUpdate) => void;
}) {
  function handleBlockingAssetState(
    detail: Parameters<typeof resolveBlockingAssetUpdate>[0]['detail'],
    slot: BlockingAssetSlot = 'active',
  ): void {
    const update = resolveBlockingAssetUpdate({
      detail,
      expectedFeedbackSrc: getExpectedFeedbackSrc(slot),
      expectedStimulusSrc: getExpectedStimulusSrc(slot),
      slot,
    });

    if (update) {
      setReady(update);
    }
  }

  return {
    handleBlockingAssetState,
  };
}
