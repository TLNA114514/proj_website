const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function fixture({ count = 5, disabled = [], reduced = false } = {}) {
  const element = () => ({
    children: [],
    listeners: {},
    attributes: {},
    style: {},
    clientWidth: 700,
    classList: { add() {}, remove() {} },
    addEventListener(type, cb) {
      (this.listeners[type] ||= []).push(cb);
    },
    emit(type, event = {}) {
      (this.listeners[type] || []).forEach((cb) => cb(event));
    },
    setAttribute(key, value) {
      this.attributes[key] = value;
    },
    setPointerCapture() {},
    focus() {
      this.focused = true;
    },
  });
  const strip = element(),
    previous = element(),
    next = element(),
    window = element();
  const cards = (strip.children = Array.from({ length: count }, (_, i) => ({
    ...element(),
    disabled: disabled.includes(i),
  })));
  const selected = [];
  const frames = new Map(),
    timers = [];
  let now = 0,
    id = 0;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../carousel.js"), "utf8"),
    {
      window,
      matchMedia: () => ({ matches: reduced }),
      performance: { now: () => now },
      requestAnimationFrame: (cb) => {
        frames.set(++id, cb);
        return id;
      },
      cancelAnimationFrame: (key) => frames.delete(key),
      setTimeout: (cb) => timers.push(cb),
    },
  );
  window.EgoCarousel({
    strip,
    previous,
    next,
    onSelect: (index) => selected.push(index),
  });
  function settle() {
    now += 600;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((cb) => cb(now));
  }
  return { cards, strip, previous, next, selected, settle, frames, timers };
}
test("arrows wrap in both directions and keep one centered, keyboard-focusable card", () => {
  const f = fixture();
  f.previous.emit("click");
  f.settle();
  assert.equal(f.selected.at(-1), 4);
  assert.match(f.cards[4].style.transform, /translateX\(0px\)/);
  assert.equal(f.cards[4].style.opacity, "1");
  assert.equal(f.cards.filter((c) => c.tabIndex === 0).length, 1);
  assert.ok(
    Number(f.cards[1].style.opacity) < Number(f.cards[0].style.opacity),
  );
  f.next.emit("click");
  f.settle();
  assert.equal(f.selected.at(-1), 0);
});
test("rapid selections settle on the latest target without stale animation frames", () => {
  const f = fixture();
  f.next.emit("click");
  f.next.emit("click");
  f.previous.emit("click");
  f.settle();
  assert.equal(f.selected.at(-1), 1);
  assert.match(f.cards[1].style.transform, /translateX\(0px\)/);
  assert.equal(f.frames.size, 0);
});
test("keyboard navigation skips unavailable entries and moves focus", () => {
  const f = fixture({ disabled: [1, 4] });
  f.strip.emit("keydown", { key: "ArrowRight", preventDefault() {} });
  f.settle();
  assert.equal(f.selected.at(-1), 2);
  assert.equal(f.cards[2].focused, true);
  f.strip.emit("keydown", { key: "End", preventDefault() {} });
  assert.equal(f.selected.at(-1), 3);
});
test("horizontal swipes snap and suppress their synthetic click; vertical swipes scroll", () => {
  const f = fixture({ count: 3 });
  f.strip.emit("pointerdown", {
    button: 0,
    clientX: 220,
    clientY: 10,
    pointerId: 1,
  });
  f.strip.emit("pointermove", { clientX: 50, clientY: 12, pointerId: 1 });
  f.strip.emit("pointerup", { type: "pointerup", pointerId: 1 });
  f.cards[0].emit("click");
  f.settle();
  assert.equal(f.selected.at(-1), 1);
  f.timers.forEach((cb) => cb());
  f.cards[0].emit("click");
  assert.equal(f.selected.at(-1), 0);
  f.strip.emit("pointerdown", {
    button: 0,
    clientX: 220,
    clientY: 10,
    pointerId: 2,
  });
  f.strip.emit("pointermove", { clientX: 218, clientY: 70, pointerId: 2 });
  f.strip.emit("pointerup", { type: "pointerup", pointerId: 2 });
  assert.equal(f.selected.at(-1), 0);
});
test("reduced-motion selection changes immediately without animation", () => {
  const f = fixture({ reduced: true });
  f.next.emit("click");
  assert.equal(f.frames.size, 0);
  assert.match(f.cards[1].style.transform, /translateX\(0px\)/);
});
