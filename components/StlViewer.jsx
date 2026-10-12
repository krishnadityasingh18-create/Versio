// @ts-nocheck
"use client";
// 3D view of one .stl file. three.js is imported inside the effect, so it only loads when a model is opened.
// `sync` (an EventTarget shared by two viewers) keeps their rotation and zoom in step.
import { useEffect, useId, useRef, useState } from "react";

const STEP = 0.2; // radians per arrow key press

export const isStl = (path) => path.toLowerCase().endsWith(".stl");

export default function StlViewer({ url, name, sync = null }) {
  const box = useRef(null);
  const api = useRef(null);
  const hintId = useId();
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let live = true;
    let cleanup = () => {};
    setStatus("loading");
    (async () => {
      const [THREE, { STLLoader }, { OrbitControls }, buf] = await Promise.all([
        import("three"),
        import("three/examples/jsm/loaders/STLLoader.js"),
        import("three/examples/jsm/controls/OrbitControls.js"),
        fetch(url).then((r) => {
          if (!r.ok) throw new Error("fetch");
          return r.arrayBuffer();
        }),
      ]);
      if (!live) return;
      const el = box.current;
      const geo = new STLLoader().parse(buf);
      geo.center();
      // Many exporters write zero or wrong normals; recompute so lighting always shows the shape.
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const size = geo.boundingSphere?.radius || 1;
      const css = getComputedStyle(el);
      const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(css.getPropertyValue("--color-accent").trim() || "teal"), roughness: 0.7, metalness: 0.1 });
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, 1, size / 100, size * 100);
      // Key light above-left of the camera so adjacent faces get different shades.
      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(-1, 1.2, 0.6).multiplyScalar(size * 4);
      camera.add(key);
      scene.add(new THREE.Mesh(geo, material), new THREE.AmbientLight(0xffffff, 0.55), camera);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.domElement.className = "absolute inset-0 h-full w-full";
      el.appendChild(renderer.domElement);
      const controls = new OrbitControls(camera, renderer.domElement); // no damping, no auto-rotate
      const render = () => renderer.render(scene, camera);

      // View state as { theta, phi, zoom } so two models of different sizes can share it.
      // Fits the bounding sphere in a 40° view with margin, down to ~0.7 aspect (phones).
      const base = size * 4.2;
      const off = new THREE.Vector3();
      const sph = new THREE.Spherical();
      const read = () => {
        sph.setFromVector3(off.copy(camera.position).sub(controls.target));
        return { theta: sph.theta, phi: sph.phi, zoom: sph.radius / base };
      };
      const write = (v) => {
        sph.set(Math.min(20, Math.max(0.1, v.zoom)) * base, Math.min(Math.PI - 0.01, Math.max(0.01, v.phi)), v.theta);
        camera.position.copy(controls.target).add(off.setFromSpherical(sph));
        camera.lookAt(controls.target);
        render();
      };
      const me = {};
      let applying = false;
      const emit = () => sync?.dispatchEvent(new CustomEvent("view", { detail: { from: me, view: read() } }));
      const onView = (e) => {
        if (e.detail.from === me) return;
        applying = true;
        write(e.detail.view);
        applying = false;
      };
      sync?.addEventListener("view", onView);
      controls.addEventListener("change", () => {
        render();
        if (!applying) emit();
      });

      api.current = {
        nudge(dt, dp, zf) {
          const v = read();
          write({ theta: v.theta + dt, phi: v.phi + dp, zoom: v.zoom * zf });
          emit();
        },
        reset() {
          controls.target.set(0, 0, 0);
          write({ theta: Math.PI / 4, phi: Math.PI / 3, zoom: 1 });
          emit();
        },
      };
      controls.target.set(0, 0, 0);
      write({ theta: Math.PI / 4, phi: Math.PI / 3, zoom: 1 });

      const ro = new ResizeObserver(() => {
        const w = el.clientWidth || 1;
        const h = el.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        render();
      });
      ro.observe(el);
      setStatus("ready");

      cleanup = () => {
        ro.disconnect();
        sync?.removeEventListener("view", onView);
        controls.dispose();
        geo.dispose();
        material.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        api.current = null;
      };
    })().catch(() => live && setStatus("error"));
    return () => {
      live = false;
      cleanup();
    };
  }, [url, sync]);

  function onKey(e) {
    const a = api.current;
    if (!a) return;
    const k = { ArrowLeft: [-STEP, 0, 1], ArrowRight: [STEP, 0, 1], ArrowUp: [0, -STEP, 1], ArrowDown: [0, STEP, 1], "+": [0, 0, 0.9], "=": [0, 0, 0.9], "-": [0, 0, 1.1], _: [0, 0, 1.1] }[e.key];
    if (!k) return;
    e.preventDefault();
    a.nudge(...k);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={box}
        role="application"
        tabIndex={0}
        aria-label={`3D view of ${name}`}
        aria-describedby={hintId}
        onKeyDown={onKey}
        className="relative h-80 w-full overflow-hidden rounded-field border border-line bg-canvas"
      >
        {status !== "ready" && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-2">
            {status === "error" ? "Could not show this model. You can still download it." : "Loading 3D view…"}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={hintId} className="text-xs text-ink-2">Drag to rotate, scroll or pinch to zoom. With the keyboard: arrow keys rotate, + and − zoom.</p>
        <button type="button" className="btn-ghost btn-sm" onClick={() => api.current?.reset()} disabled={status !== "ready"}>
          Reset view
        </button>
      </div>
    </div>
  );
}
