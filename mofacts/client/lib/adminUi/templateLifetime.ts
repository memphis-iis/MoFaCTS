export type TemplateGeneration = number;

export type TemplateLifetime = Readonly<{
  begin: () => TemplateGeneration;
  isCurrent: (generation: TemplateGeneration) => boolean;
  supersede: () => void;
  destroy: () => void;
  isDestroyed: () => boolean;
}>;

export function createTemplateLifetime(): TemplateLifetime {
  let generation = 0;
  let destroyed = false;

  return {
    begin(): TemplateGeneration {
      if (destroyed) {
        throw new Error('Cannot begin work for a destroyed template lifetime.');
      }
      generation += 1;
      return generation;
    },
    isCurrent(candidate: TemplateGeneration): boolean {
      return !destroyed && candidate === generation;
    },
    supersede(): void {
      if (!destroyed) {
        generation += 1;
      }
    },
    destroy(): void {
      destroyed = true;
      generation += 1;
    },
    isDestroyed(): boolean {
      return destroyed;
    },
  };
}

