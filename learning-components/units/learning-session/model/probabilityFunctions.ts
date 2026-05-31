export function defaultProbFunction(p: any, pFunc: any): any {
  const recentHistory = p.overallOutcomeHistory.slice(
    Math.max(p.overallOutcomeHistory.length - 60, 0),
    p.overallOutcomeHistory.length,
  );

  p.y = -0.77 +
    0.665 * pFunc.logitdec(recentHistory, 0.966) +
    0.51 * p.stimSuccessCount +
    11.1 * pFunc.recency(p.stimSecsSinceLastShown, 0.443);

  p.probability = 1.0 / (1.0 + Math.exp(-p.y));

  return p;
}

function requireFiniteNumber(value: any, name: string): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new Error(`PPES requires finite ${name}`);
  }
  return numericValue;
}

function requireFiniteNumberArray(values: any, name: string): number[] {
  if (!Array.isArray(values)) {
    throw new Error(`PPES requires ${name} as an array`);
  }
  return values.map((value, index) => requireFiniteNumber(value, `${name}[${index}]`));
}

function componentSpacing(times: number[]): number[] {
  if (times.length === 0) {
    return [0];
  }

  return times.map((time, index) => {
    if (index === 0) {
      return 0;
    }
    const previousTime = times[index - 1];
    if (previousTime === undefined) {
      throw new Error('PPES failed to align component spacing times');
    }
    return time - previousTime;
  });
}

function laggedSpacing(times: number[]): number[] {
  const spacing = componentSpacing(times);
  return spacing.map((_, index) => {
    if (index === 0) {
      return 0;
    }
    const previousSpacing = spacing[index - 1];
    if (previousSpacing === undefined) {
      throw new Error('PPES failed to align lagged spacing values');
    }
    return previousSpacing;
  });
}

function weightedPpeTime(times: number[], decay: number): number {
  const currentTime = times[times.length - 1];
  if (currentTime === undefined) {
    return 1;
  }

  const elapsedTimes = times.slice(0, -1).map((time) => currentTime - time);
  if (elapsedTimes.length === 0) {
    return 1;
  }

  const weights = elapsedTimes.map((elapsedTime) => Math.pow(elapsedTime, -decay));
  const weightTotal = weights.reduce((total, weight) => total + weight, 0);
  const weightedTime = elapsedTimes.reduce((total, elapsedTime, index) => {
    const weight = weights[index];
    if (weight === undefined) {
      throw new Error('PPES failed to align elapsed time weights');
    }
    return total + elapsedTime * weight / weightTotal;
  }, 0);

  return Number.isNaN(weightedTime) ? 1 : weightedTime;
}

function slidingWeightedPpeTimes(times: number[], decay: number): number[] {
  return times.map((_, index) => weightedPpeTime(times.slice(0, index + 1), decay));
}

