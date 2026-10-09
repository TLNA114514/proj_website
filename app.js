(() => {
  "use strict";
  const config = window.EGOFACT_CONFIG || {};
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const q = (selector) => document.querySelector(selector);
  const qa = (selector) => [...document.querySelectorAll(selector)];

  if (config.authors) q("#author-line").textContent = config.authors;
  if (config.affiliations)
    q("#affiliation-line").textContent = config.affiliations;
  const isWebUrl = (value) => {
    try {
      return ["https:", "http:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  };
  if (isWebUrl(config.websiteUrl)) {
    qa("[data-website-link]").forEach((link) => {
      link.href = config.websiteUrl;
    });
  }
  if (isWebUrl(config.paperUrl)) {
    ["#paper-link", "#resource-paper-link"].forEach((selector) => {
      const link = q(selector);
      link.href = config.paperUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });
    q("#paper-resource-status").textContent = "View paper";
    q("#paper-status").textContent =
      "Read the paper at the publication link above.";
  } else {
    q("#paper-link").innerHTML =
      'Paper <span class="button-status">Coming soon</span>';
    q("#paper-link").setAttribute(
      "aria-label",
      "Paper link coming soon. View resource status.",
    );
  }

  // Content stays visible without JavaScript or IntersectionObserver support.
  if ("IntersectionObserver" in window && !reducedMotion.matches) {
    document.documentElement.classList.add("js-motion");
    const reveal = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("visible");
          reveal.unobserve(entry.target);
        });
      },
      { threshold: 0.06, rootMargin: "0px 0px -20px 0px" },
    );
    qa(".reveal").forEach((element) => reveal.observe(element));
  }

  const header = q(".site-header");
  const progress = q(".reading-progress");
  const navLinks = qa(".desktop-nav a");
  const sections = navLinks.map((link) => q(link.getAttribute("href")));
  let scrollPending = false;
  function updateScroll() {
    const scrollable =
      document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = `scaleX(${scrollable > 0 ? window.scrollY / scrollable : 0})`;
    header.classList.toggle("scrolled", window.scrollY > 30);
    let current = -1;
    sections.forEach((section, index) => {
      if (section.getBoundingClientRect().top < window.innerHeight * 0.4)
        current = index;
    });
    navLinks.forEach((link, index) => {
      if (index === current) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
    scrollPending = false;
  }
  window.addEventListener(
    "scroll",
    () => {
      if (!scrollPending) {
        scrollPending = true;
        requestAnimationFrame(updateScroll);
      }
    },
    { passive: true },
  );
  window.addEventListener("resize", updateScroll, { passive: true });
  updateScroll();

  const menuButton = q(".menu-toggle");
  const mobileNav = q("#mobile-nav");
  function closeMenu() {
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Open navigation");
    mobileNav.hidden = true;
  }
  menuButton.addEventListener("click", () => {
    const opening = menuButton.getAttribute("aria-expanded") !== "true";
    menuButton.setAttribute("aria-expanded", String(opening));
    menuButton.setAttribute(
      "aria-label",
      opening ? "Close navigation" : "Open navigation",
    );
    mobileNav.hidden = !opening;
  });
  qa("#mobile-nav a").forEach((link) =>
    link.addEventListener("click", closeMenu),
  );
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !mobileNav.hidden) {
      closeMenu();
      menuButton.focus();
    }
  });
  window
    .matchMedia("(min-width: 701px)")
    .addEventListener("change", (event) => {
      if (event.matches) closeMenu();
    });

  // These are real Figure 1 stills. We never synthesize or animate model predictions.
  const descriptions = {
    controller: "both hands interacting with a game controller",
    can: "a hand manipulating a can",
  };
  let scene = "controller";
  const selectedSamples = { controller: 2, can: 2 };
  const slider = q("#sample-slider");
  function setSample(next) {
    const sample = Math.max(1, Math.min(3, next));
    selectedSamples[scene] = sample;
    q("#rgb-image").src = `assets/figures/${scene}-${sample}-rgb.webp`;
    q("#rgb-image").alt =
      `First-person view of ${descriptions[scene]}, sample ${sample}`;
    q("#tactile-image").src = `assets/figures/${scene}-${sample}-tactile.webp`;
    q("#tactile-image").alt =
      `EgoFact tactile field and contact map for ${descriptions[scene]}, sample ${sample}`;
    q("#sample-counter").textContent = `0${sample} / 03`;
    slider.value = sample;
    slider.setAttribute("aria-valuetext", `Sample ${sample} of 3`);
  }
  qa(".scene-button").forEach((button) => {
    button.addEventListener("click", () => {
      scene = button.dataset.scene;
      qa(".scene-button").forEach((item) => {
        item.classList.toggle("active", item === button);
        item.setAttribute("aria-pressed", String(item === button));
      });
      setSample(selectedSamples[scene]);
    });
  });
  slider.addEventListener("input", () => setSample(Number(slider.value)));
  q("#previous-sample").addEventListener("click", () =>
    setSample(selectedSamples[scene] === 1 ? 3 : selectedSamples[scene] - 1),
  );
  q("#next-sample").addEventListener("click", () =>
    setSample(selectedSamples[scene] === 3 ? 1 : selectedSamples[scene] + 1),
  );

  const tabs = qa('[role="tab"]');
  function activateTab(tab) {
    tabs.forEach((item) => {
      const selected = item === tab;
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute("aria-controls")).hidden =
        !selected;
    });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activateTab(tab));
    tab.addEventListener("keydown", (event) => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft")
        next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      activateTab(tabs[next]);
      tabs[next].focus();
    });
  });

  const benchmarks = {
    opentouch: {
      name: "OpenTouch",
      baseline: [55.61, 33.6, 28.33, 0.1995],
      ours: [82.4, 53.15, 48.09, 0.1442],
    },
    "egotouch-seen": {
      name: "TouchAnything",
      baseline: [87.53, 52.52, 50.26, 1.4663],
      ours: [87.61, 54.85, 52.56, 1.6186],
    },
    "egotouch-unseen": {
      name: "TouchAnything",
      baseline: [84.44, 40.32, 39.0, 2.5121],
      ours: [83.56, 45.73, 44.01, 2.3736],
    },
    "egotactile-object": {
      name: "EgoTactile",
      baseline: [54.2, 16.11, 23.39, 0.4],
      ours: [79.8, 49.57, 45.32, 0.2273],
    },
    "egotactile-subject": {
      name: "EgoTactile",
      baseline: [59.97, 10.18, 26.77, 0.38],
      ours: [67.69, 40.58, 38.42, 0.2229],
    },
  };
  const benchmarkSelect = q("#benchmark-select");
  function updateBenchmark() {
    const data = benchmarks[benchmarkSelect.value];
    const cells = (values, other) =>
      values
        .map((value, i) => {
          const better = i === 3 ? value < other[i] : value > other[i];
          const label = value.toFixed(i === 3 ? 4 : 2);
          return `<td>${better ? `<strong>${label}</strong>` : label}</td>`;
        })
        .join("");
    q("#benchmark-body").innerHTML =
      `<tr><th scope="row">${data.name}</th>${cells(data.baseline, data.ours)}</tr><tr class="ours"><th scope="row">EgoFact <span>OURS</span></th>${cells(data.ours, data.baseline)}</tr>`;
    const title = benchmarkSelect.selectedOptions[0].textContent;
    q("#benchmark-caption").textContent = title;
    q("#benchmark-announcement").textContent = `Showing results for ${title}.`;
  }
  benchmarkSelect.addEventListener("change", updateBenchmark);

  const dialog = q("#figure-dialog");
  let figureTrigger;
  qa("[data-lightbox]").forEach((button) => {
    button.addEventListener("click", () => {
      figureTrigger = button;
      q("#dialog-image").src = button.dataset.lightbox;
      q("#dialog-image").alt = button.querySelector("img").alt;
      q("#dialog-caption").textContent = button.dataset.caption;
      dialog.showModal();
      document.body.classList.add("dialog-open");
      q("#close-dialog").focus();
    });
  });
  q("#close-dialog").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close();
  });
  dialog.addEventListener("close", () => {
    document.body.classList.remove("dialog-open");
    figureTrigger?.focus({ preventScroll: true });
  });

  const copyButton = q("#copy-citation");
  let copyTimer;
  copyButton.addEventListener("click", async () => {
    clearTimeout(copyTimer);
    try {
      await navigator.clipboard.writeText(q("#citation-text").textContent);
      copyButton.textContent = "Copied ✓";
      q("#copy-status").textContent = "BibTeX copied to clipboard.";
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(q("#citation-text"));
      selection.removeAllRanges();
      selection.addRange(range);
      copyButton.textContent = "Text selected";
      q("#copy-status").textContent =
        "Copy was unavailable. Citation selected; press Command+C or Control+C to copy.";
    }
    copyTimer = setTimeout(() => {
      copyButton.innerHTML = 'Copy BibTeX <span aria-hidden="true">⧉</span>';
    }, 2400);
  });
})();
