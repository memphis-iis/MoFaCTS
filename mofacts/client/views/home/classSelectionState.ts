export type TeacherOption = Readonly<{
  _id: string;
  displayIdentifier?: string;
}> & Record<string, unknown>;

export type SectionOption = Readonly<{
  sectionId: string;
  teacherUserId?: string;
  courseName?: string;
  sectionName?: string;
  visibility?: string;
}> & Record<string, unknown>;

export type ClassSelectionSnapshot = Readonly<{
  teachers: TeacherOption[];
  sections: SectionOption[];
}>;

export function normalizeClassSelectionSnapshot(
  teachers: unknown,
  sections: unknown,
  isSelectable: (section: SectionOption) => boolean,
): ClassSelectionSnapshot {
  if (!Array.isArray(teachers) || !Array.isArray(sections)) {
    throw new Error('Course enrollment options returned an invalid response.');
  }
  const normalizedTeachers = teachers.filter((teacher): teacher is TeacherOption => (
    Boolean(teacher)
    && typeof teacher === 'object'
    && typeof (teacher as { _id?: unknown })._id === 'string'
    && (teacher as { _id: string })._id.trim().length > 0
  ));
  const normalizedSections = sections.filter((section): section is SectionOption => (
    Boolean(section)
    && typeof section === 'object'
    && typeof (section as { sectionId?: unknown }).sectionId === 'string'
    && (section as { sectionId: string }).sectionId.trim().length > 0
  )).filter(isSelectable);
  return {
    teachers: normalizedTeachers,
    sections: normalizedSections,
  };
}

export function classSelectionSnapshotIsEmpty(snapshot: ClassSelectionSnapshot): boolean {
  return snapshot.teachers.length === 0 || snapshot.sections.length === 0;
}

export function sectionsForTeacher(
  snapshot: ClassSelectionSnapshot,
  teacherId: string,
): SectionOption[] {
  if (!teacherId) {
    return [];
  }
  return snapshot.sections.filter(
    (section) => String(section.teacherUserId || '') === teacherId,
  );
}

export function selectionForCurrentSection(
  snapshot: ClassSelectionSnapshot,
  sectionId: string,
): Readonly<{ teacherId: string; sectionId: string }> {
  const matching = snapshot.sections.find((section) => section.sectionId === sectionId);
  return {
    teacherId: String(matching?.teacherUserId || ''),
    sectionId: String(matching?.sectionId || ''),
  };
}
