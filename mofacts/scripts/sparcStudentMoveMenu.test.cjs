// Production menu + central styles in Chromium, with synthetic offered options.
// No Meteor, accounts, learner records, or provider requests are used.
const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { rspack, NormalModuleReplacementPlugin } = require('@rspack/core');
require('./registerHistoryTypescript.cjs');
const { SPARC_CATEGORIZED_MENU_OPTIONS } = require('../../learning-components/units/sparcsession/sparcDynamicInstructionRules.ts');
const { assertCompletePlatformLocaleResources } = require('../client/lib/interfaceI18n.ts');

it('keeps single choices, submits one combined move, and scales unwrapped columns uniformly', { timeout: 120000 }, async () => {
  assertCompletePlatformLocaleResources();
  const app = path.resolve(__dirname, '..');
  const directory = fs.mkdtempSync(path.join(app, '../tmp/sparc-move-menu-'));
  const component = path.join(app, 'client/views/experiment/svelte/components/SparcStudentMoveMenu.svelte').replaceAll('\\', '/');
  const locale = path.join(directory, 'locale.js');
  fs.writeFileSync(locale, "export const getActiveUiLocale = () => window.menuLocale || 'en';");
  const entry = path.join(directory, 'entry.js');
  fs.writeFileSync(entry, `import { mount, unmount, tick } from 'svelte';
    import Menu from ${JSON.stringify(component)};
    let instance;
    window.mountMenu = async (node, history = false) => {
      if (instance) await unmount(instance);
      window.choices = [];
      instance = mount(Menu, { target: document.querySelector('#menu'), props: { node, history,
        onActivate: async (option, next) => { window.choices.push({ option, next }); } } });
      await tick();
    };`);
  const compiler = rspack({
    mode: 'development', devtool: false, context: app, entry,
    output: { path: directory, filename: 'bundle.js' },
    resolve: { extensions: ['.ts', '.js', '.svelte'], conditionNames: ['svelte', 'browser', 'import', 'default'], modules: [path.join(app, 'node_modules'), 'node_modules'] },
    module: { rules: [
      { test: /\.svelte$/, use: [{ loader: require.resolve('./loaders/svelte-loader-wrapper.cjs'), options: { compilerOptions: { dev: true } } }] },
      { test: /\.ts$/, exclude: /node_modules/, use: [{ loader: 'builtin:swc-loader', options: { jsc: { parser: { syntax: 'typescript' }, target: 'es2022' } } }] },
    ] },
    plugins: [new NormalModuleReplacementPlugin(/interfaceLocaleState$/, locale)],
    optimization: { minimize: false, splitChunks: false }, performance: { hints: false },
  });
  await new Promise((resolve, reject) => compiler.run((error, stats) => compiler.close(closeError => {
    if (error || closeError) reject(error || closeError);
    else if (stats.hasErrors()) reject(new Error(stats.toString({ all: false, errors: true })));
    else resolve();
  })));
  const node = { id: 'instructional-choice-menu', children: SPARC_CATEGORIZED_MENU_OPTIONS.map(option => ({
    id: `synthetic-menu:${option.id}`, menuId: 'synthetic-menu', optionId: option.id, value: option.id, label: option.label,
  })) };
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.setContent('<main id="menu" style="width:420px;max-width:100%;margin:auto"></main>');
    await page.addStyleTag({ content: fs.readFileSync(path.join(app, 'public/styles/classic.css'), 'utf8') + '\n' + fs.readFileSync(path.join(app, 'public/styles/instructional-content.css'), 'utf8') });
    await page.addScriptTag({ content: fs.readFileSync(path.join(directory, 'bundle.js'), 'utf8') });
    await page.evaluate(node => window.mountMenu(node), node);
    const buttons = page.locator('.sparc-student-menu-column button');
    assert.equal(await buttons.count(), 10);
    assert.equal(await page.locator('input[type=radio]').count(), 0);
    assert.equal(await buttons.filter({ hasText: /^Same KC$/ }).getAttribute('aria-pressed'), 'true');
    assert.equal(await buttons.locator('..').first().locator('[aria-pressed=true]').count(), 1);
    assert.equal(await page.locator('.sparc-student-menu-column').nth(1).locator('[aria-pressed=true]').count(), 0);
    assert.equal(await page.locator('.sparc-student-menu-column').nth(2).locator('[aria-pressed=true]').count(), 0);
    await page.getByRole('button', { name: 'Next KC', exact: true }).click();
    await page.getByRole('button', { name: 'Explain + Q', exact: true }).click();
    await page.getByRole('button', { name: 'Explain + support + Q', exact: true }).click();
    assert.equal(await page.locator('.sparc-student-menu-column').nth(1).locator('[aria-pressed=true]').count(), 1);
    assert.equal(await page.evaluate(() => window.choices.length), 0);
    await page.getByRole('button', { name: 'Multiple choice', exact: true }).click();
    assert.equal(await page.evaluate(() => window.choices.length), 1);
    const chosen = await page.evaluate(() => window.choices[0]);
    assert.equal(chosen.option.optionId, 'explanation-rich-question.multiple-choice');
    assert.equal(chosen.next.optionId, 'next-target');

    // Check both factor orders, and that changing a subdued choice stays possible.
    await page.evaluate(node => window.mountMenu(node), node);
    await page.getByRole('button', { name: 'True / false', exact: true }).click();
    assert.equal(await page.evaluate(() => window.choices.length), 0);
    await page.getByRole('button', { name: 'Question (Q)', exact: true }).click();
    assert.equal(await page.evaluate(() => window.choices[0].option.optionId), 'question.true-false');
    assert.equal(await page.evaluate(() => window.choices[0].next), null);

    // Saved choices use the same presenter, reduced to one read-only row.
    for (const nextKC of [false, true]) {
      const history = { id: 'synthetic-menu:selected', children: [
        { value: 'explanation-visual-question.cloze', selected: true, readOnly: true },
        ...(nextKC ? [{ value: 'next-target', selected: true, readOnly: true }] : []),
      ] };
      await page.evaluate(history => window.mountMenu(history, true), history);
      const historyButtons = page.locator('.sparc-student-move-history button');
      assert.deepEqual(await historyButtons.allTextContents(), [nextKC ? 'Next KC' : 'Same KC', 'Explain + visual + Q', 'Fill in the blank']);
      assert.equal(await historyButtons.count(), 3);
      assert.equal(await page.locator('.sparc-student-move-history button:disabled').count(), 3);
      assert.equal(await page.evaluate(() => window.choices.length), 0);
      const rows = await historyButtons.evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().top));
      assert.ok(Math.max(...rows) - Math.min(...rows) < 1, 'All saved choices share one row');
    }
    await page.evaluate(node => window.mountMenu(node), node);

    const inspect = () => page.locator('.sparc-student-move-menu').evaluate(host => {
      const grid = host.querySelector('.sparc-student-menu-grid');
      const size = host.querySelector('.sparc-student-menu-size');
      const rect = grid.getBoundingClientRect();
      return { width: rect.width, height: rect.height, intrinsicWidth: grid.offsetWidth, intrinsicHeight: grid.offsetHeight,
        reservedHeight: size.offsetHeight, available: host.clientWidth,
        paddings: [...new Set([...grid.querySelectorAll('button')].map(button => getComputedStyle(button).padding))],
        unwrapped: [...grid.querySelectorAll('button')].every(button => getComputedStyle(button).whiteSpace === 'nowrap'),
        columnCenters: [...grid.children].map(column => { const r = column.getBoundingClientRect(); return r.y + r.height / 2; }),
      };
    });
    for (const themeName of ['mofacts-default', 'dark-industrial']) {
      const theme = JSON.parse(fs.readFileSync(path.join(app, `public/themes/${themeName}.json`), 'utf8'));
      await page.evaluate(properties => {
        for (const [name, value] of Object.entries(properties)) document.documentElement.style.setProperty(`--${name.replaceAll('_', '-')}`, String(value));
      }, theme.properties);
    for (const locale of ['en', 'fr', 'ar']) for (const width of [390, 360, 320, 240]) {
      await page.setViewportSize({ width, height: 450 });
      await page.evaluate(async ({ node, locale }) => { window.menuLocale = locale; document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'; await window.mountMenu(node); }, { node, locale });
      await page.waitForFunction(() => {
        const grid = document.querySelector('.sparc-student-menu-grid');
        return grid && grid.getBoundingClientRect().width <= document.querySelector('#menu').clientWidth + 1;
      });
      const layout = await inspect();
      assert.ok(layout.width <= layout.available + 1, `${locale}/${width}: no horizontal overflow`);
      assert.ok(Math.abs(layout.width / layout.intrinsicWidth - layout.height / layout.intrinsicHeight) < .01, 'Same scale on both dimensions');
      assert.ok(Math.abs(layout.height - layout.reservedHeight) < 2, 'Reserved height follows scaled menu');
      assert.equal(layout.paddings.length, 1, 'All ten buttons use equal padding');
      assert.equal(layout.unwrapped, true);
      assert.ok(Math.max(...layout.columnCenters) - Math.min(...layout.columnCenters) < 1, 'KC column is vertically centered');
      if (locale === 'en' && width === 390) await page.locator('#menu').screenshot({ path: path.join(directory, `${themeName}-phone.png`) });
    }
    }
    // Theme geometry changes must be measured again, not clipped or cached.
    await page.evaluate(() => document.documentElement.style.setProperty('--app-button-height', '70px'));
    await page.waitForFunction(() => document.querySelector('.sparc-student-menu-grid').offsetHeight > 200);

    // Exercise the real node renderer and surface handler as well as the menu.
    const { buildFixture } = require('./sparcReadingOrderFixture.cjs');
    const surfaceFixture = await buildFixture({ captureSubmissions: true });
    await page.setContent('<main id="fixture"></main>');
    await page.addScriptTag({ content: surfaceFixture.source });
    await page.evaluate(node => window.fixture.mount({
      display: { pageKey: 'synthetic', unitType: 'sparc-autotutor-dialogue',
        instructionalController: { policyId: 'dynamic-instruction-student-v2' }, nodes: [{ ...node, nodeType: 'group', groupType: 'button-group' }] },
      subsetKind: 'question', engine: { curUnit: { sparcsession: {} } }, userId: 'synthetic', tdfId: 'synthetic', attemptId: 'synthetic', levelUnit: 0,
    }), node);
    assert.equal(await page.locator('[data-node-id="instructional-choice-menu"] button').count(), 10);
    await page.getByRole('button', { name: 'Next KC', exact: true }).click();
    await page.getByRole('button', { name: 'Explain + visual + Q', exact: true }).click();
    await page.getByRole('button', { name: 'Multiple choice', exact: true }).click();
    await page.waitForFunction(() => window.fixture.submissions.length === 1);
    const submission = await page.evaluate(() => window.fixture.submissions[0]);
    assert.equal(submission.triggeredBy, 'synthetic-menu:explanation-visual-question.multiple-choice');
    assert.deepEqual(submission.submittedNodes, {
      'synthetic-menu:explanation-visual-question.multiple-choice': 'explanation-visual-question.multiple-choice',
      'synthetic-menu:next-target': 'next-target',
    });

    // Render replayed history as the FIRST conversation item: its entire border
    // and text must be reachable at scrollTop=0, even when the chat overflows.
    const { projectSparcMenuOperations } = require('../../learning-components/units/sparcsession/sparcInstructionalCycle.ts');
    const { createEmptySparcReplayState } = require('../../learning-components/units/sparcsession/sparcStateReplay.ts');
    const replay = { ...createEmptySparcReplayState(), transitions: [{
      transitionId: 'synthetic:decision', event: { eventId: 'synthetic', type: 'choice-selected', time: 1,
        source: { pageKey: 'synthetic', nodeId: 'root' }, payload: { targetId: 'kc-b', targetKind: 'expectation' } },
      writes: [{ key: 'workingMemoryFact:instructional.menu', value: { factType: 'instructional.menu', slots: {
        menuId: 'synthetic-menu', status: 'selected', selectedOptionId: 'explanation-visual-question.cloze',
        options: SPARC_CATEGORIZED_MENU_OPTIONS.map(option => ({ ...option, targetId: option.id === 'next-target' ? 'kc-b' : 'kc-a', targetKind: 'expectation' })),
      } } }],
    }] };
    const marker = projectSparcMenuOperations(JSON.parse(JSON.stringify(replay)))[0].node;
    for (const themeName of ['mofacts-default', 'dark-industrial']) for (const width of [390, 1000]) {
      await page.setViewportSize({ width, height: 550 });
      await page.setContent('<main id="fixture" style="height:500px"></main>');
      await page.addStyleTag({ content: fs.readFileSync(path.join(app, 'public/styles/classic.css'), 'utf8') + '\n' + fs.readFileSync(path.join(app, 'public/styles/instructional-content.css'), 'utf8') });
      const theme = JSON.parse(fs.readFileSync(path.join(app, `public/themes/${themeName}.json`), 'utf8'));
      await page.evaluate(properties => {
        for (const [name, value] of Object.entries(properties)) document.documentElement.style.setProperty(`--${name.replaceAll('_', '-')}`, String(value));
      }, theme.properties);
      await page.addScriptTag({ content: surfaceFixture.source });
      await page.evaluate(marker => window.fixture.mount({
        display: { pageKey: 'synthetic', unitType: 'sparc-autotutor-dialogue', instructionalController: { policyId: 'dynamic-instruction-student-v2' },
          nodes: [marker, { id: 'synthetic-tutor', nodeType: 'atomic', atomType: 'dialogue-utterance', speaker: 'tutor', value: 'Synthetic instruction for layout verification. '.repeat(150) }] },
        subsetKind: 'question', engine: { curUnit: { sparcsession: {} } }, userId: 'synthetic', tdfId: 'synthetic', attemptId: 'synthetic', levelUnit: 0,
      }), marker);
      await page.waitForFunction(() => {
        const chat = document.querySelector('.sparc-auto-tutor-chat');
        return chat.scrollHeight > chat.clientHeight && chat.scrollHeight - chat.clientHeight - chat.scrollTop <= 1;
      });
      await page.locator('.sparc-auto-tutor-chat').evaluate(chat => { chat.scrollTop = 0; });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const row = page.locator('.sparc-student-move-history');
      assert.deepEqual(await row.locator('button').allTextContents(), ['Next KC', 'Explain + visual + Q', 'Fill in the blank']);
      assert.equal(await row.locator('.worksheet-selected').count(), 0);
      const geometry = await page.locator('.sparc-auto-tutor-chat').evaluate(chat => {
        const r = chat.getBoundingClientRect();
        const progress = chat.parentElement.querySelector('.sparc-auto-tutor-progress-popout > summary').getBoundingClientRect();
        return { top: r.top, left: r.left, right: r.right, scrollTop: chat.scrollTop,
          buttons: [...chat.querySelectorAll('.sparc-student-move-history button')].map(button => {
            const rect = button.getBoundingClientRect(); const style = getComputedStyle(button);
            return { top: rect.top, left: rect.left, right: rect.right, outline: style.outlineStyle, nowrap: style.whiteSpace === 'nowrap',
              coveredByProgress: rect.left < progress.right && rect.right > progress.left && rect.top < progress.bottom && rect.bottom > progress.top };
          }) };
      });
      assert.equal(geometry.scrollTop, 0);
      for (const button of geometry.buttons) {
        assert.ok(button.top >= geometry.top - .5, 'First history row is not clipped above the scroller');
        assert.ok(button.left >= geometry.left - .5 && button.right <= geometry.right + .5, 'History fits without horizontal clipping');
        assert.equal(button.outline, 'none', 'History has no selection outline outside its box');
        assert.equal(button.nowrap, true);
        assert.equal(button.coveredByProgress, false, 'Floating Progress must not cover the first history row');
      }
      await page.screenshot({ path: path.join(directory, `${themeName}-history-${width}.png`) });
      if (width === 390) await row.screenshot({ path: path.join(directory, `${themeName}-history-row.png`) });
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
