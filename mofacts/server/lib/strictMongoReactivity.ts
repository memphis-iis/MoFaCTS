type ReactivityDriverSelection = {
  driverClass?: unknown;
  matcher?: unknown;
  sorter?: unknown;
};

type ReactivityDriverSelector = (
  configuredOrder: string[],
  driverChecks: Record<string, unknown>,
) => Promise<ReactivityDriverSelection>;

type MongoObserverHandle = {
  stop(): void;
};

type MongoObserveChanges = (
  cursorDescription: { collectionName?: unknown },
  ...args: unknown[]
) => Promise<MongoObserverHandle>;

type MongoConnectionPrototype = {
  _selectReactivityDriver?: ReactivityDriverSelector;
  _observeChanges?: MongoObserveChanges;
};

const strictDriverSelectorMarker = '__mofactsStrictChangeStreamsDriverSelector';
type MarkedReactivityDriverSelector = ReactivityDriverSelector & {
  __mofactsStrictChangeStreamsDriverSelector?: boolean;
};

type MarkedMongoObserveChanges = MongoObserveChanges & {
  __mofactsStrictChangeStreamsObserverMetrics?: boolean;
};

const observerMetrics = {
  activeByCollection: new Map<string, number>(),
  startedByCollection: new Map<string, number>(),
  stoppedByCollection: new Map<string, number>(),
  rejectedStarts: 0,
};

function observerCollectionName(cursorDescription: { collectionName?: unknown }) {
  const collectionName = cursorDescription.collectionName;
  return typeof collectionName === 'string' && collectionName ? collectionName : '<anonymous>';
}

function incrementMetric(metric: Map<string, number>, collectionName: string) {
  metric.set(collectionName, (metric.get(collectionName) || 0) + 1);
}

function decrementActiveMetric(collectionName: string) {
  const next = Math.max(0, (observerMetrics.activeByCollection.get(collectionName) || 0) - 1);
  observerMetrics.activeByCollection.set(collectionName, next);
}

export function getStrictMongoReactivityMetrics() {
  const active = [...observerMetrics.activeByCollection.values()].reduce((sum, value) => sum + value, 0);
  return {
    active,
    rejectedStarts: observerMetrics.rejectedStarts,
    collections: [...observerMetrics.startedByCollection.keys()]
      .sort()
      .map((collection) => ({
        collection,
        active: observerMetrics.activeByCollection.get(collection) || 0,
        started: observerMetrics.startedByCollection.get(collection) || 0,
        stopped: observerMetrics.stoppedByCollection.get(collection) || 0,
      })),
  };
}

function assertChangeStreamsOnlyOrder(configuredOrder: string[]) {
  if (configuredOrder.length !== 1 || configuredOrder[0] !== 'changeStreams') {
    throw new Error(
      'MoFaCTS requires METEOR_REACTIVITY_ORDER=changeStreams; alternate Mongo reactivity drivers are not permitted',
    );
  }
}

/**
 * Makes Meteor's internal observer selection fail closed. Meteor 3.5 normally
 * creates a PollingObserveDriver if no configured driver can serve a cursor;
 * this wrapper throws before that fallback point.
 */
export function installStrictMongoReactivityOnConnection(
  connectionPrototype: MongoConnectionPrototype,
) {
  const currentSelector = connectionPrototype._selectReactivityDriver;
  if (!currentSelector) {
    throw new Error('Meteor MongoConnection._selectReactivityDriver is unavailable');
  }

  if (!(currentSelector as MarkedReactivityDriverSelector)[strictDriverSelectorMarker]) {
    const strictSelector: ReactivityDriverSelector = async function(
      this: unknown,
      configuredOrder,
      driverChecks,
    ) {
      assertChangeStreamsOnlyOrder(configuredOrder);
      const selection = await currentSelector.call(this, configuredOrder, driverChecks);
      if (!selection.driverClass) {
        throw new Error(
          'No Change Streams observer driver is available for this reactive cursor; polling fallback is prohibited',
        );
      }
      return selection;
    };
    (strictSelector as MarkedReactivityDriverSelector)[strictDriverSelectorMarker] = true;
    connectionPrototype._selectReactivityDriver = strictSelector;
  }

  const currentObserveChanges = connectionPrototype._observeChanges;
  if (!currentObserveChanges) {
    throw new Error('Meteor MongoConnection._observeChanges is unavailable');
  }
  if ((currentObserveChanges as MarkedMongoObserveChanges).__mofactsStrictChangeStreamsObserverMetrics) {
    return;
  }

  const measuredObserveChanges: MongoObserveChanges = async function(
    this: unknown,
    cursorDescription,
    ...args
  ) {
    const collectionName = observerCollectionName(cursorDescription);
    try {
      const handle = await currentObserveChanges.call(this, cursorDescription, ...args);
      incrementMetric(observerMetrics.activeByCollection, collectionName);
      incrementMetric(observerMetrics.startedByCollection, collectionName);
      const originalStop = handle.stop.bind(handle);
      let stopped = false;
      handle.stop = () => {
        if (!stopped) {
          stopped = true;
          decrementActiveMetric(collectionName);
          incrementMetric(observerMetrics.stoppedByCollection, collectionName);
        }
        originalStop();
      };
      return handle;
    } catch (error) {
      observerMetrics.rejectedStarts += 1;
      throw error;
    }
  };
  (measuredObserveChanges as MarkedMongoObserveChanges).__mofactsStrictChangeStreamsObserverMetrics = true;
  connectionPrototype._observeChanges = measuredObserveChanges;
}

export function installStrictMongoReactivity(
  env: NodeJS.ProcessEnv = process.env,
  mongoInternals: { Connection?: { prototype: MongoConnectionPrototype } } | undefined = (
    globalThis as typeof globalThis & {
      MongoInternals?: { Connection?: { prototype: MongoConnectionPrototype } };
    }
  ).MongoInternals,
) {
  if (env.METEOR_REACTIVITY_ORDER !== 'changeStreams') {
    throw new Error('MoFaCTS requires METEOR_REACTIVITY_ORDER=changeStreams');
  }
  if (!mongoInternals?.Connection?.prototype) {
    throw new Error('Meteor MongoInternals.Connection is unavailable');
  }
  installStrictMongoReactivityOnConnection(mongoInternals.Connection.prototype);
}
