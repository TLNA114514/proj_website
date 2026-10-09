# EgoFact project website

A minimal, responsive research project page for **EgoFact: Estimating Dense Full-Hand Tactile Fields from Egocentric Human Videos**. Built with HTML, CSS, and vanilla JavaScript; no build step or third-party runtime dependencies.

## Local preview

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open <http://127.0.0.1:8000>.

## Update content

- `site-config.js`: anonymous author details, affiliations, public website URL (`websiteUrl`), and external paper URL. An empty paper URL produces an explicit “Coming soon” state.
- `index.html`: narrative sections, dataset statistics, preliminary citation, and resource availability.
- `demo.js` / `video-clips.js`: synchronized RGB, tactile, and contact video player and generated clip catalog.
- `app.js`: independent still-image sample viewers and the five evaluation tracks transcribed from Table 2. Best values are highlighted per metric, including metrics where the baseline is better.
- `styles.css`: typography, responsive layout, transitions, and reduced-motion support.
- `assets/figures/`: compressed WebP figures extracted from the supplied manuscript. The sample viewer shows actual stills; it is not a live model or a video.

All manuscript PDFs stay outside the published assets and are ignored by Git. Local extraction intermediates are stored under `.work/`, which is also ignored. No manuscript PDF is required to run the website.

## Publish with GitHub Pages

Repository: <https://github.com/TLNA114514/proj_website>

In **Settings → Pages → Build and deployment**, select **Deploy from a branch**, then **main** and **/(root)**, and save. `.nojekyll` enables direct static publishing. The expected project URL is <https://TLNA114514.github.io/proj_website/>.

See [GitHub’s publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site). All local asset URLs are relative, so the `/proj_website/` prefix works without a build configuration.

## Assets to add later

- Final author list, affiliations, and personal links.
- Public paper URL and final BibTeX citation.
- Remaining demo clips after their source transfers complete (see below).
- Model code and dataset download links. The page’s project links point to <https://tlna114514.github.io/proj_website/>; model code and dataset links remain pending.

## Design and provenance

Original implementation inspired by the spacious research storytelling of [World Labs’ Generating Worlds](https://www.worldlabs.ai/blog/generating-worlds), without copying its code or visual assets. All research figures and numerical results come from the user-supplied EgoFact manuscript. Author identity and publication venue are not inferred.

Interactions include sample selection, accessible method tabs, a native figure dialog, benchmark selection, expandable abstract, copyable preliminary citation, mobile navigation, scroll reveals, and a reading progress indicator. Content remains readable without JavaScript.

## Video demo

The gallery follows the input-selection and shared-timeline pattern of [FlowHMR](https://flowhmr.github.io/). Choose a thumbnail, play/pause the three views together, scrub at 30 fps, or change playback speed. Clips loop together. Switching a clip resets its timeline and pauses playback; switching image categories preserves each category’s selected image independently.

`assets/videos/` contains compressed, silent H.264 MP4s and WebP posters. Each output combines the available left/right hand renders on white, preserving the supplied alpha masks. Single-hand samples show one hand. These are precomputed results from the supplied clips.

To add clips after downloading their originals:

```sh
python3 -m pip install imageio-ffmpeg
python3 scripts/prepare-videos.py /path/to/Downloads
```

The script supports the five supplied folders: `wood`, `bare_01`, `bare_04`, `gloved_08`, and `orange_gloved_02`. It checks file sizes against each export manifest, fully decodes complete source videos, converts them, and updates `video-clips.js`. Incomplete transfers are skipped and appear as disabled “Video coming soon” cards. Already prepared clips are reused; `--force` rebuilds them. Original files are never modified or deleted. Commit updated `assets/videos/` and `video-clips.js` to publish the new clips.

Current asset availability: `wood` and `bare_01` are ready. `bare_04`, `gloved_08`, and `orange_gloved_02` still contain incomplete MOV files; their cards remain unavailable until the complete sources can be decoded.

Player state regression checks (Node.js 18+): `node --test tests/demo.test.cjs`.
