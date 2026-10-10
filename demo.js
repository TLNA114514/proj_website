(() => {
  "use strict";
  const clips = window.EGOFACT_CLIPS || [];
  const root = document.querySelector("#demo");
  if (!root || !clips.length) return;
  const q = (selector) => root.querySelector(selector);
  const strip = q("#clip-strip");
  const stage = q("#demo-stage");
  const play = q("#demo-play");
  const timeline = q("#demo-timeline");
  const speed = q("#demo-speed");
  const status = q("#demo-status");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const kinds = ["rgb", "tactile", "contact"];
  // Reuse decoded players for recent clips instead of recreating them on every click.
  const cache = new Map();
  const connection = navigator.connection;
  const allowPreload =
    !connection?.saveData && !/2g|3g/.test(connection?.effectiveType || "");
  let carousel;
  let selectedEntry;
  let presentedEntry;
  let exitingEntry;
  let warmTimer = 0;
  let transitionTimer = 0;
  let videos = [];
  let selected;
  let epoch = 0;
  let playing = false;
  let wantsPlay = false;
  let starting = false;
  let failed = false;
  let animation = 0;
  let resumeAfterSeek = false;
  let scrubbing = false;
  let duration = 0;

  function setStatus(message) {
    if (status.textContent !== message) status.textContent = message;
  }
  function setButton() {
    q("[data-play-icon]").textContent = wantsPlay ? "Ⅱ" : "▶";
    q("[data-play-text]").textContent = failed
      ? "Retry"
      : wantsPlay
        ? "Pause"
        : "Play";
    play.setAttribute(
      "aria-label",
      failed
        ? "Retry loading videos"
        : wantsPlay
          ? "Pause all videos"
          : "Play all videos",
    );
  }
  function showTime(time) {
    timeline.value = Math.min(time, Number(timeline.max));
    timeline.setAttribute(
      "aria-valuetext",
      `${time.toFixed(2)} of ${duration.toFixed(2)} seconds`,
    );
    q("#demo-time").textContent =
      `${time.toFixed(2)} / ${duration.toFixed(2)} s`;
    timeline.style.setProperty(
      "--played",
      `${duration ? (time / duration) * 100 : 0}%`,
    );
  }
  function halt() {
    playing = false;
    cancelAnimationFrame(animation);
    videos.forEach((video) => video.pause());
  }
  function pause() {
    wantsPlay = false;
    resumeAfterSeek = false;
    halt();
    setButton();
    if (!failed) setStatus("Drag the timeline to explore");
  }
  function seek(time) {
    const target = Math.max(
      0,
      Math.min(time, (selected.frames - 1) / selected.fps),
    );
    videos.forEach((video) => {
      if (video.readyState >= 1) video.currentTime = target;
    });
    showTime(target);
  }
  function tick() {
    if (!playing) return;
    const master = videos[0];
    // Keep the three native players within a frame under ordinary playback.
    videos.slice(1).forEach((video) => {
      if (
        !video.seeking &&
        Math.abs(video.currentTime - master.currentTime) > 0.06
      )
        video.currentTime = master.currentTime;
    });
    if (!scrubbing) showTime(master.currentTime);
    animation = requestAnimationFrame(tick);
  }
  function usable() {
    return (
      videos.length === 3 &&
      videos.every((video) => video.readyState >= 3 && !video.seeking)
    );
  }
  async function start() {
    if (failed || starting || playing || scrubbing || !wantsPlay || !usable())
      return;
    const currentEpoch = epoch;
    const currentVideos = videos;
    starting = true;
    setStatus("Starting playback…");
    try {
      await Promise.all(currentVideos.map((video) => video.play()));
      if (currentEpoch !== epoch) {
        currentVideos.forEach((video) => {
          if (!videos.includes(video)) video.pause();
        });
        return;
      }
      if (!wantsPlay || scrubbing) {
        halt();
        return;
      }
      playing = true;
      setLoading(false);
      setStatus("Synchronized playback");
      tick();
    } catch (error) {
      if (currentEpoch !== epoch) return;
      pause();
      setStatus(
        error.name === "NotAllowedError"
          ? "Press Play to start the videos"
          : "Playback paused. Press Play to continue.",
      );
    } finally {
      if (currentEpoch === epoch) starting = false;
    }
  }
  function ready() {
    if (failed) return;
    const metadataReady = videos.every((video) => video.readyState >= 1);
    if (metadataReady) {
      duration = Math.min(
        selected.duration,
        ...videos.map((video) => video.duration),
      );
      timeline.max = Math.max(
        0,
        Math.min(
          duration - 1 / selected.fps,
          (selected.frames - 1) / selected.fps,
        ),
      );
      timeline.disabled = false;
      play.disabled = false;
    }
    if (!usable()) return;
    setLoading(false);
    selectedEntry.layers.forEach((layer) => layer.classList.add("is-ready"));
    present(selectedEntry);
    scheduleNext();
    if (wantsPlay) start();
    else setStatus("Drag the timeline to explore");
  }
  function setLoading(loading) {
    stage.setAttribute("aria-busy", String(loading));
    stage.dataset.loading = String(loading);
    [...strip.children].forEach((button) => {
      button.dataset.loading = String(
        loading && button.dataset.clip === selected?.id,
      );
    });
  }
  function dispose(entry) {
    entry.videos.forEach((video) => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    });
    entry.layers.forEach((layer) => layer.remove());
  }
  function trimCache() {
    for (const [id, entry] of cache) {
      if (cache.size <= 3) break;
      if (
        entry === selectedEntry ||
        entry === presentedEntry ||
        entry === exitingEntry
      )
        continue;
      cache.delete(id);
      dispose(entry);
    }
  }
  function present(entry) {
    if (entry !== selectedEntry || entry === presentedEntry) return;
    const previous = presentedEntry;
    clearTimeout(transitionTimer);
    if (exitingEntry && exitingEntry !== presentedEntry) {
      exitingEntry.layers.forEach((layer) =>
        layer.classList.remove("is-previous"),
      );
      if (cache.get(exitingEntry.clip.id) !== exitingEntry)
        dispose(exitingEntry);
    }
    exitingEntry = previous;
    cache.forEach((item) =>
      item.layers.forEach((layer) => layer.classList.remove("is-previous")),
    );
    // Keep the outgoing frame opaque under the incoming view: no blank flashes.
    if (previous)
      previous.layers.forEach((layer) => {
        layer.classList.add("is-previous");
        layer.classList.remove("is-current");
      });
    void stage.offsetWidth;
    entry.layers.forEach((layer) => layer.classList.add("is-current"));
    presentedEntry = entry;
    root.querySelectorAll("[data-hand-labels]").forEach((labels) => {
      labels.innerHTML =
        entry.clip.hands === "Both hands"
          ? "<span>Left hand</span><span>Right hand</span>"
          : "<span>Hand</span>";
    });
    transitionTimer = setTimeout(
      () => {
        if (previous && previous !== presentedEntry) {
          previous.layers.forEach((layer) =>
            layer.classList.remove("is-previous"),
          );
          if (cache.get(previous.clip.id) !== previous) dispose(previous);
        }
        if (exitingEntry === previous) exitingEntry = undefined;
        trimCache();
      },
      reducedMotion.matches ? 0 : 500,
    );
  }
  function getEntry(clip) {
    if (cache.get(clip.id)?.failed) {
      const broken = cache.get(clip.id);
      cache.delete(clip.id);
      if (broken !== presentedEntry) dispose(broken);
    }
    if (cache.has(clip.id)) {
      const entry = cache.get(clip.id);
      cache.delete(clip.id);
      cache.set(clip.id, entry);
      return entry;
    }
    const entry = {
      clip,
      layers: [],
      videos: [],
      postersReady: false,
      mounted: false,
    };
    const posters = [];
    kinds.forEach((kind) => {
      const layer = document.createElement("div");
      layer.className = "demo-layer";
      layer.dataset.clip = clip.id;
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.poster = `${clip.base}${kind}.webp`;
      video.setAttribute(
        "aria-label",
        `${clip.label}: ${kind === "rgb" ? "input video" : kind + " prediction"}`,
      );
      const poster = document.createElement("img");
      poster.className = "demo-poster";
      poster.alt = "";
      poster.setAttribute("aria-hidden", "true");
      poster.src = video.poster;
      layer.append(video, poster);
      entry.layers.push(layer);
      entry.videos.push(video);
      posters.push(poster.decode ? poster.decode() : Promise.resolve());
      const active = (callback) => () => {
        if (entry === selectedEntry) callback();
      };
      for (const event of ["loadedmetadata", "canplay", "seeked"])
        video.addEventListener(event, active(ready));
      for (const event of ["progress", "canplaythrough"])
        video.addEventListener(event, active(scheduleNext));
      video.addEventListener(
        "waiting",
        active(() => {
          if (!playing || scrubbing) return;
          const time = videos[0].currentTime;
          halt();
          setLoading(true);
          setStatus("Buffering videos…");
          seek(time);
        }),
      );
      video.addEventListener(
        "ended",
        active(() => {
          if (!wantsPlay || scrubbing) return;
          halt();
          seek(0);
          ready();
        }),
      );
      video.addEventListener("error", () => {
        entry.failed = true;
        if (entry !== selectedEntry) return;
        pause();
        failed = true;
        play.disabled = false;
        timeline.disabled = true;
        setLoading(false);
        setButton();
        setStatus("This video could not load. Retry to reconnect.");
      });
      video.src = `${clip.base}${kind}${clip.playbackSuffix || ""}.mp4`;
    });
    cache.set(clip.id, entry);
    Promise.all(posters)
      .then(() => {
        entry.postersReady = true;
        present(entry);
      })
      .catch(() => {
        // If a poster fails, preserve the old view until the video itself is ready.
        if (entry === selectedEntry) ready();
      });
    return entry;
  }
  function warm(clip) {
    if (!allowPreload || document.hidden || !clip.ready || clip === selected)
      return;
    getEntry(clip);
    trimCache();
  }
  function scheduleNext() {
    if (
      !allowPreload ||
      warmTimer ||
      document.hidden ||
      !selected ||
      !videos.length
    )
      return;
    // Background traffic starts only after all current tracks are fully buffered.
    if (
      !videos.every(
        (video) =>
          video.buffered.length &&
          video.buffered.end(video.buffered.length - 1) >= video.duration - 0.1,
      )
    )
      return;
    const next = clips[(clips.indexOf(selected) + 1) % clips.length];
    if (!next?.ready || cache.has(next.id)) return;
    warmTimer = setTimeout(() => {
      warmTimer = 0;
      warm(next);
    }, 900);
  }
  function choose(clip, focus = false) {
    if (!clip.ready || (clip === selected && !failed)) return;
    const continuePlaying = wantsPlay;
    const retry = failed && clip === selected;
    epoch += 1;
    clearTimeout(warmTimer);
    warmTimer = 0;
    pause();
    if (retry) cache.delete(clip.id);
    selected = clip;
    selectedEntry = getEntry(clip);
    failed = false;
    starting = false;
    scrubbing = false;
    resumeAfterSeek = false;
    wantsPlay = continuePlaying;
    duration = clip.duration;
    play.disabled = false;
    timeline.disabled = true;
    timeline.max = (clip.frames - 1) / clip.fps;
    timeline.step = 1 / clip.fps;
    stage.dataset.clip = clip.id;
    showTime(0);
    q("#demo-current").textContent = clip.label;
    [...strip.children].forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.clip === clip.id),
      );
    });
    carousel?.set(clips.indexOf(clip));
    videos = selectedEntry.videos;
    videos.forEach((video) => {
      video.playbackRate = Number(speed.value);
      if (video.readyState >= 1 && video.currentTime !== 0)
        video.currentTime = 0;
    });
    if (!selectedEntry.mounted) {
      selectedEntry.layers.forEach((layer, index) =>
        q(`[data-video-slot="${kinds[index]}"]`).append(layer),
      );
      selectedEntry.mounted = true;
    }
    selectedEntry.layers.forEach((layer) =>
      layer.classList.toggle("is-ready", usable()),
    );
    setLoading(!usable());
    setStatus("Loading videos…");
    if (selectedEntry.postersReady || usable()) present(selectedEntry);
    setButton();
    ready();
    trimCache();
    if (focus)
      strip
        .querySelector(`[data-clip="${clip.id}"]`)
        .focus({ preventScroll: true });
  }

  clips.forEach((clip) => {
    const button = document.createElement("button");
    button.className = "clip-card";
    button.dataset.clip = clip.id;
    button.setAttribute("aria-label", clip.label);
    button.setAttribute("aria-pressed", "false");
    button.disabled = !clip.ready;
    if (clip.ready) {
      const image = document.createElement("img");
      image.src = `${clip.base}rgb.webp`;
      image.alt = "";
      image.width = 240;
      image.height = 135;
      button.append(image);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "clip-placeholder";
      placeholder.textContent = "Video coming soon";
      button.append(placeholder);
    }
    const label = document.createElement("span");
    label.className = "clip-name";
    label.textContent = clip.label;
    button.append(label);
    button.addEventListener("pointerenter", () => warm(clip));
    button.addEventListener("focus", () => warm(clip));
    strip.append(button);
  });
  carousel = window.EgoCarousel({
    strip,
    previous: q("#clip-previous"),
    next: q("#clip-next"),
    onSelect: (index) => choose(clips[index]),
    initial: Math.max(
      0,
      clips.findIndex((clip) => clip.ready),
    ),
  });
  play.addEventListener("click", () => {
    if (failed) {
      choose(selected);
      return;
    }
    if (wantsPlay) {
      pause();
      return;
    }
    wantsPlay = true;
    setButton();
    if (!usable()) setStatus("Buffering videos…");
    start();
  });
  timeline.addEventListener("input", () => {
    if (!scrubbing) {
      resumeAfterSeek = wantsPlay;
      scrubbing = true;
      halt();
    }
    seek(Number(timeline.value));
  });
  function finishSeek() {
    if (!scrubbing) return;
    scrubbing = false;
    wantsPlay = resumeAfterSeek;
    setButton();
    ready();
  }
  timeline.addEventListener("change", finishSeek);
  timeline.addEventListener("blur", finishSeek);
  timeline.addEventListener("pointercancel", finishSeek);
  speed.addEventListener("change", () =>
    videos.forEach((video) => {
      video.playbackRate = Number(speed.value);
    }),
  );
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearTimeout(warmTimer);
      warmTimer = 0;
      pause();
    }
  });
  window.addEventListener("pagehide", pause);
  choose(clips.find((clip) => clip.ready) || clips[0]);
})();
