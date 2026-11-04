"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type EdgeWalker = { from: number; to: number; progress: number; rate: number };

export default function DashboardHoloSphere({
  totalProducts = "0",
  totalOrders = "0",
  activeHolds = "0",
  login = false,
}: {
  totalProducts?: string;
  totalOrders?: string;
  activeHolds?: string;
  login?: boolean;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let width = mount.clientWidth || 400;
    let height = mount.clientHeight || 260;

    const scene = new THREE.Scene();
    const loginDistance = () => Math.max(
      9.1,
      (3.1 * 1.05) / (Math.tan(THREE.MathUtils.degToRad(19)) * Math.min(1, width / height))
    );
    const camera = new THREE.PerspectiveCamera(login ? 38 : 45, width / height, 0.1, 100);
    camera.position.set(0, login ? 0.4 : 1.2, login ? loginDistance() : 5.5);
    if (login) camera.lookAt(0, 0, 0);

    let renderer: THREE.WebGLRenderer | undefined;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      mount.appendChild(renderer.domElement);
    } catch {
      renderer?.dispose();
      queueMicrotask(() => setWebglUnavailable(true));
      return;
    }
    const activeRenderer = renderer;
    let contextLost = false;
    const onContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      setWebglUnavailable(true);
    };
    activeRenderer.domElement.addEventListener("webglcontextlost", onContextLost);

    // Group for mouse parallax tilt
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // Core Holographic Wireframe Sphere
    const sphereRadius = login ? 2.27 : 1.6;
    const sphereGeo = new THREE.IcosahedronGeometry(sphereRadius, 2);
    if (login) {
      const positions = sphereGeo.getAttribute("position");
      const colors = new Float32Array(positions.count * 3);
      const lower = new THREE.Color("#a78bfa");
      const middle = new THREE.Color("#c4b5fd");
      const upper = new THREE.Color("#e9d5ff");
      const shade = new THREE.Color();
      for (let i = 0; i < positions.count; i++) {
        const height = THREE.MathUtils.clamp((positions.getY(i) + sphereRadius) / (sphereRadius * 2), 0, 1);
        if (height < 0.5) shade.lerpColors(lower, middle, height * 2);
        else shade.lerpColors(middle, upper, (height - 0.5) * 2);
        colors[i * 3] = shade.r;
        colors[i * 3 + 1] = shade.g;
        colors[i * 3 + 2] = shade.b;
      }
      sphereGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }
    const sphereMat = new THREE.MeshBasicMaterial({
      color: login ? 0xffffff : 0x00f0ff,
      vertexColors: login,
      wireframe: true,
      transparent: true,
      opacity: login ? 0.32 : 0.28,
      depthWrite: !login,
    });
    const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    rootGroup.add(sphereMesh);
    const glowMat = login ? new THREE.MeshBasicMaterial({
      color: 0xc4b5fd, wireframe: true, transparent: true, opacity: 0.07,
      depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    }) : undefined;
    if (glowMat) sphereMesh.add(new THREE.Mesh(sphereGeo, glowMat));
    let intersectionGeo: THREE.BufferGeometry | undefined;
    let intersectionMat: THREE.PointsMaterial | undefined;
    let sparkleGeo: THREE.BufferGeometry | undefined;
    let sparkleMat: THREE.PointsMaterial | undefined;
    let pulseGeo: THREE.BufferGeometry | undefined;
    let pulseMat: THREE.LineBasicMaterial | undefined;
    let pulseLine: THREE.Line | undefined;
    const edgeVertices: THREE.Vector3[] = [];
    const neighbors: number[][] = [];
    const sparkles: EdgeWalker[] = [];
    let pulse: EdgeWalker | undefined;
    if (login) {
      const positions = sphereGeo.getAttribute("position");
      const dots: number[] = [];
      for (let i = 0; i < positions.count; i += 40) {
        dots.push(positions.getX(i), positions.getY(i), positions.getZ(i));
      }
      intersectionGeo = new THREE.BufferGeometry();
      intersectionGeo.setAttribute("position", new THREE.Float32BufferAttribute(dots, 3));
      intersectionMat = new THREE.PointsMaterial({ color: 0xc4b5fd, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
      sphereMesh.add(new THREE.Points(intersectionGeo, intersectionMat));

      // Follow the same unique edges that Three.js uses for the wireframe.
      const wireEdges = new THREE.WireframeGeometry(sphereGeo);
      const edgePositions = wireEdges.getAttribute("position");
      const vertexIds = new Map<string, number>();
      const vertexAt = (index: number) => {
        const x = edgePositions.getX(index);
        const y = edgePositions.getY(index);
        const z = edgePositions.getZ(index);
        const key = `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`;
        let id = vertexIds.get(key);
        if (id === undefined) {
          id = edgeVertices.length;
          vertexIds.set(key, id);
          edgeVertices.push(new THREE.Vector3(x, y, z));
          neighbors.push([]);
        }
        return id;
      };
      for (let i = 0; i < edgePositions.count; i += 2) {
        const a = vertexAt(i);
        const b = vertexAt(i + 1);
        if (a !== b && !neighbors[a].includes(b)) {
          neighbors[a].push(b);
          neighbors[b].push(a);
        }
      }
      wireEdges.dispose();

      const shades = [new THREE.Color("#c4b5fd"), new THREE.Color("#a78bfa"), new THREE.Color("#e9d5ff")];
      const sparkleColors: number[] = [];
      for (let i = 0; i < 7; i++) {
        const from = (i * 31) % edgeVertices.length;
        sparkles.push({ from, to: neighbors[from][i % neighbors[from].length], progress: (i * 0.137) % 1, rate: 0.25 + i * 0.025 });
        const color = shades[i % shades.length];
        sparkleColors.push(color.r, color.g, color.b);
      }
      sparkleGeo = new THREE.BufferGeometry();
      sparkleGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(sparkles.length * 3), 3).setUsage(THREE.DynamicDrawUsage));
      sparkleGeo.setAttribute("color", new THREE.Float32BufferAttribute(sparkleColors, 3));
      sparkleMat = new THREE.PointsMaterial({ size: 0.055, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
      const sparklePoints = new THREE.Points(sparkleGeo, sparkleMat);
      sparklePoints.frustumCulled = false;
      sphereMesh.add(sparklePoints);

      pulse = { from: 11 % edgeVertices.length, to: neighbors[11 % edgeVertices.length][0], progress: 0, rate: 0.55 };
      pulseGeo = new THREE.BufferGeometry();
      pulseGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage));
      const pulseColors = [shades[1].r, shades[1].g, shades[1].b, shades[2].r, shades[2].g, shades[2].b];
      pulseGeo.setAttribute("color", new THREE.Float32BufferAttribute(pulseColors, 3));
      pulseMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending });
      pulseLine = new THREE.Line(pulseGeo, pulseMat);
      pulseLine.frustumCulled = false;
      sphereMesh.add(pulseLine);
    }

    const advance = (walker: EdgeWalker, delta: number) => {
      walker.progress += delta * walker.rate;
      while (walker.progress >= 1) {
        walker.progress -= 1;
        const previous = walker.from;
        walker.from = walker.to;
        const choices = neighbors[walker.from].filter(index => index !== previous);
        walker.to = choices.length ? choices[Math.floor(Math.random() * choices.length)] : previous;
      }
    };

    // Inner glowing core
    const innerGeo = new THREE.SphereGeometry(1.0, 16, 16);
    const innerMat = new THREE.MeshBasicMaterial({
      color: login ? 0x8b5cf6 : 0x14b8a6,
      wireframe: true,
      transparent: true,
      opacity: login ? 0.07 : 0.18,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    rootGroup.add(innerMesh);

    const shadeRing = (geometry: THREE.RingGeometry, start: string, end: string) => {
      if (!login) return;
      const positions = geometry.getAttribute("position");
      const colors = new Float32Array(positions.count * 3);
      const first = new THREE.Color(start);
      const second = new THREE.Color(end);
      const shade = new THREE.Color();
      for (let i = 0; i < positions.count; i++) {
        const angle = Math.atan2(positions.getY(i), positions.getX(i));
        shade.lerpColors(first, second, (Math.sin(angle) + 1) / 2);
        colors[i * 3] = shade.r;
        colors[i * 3 + 1] = shade.g;
        colors[i * 3 + 2] = shade.b;
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    };

    // Three intentionally inclined orbital planes frame the welcome sphere.
    const ring1Geo = new THREE.RingGeometry(login ? 2.62 : 2.1, login ? 2.635 : 2.14, 96);
    shadeRing(ring1Geo, "#c4b5fd", "#e9d5ff");
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: login ? 0xffffff : 0x00f0ff,
      vertexColors: login,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: login ? 0.31 : 0.65,
    });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    ring1.rotation.x = login ? Math.PI / 2.8 : Math.PI / 2.3;
    rootGroup.add(ring1);

    const ring2Geo = new THREE.RingGeometry(login ? 2.86 : 2.35, login ? 2.875 : 2.38, 96);
    shadeRing(ring2Geo, "#a78bfa", "#c4b5fd");
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: login ? 0xffffff : 0x8b5cf6,
      vertexColors: login,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: login ? 0.28 : 0.5,
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.x = login ? -Math.PI / 3.6 : -Math.PI / 3.8;
    ring2.rotation.y = login ? Math.PI / 6 : Math.PI / 5;
    rootGroup.add(ring2);
    const ring3Geo = login ? new THREE.RingGeometry(3.1, 3.115, 96) : undefined;
    if (ring3Geo) shadeRing(ring3Geo, "#c4b5fd", "#a78bfa");
    const ring3Mat = ring3Geo ? new THREE.MeshBasicMaterial({
      color: 0xffffff, vertexColors: true, side: THREE.DoubleSide,
      transparent: true, opacity: 0.24,
    }) : undefined;
    const ring3 = ring3Geo && ring3Mat ? new THREE.Mesh(ring3Geo, ring3Mat) : undefined;
    if (ring3) {
      ring3.rotation.set(Math.PI / 2.1, -Math.PI / 4, 0);
      rootGroup.add(ring3);
    }

    // The welcome view uses a real lit lock mesh inside the existing sphere.
    const lockGroup = new THREE.Group();
    const lockGeometries: THREE.BufferGeometry[] = [];
    const lockMaterials: THREE.Material[] = [];
    if (login) {
      const bodyGeometry = new THREE.BoxGeometry(0.95, 0.72, 0.28);
      const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x4c1d95, metalness: 0.52, roughness: 0.32, emissive: 0x2e1065, emissiveIntensity: 0.36, transparent: true, depthTest: false, depthWrite: false });
      const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
      body.position.y = -0.28;
      lockGroup.add(body);
      lockGeometries.push(bodyGeometry);
      lockMaterials.push(bodyMaterial);
      const edgeGeometry = new THREE.EdgesGeometry(bodyGeometry);
      const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xe9d5ff, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false });
      body.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));
      lockGeometries.push(edgeGeometry);
      lockMaterials.push(edgeMaterial);

      const archGeometry = new THREE.TorusGeometry(0.33, 0.085, 12, 48, Math.PI);
      const archMaterial = new THREE.MeshStandardMaterial({ color: 0xe9d5ff, metalness: 0.7, roughness: 0.22, emissive: 0xa78bfa, emissiveIntensity: 0.22, transparent: true, depthTest: false, depthWrite: false });
      const arch = new THREE.Mesh(archGeometry, archMaterial);
      arch.position.y = 0.18;
      lockGroup.add(arch);
      lockGeometries.push(archGeometry);
      lockMaterials.push(archMaterial);
      const postGeometry = new THREE.CylinderGeometry(0.085, 0.085, 0.36, 16);
      for (const x of [-0.33, 0.33]) {
        const post = new THREE.Mesh(postGeometry, archMaterial);
        post.position.set(x, 0, 0);
        lockGroup.add(post);
      }
      lockGeometries.push(postGeometry);
      const keyGeometry = new THREE.SphereGeometry(0.065, 16, 12);
      const keyMaterial = new THREE.MeshStandardMaterial({ color: 0x160b35, roughness: 0.45, transparent: true, depthTest: false, depthWrite: false });
      const key = new THREE.Mesh(keyGeometry, keyMaterial);
      key.position.set(0, -0.22, 0.15);
      lockGroup.add(key);
      lockGeometries.push(keyGeometry);
      lockMaterials.push(keyMaterial);
      lockGroup.scale.setScalar(1.16);
      lockGroup.traverse(object => { object.renderOrder = 10; });
      rootGroup.add(lockGroup);
      scene.add(new THREE.AmbientLight(0xffffff, 1.3));
      const light = new THREE.PointLight(0xc4b5fd, 15, 8);
      light.position.set(1.5, 2.5, 3);
      scene.add(light);
    }

    // Orbiting Data Nodes (representing channels: Website, Mobile, Store)
    const nodeCount = login ? 3 : 6;
    const nodeGeo = new THREE.SphereGeometry(login ? 0.05 : 0.08, 8, 8);
    const nodeMat = new THREE.MeshBasicMaterial({ color: login ? 0xe9d5ff : 0x38bdf8, transparent: login, opacity: login ? 0.75 : 1 });
    const haloGeo = login ? new THREE.SphereGeometry(0.12, 8, 8) : undefined;
    const haloMat = login ? new THREE.MeshBasicMaterial({ color: 0xc4b5fd, transparent: true, opacity: 0.14, depthWrite: false }) : undefined;
    const nodes: THREE.Mesh[] = [];

    for (let i = 0; i < nodeCount; i++) {
      const node = new THREE.Mesh(nodeGeo, nodeMat);
      if (haloGeo && haloMat) node.add(new THREE.Mesh(haloGeo, haloMat));
      rootGroup.add(node);
      nodes.push(node);
    }

    // Atmospheric Particle Dust
    const particleCount = login ? 24 : 75;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 8;
      positions[i + 1] = (Math.random() - 0.5) * 6;
      positions[i + 2] = (Math.random() - 0.5) * 6;
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: login ? 0xc4b5fd : 0x00f0ff,
      size: 0.04,
      transparent: true,
      opacity: login ? 0.2 : 0.55,
    });
    const particlePoints = new THREE.Points(particleGeo, particleMat);
    scene.add(particlePoints);

    // Mouse Parallax
    let targetRotX = 0;
    let targetRotY = 0;
    const onMouseMove = (e: MouseEvent) => {
      const rect = mount.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      targetRotY = x * (login ? 0.18 : 0.45);
      targetRotX = -y * (login ? 0.14 : 0.35);
    };
    mount.addEventListener("mousemove", onMouseMove);

    // Resize Observer
    let animationId: number;
    let isVisible = true;

    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
    });
    observer.observe(mount);

    const onResize = () => {
      if (!mount) return;
      width = Math.max(1, mount.clientWidth);
      height = Math.max(1, mount.clientHeight);
      camera.aspect = width / height;
      if (login) {
        camera.position.z = loginDistance();
        camera.lookAt(0, 0, 0);
      }
      camera.updateProjectionMatrix();
      activeRenderer.setSize(width, height);
    };
    window.addEventListener("resize", onResize);

    // Animation Loop
    const clock = new THREE.Clock();
    let lastElapsed = 0;

    const animate = () => {
      if (contextLost) return;
      animationId = requestAnimationFrame(animate);
      if (!isVisible) return;

      const elapsed = clock.getElapsedTime();
      const delta = Math.min(0.05, elapsed - lastElapsed);
      lastElapsed = elapsed;

      // Smooth parallax lerp
      rootGroup.rotation.x += (targetRotX - rootGroup.rotation.x) * 0.05;
      rootGroup.rotation.y += (targetRotY - rootGroup.rotation.y) * 0.05;

      // Continuous sphere rotations
      sphereMesh.rotation.y = elapsed * (login ? 0.1 : 0.15);
      sphereMesh.rotation.x = elapsed * (login ? 0.05 : 0.08);
      if (sparkleGeo) {
        const positions = sparkleGeo.getAttribute("position") as THREE.BufferAttribute;
        sparkles.forEach((sparkle, index) => {
          advance(sparkle, delta);
          const from = edgeVertices[sparkle.from];
          const to = edgeVertices[sparkle.to];
          positions.setXYZ(index,
            from.x + (to.x - from.x) * sparkle.progress,
            from.y + (to.y - from.y) * sparkle.progress,
            from.z + (to.z - from.z) * sparkle.progress);
        });
        positions.needsUpdate = true;
      }
      if (pulse && pulseGeo && pulseLine && pulseMat) {
        advance(pulse, delta);
        const pulseTime = elapsed % 12;
        pulseLine.visible = pulseTime < 3;
        pulseMat.opacity = 0.42 * Math.max(0, Math.min(1, pulseTime / 0.4, (3 - pulseTime) / 0.5));
        const positions = pulseGeo.getAttribute("position") as THREE.BufferAttribute;
        const from = edgeVertices[pulse.from];
        const to = edgeVertices[pulse.to];
        for (let i = 0; i < 2; i++) {
          const progress = Math.max(0, pulse.progress - (1 - i) * 0.22);
          positions.setXYZ(i,
            from.x + (to.x - from.x) * progress,
            from.y + (to.y - from.y) * progress,
            from.z + (to.z - from.z) * progress);
        }
        positions.needsUpdate = true;
      }
      innerMesh.rotation.y = -elapsed * 0.22;
      if (login) lockGroup.rotation.y = Math.sin(elapsed * 0.5) * 0.22;

      // Orbiting rings
      ring1.rotation.z = elapsed * (login ? 0.09 : 0.25);
      ring2.rotation.z = -elapsed * (login ? 0.07 : 0.18);
      if (ring3) ring3.rotation.z = elapsed * 0.05;

      // Position satellite nodes on the rings
      nodes.forEach((node, i) => {
        if (login && ring3) {
          const orbit = [ring1, ring2, ring3][i];
          const radius = [2.6275, 2.8675, 3.1075][i];
          const angle = elapsed * [0.14, -0.11, 0.09][i] + i * (Math.PI * 2 / 3);
          node.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0).applyEuler(orbit.rotation);
          return;
        }
        const angle = elapsed * 0.5 + (i * Math.PI * 2) / nodeCount;
        const radius = i % 2 === 0 ? 2.12 : 2.36;
        if (i % 2 === 0) {
          node.position.x = Math.cos(angle) * radius;
          node.position.z = Math.sin(angle) * radius;
          node.position.y = Math.sin(angle * 2) * 0.25;
        } else {
          node.position.x = Math.sin(angle) * radius * 0.8;
          node.position.y = Math.cos(angle) * radius;
          node.position.z = Math.cos(angle * 1.5) * 0.4;
        }
      });

      // Subtle particle float
      particlePoints.rotation.y = elapsed * 0.03;

      try {
        activeRenderer.render(scene, camera);
      } catch {
        contextLost = true;
        setWebglUnavailable(true);
      }
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      observer.disconnect();
      mount.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      activeRenderer.domElement.removeEventListener("webglcontextlost", onContextLost);

      // Clean up geometries and materials
      sphereGeo.dispose();
      sphereMat.dispose();
      glowMat?.dispose();
      intersectionGeo?.dispose();
      intersectionMat?.dispose();
      sparkleGeo?.dispose();
      sparkleMat?.dispose();
      pulseGeo?.dispose();
      pulseMat?.dispose();
      innerGeo.dispose();
      innerMat.dispose();
      ring1Geo.dispose();
      ring1Mat.dispose();
      ring2Geo.dispose();
      ring2Mat.dispose();
      ring3Geo?.dispose();
      ring3Mat?.dispose();
      nodeGeo.dispose();
      nodeMat.dispose();
      haloGeo?.dispose();
      haloMat?.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      lockGeometries.forEach(geometry => geometry.dispose());
      lockMaterials.forEach(material => material.dispose());
      activeRenderer.dispose();

      if (mount.contains(activeRenderer.domElement)) {
        mount.removeChild(activeRenderer.domElement);
      }
    };
  }, []);

  return (
    <div
      className={`holo-sphere-card ${login ? "holo-sphere-login" : ""}`}
      style={{
        position: "relative",
        width: "100%",
        height: login ? "100%" : "260px",
        borderRadius: "16px",
        background:
          login ? "transparent" : "linear-gradient(135deg, rgba(8, 16, 32, 0.85), rgba(4, 9, 20, 0.95))",
        border: login ? "none" : "1px solid rgba(56, 189, 248, 0.22)",
        boxShadow:
          login ? "none" : "0 20px 50px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        ref={mountRef}
        style={{
          position: "absolute",
          inset: 0,
          cursor: "grab",
        }}
      />
      {webglUnavailable && (
        <div role="status" style={{ position: "relative", zIndex: 1, color: login ? "#e9e4ff" : "var(--foreground-dim)", fontSize: "12px", textAlign: "center", padding: "20px" }}>
          3D visualization is unavailable on this device.
        </div>
      )}

      {/* Top telemetry bar */}
      {!login && <>
      <div
        style={{
          position: "absolute",
          top: "14px",
          left: "18px",
          right: "18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          pointerEvents: "none",
          fontSize: "10px",
          fontFamily: "var(--font-geist-mono), monospace",
          letterSpacing: "1px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "var(--cyan)",
              boxShadow: "0 0 8px var(--cyan)",
            }}
          />
          <span style={{ color: "#fff", fontWeight: 700 }}>
            SPATIAL TELEMETRY NEXUS
          </span>
        </div>
        <span style={{ color: "var(--teal)" }}>ORBITAL RADAR · 3 CHANNELS</span>
      </div>
      </>}

      {/* Bottom telemetry overlay pill */}
      {!login && <>
      <div
        style={{
          position: "absolute",
          bottom: "14px",
          left: "18px",
          right: "18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 14px",
          borderRadius: "8px",
          background: "rgba(10, 18, 34, 0.75)",
          border: "1px solid rgba(56, 189, 248, 0.15)",
          backdropFilter: "blur(8px)",
          pointerEvents: "none",
          fontSize: "11px",
        }}
      >
        <span style={{ color: "var(--foreground-dim)" }}>
          Active Nodes:{" "}
          <strong style={{ color: "#fff" }}>{totalProducts} Products</strong> ·{" "}
          <strong style={{ color: "var(--cyan)" }}>{totalOrders} Orders</strong>
        </span>
        <span
          style={{
            color: "var(--amber)",
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: "10px",
          }}
        >
          {activeHolds} Active Holds
        </span>
      </div>
      </>}
    </div>
  );
}
