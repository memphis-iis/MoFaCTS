import WildEmitter from 'wildemitter';

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

type HarkOptions = {
  smoothing?: number;
  interval?: number;
  threshold?: number;
  play?: boolean;
  history?: number;
  audioContext?: AudioContext;
};

function getMaxVolume(analyser: AnalyserNode, fftBins: Float32Array<ArrayBuffer>): number {
  let maxVolume = -Infinity;
  analyser.getFloatFrequencyData(fftBins);

  for (let i = 4, ii = fftBins.length; i < ii; i++) {
    const bin = fftBins[i];
    if (bin !== undefined && bin > maxVolume && bin < 0) {
      maxVolume = bin;
    }
  }

  return maxVolume;
}


let audioContextType: typeof AudioContext | undefined;
if (typeof window !== 'undefined') {
  audioContextType = window.AudioContext || window.webkitAudioContext;
}
// use a single audio context due to hardware limits
let audioContext: AudioContext | null = null;
export default function hark(stream: MediaStream | HTMLAudioElement | HTMLVideoElement | any, opts?: HarkOptions): any {
  const harker: any = new WildEmitter();

  // make it not break in non-supported browsers
  if (!audioContextType) return harker;

  //Config
  const options = opts || {};
  const smoothing = options.smoothing || 0.1;
  let interval = options.interval || 50;
  let threshold = options.threshold ?? -50;
  let play = options.play;
  const history = options.history || 10;
  let running = true;

  // Ensure that just a single AudioContext is internally created
  audioContext = options.audioContext || audioContext || new audioContextType();

  const ctx = audioContext;
  if (!ctx) {
    return harker;
  }

  let sourceNode: MediaElementAudioSourceNode | MediaStreamAudioSourceNode;
  let fftBins: Float32Array<ArrayBuffer>;
  let analyser: AnalyserNode;

  analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = smoothing;
  fftBins = new Float32Array(analyser.frequencyBinCount);

  if (stream?.jquery) stream = stream[0];
  if (stream instanceof HTMLAudioElement || stream instanceof HTMLVideoElement) {
    //Audio Tag
    sourceNode = ctx.createMediaElementSource(stream);
    if (typeof play === 'undefined') play = true;
    threshold = threshold || -50;
  } else {
    //WebRTC Stream
    sourceNode = ctx.createMediaStreamSource(stream);
  }

  sourceNode.connect(analyser);
  if (play) analyser.connect(ctx.destination);

  harker.speaking = false;

  harker.suspend = function() {
    return ctx.suspend();
  }
  harker.resume = function() {
    return ctx.resume();
  }
  Object.defineProperty(harker, 'state', { get: function() {
    return ctx.state;
  }});
  ctx.onstatechange = function() {
    harker.emit('state_change', ctx.state);
  }

  harker.setThreshold = function (t: number) {
    threshold = t;
  };

  harker.setInterval = function (i: number) {
    interval = i;
  };

  harker.stop = function() {
    running = false;
    harker.emit('volume_change', -100, threshold);
    if (harker.speaking) {
      harker.speaking = false;
      harker.emit('stopped_speaking');
    }
    analyser.disconnect();
    sourceNode.disconnect();
  };
  harker.speakingHistory = [];
  for (let i = 0; i < history; i++) {
      harker.speakingHistory.push(0);
  }

  // Poll the analyser node to determine if speaking
  // and emit events if changed
  const looper = function () {
    setTimeout(function () {

      //check if stop has been called
      if(!running) {
        return;
      }

      const currentVolume = getMaxVolume(analyser, fftBins);

      harker.emit('volume_change', currentVolume, threshold);

      let speakingHistoryScore = 0;
      if (currentVolume > threshold && !harker.speaking) {
        // trigger quickly, short history
        for (let i = harker.speakingHistory.length - 3; i < harker.speakingHistory.length; i++) {
          speakingHistoryScore += harker.speakingHistory[i];
        }
        if (speakingHistoryScore >= 2) {
          harker.speaking = true;
          harker.emit('speaking');
        }
      } else if (currentVolume < threshold && harker.speaking) {
        for (let j = 0; j < harker.speakingHistory.length; j++) {
          speakingHistoryScore += harker.speakingHistory[j];
        }
        if (speakingHistoryScore === 0) {
          harker.speaking = false;
          harker.emit('stopped_speaking');
        }
      }
      harker.speakingHistory.shift();
      harker.speakingHistory.push(Number(currentVolume > threshold));

      looper();
    }, interval);
  };
  looper();

  return harker;
}





