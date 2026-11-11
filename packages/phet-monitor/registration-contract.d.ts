/** Shared framework-to-collector contract, compiled into every adapted build. */
declare global {
  type PhETResearchRegistration = {
    version: 1;
    source?: object;
    tandem?: string;
  } & (
    { kind: 'property'; read: () => unknown } |
    { kind: 'emitter' } |
    { kind: 'collection'; members: unknown[]; children?: () => Record<string, object> }
  );

  interface Window {
    phetResearchMonitor: {
      beginModel(): void;
      model(model: object): void;
      register(object: object, descriptor: PhETResearchRegistration): void;
      excludeType(constructor: Function): void;
      collectionChanged(object: object, members?: object): void;
      emit(source: object, args: unknown[]): void;
      dispose(object: object): void;
      frame(): void;
    };
  }
}
export {};
