"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export default function DashboardHoloSphere({
  totalProducts = "0",
  totalOrders = "0",
  activeHolds = "0",
}: {
  totalProducts?: string;
  totalOrders?: string;
  activeHolds?: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let width = mount.clientWidth || 400;
    let height = mount.clientHeight || 260;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 1.2, 5.5);

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
    const sphereGeo = new THREE.IcosahedronGeometry(1.6, 2);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.28,
    });
    const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    rootGroup.add(sphereMesh);

    // Inner glowing core
    const innerGeo = new THREE.SphereGeometry(1.0, 16, 16);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x14b8a6,
      wireframe: true,
      transparent: true,
      opacity: 0.18,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    rootGroup.add(innerMesh);

    // Orbital Ring 1: Cyan Equator
    const ring1Geo = new THREE.RingGeometry(2.1, 2.14, 64);
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
    });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    ring1.rotation.x = Math.PI / 2.3;
    rootGroup.add(ring1);

    // Orbital Ring 2: Violet Polar Ring
    const ring2Geo = new THREE.RingGeometry(2.35, 2.38, 64);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.x = -Math.PI / 3.8;
    ring2.rotation.y = Math.PI / 5;
    rootGroup.add(ring2);

    // Orbiting Data Nodes (representing channels: Website, Mobile, Store)
    const nodeCount = 6;
    const nodeGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const nodeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const nodes: THREE.Mesh[] = [];

    for (let i = 0; i < nodeCount; i++) {
      const node = new THREE.Mesh(nodeGeo, nodeMat);
      rootGroup.add(node);
      nodes.push(node);
    }

    // Atmospheric Particle Dust
    const particleCount = 75;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 8;
      positions[i + 1] = (Math.random() - 0.5) * 6;
      positions[i + 2] = (Math.random() - 0.5) * 6;
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x00f0ff,
      size: 0.04,
      transparent: true,
      opacity: 0.55,
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
      targetRotY = x * 0.45;
      targetRotX = -y * 0.35;
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
      width = mount.clientWidth;
      height = mount.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      activeRenderer.setSize(width, height);
    };
    window.addEventListener("resize", onResize);

    // Animation Loop
    const clock = new THREE.Clock();

    const animate = () => {
      if (contextLost) return;
      animationId = requestAnimationFrame(animate);
      if (!isVisible) return;

      const elapsed = clock.getElapsedTime();

      // Smooth parallax lerp
      rootGroup.rotation.x += (targetRotX - rootGroup.rotation.x) * 0.05;
      rootGroup.rotation.y += (targetRotY - rootGroup.rotation.y) * 0.05;

      // Continuous sphere rotations
      sphereMesh.rotation.y = elapsed * 0.15;
      sphereMesh.rotation.x = elapsed * 0.08;
      innerMesh.rotation.y = -elapsed * 0.22;

      // Orbiting rings
      ring1.rotation.z = elapsed * 0.25;
      ring2.rotation.z = -elapsed * 0.18;

      // Position satellite nodes on the rings
      nodes.forEach((node, i) => {
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
      innerGeo.dispose();
      innerMat.dispose();
      ring1Geo.dispose();
      ring1Mat.dispose();
      ring2Geo.dispose();
      ring2Mat.dispose();
      nodeGeo.dispose();
      nodeMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      activeRenderer.dispose();

      if (mount.contains(activeRenderer.domElement)) {
        mount.removeChild(activeRenderer.domElement);
      }
    };
  }, []);

  return (
    <div
      className="holo-sphere-card"
      style={{
        position: "relative",
        width: "100%",
        height: "260px",
        borderRadius: "16px",
        background:
          "linear-gradient(135deg, rgba(8, 16, 32, 0.85), rgba(4, 9, 20, 0.95))",
        border: "1px solid rgba(56, 189, 248, 0.22)",
        boxShadow:
          "0 20px 50px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
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
        <div role="status" style={{ position: "relative", zIndex: 1, color: "var(--foreground-dim)", fontSize: "12px", textAlign: "center", padding: "20px" }}>
          3D visualization is unavailable on this device. Dashboard data remains available below.
        </div>
      )}

      <span className="hud-corner hud-tl" />
      <span className="hud-corner hud-tr" />
      <span className="hud-corner hud-bl" />
      <span className="hud-corner hud-br" />

      {/* Top telemetry bar */}
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

      {/* Bottom telemetry overlay pill */}
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
    </div>
  );
}
