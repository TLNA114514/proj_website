(() => {
  "use strict";
  const root = document.querySelector("#hoi");
  if (!root) return;
  const q = (selector) => root.querySelector(selector);
  const examples = ["apple", "cube", "milk"];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const stage = q("#hoi-stage");
  const loading = q("#hoi-loading");
  const loadText = q("#hoi-load-text");
  const retry = q("#hoi-retry");
  const controls = [q("#hoi-reset"), q("#hoi-zoom-in"), q("#hoi-zoom-out")];
  let selected = 0;
  let epoch = 0;
  let runtime;
  let initialized = false;
  let activeSet = q(".hoi-image-set");
  const images = new Map([["apple", activeSet]]);
  let cleanupTimer;

  function getImages(name) {
    if (!images.has(name)) {
      const set = document.createElement("div");
      set.className = "hoi-image-set";
      set.dataset.example = name;
      ["rgb", "tactile", "contact"].forEach((kind) => {
        const figure = document.createElement("figure");
        if (kind === "rgb") figure.className = "hoi-rgb";
        const caption = document.createElement("figcaption");
        caption.textContent = {
          rgb: "Input RGB",
          tactile: "Tactile",
          contact: "Contact",
        }[kind];
        const holder = document.createElement("div");
        const image = document.createElement("img");
        image.src = `assets/hoi/${name}/${kind}.webp`;
        image.alt = `${caption.textContent} for the ${name} example`;
        holder.append(image);
        figure.append(caption, holder);
        set.append(figure);
      });
      images.set(name, set);
      q("#hoi-images").append(set);
    }
    const set = images.get(name);
    return Promise.all(
      [...set.querySelectorAll("img")].map((img) => img.decode()),
    ).then(() => set);
  }
  function showImages(set) {
    if (set === activeSet) return;
    clearTimeout(cleanupTimer);
    images.forEach((layer) => layer.classList.remove("is-previous"));
    activeSet.classList.add("is-previous");
    activeSet.classList.remove("is-current");
    void stage.offsetWidth;
    set.classList.add("is-current");
    activeSet = set;
    images.forEach((layer) =>
      layer.setAttribute("aria-hidden", String(layer !== set)),
    );
    cleanupTimer = setTimeout(
      () => images.forEach((layer) => layer.classList.remove("is-previous")),
      500,
    );
  }
  async function getRuntime() {
    if (!runtime) {
      runtime = import("./hoi-viewer.js").then((module) =>
        module.createViewer(q("#hoi-canvas"), reduced),
      );
      runtime.catch(() => {
        runtime = undefined;
      });
    }
    return runtime;
  }
  async function choose(index) {
    selected = index;
    initialized = true;
    const currentEpoch = ++epoch;
    const name = examples[index];
    stage.setAttribute("aria-busy", "true");
    loading.hidden = false;
    retry.hidden = true;
    loadText.textContent = `Loading demo_${index + 1}…`;
    controls.forEach((button) => {
      button.disabled = true;
    });
    try {
      const viewer = await getRuntime();
      const [model, set] = await Promise.all([
        viewer.load(name, (progress) => {
          if (currentEpoch === epoch)
            loadText.textContent = `Loading demo_${index + 1} · ${progress}%`;
        }),
        getImages(name),
      ]);
      if (currentEpoch !== epoch) return;
      viewer.show(model);
      showImages(set);
      stage.dataset.example = name;
      q("#hoi-current").textContent = `demo_${index + 1}`;
      loading.hidden = true;
      controls.forEach((button) => {
        button.disabled = false;
      });
    } catch (error) {
      if (currentEpoch !== epoch) return;
      loadText.textContent =
        error.message === "WEBGL_UNAVAILABLE"
          ? "3D is unavailable in this browser. Try a browser with WebGL enabled."
          : "This example could not load. Please try again.";
      retry.hidden = false;
    } finally {
      if (currentEpoch === epoch) stage.setAttribute("aria-busy", "false");
    }
  }
  window.EgoCarousel({
    strip: q("#hoi-strip"),
    previous: q("#hoi-previous"),
    next: q("#hoi-next"),
    onSelect: (index) => {
      if (index !== selected || !initialized) choose(index);
    },
  });
  retry.addEventListener("click", () => choose(selected));
  q("#hoi-reset").addEventListener("click", async () =>
    (await getRuntime()).reset(),
  );
  q("#hoi-zoom-in").addEventListener("click", async () =>
    (await getRuntime()).zoom(1),
  );
  q("#hoi-zoom-out").addEventListener("click", async () =>
    (await getRuntime()).zoom(-1),
  );
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          if (!initialized) choose(selected);
        }
      },
      { rootMargin: "450px" },
    );
    observer.observe(root);
  } else choose(selected);
})();
