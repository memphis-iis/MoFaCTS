import { sparcFigureCosineSimilarity, sparcFigureMinimumSimilarity } from '../../common/lib/sparcFigureLibrary';
import { parseSparcVideoSegment, type SparcVideoSegment } from '../../../learning-components/runtime/sparcVideo';

export type SparcVideoMatch = { video: SparcVideoSegment; similarity: number };
export type SparcVideoCandidate = { _id: string; embedding: number[]; content: { video: SparcVideoSegment } };

/** A successful search returns one eligible passage or a miss; storage/validation errors propagate. */
export async function selectSparcLibraryVideo(params: {
  vector: number[]; language: string; minimumSimilarity: number;
  page(after: string): Promise<SparcVideoCandidate[]>;
}): Promise<SparcVideoMatch | undefined> {
  const minimumSimilarity = sparcFigureMinimumSimilarity(params.minimumSimilarity);
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(params.language)) throw new Error('Video retrieval requires the package content language');
  let best: SparcVideoMatch | undefined;
  let after = '';
  for (;;) {
    const rows = await params.page(after);
    for (const row of rows) {
      const video = parseSparcVideoSegment(row.content.video);
      if (row._id <= after || row._id !== video.segmentId || video.language !== params.language) throw new Error('Video library returned an invalid candidate page');
      const similarity = sparcFigureCosineSimilarity(params.vector, row.embedding);
      if (similarity >= minimumSimilarity && (!best || similarity > best.similarity
        || (similarity === best.similarity && video.segmentId < best.video.segmentId))) best = { video, similarity };
    }
    if (rows.length < 100) return best;
    after = rows.at(-1)!._id;
  }
}