export function createProbabilityFunctionHelpers(log: (...args: unknown[]) => void): any {
  const pFunc: any = {};
  pFunc.testFunction = function() {
    log("testing probability function");
  };

  pFunc.mul = function(m1: any, m2: any) {
    let result = 0;
    const len = m1.length;
    for (let i = 0; i < len; i++) {
      result += m1[i] * m2[i];
    }
    return result;
  };
  pFunc.logitdec = function(outcomes: any, decay: any) {
    if (outcomes) {
      const outcomessuc = JSON.parse(JSON.stringify(outcomes));
      const outcomesfail = outcomes.map(function(value: any) {
        return Math.abs(value - 1);
      });
      const w = outcomessuc.unshift(1);
      outcomesfail.unshift(1);
      return Math.log(pFunc.mul(outcomessuc, [...Array(w).keys()].reverse().map(function(value: any) {
        return Math.pow(decay, value);
      })) / pFunc.mul(outcomesfail, [...Array(w).keys()].reverse().map(function(value: any) {
        return Math.pow(decay, value);
      })));
    }
    return 0;
  };

  pFunc.recency = function(age: any, d: any) {
    if (age == 0) {
      return 0;
    } else {
      return Math.pow(1 + age, -d);
    }
  };

  pFunc.quaddiffcor = function(seq: any, probs: any) {
    return pFunc.mul(seq, probs.map(function(value: any) {
      return value * value;
    }));
  };

  pFunc.quaddiffincor = function(seq: any, probs: any) {
    return pFunc.mul(Math.abs(seq - 1), probs.map(function(value: any) {
      return value * value;
    }));
  };

  pFunc.linediffcor = function(seq: any, probs: any) {
    return pFunc.mul(seq, probs);
  };

  pFunc.linediffincor = function(seq: any, probs: any) {
    return pFunc.mul(seq.map(function(value: any) {
      return Math.abs(value - 1);
    }), probs);
  };

  pFunc.arrSum = function(arr: any) {
    return arr.reduce(function(a: any, b: any) { return a + b; }, 0);
  };

  pFunc.errlist = function(seq: any) {
    return seq.map(function(value: any) { return Math.abs(value - 1); });
  };

  pFunc.componentSpacing = function(times: any) {
    return componentSpacing(requireFiniteNumberArray(times, 'times'));
  };

  pFunc.spacingLagged = function(times: any) {
    return laggedSpacing(requireFiniteNumberArray(times, 'times'));
  };

  pFunc.ppew = function(times: any, wpar: any) {
    const timeValues = requireFiniteNumberArray(times, 'times');
    const weightDecay = requireFiniteNumber(wpar, 'wpar');
    const weights = timeValues.map((timeValue) => Math.pow(timeValue, -weightDecay));
    const weightTotal = weights.reduce((total, weight) => total + weight, 0);
    return weights.map((weight) => weight / weightTotal);
  };

  pFunc.ppet = function(times: any) {
    const timeValues = requireFiniteNumberArray(times, 'times');
    const currentTime = timeValues[timeValues.length - 1];
    if (currentTime === undefined) {
      return [];
    }
    return timeValues.map((timeValue) => currentTime - timeValue);
  };

  pFunc.ppetw = function(times: any, d: any) {
    return weightedPpeTime(
      requireFiniteNumberArray(times, 'times'),
      requireFiniteNumber(d, 'd'),
    );
  };

  pFunc.slideppetw = function(times: any, d: any) {
    return slidingWeightedPpeTimes(
      requireFiniteNumberArray(times, 'times'),
      requireFiniteNumber(d, 'd'),
    );
  };

  pFunc.ppes = function(
    correctCount: any,
    totalCount: any,
    times: any,
    spacingLagged: any,
    par1: any,
    par2: any,
    par3: any,
    par4: any,
  ) {
    const correct = requireFiniteNumber(correctCount, 'correctCount');
    const total = requireFiniteNumber(totalCount, 'totalCount');
    const timeValues = requireFiniteNumberArray(times, 'times');
    const spacingValues = requireFiniteNumberArray(spacingLagged, 'spacingLagged');
    if (timeValues.length === 0) {
      return 0;
    }
    const p1 = requireFiniteNumber(par1, 'par1');
    const p2 = requireFiniteNumber(par2, 'par2');
    const p3 = requireFiniteNumber(par3, 'par3');
    const p4 = requireFiniteNumber(par4, 'par4');
    if (timeValues.length !== spacingValues.length) {
      throw new Error('PPES requires times and spacingLagged arrays with the same length');
    }

    const firstTime = Math.min(...timeValues);
    const relativeTimes = timeValues.map((timeValue) => timeValue - firstTime);
    const spacingSum = spacingValues.reduce((totalSpacing, spacingValue) => {
      return totalSpacing + (spacingValue === 0 ? 0 : 1 / Math.log(spacingValue + Math.E));
    }, 0);
    const spacing = total <= 1 ? 0 : spacingSum / (total - 1);
    const weightedTimes = slidingWeightedPpeTimes(relativeTimes, p4);
    const tw = weightedTimes[weightedTimes.length - 1];
    if (tw === undefined) {
      throw new Error('PPES failed to compute weighted time');
    }

    return Math.pow(correct, p1) * Math.pow(tw, -(p2 + p3 * spacing));
  };

  pFunc.ppesFromTimes = function(
    correctCount: any,
    totalCount: any,
    times: any,
    par1: any,
    par2: any,
    par3: any,
    par4: any,
  ) {
    const timeValues = requireFiniteNumberArray(times, 'times');
    return pFunc.ppes(
      correctCount,
      totalCount,
      timeValues,
      laggedSpacing(timeValues),
      par1,
      par2,
      par3,
      par4,
    );
  };

  return pFunc;
}
