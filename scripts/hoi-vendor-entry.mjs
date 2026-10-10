// Build with Three.js 0.186.1, meshoptimizer 1.3.0 and esbuild 0.28.2.
// esbuild scripts/hoi-vendor-entry.mjs --bundle --format=esm --minify --target=es2020 --outfile=assets/vendor/hoi-three.js
export {
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
} from "three";
export { OrbitControls } from "three/addons/controls/OrbitControls.js";
export { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
export { MeshoptDecoder } from "meshoptimizer/decoder";
