const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createVideoParticipantControls } = require('../client/views/experiment/svelte/services/videoParticipantControls.ts');
const { createVideoSessionRuntimeController } = require('../client/views/experiment/svelte/services/videoSessionRuntime.ts');

function harness(policy = {}) {
  let position = 0;
  let requestedTime = null;
  let gate = false;
  let blocked = 0;
  let rejected = 0;
  let plays = 0;
  let rejectPlay = false;
  let controls;
  const player = {
    get currentTime() { return position; },
    set currentTime(value) { requestedTime = value; },
    duration: 100,
    paused: true,
    ended: false,
    play() {
      plays++;
      if (rejectPlay) return Promise.reject(new Error('Playback denied'));
      player.paused = false;
      controls.handlePlay();
      return Promise.resolve();
    },
    pause() { player.paused = true; controls.handlePause(); },
  };
  controls = createVideoParticipantControls({
    getPlayer: () => player,
    getPolicy: () => ({ preventPause: false, preventRewind: false, preventScrubbing: false, ...policy }),
    isPlayBlocked: () => gate,
    onSeekBlocked: () => { blocked++; },
    onPlayRejected: () => { rejected++; },
  });
  return {
    controls, player,
    setGate(value) { gate = value; },
    rejectPlay(value) { rejectPlay = value; },
    advance(time) { position = time; return controls.checkPosition('timeupdate'); },
    observeProvider(time) { position = time; return controls.checkPosition('provider-observation'); },
    seek(time) { position = time; return controls.checkPosition('seeking'); },
    finishSeek(time = requestedTime) { position = time; return controls.checkPosition('seeked'); },
    get requestedTime() { return requestedTime; },
    get blocked() { return blocked; },
    get rejected() { return rejected; },
    get plays() { return plays; },
  };
}

for (const preventPause of [false, true]) {
  for (const preventRewind of [false, true]) {
    for (const preventScrubbing of [false, true]) {
      test(`independent restrictions ${JSON.stringify({preventPause, preventRewind, preventScrubbing})}`, async () => {
        const h = harness({ preventPause, preventRewind, preventScrubbing });
        await h.controls.playSystem();
        for (let time = 0.5; time <= 10; time += 0.5) h.advance(time);
        h.player.pause();
        assert.equal(h.plays, preventPause ? 2 : 1);
        assert.equal(h.seek(5), preventRewind);
        if (preventRewind) {
          assert.equal(h.requestedTime, 10);
          h.finishSeek();
        } else h.finishSeek(5);
        assert.equal(h.seek(30), preventScrubbing);
        if (preventScrubbing) assert.equal(h.requestedTime, 10);
      });
    }
  }
}

test('omitted settings preserve ordinary pause and seek behavior', async () => {
  const h = harness();
  await h.controls.playSystem();
  h.advance(50);
  h.player.pause();
  assert.equal(h.plays, 1);
  assert.equal(h.seek(1), false);
  assert.equal(h.seek(99), false);
});

test('instruction and checkpoint gates block participant playback and preserve system pauses', async () => {
  const h = harness({ preventPause: true });
  h.setGate(true);
  h.controls.pauseSystem();
  await assert.rejects(h.controls.playSystem(), /blocked by instructions/);
  assert.equal(h.plays, 0);
  assert.equal(h.controls.canParticipantPlay(), false);
  h.setGate(false);
  await h.controls.playSystem();
  assert.equal(h.plays, 1);
  h.setGate(true);
  h.controls.pauseSystem();
  assert.equal(h.plays, 1);
  h.player.paused = false;
  assert.equal(h.controls.handlePlay(), false);
  assert.equal(h.player.paused, true);
  h.setGate(false);
  assert.equal(h.controls.canParticipantPlay(), false, 'external system pause remains until explicit resume');
  await h.controls.playSystem();
  assert.equal(h.player.paused, false);
});

test('blocked automatic resume is attempted once and leaves explicit Play available', async () => {
  const h = harness({ preventPause: true });
  await h.controls.playSystem();
  h.rejectPlay(true);
  h.player.pause();
  h.controls.handlePause();
  await new Promise(resolve => setImmediate(resolve));
  h.controls.handlePause();
  assert.equal(h.plays, 2);
  assert.equal(h.rejected, 1);
  assert.equal(h.controls.canParticipantPlay(), true);
  h.rejectPlay(false);
  await h.controls.playSystem();
  assert.equal(h.player.paused, false);
});

test('play/pause oscillation does not cause an automatic resume loop', async () => {
  const h = harness({ preventPause: true });
  await h.controls.playSystem();
  h.player.pause();
  h.player.pause();
  assert.equal(h.plays, 2);
  h.player.paused = false;
  h.advance(0.5);
  h.player.pause();
  assert.equal(h.plays, 3, 'advancing playback re-arms protection');
});

