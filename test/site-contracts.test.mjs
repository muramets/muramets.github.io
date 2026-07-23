import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = file => readFile(resolve(root, file), 'utf8');

test('published content uses the current schema without obsolete deck keys', async () => {
  const content = JSON.parse(await read('data/content.json'));
  assert.equal(content.version, 2);
  assert.equal(JSON.stringify(content).includes('"about.deck"'), false);
});

test('all internal modules have one identity, including the admin renderer', async () => {
  const [main, admin, render] = await Promise.all([
    read('js/main.js'),
    read('js/admin.js'),
    read('js/render.js'),
  ]);
  assert.equal(/from ['"][^'"]+\?v=/.test(main + admin + render), false);
  assert.match(main, /await import\('\.\/admin\.js'\)/);
});

test('Impact gate lettering is content-managed and available to the editor', async () => {
  const [about, adminCss] = await Promise.all([read('about.html'), read('css/admin.css')]);
  assert.match(about, /data-text-id="about\.impact\.gate\.left"/);
  assert.match(about, /data-text-id="about\.impact\.gate\.right"/);
  assert.match(adminCss, /\.admin-authed \.scroll-chapter__shutter/);
});

test('floating navigation and admin toolbar retain independent feature boundaries', async () => {
  const [main, navigation, sectionBar, admin, toolbar, publisher] = await Promise.all([
    read('js/main.js'),
    read('js/features/navigation.js'),
    read('js/features/section-bar.js'),
    read('js/admin.js'),
    read('js/admin/toolbar.js'),
    read('js/admin/publisher.js'),
  ]);

  assert.match(main, /from '\.\/features\/section-bar\.js'/);
  assert.doesNotMatch(navigation, /function initSectionBar/);
  assert.match(sectionBar, /export function initSectionBar/);
  assert.match(admin, /from '\.\/admin\/toolbar\.js'/);
  assert.match(admin, /from '\.\/admin\/publisher\.js'/);
  assert.match(toolbar, /export function createAdminToolbar/);
  assert.match(publisher, /export async function publishContent/);
  assert.doesNotMatch(admin, /api\.github\.com/);
});

test('timeline fold lands at compact Journey instead of Contact', async () => {
  const [main, timeline, geometry, sectionBar] = await Promise.all([
    read('js/main.js'),
    read('js/features/journey/index.js'),
    read('js/features/journey/timeline-geometry.js'),
    read('js/features/section-bar.js'),
  ]);

  assert.match(main, /mountJourneyTimeline/);
  assert.match(timeline, /document\.body\.classList\.add\('is-journey-collapsing', 'is-timeline-folding'\)/);
  assert.match(timeline, /window\.dispatchEvent\(new Event\('timelinefoldstart'\)\)/);
  assert.match(timeline, /const FOLD_DURATION_MS = 1500;/);
  assert.match(timeline, /getCollapsePlan/);
  assert.match(geometry, /controlBottomAfterCollapse/);
  assert.match(geometry, /desiredControlBottom/);
  assert.doesNotMatch(timeline + geometry, /scrollToPageEnd|journeyBottom|compactJourneyEnd/);
  assert.match(sectionBar, /is-timeline-folding/);
  assert.match(sectionBar, /timelinefoldend/);
});

test('Journey intro keeps its native sticky context during the component fold', async () => {
  const [about, timeline, layout] = await Promise.all([
    read('about.html'),
    read('js/features/journey/index.js'),
    read('css/layout.css'),
  ]);

  assert.match(layout, /is-journey-collapsing:not\(\.is-admin\) \.section--journey \.journey-layout/);
  assert.match(about, /journey-layout">\s*<div class="journey-layout__intro">/);
  assert.match(layout, /\.journey-layout__intro \{\s+position: sticky;/);
  assert.doesNotMatch(about, /journey-layout__intro-shell/);
  assert.doesNotMatch(timeline + layout, /is-fold-locked|cloneNode\(|position: fixed/);
});

test('the fold reserves Journey height and applies the control ceiling before a visible resize', async () => {
  const [timeline, geometry, components, layout] = await Promise.all([
    read('js/features/journey/index.js'),
    read('js/features/journey/timeline-geometry.js'),
    read('css/components.css'),
    read('css/layout.css'),
  ]);

  assert.match(timeline, /renderTimelineFoldFrame/);
  assert.match(timeline, /setJourneySurfaceHold\(0\)/);
  assert.match(timeline, /setJourneySurfaceHold\(frame\.reservedHeight\)/);
  assert.match(timeline, /getFoldScrollLimit/);
  assert.match(timeline, /lenis\.scrollTo\(target, \{ immediate: true, force: true \}\)/);
  assert.doesNotMatch(timeline, /lenis\.setScroll\?\./);
  assert.match(timeline, /scroll-behavior', 'auto', 'important'/);
  assert.match(timeline, /freezeJourneyPresentation\(\);\s+useInstantNativeScroll\(\);/);
  assert.match(timeline, /applyControlCeiling\(plan, startScroll, frame\.reservedHeight, eased\);\s+setJourneySurfaceHold/);
  assert.match(timeline, /syncLenisAfterLayout\(plan\.targetScroll\);/);
  assert.match(timeline, /journeyfolddebugstart/);
  assert.match(timeline, /journeyfolddebugend/);
  assert.match(geometry, /export function getCollapseFrame/);
  assert.match(geometry, /export function getFoldScrollLimit/);
  assert.match(geometry, /finalMaxScroll/);
  assert.match(components, /\.timeline-fold-reservation/);
  assert.match(layout, /--journey-fold-contact-shift/);
  assert.match(layout, /--journey-fold-sheet-transform/);
  assert.match(layout, /--journey-paper-layer: 6/);
  assert.match(layout, /--contact-paper-layer: 7/);
  assert.match(layout, /#contact \{\s+position: relative;\s+z-index: var\(--contact-paper-layer\);[\s\S]*background-image: var\(--paper-grain\);[\s\S]*overflow: clip;[\s\S]*border-top: 1px solid rgba\(19, 19, 19, 0\.12\);[\s\S]*box-shadow: inset 0 10px 12px -12px rgba\(19, 19, 19, 0\.30\);/);
  assert.match(layout, /#contact::before \{[\s\S]*box-shadow: 0 24px 180px -10px rgba\(19, 19, 19, 0\.096\);/);
  assert.match(components, /\.timeline-expand\.is-folding/);
  assert.match(timeline, /control\.setAttribute\('aria-busy', String\(isFolding\)\)/);
  assert.doesNotMatch(timeline + components, /timeline-fold-progress/);
  assert.doesNotMatch(timeline + layout, /cloneNode\(|position: fixed/);
  assert.doesNotMatch(timeline, /\.stop\(\)/);
});

test('Journey diagnostics stay opt-in behind the query flag', async () => {
  const [main, timeline] = await Promise.all([
    read('js/main.js'),
    read('js/features/journey/index.js'),
  ]);

  assert.match(main, /has\('journey-debug'\)/);
  assert.match(main, /window\.__lenis = lenisInstance/);
  assert.match(timeline, /const JOURNEY_DEBUG_QUERY = 'journey-debug'/);
  assert.match(timeline, /window\.__journeyFoldDebug = state/);
});
