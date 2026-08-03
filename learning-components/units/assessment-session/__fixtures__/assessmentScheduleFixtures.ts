export type AssessmentFixture = {
  readonly conditiontemplatesbygroup: Record<string, unknown>;
  readonly clusterlist?: string;
};

export const oneGroupOneTemplateOneClusterRepeat: AssessmentFixture = {
  conditiontemplatesbygroup: {
    groupnames: 'A',
    clustersrepeated: '2',
    templatesrepeated: '1',
    initialpositions: 'A_1',
    group: '0,t,d,0 1,b,h,1',
  },
  clusterlist: '0-1',
};

export const multipleGroupsMatchingTemplateAndClusterRepeats: AssessmentFixture = {
  conditiontemplatesbygroup: {
    groupnames: 'A B',
    clustersrepeated: '1 2',
    templatesrepeated: '2 1',
    initialpositions: 'A_1 A_2 B_1',
    group: [
      '0,t,d,0 0,b,h,0',
      '0,t,s,0 1,t,d,1',
    ],
  },
  clusterlist: '0-2',
};

export const malformedGroupTemplateCountMismatch: AssessmentFixture = {
  conditiontemplatesbygroup: {
    groupnames: 'A B',
    clustersrepeated: '1 1',
    templatesrepeated: '1 1',
    initialpositions: 'A_1 B_1',
    group: ['0,t,d,0'],
  },
};

export const malformedGroupClusterRepeatMismatch: AssessmentFixture = {
  conditiontemplatesbygroup: {
    groupnames: 'A B',
    clustersrepeated: '1',
    templatesrepeated: '1 1',
    initialpositions: 'A_1 B_1',
    group: [
      '0,t,d,0',
      '0,t,d,0',
    ],
  },
};

export const exhaustedClusterList: AssessmentFixture = {
  conditiontemplatesbygroup: {
    groupnames: 'A',
    clustersrepeated: '1',
    templatesrepeated: '2',
    initialpositions: 'A_1 A_2',
    group: '0,t,d,0 0,t,d,0',
  },
  clusterlist: '0-0',
};
