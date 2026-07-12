import { expect } from 'chai';
import {
  canActivateContentInput,
  createContentLaunchCoordinator,
  resolveContentLaunchSurfaceKind,
  resolveContentSurfaceKind,
} from './contentLaunchCoordinator';

const identity = {
  userId: 'user-a',
  rootTdfId: 'root-a',
  activeTdfId: 'tdf-a',
  unitIndex: 2,
  attemptId: 'attempt-a',
};

describe('content launch coordinator', function() {
  it('does not activate learner input before the initial render is visible', function() {
    expect(canActivateContentInput('committing-first-render', true)).to.equal(false);
    expect(canActivateContentInput('active', false)).to.equal(false);
    expect(canActivateContentInput('active', true)).to.equal(true);
  });

  it('keeps assessment behavior explicit within the flashcard rendering surface', function() {
    expect(resolveContentSurfaceKind('flashcard', { assessmentsession: {} })).to.equal('assessment');
    expect(resolveContentSurfaceKind('flashcard', {})).to.equal('flashcard');
    expect(resolveContentSurfaceKind('sparc', { assessmentsession: {} })).to.equal('sparc');
  });

  it('classifies launch surfaces from the freshly resolved runtime unit', function() {
    expect(resolveContentLaunchSurfaceKind({ currentTdfUnit: { assessmentsession: {} } })).to.equal('assessment');
    expect(resolveContentLaunchSurfaceKind({ currentTdfUnit: { videosession: {} } })).to.equal('video');
    expect(resolveContentLaunchSurfaceKind({ currentTdfUnit: { sparcsession: {} } })).to.equal('sparc');
    expect(resolveContentLaunchSurfaceKind({ currentTdfUnit: { autotutorsession: {} } })).to.equal('autotutor');
    expect(resolveContentLaunchSurfaceKind({ currentTdfUnit: { learningsession: {} } })).to.equal('flashcard');
  });

  it('owns the ordered path from content resolution through visible active content', function() {
    const coordinator = createContentLaunchCoordinator();
    const phases: string[] = [];
    coordinator.subscribe((snapshot) => phases.push(snapshot.phase));

    coordinator.begin();
    coordinator.markProgressRestoring('flashcard', identity);
    coordinator.markEngineInitializing();
    coordinator.markFirstTrialPreparing();
    coordinator.markFirstRenderCommitting();
    coordinator.markInitialRenderVisible();

    expect(phases).to.deep.equal([
      'idle',
      'resolving-content',
      'restoring-progress',
      'initializing-engine',
      'preparing-first-trial',
      'committing-first-render',
      'active',
    ]);
    expect(coordinator.getSnapshot()).to.deep.include({
      phase: 'active',
      surface: 'flashcard',
      identity,
      failure: null,
    });
  });

  it('rejects activation before an initial render is committed', function() {
    const coordinator = createContentLaunchCoordinator();
    coordinator.begin();
    coordinator.markProgressRestoring('assessment', identity);

    expect(() => coordinator.markInitialRenderVisible())
      .to.throw('Invalid phase transition restoring-progress -> active');
  });

  it('requires canonical identity before progress restoration', function() {
    const coordinator = createContentLaunchCoordinator();
    coordinator.begin();

    expect(() => coordinator.markProgressRestoring('sparc', { ...identity, activeTdfId: '' }))
      .to.throw('[Content Launch] activeTdfId is required');
  });

  it('records launch failure without allowing active content to regress', function() {
    const coordinator = createContentLaunchCoordinator();
    coordinator.begin();
    coordinator.fail(new Error('video failed'));
    expect(coordinator.getSnapshot().phase).to.equal('failed');

    coordinator.begin();
    coordinator.markProgressRestoring('video', identity);
    coordinator.markEngineInitializing();
    coordinator.markFirstTrialPreparing();
    coordinator.markFirstRenderCommitting();
    coordinator.markInitialRenderVisible();
    expect(() => coordinator.fail(new Error('late failure')))
      .to.throw('Active content cannot transition back to launch failure');
  });
});
