import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  HemisphereLight,
  DirectionalLight,
  Box3,
  Vector3,
  Sphere,
  Group,
  MeshStandardMaterial,
  SRGBColorSpace,
  NeutralToneMapping,
  DoubleSide,
  OrbitControls,
  GLTFLoader,
  MeshoptDecoder,
} from "./assets/vendor/hoi-three.js";

export function createViewer(host, reduced) {
  let renderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    throw new Error("WEBGL_UNAVAILABLE");
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute(
    "aria-label",
    "Interactive hand–object mesh. Drag to rotate; arrow keys rotate; plus and minus zoom; R resets the view.",
  );
  canvas.setAttribute("aria-describedby", "hoi-hint");
  host.append(canvas);
  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.01, 100);
  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = !reduced.matches;
  orbit.dampingFactor = 0.12;
  orbit.rotateSpeed = 0.65;
  orbit.panSpeed = 0.7;
  orbit.zoomSpeed = 0.75;
  scene.add(new HemisphereLight(0xffffff, 0xb9b4aa, 2.3));
  const key = new DirectionalLight(0xffffff, 2.5);
  key.position.set(3, 5, 4);
  scene.add(key);
  const fill = new DirectionalLight(0xdde9ff, 1.2);
  fill.position.set(-3, 1, -2);
  scene.add(fill);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const cache = new Map();
  let model;
  let frame = 0;
  let visible = true;
  let fade;
  let fadeTimer;

  function render() {
    frame = 0;
    if (!visible || document.hidden) return;
    orbit.update();
    renderer.render(scene, camera);
  }
  function invalidate() {
    if (!frame && visible && !document.hidden)
      frame = requestAnimationFrame(render);
  }
  orbit.addEventListener("change", invalidate);
  function reset() {
    // Fit a bounding sphere in both portrait and landscape viewports.
    const v = (camera.fov * Math.PI) / 360;
    const h = Math.atan(Math.tan(v) * camera.aspect);
    const distance = 1.12 / Math.sin(Math.min(v, h));
    orbit.enableDamping = false;
    orbit.update();
    orbit.target.set(0, 0, 0);
    camera.position.set(0, 0, distance);
    orbit.minDistance = 1.4;
    orbit.maxDistance = distance * 3;
    orbit.update();
    orbit.enableDamping = !reduced.matches;
    orbit.saveState();
    invalidate();
  }
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    reset();
  }
  new ResizeObserver(resize).observe(host);
  if ("IntersectionObserver" in window)
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) invalidate();
    }).observe(host);
  document.addEventListener("visibilitychange", invalidate);
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    host.classList.add("context-lost");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    host.classList.remove("context-lost");
    invalidate();
  });
  function zoom(direction) {
    if (direction > 0) orbit.dollyIn(1 / 1.2);
    else orbit.dollyOut(1 / 1.2);
    orbit.update();
    invalidate();
  }
  canvas.addEventListener("keydown", (event) => {
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "+",
        "=",
        "-",
        "r",
        "R",
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    if (event.key === "r" || event.key === "R") reset();
    else if (["+", "=", "-"].includes(event.key))
      zoom(event.key === "-" ? -1 : 1);
    else {
      if (event.key === "ArrowLeft") orbit.rotateLeft(0.15);
      if (event.key === "ArrowRight") orbit.rotateLeft(-0.15);
      if (event.key === "ArrowUp") orbit.rotateUp(0.15);
      if (event.key === "ArrowDown") orbit.rotateUp(-0.15);
      orbit.update();
      invalidate();
    }
  });
  async function load(name, progress) {
    if (!cache.has(name)) {
      const pending = loader
        .loadAsync(`assets/hoi/${name}/scene.glb`, (event) => {
          if (event.total)
            progress(Math.round((event.loaded / event.total) * 100));
        })
        .then((gltf) => {
          const group = new Group();
          group.add(gltf.scene);
          gltf.scene.traverse((node) => {
            if (!node.isMesh) return;
            if (!node.geometry.attributes.normal)
              node.geometry.computeVertexNormals();
            node.material.dispose();
            node.material = new MeshStandardMaterial({
              vertexColors: true,
              roughness: 0.72,
              metalness: 0,
              side: DoubleSide,
            });
          });
          const bounds = new Box3().setFromObject(group);
          const sphere = bounds.getBoundingSphere(new Sphere());
          gltf.scene.position.sub(sphere.center);
          group.scale.setScalar(1 / sphere.radius);
          return group;
        })
        .catch((error) => {
          cache.delete(name);
          throw error;
        });
      cache.set(name, pending);
    }
    return cache.get(name);
  }
  function show(next) {
    if (model === next) return;
    clearTimeout(fadeTimer);
    fade?.remove();
    fade = undefined;
    if (model && !reduced.matches) {
      renderer.render(scene, camera);
      const snapshot = document.createElement("img");
      snapshot.alt = "";
      snapshot.setAttribute("aria-hidden", "true");
      snapshot.className = "hoi-mesh-snapshot";
      snapshot.src = canvas.toDataURL("image/png");
      host.append(snapshot);
      fade = snapshot;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          snapshot.style.opacity = "0";
        }),
      );
      fadeTimer = setTimeout(() => {
        snapshot.remove();
        if (fade === snapshot) fade = undefined;
      }, 500);
    }
    if (model) scene.remove(model);
    model = next;
    scene.add(model);
    reset();
    renderer.render(scene, camera);
    canvas.animate?.([{ opacity: 0.25 }, { opacity: 1 }], {
      duration: reduced.matches ? 0 : 420,
    });
  }
  resize();
  return { load, show, reset, zoom };
}
