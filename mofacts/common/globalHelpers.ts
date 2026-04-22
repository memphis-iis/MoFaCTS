import { _ as underscore } from 'meteor/underscore';

const _ = underscore as any;

export { secsIntervalString, displayify };

// Poly-fill for missing functionality
if (!Date.now) {
  Date.now = function now() {
    return new Date().getTime();
  };
}
function endsWith(subjectString: string, searchString: string, position?: number) {
  if (typeof position !== 'number' || !isFinite(position) ||
    Math.floor(position) !== position || position > subjectString.length) {
    position = subjectString.length;
  }
  position -= searchString.length;
  const lastIndex = subjectString.indexOf(searchString, position);
  return lastIndex !== -1 && lastIndex === position;
}

function secsIntervalString(elapsedSecs: unknown) {
  let timeLeft = _.floatval(elapsedSecs);

  const secs = _.intval(timeLeft % 60);
  timeLeft = Math.floor(timeLeft / 60);
  const mins = _.intval(timeLeft % 60);
  timeLeft = Math.floor(timeLeft / 60);
  const hrs = _.intval(timeLeft % 24);
  timeLeft = Math.floor(timeLeft / 24);
  const days = _.intval(timeLeft);

  let timeLeftDisplay = '';

  if (days > 0) {
    timeLeftDisplay += days.toString() + ' days, ';
  }
  if (hrs > 0) {
    timeLeftDisplay += hrs.toString() + ' hr, ';
  }
  if (mins > 0) {
    timeLeftDisplay += mins.toString() + ' min, ';
  }

  return timeLeftDisplay + secs.toString() + ' sec';
}

// Helper function for underscore that accesses a property by name but
// returns null either the object is "falsey" or the property is missing
// Given o = {a: {z: [1,2,3]}} then
// _.chain(o).prop('a').prop('z').value == [1,2,3]
// _.chain(o).prop('a').prop('z').first().intval().value == 1
// _.chain(o).prop('a').prop('z').first().floatval().value == 1.0
// _.chain(o).prop('a').prop('z').first().prop('nope') == null
// _.chain(o).prop('bad start').prop('z') == null
if (_ && _.mixin) {
  _.mixin({
    split: function(str: string, delimiter: string) {
      if (!str) {
        str = '';
      }
      return str.split(delimiter);
    },

    safefirst: function(arr: unknown[]) {
      const ret = _.first(arr);
      if (typeof ret === 'undefined') {
        return null;
      }
      return ret;
    },

    prop: function(obj: any, propname: string | number) {
      if (_.isArray(obj) && _.isNumber(propname)) {
        return obj[propname];
      } else if ((!obj && obj !== '') || !propname || !_.has(obj, String(propname))) {
        return null;
      } else {
        return obj[propname];
      }
    },

    intval: function(src: unknown, defaultVal?: number) {
      if (!src && src !== false && src !== 0) {
        src = '';
      } else {
        src = ('' + src).replace(/^\s+|\s+$/gm, '');
      }

      const val = parseInt(String(src), 10);
      defaultVal = defaultVal || 0;
      return isNaN(val) ? defaultVal : val;
    },

    floatval: function(src: unknown, defaultVal?: number) {
      if (!src && src !== false) {
        src = '';
      } else {
        src = ('' + src).replace(/^\s+|\s+$/gm, '');
      }

      const val = parseFloat(String(src));
      defaultVal = defaultVal || 0.0;
      return isFinite(val) ? val : defaultVal;
    },

    trim: function(s: unknown) {
      if (!s && s !== 0 && s !== false) {
        return '';
      }

      const ss = '' + s;
      if (!ss || !ss.length || ss.length < 1) {
        return '';
      }

      if (ss.trim) {
        return ss.trim();
      } else {
        return ss.replace(/^\s+|\s+$/gm, '');
      }
    },

    // Given an object, convert it to a reasonable string for display:
    // - If it doesn't evaluate and isn't False, return empty string
    // - if it's an array join the entries together with a comma
    // - else convert to a string
    // Note that we recurse on array entries, so arrays of arrays will
    // be "flattened"
    display: function(s: any) {
      if (!s && s !== false && s !== 0) {
        return '';
      } else if (s && s.length && s.join) {
        const dispvals = [];
        for (let i = 0; i < s.length; ++i) {
          dispvals.push(_.display(s[i]));
        }
        return dispvals.join(',');
      } else {
        return _.trim('' + s);
      }
    },

    sum: function(lst: unknown[]) {
      return _.reduce(
          lst,
          function(memo: number, num: any) {
            return memo + (isFinite(num) ? num : 0.0);
          },
          0,
      );
    },
  });
}

// Useful function for display and debugging objects: returns an OK JSON
// pretty-print textual representation of the object
// Helpful wrapper around JSON.stringify, including timestamp field expansion
function displayify(obj: any): any {
  // Strings and numbers are simple
  const type = typeof obj;
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return obj;
  } else if (type === 'symbol' && obj.toString) {
    return obj.toString();
  } else if (type === 'undefined' || obj === null) {
    return '';
  }

  // Array: return with displayify run on each member and intelligently decide
  // on how we space/break the display
  if (_.isArray(obj)) {
    const multiLine = (obj.length > 3 && !_.isNumber(obj[0]));
    return '[' + _.map(obj, function(val: any) {
      let txt = displayify(val) + ', '; // Recursion!
      if (multiLine) {
        txt = '  ' + txt + '\n';
      }
      return txt;
    }).join('') + ']';
  }

  // Object - perform some special formatting on a copy
  const dispObj = _.extend({}, obj);

  try {
    for (const prop in dispObj) {
      if (endsWith(prop.toLowerCase(), 'timestamp')) {
        const ts = _.intval(_.prop(obj, prop));
        if (ts > 0) {
          dispObj[prop] = ' ' + new Date(ts) + ' (converted from ' + ts + ')';
        }
      }
    }
  } catch (e) {
    // Best-effort formatting only; return partial display object if conversion fails.
  }

  return JSON.stringify(dispObj, null, 2);
}
