// Run with mongosh against the application database. Defaults to a read-only dry run.
// Apply only after reviewing the dry run: MOFACTS_APPLY_TEACHER_DEMO_REPAIR=1.
// Rollback: MOFACTS_ROLLBACK_TEACHER_DEMO_REPAIR=1 and MOFACTS_TEACHER_DEMO_REVISION=<current revision>.
// Only the launcher target and optimistic revision change. Learner data, stimulus content,
// installed TDF identity and the canonical package's separate identity are not replaced.
async function repairTeacherDemoTarget(tdfs, options = {}) {
  const id = 'tdf_90326bcac960053c76deac45';
  const target = 'public-demo-teacher-autotutor';
  const field = 'content.tdfs.tutor.setspec.experimentTarget';
  const row = await tdfs.findOne({ _id: id }, { projection: { _id: 1, tdfRevision: 1, tdfFileName: 1,
    'content.tdfs.tutor.setspec': 1, 'content.tdfs.tutor.unit.sparcsession': 1 } });
  if (!row || row.tdfFileName !== 'AutoTutor_Natural_Selection_TDF.json'
    || !(row.content?.tdfs?.tutor?.unit || []).some(unit => unit.sparcsession)) throw new Error('Expected installed teacher lesson not found; no change made');
  const revision = row.tdfRevision;
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Teacher lesson requires a valid revision');
  const old = row.content.tdfs.tutor.setspec.experimentTarget;
  const conflict = await tdfs.findOne({ [field]: target, _id: { $ne: id } }, { projection: { _id: 1 } });
  if (conflict) throw new Error('Another installed lesson already owns the teacher demo target; no change made');
  if (!options.rollback && old === target) return { status: 'already-correct', tdfId: id, revision };
  if (options.rollback ? old !== target : old !== undefined) throw new Error('Unexpected teacher target; no change made');
  if (options.rollback && options.expectedRevision !== revision) throw new Error('Rollback revision does not match; no change made');
  const plan = { status: 'dry-run', tdfId: id, revision, fromTarget: old ?? null, toTarget: options.rollback ? null : target };
  if (!options.apply) return plan;
  const selector = { _id: id, tdfRevision: revision, [field]: options.rollback ? target : { $exists: false } };
  const mutation = options.rollback ? { $unset: { [field]: '' }, $inc: { tdfRevision: 1 } }
    : { $set: { [field]: target }, $inc: { tdfRevision: 1 } };
  const result = await tdfs.updateOne(selector, mutation);
  if (result.matchedCount !== 1 || result.modifiedCount !== 1) throw new Error('Teacher lesson changed concurrently; no repair recorded');
  const verified = await tdfs.findOne({ _id: id }, { projection: { tdfRevision: 1, [field]: 1 } });
  if (verified?.tdfRevision !== revision + 1 || (verified?.content?.tdfs?.tutor?.setspec?.experimentTarget ?? null) !== plan.toTarget) throw new Error('Teacher repair readback failed; inspect current metadata before any retry');
  return { ...plan, status: options.rollback ? 'rolled-back' : 'repaired', revision: revision + 1 };
}
if (typeof module !== 'undefined') module.exports = { repairTeacherDemoTarget };
if (typeof db !== 'undefined') {
  if (db.getName() !== 'MoFACT-meteor3') throw new Error('Unexpected application database; no change made');
  const rollback = process.env.MOFACTS_ROLLBACK_TEACHER_DEMO_REPAIR === '1';
  repairTeacherDemoTarget(db.tdfs, { apply: process.env.MOFACTS_APPLY_TEACHER_DEMO_REPAIR === '1', rollback,
    expectedRevision: Number(process.env.MOFACTS_TEACHER_DEMO_REVISION) }).then(result => print(JSON.stringify(result)));
}
