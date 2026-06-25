import { MongoClient } from 'mongodb';

type TdfSummary = {
  id: string;
  fileName?: string;
  title?: string;
  stimuliSetId?: string | number;
};

type HistoryAuditGroup = {
  _id: {
    TDFId?: string;
    courseId?: string;
    clusterKC?: string | number;
    hasCourseAssignment?: boolean;
    clusterKind?: string;
  };
  count: number;
  distinctStimulusKCs?: Array<string | number>;
};

function parseArgs(argv: string[]) {
  const names: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--tdf') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('--tdf requires a value');
      }
      names.push(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { names };
}

function regexForLiteral(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function summarizeTdf(doc: any): TdfSummary {
  return {
    id: String(doc._id),
    fileName: doc.content?.fileName,
    title: doc.content?.tdfs?.tutor?.setspec?.lessonname ?? doc.content?.tdfs?.tutor?.title,
    stimuliSetId: doc.stimuliSetId,
  };
}

async function findTdfs(db: any, names: string[]): Promise<TdfSummary[]> {
  const clauses = names.flatMap((name) => {
    const pattern = regexForLiteral(name);
    return [
      { 'content.fileName': pattern },
      { 'content.tdfs.tutor.setspec.lessonname': pattern },
      { 'content.tdfs.tutor.title': pattern },
    ];
  });
  const selector = clauses.length > 0 ? { $or: clauses } : {};
  const docs = await db.collection('tdfs').find(selector, {
    projection: {
      _id: 1,
      stimuliSetId: 1,
      'content.fileName': 1,
      'content.tdfs.tutor.setspec.lessonname': 1,
      'content.tdfs.tutor.title': 1,
    },
    sort: { 'content.fileName': 1 },
  }).toArray();
  return docs.map(summarizeTdf);
}

function clusterKind(clusterKC: unknown): string {
  if (clusterKC === undefined || clusterKC === null || clusterKC === '') {
    return 'missing';
  }
  if (typeof clusterKC === 'number') {
    return 'numeric';
  }
  const text = String(clusterKC).trim();
  if (!text) {
    return 'missing';
  }
  return /^\d+$/.test(text) ? 'numeric-string' : 'semantic';
}

async function auditHistoryForTdfs(db: any, tdfIds: string[]) {
  if (tdfIds.length === 0) {
    return [];
  }
  return await db.collection('history').aggregate<HistoryAuditGroup>([
    {
      $match: {
        TDFId: { $in: tdfIds },
        levelUnitType: 'model',
      },
    },
    {
      $group: {
        _id: {
          TDFId: '$TDFId',
          courseId: '$courseAssignment.courseId',
          hasCourseAssignment: { $ne: [{ $type: '$courseAssignment' }, 'missing'] },
          clusterKC: '$clusterKC',
        },
        count: { $sum: 1 },
        distinctStimulusKCs: { $addToSet: '$stimulusKC' },
      },
    },
    { $sort: { '_id.TDFId': 1, '_id.courseId': 1, '_id.clusterKC': 1 } },
  ]).toArray();
}

async function auditCourseSharedClusters(db: any, tdfIds: string[]) {
  if (tdfIds.length === 0) {
    return [];
  }
  return await db.collection('history').aggregate<HistoryAuditGroup>([
    {
      $match: {
        TDFId: { $in: tdfIds },
        levelUnitType: 'model',
        'courseAssignment.courseId': { $exists: true },
      },
    },
    {
      $group: {
        _id: {
          courseId: '$courseAssignment.courseId',
          clusterKC: '$clusterKC',
        },
        count: { $sum: 1 },
        distinctTdfIds: { $addToSet: '$TDFId' },
        distinctStimulusKCs: { $addToSet: '$stimulusKC' },
      },
    },
    { $sort: { '_id.courseId': 1, '_id.clusterKC': 1 } },
  ]).toArray();
}

function printSection(title: string, value: unknown) {
  console.log(`\n${title}`);
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) {
    throw new Error('MONGO_URL is required');
  }
  const { names } = parseArgs(process.argv.slice(2));
  const client = new MongoClient(mongoUrl);
  await client.connect();
  try {
    const db = client.db();
    const tdfs = await findTdfs(db, names);
    const tdfIds = tdfs.map((tdf) => tdf.id);
    const historyGroups = await auditHistoryForTdfs(db, tdfIds);
    const courseSharedClusters = await auditCourseSharedClusters(db, tdfIds);
    const blockers = historyGroups
      .map((group) => ({
        ...group,
        clusterKind: clusterKind(group._id.clusterKC),
      }))
      .filter((group) =>
        group.clusterKind !== 'semantic'
        || !group._id.hasCourseAssignment
      );

    printSection('TDFs', tdfs);
    printSection('Model History Groups', historyGroups);
    printSection('Course Shared Cluster Groups', courseSharedClusters);
    printSection('Potential Shared Hydration Blockers', blockers);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
