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
  assert.doesNotMatch(timeline, /is-fold-locked|cloneNode\(|position: fixed/);
});

test('Contact perspective keeps the Journey intro in normal scroll flow', async () => {
  const [main, hold, timeline, layout] = await Promise.all([
    read('js/main.js'),
    read('js/features/journey-contact-hold.js'),
    read('js/features/journey/index.js'),
    read('css/layout.css'),
  ]);

  assert.match(main, /from '\.\/features\/journey-contact-hold\.js'/);
  assert.match(main, /initJourneyContactHold\(\);/);
  assert.match(hold, /--contact-sheet-transform/);
  assert.match(hold, /CONTACT_SHEET_START_SCALE_Y = 1/);
  assert.match(hold, /--contact-footer-depth/);
  assert.match(hold, /timelinefoldstart/);
  assert.doesNotMatch(hold, /is-journey-contact-held|journey-contact-pin|PIN_RELEASE_HYSTERESIS/);
  assert.doesNotMatch(hold, /foldToken|setJourneySurfaceHold|renderTimelineFoldFrame/);
  assert.doesNotMatch(layout, /is-journey-contact-held|journey-contact-pin/);
  assert.match(layout, /\.journey-layout__timeline \{\s+grid-column: 2;\s+grid-row: 1;/);
  assert.doesNotMatch(timeline, /initJourneyContactHold/);
});

test('the fold collapses Journey in normal flow without playing its own perspective', async () => {
  const [timeline, geometry, components, layout] = await Promise.all([
    read('js/features/journey/index.js'),
    read('js/features/journey/timeline-geometry.js'),
    read('css/components.css'),
    read('css/layout.css'),
  ]);

  assert.match(timeline, /renderTimelineFoldFrame/);
  assert.match(timeline, /is-journey-folded/);
  assert.match(timeline, /getFoldScrollLimit/);
  assert.match(timeline, /lenis\.scrollTo\(target, \{ immediate: true, force: true \}\)/);
  assert.doesNotMatch(timeline, /lenis\.setScroll\?\./);
  assert.match(timeline, /scroll-behavior', 'auto', 'important'/);
  assert.match(timeline, /freezeJourneyPresentation\(\);\s+useInstantNativeScroll\(\);/);
  // The auto-fold never writes its own tilt/depth: the perspective is only
  // ever the native scroll-linked animation, resumed on the visitor's next
  // manual scroll (see retainFoldedPresentationUntilIntent).
  assert.doesNotMatch(timeline, /applyFoldPerspective|foldPerspectiveProgress|FOLD_COMPACT_PHASE_RATIO|SHEET_FOLD_TILT_MAX_DEG|SHEET_FOLD_DEPTH_MAX_PX/);
  assert.match(timeline, /const eased = foldEase\(progress\);/);
  assert.match(timeline, /renderTimelineFoldFrame\(plan, eased\);\s+const expectedScroll = applyControlCeiling\(plan, startScroll, eased\);/);
  assert.match(timeline, /syncLenisAfterLayout\(plan\.targetScroll\);/);
  assert.match(timeline, /journeyfolddebugstart/);
  assert.match(timeline, /journeyfolddebugend/);
  assert.match(geometry, /export function getCollapseFrame/);
  assert.match(geometry, /export function getFoldScrollLimit/);
  assert.match(geometry, /finalMaxScroll/);
  assert.doesNotMatch(timeline + components, /foldReservation|setJourneySurfaceHold|timeline-fold-reservation/);
  assert.doesNotMatch(layout, /--journey-fold-contact-shift/);
  assert.match(layout, /is-journey-folded:not\(\.is-admin\) #contact/);
  assert.match(layout, /--journey-fold-sheet-transform/);
  assert.match(layout, /--journey-paper-layer: 6/);
  assert.match(layout, /--contact-paper-layer: 7/);
  assert.match(layout, /#contact \{\s+position: relative;\s+z-index: var\(--contact-paper-layer\);[\s\S]*background-image: var\(--paper-grain\);[\s\S]*overflow: clip;[\s\S]*box-shadow: 0 -28px 68px rgba\(19, 19, 19, 0\.16\);/);
  assert.doesNotMatch(layout, /#contact \{[\s\S]{0,400}border-top/);
  assert.match(layout, /--contact-fold-entry-transform/);
  assert.match(layout, /transform: var\(--contact-sheet-transform, none\);/);
  assert.match(layout, /transform-origin: 50% calc\(100% \+ var\(--contact-footer-depth, 0px\)\);/);
  assert.doesNotMatch(layout, /view-timeline-name: --contact-chapter;/);
  assert.doesNotMatch(layout, /--journey-contact-hold/);
  assert.doesNotMatch(layout, /padding-bottom: var\(--journey-contact-hold\)/);
  assert.match(layout, /--journey-contact-control-gap: 24px;/);
  assert.match(layout, /section--journey \{\s+\/\* The timeline control is Journey's real lower edge[\s\S]{0,300}padding-bottom: var\(--journey-contact-control-gap\);/);
  assert.match(layout, /--journey-contact-underlay-depth: clamp\(420px, 72svh, 820px\);/);
  assert.match(layout, /section--journey::after \{[\s\S]{0,300}height: calc\(100% \+ var\(--journey-contact-underlay-depth\)\);/);
  assert.match(layout, /section--journey \{[\s\S]{0,500}background-color: transparent;[\s\S]{0,300}border-bottom: 0;/);
  assert.match(layout, /#contact \{\s+\/\* Contact must not cover the timeline control:[\s\S]{0,400}margin-top: 0;/);
  assert.doesNotMatch(layout, /journey-layout__timeline-catch|journey-hold-spacer/);
  assert.match(components, /\.timeline-expand\.is-folding/);
  assert.match(timeline, /control\.setAttribute\('aria-busy', String\(isFolding\)\)/);
  assert.doesNotMatch(timeline + components, /timeline-fold-progress/);
  assert.doesNotMatch(timeline, /cloneNode\(|position: fixed/);
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
