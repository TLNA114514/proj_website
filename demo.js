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
        currentVideos.forEach((video) => video.pause());
        return;
      }
      if (!wantsPlay || scrubbing) {
        halt();
        return;
      }
      playing = true;
      stage.setAttribute("aria-busy", "false");
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
    stage.setAttribute("aria-busy", "false");
    if (wantsPlay) start();
    else setStatus("Drag the timeline to explore");
  }
  function choose(clip, focus = false) {
    if (!clip.ready) return;
    epoch += 1;
    const currentEpoch = epoch;
    pause();
    selected = clip;
    failed = false;
    starting = false;
    scrubbing = false;
    resumeAfterSeek = false;
    duration = clip.duration;
    play.disabled = true;
    timeline.disabled = true;
    timeline.max = (clip.frames - 1) / clip.fps;
    timeline.step = 1 / clip.fps;
    showTime(0);
    stage.setAttribute("aria-busy", "true");
    setStatus("Loading videos…");
    q("#demo-current").textContent = clip.label;
    [...strip.children].forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.clip === clip.id),
      );
    });
    root.querySelectorAll("[data-hand-labels]").forEach((labels) => {
      labels.innerHTML =
        clip.hands === "Both hands"
          ? "<span>Left hand</span><span>Right hand</span>"
          : "<span>Hand</span>";
    });
    videos = kinds.map((kind) => {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.poster = `${clip.base}${kind}.webp`;
      video.src = `${clip.base}${kind}.mp4`;
      video.playbackRate = Number(speed.value);
      video.setAttribute(
        "aria-label",
        `${clip.label}: ${kind === "rgb" ? "input video" : kind + " prediction"}`,
      );
      const active = (callback) => () => {
        if (currentEpoch === epoch) callback();
      };
      for (const event of ["loadedmetadata", "canplay", "seeked"])
        video.addEventListener(event, active(ready));
      video.addEventListener(
        "waiting",
        active(() => {
          if (!playing || scrubbing) return;
          const time = videos[0].currentTime;
          halt();
          stage.setAttribute("aria-busy", "true");
          setStatus("Buffering videos…");
          // Freeze every view at the same instant while a track catches up.
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
      video.addEventListener(
        "error",
        active(() => {
          pause();
          failed = true;
          play.disabled = false;
          timeline.disabled = true;
          stage.setAttribute("aria-busy", "false");
          setButton();
          setStatus("This video could not load. Retry to reconnect.");
        }),
      );
      q(`[data-video-slot="${kind}"]`).replaceChildren(video);
      return video;
    });
    setButton();
    if (focus)
      strip
        .querySelector(`[data-clip="${clip.id}"]`)
        .focus({ preventScroll: true });
  }

  clips.forEach((clip) => {
    const button = document.createElement("button");
    button.className = "clip-card";
    button.dataset.clip = clip.id;
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
    button.addEventListener("click", () => choose(clip));
    button.addEventListener("keydown", (event) => {
      const readyClips = clips.filter((item) => item.ready);
      const current = readyClips.indexOf(clip);
      let next;
      if (event.key === "ArrowRight") next = (current + 1) % readyClips.length;
      if (event.key === "ArrowLeft")
        next = (current - 1 + readyClips.length) % readyClips.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = readyClips.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      choose(readyClips[next], true);
      strip.children[clips.indexOf(readyClips[next])].scrollIntoView({
        behavior: reducedMotion.matches ? "instant" : "smooth",
        block: "nearest",
        inline: "nearest",
      });
    });
    strip.append(button);
  });
  function scrollStrip(direction) {
    strip.scrollBy({
      left: direction * strip.clientWidth * 0.7,
      behavior: reducedMotion.matches ? "instant" : "smooth",
    });
  }
  function scrollButtons() {
    q("#clip-previous").disabled = strip.scrollLeft <= 1;
    q("#clip-next").disabled =
      strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;
  }
  q("#clip-previous").addEventListener("click", () => scrollStrip(-1));
  q("#clip-next").addEventListener("click", () => scrollStrip(1));
  strip.addEventListener("scroll", scrollButtons, { passive: true });
  window.addEventListener("resize", scrollButtons, { passive: true });
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
    if (document.hidden) pause();
  });
  window.addEventListener("pagehide", pause);
  choose(clips.find((clip) => clip.ready) || clips[0]);
  scrollButtons();
})();
