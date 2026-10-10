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
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle: (name, active) =>
        active ? classes.add(name) : classes.delete(name),
    };
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
    if (name === "keydown" && this.parent) this.parent.emit(name, event);
  }
  setAttribute(key, value) {
    this.attributes[key] = value;
  }
  append(...children) {
    this.children.push(...children);
    children.forEach((child) => {
      child.parent = this;
    });
  }
  removeAttribute(key) {
    delete this.attributes[key];
    if (key === "src") this.src = "";
  }
  remove() {
    if (this.parent)
      this.parent.children = this.parent.children.filter(
        (child) => child !== this,
      );
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
    this.buffered = { length: 0, end: () => this.duration };
  }
  pause() {
    this.paused = true;
  }
  load() {}
  play() {
    this.paused = false;
    return this.promise || Promise.resolve();
  }
}
function fixture({
  connection = { effectiveType: "4g" },
  extraClips = false,
} = {}) {
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
  const createdVideos = [];
  document.createElement = (name) => {
    if (name !== "video") return new Element();
    const video = new Video();
    createdVideos.push(video);
    return video;
  };
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
  if (extraClips)
    for (let n = 2; n < 5; n += 1)
      window.EGOFACT_CLIPS.push({
        ...window.EGOFACT_CLIPS[0],
        id: `extra${n}`,
        label: `Extra ${n}`,
        base: `extra${n}/`,
      });
  const frames = new Map();
  let frame = 0;
  const timers = new Map();
  let timer = 0;
  vm.runInNewContext(
    fs.readFileSync(
      require("node:path").join(__dirname, "../carousel.js"),
      "utf8",
    ) +
      "\n" +
      script,
    {
      performance: { now: () => 0 },
      window,
      document,
      navigator: { connection },
      setTimeout: (callback, delay) => {
        timers.set(++timer, { callback, delay });
        return timer;
      },
      clearTimeout: (id) => timers.delete(id),
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: (fn) => {
        frames.set(++frame, fn);
        return frame;
      },
      cancelAnimationFrame: (id) => frames.delete(id),
    },
  );
  const videos = () =>
    ["rgb", "tactile", "contact"].map(
      (kind) =>
        q(`[data-video-slot="${kind}"]`)
          .children.filter(
            (layer) => layer.dataset.clip === q("#demo-stage").dataset.clip,
          )
          .at(-1).children[0],
    );
  function load() {
    videos().forEach((v) => {
      v.readyState = 4;
    });
    videos().forEach((v) => v.emit("canplay"));
  }
  function runTimers(delay) {
    [...timers].forEach(([id, item]) => {
      if (item.delay === delay) {
        timers.delete(id);
        item.callback();
      }
    });
  }
  return { q, videos, load, document, frames, createdVideos, runTimers };
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

test("returning to a recent clip reuses its players and preserves playback intent", async () => {
  const f = fixture();
  f.load();
  const first = f.videos();
  f.q("#demo-play").emit("click");
  await settle();
  f.q("#clip-strip").children[1].emit("click");
  f.load();
  await settle();
  assert.ok(f.videos().every((video) => !video.paused));
  f.q("#clip-strip").children[0].emit("click");
  await settle();
  assert.deepEqual(f.videos(), first);
  assert.ok(first.every((video) => !video.paused));
  assert.equal(f.createdVideos.length, 6);
});

test("selecting the current card leaves its timeline and playback untouched", async () => {
  const f = fixture();
  f.load();
  f.q("#demo-play").emit("click");
  await settle();
  f.videos().forEach((video) => {
    video.currentTime = 2;
  });
  f.q("#clip-strip").children[0].emit("click");
  assert.ok(
    f.videos().every((video) => !video.paused && video.currentTime === 2),
  );
  assert.equal(f.createdVideos.length, 3);
});

test("hover prepares the next clip without replacing the visible clip", async () => {
  const f = fixture();
  f.load();
  const current = f.videos();
  f.q("#clip-strip").children[1].emit("pointerenter");
  const prepared = f.createdVideos.slice(3);
  assert.equal(prepared.length, 3);
  prepared.forEach((video) => {
    video.readyState = 4;
    video.emit("canplay");
  });
  assert.deepEqual(f.videos(), current);
  f.q("#clip-strip").children[1].emit("click");
  await settle();
  assert.deepEqual(f.videos(), prepared);
  assert.equal(f.q("#demo-stage").attributes["aria-busy"], "false");
});

test("background preloading waits for the current clip to finish buffering", () => {
  const f = fixture();
  f.load();
  f.runTimers(900);
  assert.equal(f.createdVideos.length, 3);
  f.videos().forEach((video) => {
    video.buffered.length = 1;
  });
  f.videos()[0].emit("progress");
  f.runTimers(900);
  assert.equal(f.createdVideos.length, 6);
});

test("save-data and slow connections skip speculative preloading", () => {
  for (const connection of [{ saveData: true }, { effectiveType: "3g" }]) {
    const f = fixture({ connection });
    f.load();
    f.q("#clip-strip").children[1].emit("pointerenter");
    f.videos().forEach((video) => {
      video.buffered.length = 1;
    });
    f.videos()[0].emit("progress");
    f.runTimers(900);
    assert.equal(f.createdVideos.length, 3);
    f.q("#clip-strip").children[1].emit("click");
    assert.equal(f.createdVideos.length, 6);
  }
});

test("failed speculative loads are rebuilt when the user selects them", () => {
  const f = fixture();
  f.load();
  f.q("#clip-strip").children[1].emit("pointerenter");
  const broken = f.createdVideos[3];
  broken.emit("error");
  assert.equal(f.q("[data-play-text]").textContent, "Play");
  f.q("#clip-strip").children[1].emit("click");
  f.load();
  assert.notEqual(f.videos()[0], broken);
  assert.equal(f.q("#demo-timeline").disabled, false);
});

test("rapid A-to-B-to-A switching cannot let an old promise pause reused players", async () => {
  const f = fixture();
  f.load();
  let resolve;
  f.videos()[0].promise = new Promise((done) => {
    resolve = done;
  });
  f.q("#demo-play").emit("click");
  f.q("#clip-strip").children[1].emit("click");
  f.load();
  await settle();
  f.q("#clip-strip").children[0].emit("click");
  resolve();
  await settle();
  assert.ok(f.videos().every((video) => !video.paused));
  assert.equal(f.q("#demo-status").textContent, "Synchronized playback");
});

test("cache eviction keeps outgoing frames until their crossfade ends", async () => {
  const f = fixture({ extraClips: true });
  f.load();
  await settle();
  const outgoing = f.videos();
  f.q("#clip-strip").children[1].emit("click");
  f.load();
  await settle();
  const cards = f.q("#clip-strip").children;
  cards[3].emit("pointerenter");
  cards[4].emit("pointerenter");
  cards[5].emit("pointerenter");
  assert.ok(outgoing.every((video) => video.src.startsWith("wood/")));
  assert.ok(f.createdVideos.filter((video) => video.src).length <= 9);
  f.runTimers(500);
  cards[3].emit("pointerenter");
  assert.ok(f.createdVideos.filter((video) => video.src).length <= 9);
});

test("a retried player is released even if another switch interrupts its fade", async () => {
  const f = fixture();
  f.load();
  await settle();
  const original = f.videos();
  original[0].emit("error");
  f.q("#demo-play").emit("click");
  f.load();
  await settle();
  f.q("#clip-strip").children[1].emit("click");
  f.load();
  await settle();
  assert.ok(original.every((video) => video.src === ""));
});