test('end-of-video pause and teardown never restart playback', async () => {
  const h = harness({ preventPause: true });
  await h.controls.playSystem();
  h.advance(100);
  h.player.pause();
  assert.equal(h.plays, 1);
  h.controls.handleEnded();
  h.controls.dispose();
  h.controls.handlePause();
  await h.controls.playSystem();
  assert.equal(h.plays, 1);
});

test('authorized asynchronous seek survives intervening time updates and resets rewind reference', async () => {
  const h = harness({ preventRewind: true, preventScrubbing: true });
  await h.controls.playSystem();
  h.controls.seekSystem(60);
  assert.equal(h.controls.hasPendingSeek(), true);
  assert.equal(h.advance(0), true, 'old-position update must not consume authorization');
  assert.equal(h.seek(60), true);
  h.finishSeek(60);
  assert.equal(h.controls.hasPendingSeek(), false);
  h.controls.pauseSystem();
  h.controls.seekSystem(20.1); // configured rewindOnIncorrect
  assert.equal(h.advance(60), true);
  h.seek(20.1);
  h.finishSeek(20.1);
  assert.equal(h.controls.getAcceptedTime(), 20.1);
  await h.controls.playSystem();
  assert.equal(h.advance(20.6), false);
  assert.equal(h.blocked, 0);
  assert.equal(h.seek(10), true);
  assert.equal(h.requestedTime, 20.6);
});

test('authorization for one destination does not authorize another participant seek', () => {
  const h = harness({ preventRewind: true });
  h.advance(40);
  h.controls.seekSystem(20);
  h.seek(2);
  assert.equal(h.requestedTime, 20);
  assert.equal(h.blocked, 1);
  h.finishSeek(20);
  assert.equal(h.controls.hasPendingSeek(), false);
});

test('YouTube seeking emitted at the old position does not recurse or cancel authorization', () => {
  const h = harness({ preventRewind: true, preventScrubbing: true });
  h.controls.seekSystem(30);
  h.seek(0); // YouTube emits seeking before seekTo changes its reported position.
  assert.equal(h.blocked, 0);
  assert.equal(h.controls.hasPendingSeek(), true);
  h.finishSeek(30);
  h.controls.seekSystem(10);
  h.seek(30);
  assert.equal(h.blocked, 0);
  h.finishSeek(10);
  assert.equal(h.controls.getAcceptedTime(), 10);
});

test('paused YouTube position observation enforces seeks without a provider seeked event', () => {
  const h = harness({ preventRewind: true, preventScrubbing: true });
  h.controls.seekSystem(30);
  h.seek(0);
  assert.equal(h.observeProvider(30), false);
  assert.equal(h.controls.hasPendingSeek(), false);
  h.seek(30); // Provider announces seeking before its position changes.
  assert.equal(h.observeProvider(2), true);
  assert.equal(h.requestedTime, 30);
  h.observeProvider(30);
  assert.equal(h.controls.hasPendingSeek(), false);
  h.controls.seekSystem(10);
  h.observeProvider(10);
  assert.equal(h.controls.getAcceptedTime(), 10);
});

test('no-op restoration needs no seeked event and rounding cannot ratchet backward', () => {
  const h = harness({ preventRewind: true });
  h.controls.seekSystem(0);
  assert.equal(h.controls.hasPendingSeek(), false);
  h.advance(20);
  assert.equal(h.seek(19.95), false);
  h.finishSeek(19.95);
  assert.equal(h.seek(19.8), true);
  assert.equal(h.requestedTime, 20);
});

test('new unit with the same media starts with fresh position and policy', async () => {
  const first = harness({ preventPause: true, preventRewind: true });
  await first.controls.playSystem();
  first.advance(80);
  first.controls.dispose();
  const second = harness(); // route unit transition remounts ContentSurface
  await second.controls.playSystem();
  assert.equal(second.controls.getAcceptedTime(), 0);
  assert.equal(second.advance(1), false);
  second.player.pause();
  assert.equal(second.plays, 1);
});

test('instruction Continue releases the gate before play and restores it if the browser rejects', async () => {
  for (const rejected of [false, true]) {
    const h = harness({ preventPause: true });
    h.setGate(true);
    h.controls.pauseSystem();
    h.rejectPlay(rejected);
    let dismissed = false;
    let persisted = 0;
    const runtime = createVideoSessionRuntimeController({
      getCurrentUnitNumber: () => 0,
      getVideoInstructionsShownAt: () => 1,
      getVideoPlayer: () => ({play: () => h.controls.playSystem()}),
      log() {}, now: () => 1,
      persistInstructionState: async () => { persisted++; },
      prepareReadyPlayer() {}, recordInstructionContinue: async () => {},
      setSessionValue() {},
      setVideoInstructionDismissed(value) { dismissed = value; h.setGate(!value); },
      setVideoInstructionStartBlocked() {}, setVideoPlayerReady() {}, flushPendingResume() {},
    });
    runtime.handleInstructionContinue();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.plays, 1);
    assert.equal(dismissed, !rejected);
    assert.equal(persisted, rejected ? 0 : 1);
  }
});
