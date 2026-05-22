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

  return pFunc;
}
