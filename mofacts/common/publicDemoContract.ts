export const PUBLIC_DEMO_KINDS = ['student', 'teacher', 'researcher'] as const;
export const PUBLIC_DEMO_LIFETIME_MS = 24 * 60 * 60 * 1000;

export type PublicDemoKind = typeof PUBLIC_DEMO_KINDS[number];

// Reserved authoring markers. These identify protected content; they do not
// themselves grant anonymous launch access.
export function isPublicDemoTutor(tutor: unknown): boolean {
  const setspec = (tutor as { setspec?: { experimentTarget?: unknown; tags?: unknown } } | null)?.setspec;
  const target = typeof setspec?.experimentTarget === 'string'
    ? setspec.experimentTarget.trim().toLowerCase() : '';
  return target.startsWith('public-demo-') ||
    (Array.isArray(setspec?.tags) && setspec.tags.some(
      (tag) => typeof tag === 'string' && tag.trim().toLowerCase() === 'public-demo',
    ));
}

export type PublicDemoDefinition = {
  experimentTarget: string;
  launchPath: string;
};

export const PUBLIC_DEMO_DEFINITIONS: Record<PublicDemoKind, PublicDemoDefinition> = {
  student: {
    experimentTarget: 'public-demo-student-maps',
    launchPath: '/experiment/public-demo-student-maps',
  },
  teacher: {
    experimentTarget: 'public-demo-teacher-autotutor',
    launchPath: '/experiment/public-demo-teacher-autotutor',
  },
  researcher: {
    experimentTarget: 'public-demo-researcher-2x2',
    launchPath: '/experiment/public-demo-researcher-2x2',
  },
};

export function isPublicDemoKind(value: unknown): value is PublicDemoKind {
  return typeof value === 'string' && PUBLIC_DEMO_KINDS.includes(value as PublicDemoKind);
}

export function parsePublicDemoRequest(value: unknown): PublicDemoKind | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || !isPublicDemoKind(record.kind)) return null;
  return record.kind;
}

export function publicDemoExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + PUBLIC_DEMO_LIFETIME_MS);
}
