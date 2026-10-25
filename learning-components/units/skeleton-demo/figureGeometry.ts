export type FigureId = 'cube' | 'pyramid';
export type FigureVector = readonly [number, number, number];
export interface FigureGeometry {
  readonly id: FigureId;
  readonly name: string;
  readonly vertices: Readonly<Record<string, FigureVector>>;
  readonly edges: readonly string[];
  readonly faces: readonly string[];
}
export const FIGURE_SIZE_LIMITS = Object.freeze({ min: 0.25, max: 4 });
const height = Math.SQRT1_2;
// Every vertex is expressed relative to the SOLID volume centroid. These are
// unit-edge solids, not images or meshes inferred from the concept mockups.
export const FIGURES: Readonly<Record<FigureId, FigureGeometry>> = {
  cube: {
    id: 'cube', name: 'Cube',
    vertices: { A: [-.5, -.5, -.5], B: [.5, -.5, -.5], C: [.5, -.5, .5], D: [-.5, -.5, .5],
      E: [-.5, .5, -.5], F: [.5, .5, -.5], G: [.5, .5, .5], H: [-.5, .5, .5] },
    edges: ['AB', 'BC', 'CD', 'DA', 'EF', 'FG', 'GH', 'HE', 'AE', 'BF', 'CG', 'DH'],
    faces: ['ABCD', 'EFGH', 'ABFE', 'DCGH', 'ADHE', 'BCGF'],
  },
  pyramid: {
    id: 'pyramid', name: 'Pyramid',
    vertices: { A: [-.5, -.5, -height / 4], B: [.5, -.5, -height / 4],
      C: [.5, .5, -height / 4], D: [-.5, .5, -height / 4], E: [0, 0, 3 * height / 4] },
    edges: ['AB', 'BC', 'CD', 'DA', 'AE', 'BE', 'CE', 'DE'],
    faces: ['ABCD', 'ABE', 'BCE', 'CDE', 'DAE'],
  },
};
