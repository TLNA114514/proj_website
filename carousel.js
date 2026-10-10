(() => {
  "use strict";
  // A continuous circular position keeps wraparound cards moving behind the edges.
  window.EgoCarousel = function ({
    strip,
    previous,
    next,
    onSelect,
    initial = 0,
  }) {
    const cards = [...strip.children];
    const count = cards.length;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const wrap = (value) => ((value % count) + count) % count;
    const distance = (value) => wrap(value + count / 2) - count / 2;
    let selected = initial;
    let position = initial;
    let frame = 0;
    let drag;
    let suppressClick = false;
    const step = () => Math.min(180, Math.max(112, strip.clientWidth * 0.27));
    strip.classList.add("orbit-strip");
    strip.scrollLeft = 0;
    function paint() {
      cards.forEach((card, index) => {
        const d = distance(index - position);
        const depth = Math.abs(d);
        const edge = Math.min(1, Math.max(0, (count / 2 - depth) / 0.45));
        card.style.transform = `translate(-50%, -50%) translateX(${d * step()}px) scale(${1 - Math.min(depth, 2.5) * 0.11})`;
        card.style.opacity = String(Math.pow(0.53, depth) * edge);
        card.style.filter = `blur(${Math.max(0, depth - 0.2) * 0.8}px)`;
        card.style.zIndex = String(10 - Math.round(depth * 3));
        card.style.pointerEvents = edge < 0.2 ? "none" : "auto";
      });
    }
    function set(index, immediate = false) {
      selected = wrap(index);
      cards.forEach((card, i) => {
        card.setAttribute("aria-pressed", String(i === selected));
        card.tabIndex = i === selected ? 0 : -1;
      });
      cancelAnimationFrame(frame);
      const start = position;
      const delta = distance(selected - position);
      if (immediate || reduced.matches || Math.abs(delta) < 0.001) {
        position = selected;
        paint();
        return;
      }
      const began = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - began) / 480);
        position = start + delta * (1 - Math.pow(1 - t, 4));
        paint();
        if (t < 1) frame = requestAnimationFrame(tick);
        else position = selected;
      };
      frame = requestAnimationFrame(tick);
    }
    function choose(index, focus = false) {
      index = wrap(index);
      if (cards[index].disabled) return set(selected);
      set(index);
      onSelect(index);
      if (focus) cards[index].focus({ preventScroll: true });
    }
    function advance(direction, focus = false) {
      for (let n = 1; n <= count; n++) {
        const index = wrap(selected + direction * n);
        if (!cards[index].disabled) return choose(index, focus);
      }
    }
    cards.forEach((card, index) => {
      card.addEventListener("click", () => {
        if (!suppressClick) choose(index);
      });
      card.addEventListener("dragstart", (event) => event.preventDefault());
    });
    strip.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
      event.preventDefault();
      if (event.key === "Home")
        choose(
          cards.findIndex((card) => !card.disabled),
          true,
        );
      else if (event.key === "End")
        choose(
          cards.findLastIndex((card) => !card.disabled),
          true,
        );
      else advance(event.key === "ArrowRight" ? 1 : -1, true);
    });
    previous.addEventListener("click", () => advance(-1));
    next.addEventListener("click", () => advance(1));
    previous.disabled = next.disabled =
      cards.filter((card) => !card.disabled).length < 2;
    strip.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.isPrimary === false) return;
      suppressClick = false;
      drag = {
        x: event.clientX,
        y: event.clientY,
        position,
        id: event.pointerId,
        moved: false,
      };
    });
    strip.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x;
      if (!drag.moved && Math.abs(event.clientY - drag.y) > Math.abs(dx) + 8) {
        drag = null;
        return;
      }
      if (!drag.moved && Math.abs(dx) < 8) return;
      drag.moved = true;
      suppressClick = true;
      strip.setPointerCapture(event.pointerId);
      strip.classList.add("is-dragging");
      cancelAnimationFrame(frame);
      position = drag.position - dx / step();
      paint();
    });
    function finish(event) {
      if (!drag || event.pointerId !== drag.id) return;
      const moved = drag.moved;
      drag = null;
      strip.classList.remove("is-dragging");
      if (moved) {
        choose(
          event.type === "pointercancel" ? selected : Math.round(position),
        );
        // The click synthesized by pointerup must not select the card under the release point.
        setTimeout(() => {
          suppressClick = false;
        }, 0);
      }
    }
    strip.addEventListener("pointerup", finish);
    strip.addEventListener("pointercancel", finish);
    window.addEventListener("resize", paint, { passive: true });
    set(initial, true);
    return { set };
  };
})();
