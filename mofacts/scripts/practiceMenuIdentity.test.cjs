// Execute the production action handlers with a captured launch boundary.
// Rendered client coverage remains in learningDashboard.test.ts and Meteor CI.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const assert = require('node:assert/strict');

function handlers() {
  const file = path.resolve(__dirname, '../client/views/home/learningDashboard.ts');
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const printer = ts.createPrinter();
  const selected = source.statements.filter(statement =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === 'parseBooleanLike'
    || ts.isExpressionStatement(statement)
      && statement.expression.expression?.getText(source) === 'Template.learningDashboard.events');
  assert.equal(selected.length, 2, 'Production parser and event registration must be present');
  const launches = [];
  const session = {};
  let events;
  const context = vm.createContext({
    learnerSettingsEvents: {},
    Template: { learningDashboard: { events: value => { events = value; } } },
    unlockAppleMobileAudioForUserGesture() {},
    safeSelectTdf: async (...args) => { launches.push(args); },
    Session: { set: (key, value) => { session[key] = value; } },
    $: element => element,
  });
  const code = selected.map(statement => printer.printNode(ts.EmitHint.Unspecified, statement, source)).join('\n');
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { events, launches, session };
}

for (const action of ['continue-lesson', 'start-lesson', 'start-blocks']) {
  for (const multi of ['true', 'false', '1', '0']) {
    test(`${action} uses live lesson attributes and parses multi-lesson=${multi}`, async () => {
      const { events, launches } = handlers();
      const old = { 'data-tdfid': 'control', 'data-lessonname': 'Control',
        'data-currentstimulisetid': 'old-stimuli', 'data-ismultitdf': 'true' };
      const live = { ...old, 'data-tdfid': 'adaptive', 'data-lessonname': 'Adaptive',
        'data-currentstimulisetid': 'new-stimuli', 'data-ismultitdf': multi };
      const button = {
        getAttribute: name => live[name],
        data: name => old[`data-${name}`],
      };
      await events[`click .${action}`]({ preventDefault() {}, currentTarget: button });
      assert.equal(launches.length, 1);
      assert.deepEqual(Array.from(launches[0].slice(0, 3)), ['adaptive', 'Adaptive', 'new-stimuli']);
      assert.equal(launches[0][6], multi === 'true' || multi === '1');
      if (action === 'start-blocks') assert.equal(launches[0][10], 'blocks');
    });
  }
}

for (const selected of ['new-root', 'adaptive']) {
  test(`condition entry uses the live root ID with selection ${selected}`, async () => {
    const { events, launches, session } = handlers();
    const selector = { val: () => selected, attr: () => 'new-root', data: () => 'old-root' };
    const button = { closest: () => ({ find: () => selector }) };
    await events['click .start-condition-root'].call({ displayName: 'Condition pool', isMultiTdf: true },
      { preventDefault() {}, currentTarget: button });
    assert.equal(launches[0][0], 'new-root');
    assert.equal(launches[0][9], true, 'Owner launch must be preserved');
    assert.equal(session.tdfFamilyRootTdfId, 'new-root');
    assert.equal(session.preselectedConditionTdfId, selected === 'new-root' ? null : 'adaptive');
  });
}
