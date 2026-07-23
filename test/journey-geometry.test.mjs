import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCollapseFrame,
  getCollapsePlan,
  getFoldScrollLimit,
} from '../js/features/journey/timeline-geometry.js';
import {
  COMPACT_ROLE_COUNT,
  getFadingRoleIndex,
  getNextVisibleCount,
  getTimelineControlLabel,
} from '../js/features/journey/timeline-state.js';

const rect = ({ top, bottom, height = bottom - top }) => ({ top, bottom, height });

test('compact fold anchors the existing control near mid-viewport, not a Journey section boundary', () => {
  const originalWindow = globalThis.window;
  globalThis.window = { scrollY: 4000, innerHeight: 900 };

  const plan = getCollapsePlan({
    list: { getBoundingClientRect: () => rect({ top: 80, bottom: 2280 }) },
    compactLastItem: { getBoundingClientRect: () => rect({ top: 480, bottom: 760 }) },
    control: { getBoundingClientRect: () => rect({ top: 2300, bottom: 2342 }) },
  });

  assert.deepEqual(plan, {
    expandedHeight: 2200,
    compactHeight: 680,
    heightDelta: 1520,
    controlDocumentBottom: 6342,
    desiredControlBottom: 432,
    // control final document bottom: 4000 + 2342 - 1520 = 4822;
    // desired viewport position: 900 * 0.48 = 432 → 4822 - 432 = 4390.
    // document is undefined under node, so the maxScroll clamp is a no-op here.
    targetScroll: 4390,
  });
  globalThis.window = originalWindow;
});

test('each animated frame reserves released height and limits the control at its compact anchor', () => {
  const plan = {
    expandedHeight: 2200,
    compactHeight: 680,
    heightDelta: 1520,
    // The control starts at 600px in a viewport whose compact anchor is 432px.
    controlDocumentBottom: 4600,
    desiredControlBottom: 432,
    targetScroll: 2648,
  };
  const startScroll = 4000;

  const start = getCollapseFrame(plan, 0);
  const middle = getCollapseFrame(plan, 0.5);
  const end = getCollapseFrame(plan, 1);

  assert.equal(start.listHeight + start.reservedHeight, plan.expandedHeight);
  assert.equal(middle.listHeight + middle.reservedHeight, plan.expandedHeight);
  assert.equal(end.listHeight + end.reservedHeight, plan.expandedHeight);
  assert.deepEqual(end, { listHeight: 680, reservedHeight: 1520 });

  // The page does not scroll until the shrinking control reaches the anchor.
  assert.equal(getFoldScrollLimit({ plan, startScroll, reservedHeight: 167 }), 4000);
  assert.equal(getFoldScrollLimit({ plan, startScroll, reservedHeight: 168 }), 4000);
  // From that exact point, the ceiling follows the control to its final y.
  assert.equal(getFoldScrollLimit({ plan, startScroll, reservedHeight: 700 }), 3468);
  assert.equal(getFoldScrollLimit({ plan, startScroll, reservedHeight: 1520 }), plan.targetScroll);

  for (const reservedHeight of [0, 168, 700, 1520]) {
    const scroll = getFoldScrollLimit({ plan, startScroll, reservedHeight });
    const controlBottomInViewport = plan.controlDocumentBottom - reservedHeight - scroll;
    assert.ok(controlBottomInViewport >= plan.desiredControlBottom);
  }
});

test('an explicit viewport ratio overrides the default anchor', () => {
  const originalWindow = globalThis.window;
  globalThis.window = { scrollY: 4000, innerHeight: 900 };

  const plan = getCollapsePlan({
    list: { getBoundingClientRect: () => rect({ top: 80, bottom: 2280 }) },
    compactLastItem: { getBoundingClientRect: () => rect({ top: 480, bottom: 760 }) },
    control: { getBoundingClientRect: () => rect({ top: 2300, bottom: 2342 }) },
    viewportRatio: 0.5,
  });

  // 4822 - 900 * 0.5 = 4372.
  assert.equal(plan.targetScroll, 4372);
  globalThis.window = originalWindow;
});

test('timeline state exposes only compact roles initially and reveals in batches', () => {
  assert.equal(COMPACT_ROLE_COUNT, 3);
  assert.equal(getNextVisibleCount(3, 8), 6);
  assert.equal(getNextVisibleCount(6, 8), 8);
  assert.equal(getTimelineControlLabel(3, 8), 'Earlier timeline ↓');
  assert.equal(getTimelineControlLabel(6, 8), 'Another life ↓');
  assert.equal(getTimelineControlLabel(8, 8), 'Recent only ↑');
  assert.equal(getTimelineControlLabel(8, 8, true), 'compacting life');
  assert.equal(getFadingRoleIndex(3, 8), 2);
  assert.equal(getFadingRoleIndex(8, 8), -1);
});
