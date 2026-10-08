import { expect } from 'chai';
import { createVoicePreview } from './voicePreview';

describe('documentation voice previews', () => {
  function setup() {
    const failures: unknown[] = [];
    const samples: Array<{ url: string; paused: boolean; currentTime: number; onerror: HTMLAudioElement['onerror']; reject: (error: Error) => void }> = [];
    const preview = createVoicePreview(error => failures.push(error), url => {
      let reject!: (error: Error) => void;
      const promise = new Promise<void>((_resolve, rejected) => { reject = rejected; });
      const sample = { url, paused: false, currentTime: 5, onerror: null, reject };
      samples.push(sample);
      return Object.assign(sample, { play: () => promise, pause: () => { sample.paused = true; } });
    });
    return { preview, samples, failures };
  }
  it('uses only the ten offered direct sample URLs and stops the previous sample', () => {
    const { preview, samples, failures } = setup();
    for (const letter of 'ABCDEFGHIJ') preview.play(`en-US-Standard-${letter}`);
    expect(samples).to.have.length(10);
    expect(samples[0]!.url).to.equal('https://docs.cloud.google.com/text-to-speech/docs/audio/en-US-Standard-A.wav');
    expect(samples.slice(0, -1).every(sample => sample.paused && sample.currentTime === 0)).to.equal(true);
    preview.play('../untrusted');
    expect(samples).to.have.length(10);
    expect(failures).to.have.length(1);
    preview.destroy();
  });
  it('reports current failures, ignores superseded failures, and stops on destruction', async () => {
    const { preview, samples, failures } = setup();
    preview.play('en-US-Standard-A');
    preview.play('en-US-Standard-B');
    samples[0]!.reject(new Error('superseded'));
    await Promise.resolve();
    expect(failures).to.have.length(0);
    samples[1]!.reject(new Error('play rejected'));
    await Promise.resolve();
    expect(failures).to.have.length(1);
    expect(samples[1]!.paused).to.equal(true);
    preview.play('en-US-Standard-C');
    preview.destroy();
    expect(samples[2]!.paused).to.equal(true);
    samples[2]!.reject(new Error('destroyed'));
    await Promise.resolve();
    preview.play('en-US-Standard-D');
    expect(samples).to.have.length(3);
    expect(failures).to.have.length(1);
  });
});
