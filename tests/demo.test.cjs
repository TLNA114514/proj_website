const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const script = fs.readFileSync(
  require("node:path").join(__dirname, "../demo.js"),
  "utf8",
);

class Element {
  constructor() {
    this.listeners = {};
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.style = { setProperty() {} };
    this.value = "1";
    this.clientWidth = 500;
    this.scrollWidth = 1000;
    this.scrollLeft = 0;
  }
  addEventListener(name, callback) {
    (this.listeners[name] ||= []).push(callback);
  }
  emit(name, event = {}) {
    for (const callback of this.listeners[name] || []) callback(event);
  }
  setAttribute(key, value) {
    this.attributes[key] = value;
  }
  append(child) {
    this.children.push(child);
  }
  replaceChildren(child) {
    this.children = [child];
  }
  focus() {}
  scrollIntoView() {}
  scrollBy() {}
}
class Video extends Element {
  constructor() {
    super();
    this.readyState = 0;
    this.currentTime = 0;
    this.duration = 5;
    this.paused = true;
    this.seeking = false;
  }
  pause() {
    this.paused = true;
  }
  play() {
    this.paused = false;
    return this.promise || Promise.resolve();
  }
}
function fixture() {
  const elements = new Map();
  const q = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  const root = q("#demo");
  root.querySelector = q;
  root.querySelectorAll = () => [new Element(), new Element()];
  q("#clip-strip").querySelector = (selector) =>
    q("#clip-strip").children.find((el) => selector.includes(el.dataset.clip));
  const document = new Element();
  document.querySelector = q;
  document.createElement = (name) =>
    name === "video" ? new Video() : new Element();
  const window = new Element();
  window.EGOFACT_CLIPS = [
    {
      id: "wood",
      label: "Wood",
      hands: "Both hands",
      fps: 30,
      frames: 150,
      duration: 5,
      ready: true,
      base: "wood/",
    },
    {
      id: "single",
      label: "Single",
      hands: "Single hand",
      fps: 30,
      frames: 90,
      duration: 3,
      ready: true,
      base: "single/",
    },
    { id: "pending", label: "Pending", ready: false },
  ];
  const frames = new Map();
  let frame = 0;
  vm.runInNewContext(script, {
    window,
    document,
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (fn) => {
      frames.set(++frame, fn);
      return frame;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  const videos = () =>
    ["rgb", "tactile", "contact"].map(
      (kind) => q(`[data-video-slot="${kind}"]`).children[0],
    );
  function load() {
    videos().forEach((v) => {
      v.readyState = 4;
    });
    videos().forEach((v) => v.emit("canplay"));
  }
  return { q, videos, load, document, frames };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("all tracks start and pause, and paused scrubbing seeks every track", async () => {
  const f = fixture();
  f.load();
  f.q("#demo-play").emit("click");
  await settle();
  assert.ok(f.videos().every((v) => !v.paused));
  f.q("#demo-play").emit("click");
  f.q("#demo-timeline").value = 2.5;
  f.q("#demo-timeline").emit("input");
  f.q("#demo-timeline").emit("change");
  assert.ok(f.videos().every((v) => v.paused && v.currentTime === 2.5));
});

test("clip selection cannot inherit or be stopped by a stale play promise", async () => {
  const f = fixture();
  f.load();
  const old = f.videos();
  let resolve;
  old[0].promise = new Promise((r) => {
    resolve = r;
  });
  f.q("#demo-play").emit("click");
  f.q("#clip-strip").children[1].emit("click");
  f.load();
  f.q("#demo-play").emit("click");
  await settle();
  resolve();
  await settle();
  assert.ok(old.every((v) => v.paused));
  assert.ok(
    f
      .videos()
      .every(
        (v) => !v.paused && v.currentTime === 0 && v.src.startsWith("single/"),
      ),
  );
  old[0].emit("error");
  assert.equal(f.q("#demo-status").textContent, "Synchronized playback");
});

test("buffering freezes all tracks, then resumes them together", async () => {
  const f = fixture();
  f.load();
  f.q("#demo-play").emit("click");
  await settle();
  f.videos()[0].currentTime = 1.5;
  f.videos()[1].readyState = 2;
  f.videos()[1].emit("waiting");
  assert.ok(f.videos().every((v) => v.paused && v.currentTime === 1.5));
  f.load();
  await settle();
  assert.ok(f.videos().every((v) => !v.paused));
});

test("looping resets every stream and seeking during playback resumes all streams", async () => {
  const f = fixture();
  f.load();
  f.q("#demo-play").emit("click");
  await settle();
  f.videos()[0].currentTime = 5;
  f.videos()[0].emit("ended");
  await settle();
  assert.ok(f.videos().every((v) => !v.paused && v.currentTime === 0));
  f.q("#demo-timeline").value = 4;
  f.q("#demo-timeline").emit("input");
  assert.ok(f.videos().every((v) => v.paused));
  f.q("#demo-timeline").emit("change");
  await settle();
  assert.ok(f.videos().every((v) => !v.paused && v.currentTime === 4));
});

test("load failures expose retry and rebuild the failed media", () => {
  const f = fixture();
  f.load();
  const old = f.videos();
  old[2].emit("error");
  assert.equal(f.q("[data-play-text]").textContent, "Retry");
  assert.equal(f.q("#demo-timeline").disabled, true);
  f.q("#demo-play").emit("click");
  f.load();
  assert.notEqual(f.videos()[2], old[2]);
  assert.equal(f.q("#demo-timeline").disabled, false);
});

test("hiding the page pauses it and does not resume an interrupted scrub", async () => {
  const f = fixture();
  f.load();
  f.q("#demo-play").emit("click");
  await settle();
  f.q("#demo-timeline").value = 1;
  f.q("#demo-timeline").emit("input");
  f.document.hidden = true;
  f.document.emit("visibilitychange");
  f.q("#demo-timeline").emit("change");
  await settle();
  assert.ok(f.videos().every((v) => v.paused));
});

test("keyboard clip selection skips unavailable clips and resets the timeline", () => {
  const f = fixture();
  f.load();
  f.q("#demo-timeline").value = 2;
  f.q("#demo-timeline").emit("input");
  f.q("#demo-timeline").emit("change");
  f.q("#clip-strip").children[0].emit("keydown", {
    key: "End",
    preventDefault() {},
  });
  assert.ok(
    f.videos().every((v) => v.currentTime === 0 && v.src.startsWith("single/")),
  );
  assert.equal(f.q("#clip-strip").children[2].disabled, true);
});
