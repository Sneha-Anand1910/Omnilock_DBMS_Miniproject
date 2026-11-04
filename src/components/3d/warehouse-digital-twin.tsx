"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { InventoryRecord, WarehouseOption } from "@/lib/inventory";
import { playHoverSound, playInspectSound } from "@/lib/sound";

export default function WarehouseDigitalTwin({
  records,
  warehouses,
  threshold,
  onSelectRecord,
}: {
  records: InventoryRecord[];
  warehouses: WarehouseOption[];
  threshold: number;
  onSelectRecord?: (record: InventoryRecord) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const viewPresetRef = useRef<"iso" | "aisle" | "top">("iso");
  const onSelectRecordRef = useRef(onSelectRecord);
  onSelectRecordRef.current = onSelectRecord;
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<number | "ALL">("ALL");
  const [inspectedRecord, setInspectedRecord] = useState<InventoryRecord | null>(null);
  const [viewPreset, setViewPreset] = useState<"iso" | "aisle" | "top">("iso");
  viewPresetRef.current = viewPreset;

  // Filter records by selected warehouse
  const activeRecords = useMemo(
    () => records.filter((r) => selectedWarehouse === "ALL" || r.warehouse_id === selectedWarehouse),
    [records, selectedWarehouse]
  );

  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    const targets = {
      iso: { pos: [16, 14, 22], look: [0, 2, 0] },
      aisle: { pos: [-2, 3.5, 9], look: [-2, 2.5, -4] },
      top: { pos: [0, 26, 0.1], look: [0, 0, 0] },
    } as const;
    const target = targets[viewPreset];
    camera.position.set(target.pos[0], target.pos[1], target.pos[2]);
    camera.lookAt(target.look[0], target.look[1], target.look[2]);
  }, [viewPreset]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let width = mount.clientWidth || 800;
    let height = mount.clientHeight || 500;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040814);
    scene.fog = new THREE.FogExp2(0x040814, 0.022);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    const initialTargets = {
      iso: { pos: [16, 14, 22], look: [0, 2, 0] },
      aisle: { pos: [-2, 3.5, 9], look: [-2, 2.5, -4] },
      top: { pos: [0, 26, 0.1], look: [0, 0, 0] },
    } as const;
    const initialTarget = initialTargets[viewPresetRef.current];
    camera.position.set(initialTarget.pos[0], initialTarget.pos[1], initialTarget.pos[2]);
    camera.lookAt(initialTarget.look[0], initialTarget.look[1], initialTarget.look[2]);
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer | undefined;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      mount.appendChild(renderer.domElement);
    } catch {
      renderer?.dispose();
      cameraRef.current = null;
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

    // Ambient & Directional Lighting
    const ambientLight = new THREE.AmbientLight(0x0f2038, 1.8);
    scene.add(ambientLight);

    const cyanSpot = new THREE.SpotLight(0x00f0ff, 3.5, 40, Math.PI / 4, 0.4);
    cyanSpot.position.set(12, 18, 15);
    cyanSpot.castShadow = true;
    scene.add(cyanSpot);

    const blueFill = new THREE.DirectionalLight(0x3b82f6, 1.2);
    blueFill.position.set(-15, 12, -10);
    scene.add(blueFill);

    const tealRim = new THREE.PointLight(0x14b8a6, 2, 25);
    tealRim.position.set(0, 6, 0);
    scene.add(tealRim);

    // Reflective Grid Floor
    const floorGeo = new THREE.PlaneGeometry(60, 60);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x060c18,
      roughness: 0.25,
      metalness: 0.85,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Floor Laser Waypoint Tracks
    const gridHelper = new THREE.GridHelper(50, 50, 0x00f0ff, 0x0c2545);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    // Storage Rack Rows Construction
    const clickableMeshes: { mesh: THREE.Mesh; record: InventoryRecord }[] = [];
    const rackGroup = new THREE.Group();
    scene.add(rackGroup);

    // Geometries & Shared Materials
    const uprightGeo = new THREE.BoxGeometry(0.12, 4.5, 0.12);
    const beamGeo = new THREE.BoxGeometry(3.6, 0.08, 1.0);
    const rackSteelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.9,
      roughness: 0.3,
    });

    const healthyMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00a3cc,
      emissiveIntensity: 0.35,
      roughness: 0.2,
      metalness: 0.5,
    });

    const lowMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.45,
      roughness: 0.2,
      metalness: 0.5,
    });

    const outMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
    });

    const reservedAccentMat = new THREE.MeshStandardMaterial({
      color: 0x8b5cf6,
      emissive: 0x7c3aed,
      emissiveIntensity: 0.5,
    });

    // Create 4 Industrial Rack Bays (representing storage zones)
    const bays = [
      { x: -7, z: -3 },
      { x: -7, z: 5 },
      { x: 3, z: -3 },
      { x: 3, z: 5 },
    ];

    bays.forEach((bay) => {
      // 4 upright structural columns
      [-1.8, 1.8].forEach((ox) => {
        [-0.5, 0.5].forEach((oz) => {
          const col = new THREE.Mesh(uprightGeo, rackSteelMat);
          col.position.set(bay.x + ox, 2.25, bay.z + oz);
          col.castShadow = true;
          rackGroup.add(col);
        });
      });

      // 3 Shelf Levels
      [0.8, 2.2, 3.6].forEach((levelY) => {
        const shelf = new THREE.Mesh(beamGeo, rackSteelMat);
        shelf.position.set(bay.x, levelY, bay.z);
        rackGroup.add(shelf);
      });
    });

    // Populate Crate Pods from Real PostgreSQL Inventory Records
    activeRecords.slice(0, 32).forEach((rec, idx) => {
      const bay = bays[idx % bays.length];
      const level = Math.floor((idx / bays.length) % 3);
      const levelY = [0.8, 2.2, 3.6][level] + 0.35;
      const slotX = (idx % 2 === 0 ? -0.8 : 0.8) + (Math.random() - 0.5) * 0.15;
      const slotZ = (idx % 3 === 0 ? -0.2 : 0.2);

      const isOut = rec.available <= 0;
      const isLow = rec.available <= threshold;

      const crateMat = isOut ? outMat : isLow ? lowMat : healthyMat;
      const crateSize = 0.55;
      const crateGeo = new THREE.BoxGeometry(crateSize, crateSize, crateSize);
      const crate = new THREE.Mesh(crateGeo, crateMat);

      crate.position.set(bay.x + slotX, levelY, bay.z + slotZ);
      crate.castShadow = !isOut;
      crate.receiveShadow = !isOut;

      // Small reserved top tag if reserved > 0
      if (rec.reserved > 0 && !isOut) {
        const resGeo = new THREE.BoxGeometry(0.2, 0.12, 0.2);
        const resMesh = new THREE.Mesh(resGeo, reservedAccentMat);
        resMesh.position.set(0, 0.32, 0);
        crate.add(resMesh);
      }

      crate.userData = { record: rec };
      rackGroup.add(crate);
      clickableMeshes.push({ mesh: crate, record: rec });
    });

    // Autonomous Guided Vehicles (AGVs) on floor tracks
    const agvGroup1 = new THREE.Group();
    const agvGroup2 = new THREE.Group();

    const agvBodyGeo = new THREE.BoxGeometry(1.4, 0.3, 0.9);
    const agvMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.8, roughness: 0.2 });

    const agv1 = new THREE.Mesh(agvBodyGeo, agvMat);
    agv1.position.y = 0.2;
    agvGroup1.add(agv1);

    const agvCrate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.7), healthyMat);
    agvCrate.position.y = 0.65;
    agvGroup1.add(agvCrate);

    // AGV Headlights
    const lightGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const hl1 = new THREE.Mesh(lightGeo, lightMat);
    hl1.position.set(0.7, 0.2, 0.3);
    const hl2 = new THREE.Mesh(lightGeo, lightMat);
    hl2.position.set(0.7, 0.2, -0.3);
    agvGroup1.add(hl1, hl2);

    const agv2 = agv1.clone();
    agvGroup2.add(agv2);

    scene.add(agvGroup1, agvGroup2);

    // Holographic Selection Wireframe
    const selectionGeo = new THREE.BoxGeometry(0.65, 0.65, 0.65);
    const selectionMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0,
    });
    const selectionBox = new THREE.Mesh(selectionGeo, selectionMat);
    scene.add(selectionBox);

    // Raycaster for Hover and Click
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-999, -999);
    let hoveredCrate: THREE.Mesh | null = null;

    const onPointerMove = (e: MouseEvent) => {
      const rect = mount.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    };

    const onClick = () => {
      if (hoveredCrate && hoveredCrate.userData.record) {
        playInspectSound();
        const rec = hoveredCrate.userData.record as InventoryRecord;
        setInspectedRecord(rec);
        onSelectRecordRef.current?.(rec);
      }
    };

    mount.addEventListener("mousemove", onPointerMove);
    mount.addEventListener("click", onClick);

    // Smooth Orbit Drag
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    const spherical = new THREE.Spherical(30, Math.PI / 3.2, Math.PI / 4.2);

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        isDragging = true;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
      }
    };

    const onMouseUp = () => { isDragging = false; };

    const onDragMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMouseX;
      const deltaY = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      spherical.theta -= deltaX * 0.006;
      spherical.phi = Math.max(0.1, Math.min(Math.PI / 2.05, spherical.phi - deltaY * 0.006));

      camera.position.setFromSpherical(spherical);
      camera.lookAt(0, 2, 0);
    };

    mount.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    mount.addEventListener("mousemove", onDragMove);

    // Resize Handler
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
    let animationId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      if (contextLost) return;
      animationId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Animate AGVs along track lanes
      const agvDist = (elapsed * 2.5) % 36;
      agvGroup1.position.set(-2, 0, -10 + agvDist);
      agvGroup1.rotation.y = 0;

      const agvDist2 = (elapsed * 2.0) % 36;
      agvGroup2.position.set(8, 0, 15 - agvDist2);
      agvGroup2.rotation.y = Math.PI;

      // Raycast against crates
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(clickableMeshes.map((c) => c.mesh));

      if (intersects.length > 0) {
        const top = intersects[0].object as THREE.Mesh;
        if (hoveredCrate !== top) {
          hoveredCrate = top;
          playHoverSound();
          selectionBox.position.copy(top.position);
          selectionMat.opacity = 0.95;
        }
      } else {
        hoveredCrate = null;
        selectionMat.opacity = 0;
      }

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
      mount.removeEventListener("mousemove", onPointerMove);
      mount.removeEventListener("click", onClick);
      mount.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      mount.removeEventListener("mousemove", onDragMove);
      window.removeEventListener("resize", onResize);
      activeRenderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      cameraRef.current = null;

      // Dispose every scene-owned resource, including per-crate and helper geometries.
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
          geometries.add(object.geometry);
          const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
          meshMaterials.forEach((material) => materials.add(material));
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      cyanSpot.shadow.map?.dispose();
      activeRenderer.dispose();

      if (mount.contains(activeRenderer.domElement)) {
        mount.removeChild(activeRenderer.domElement);
      }
    };
  }, [activeRecords, threshold]);

  return (
    <div className="warehouse-3d-card" style={{ position: "relative", width: "100%", borderRadius: "16px", overflow: "hidden", border: "1px solid rgba(56, 189, 248, 0.22)", boxShadow: "0 24px 60px rgba(0, 0, 0, 0.75)" }}>
      {/* 3D Canvas Mount */}
      <div ref={mountRef} style={{ width: "100%", height: "480px", cursor: "grab" }} />
      {webglUnavailable && (
        <div role="status" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", textAlign: "center", color: "var(--foreground-dim)", background: "rgba(10, 18, 34, 0.9)", zIndex: 1 }}>
          3D warehouse view is unavailable on this device. Use the Data Grid to inspect inventory.
        </div>
      )}

      <span className="hud-corner hud-tl" />
      <span className="hud-corner hud-tr" />
      <span className="hud-corner hud-bl" />
      <span className="hud-corner hud-br" />

      {/* Top HUD Controls Overlay */}
      <div style={{ position: "absolute", top: "14px", left: "16px", right: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", pointerEvents: "auto", zIndex: 10 }}>
        {/* Warehouse Selector */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "rgba(10, 18, 34, 0.85)", backdropFilter: "blur(12px)", padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(56, 189, 248, 0.25)" }}>
          <span style={{ fontSize: "10px", color: "var(--cyan)", fontFamily: "var(--font-geist-mono), monospace", fontWeight: 700 }}>WAREHOUSE:</span>
          <select
            value={selectedWarehouse}
            onChange={(e) => setSelectedWarehouse(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
            style={{ background: "transparent", border: "none", color: "#fff", fontSize: "12px", fontWeight: 600, outline: "none", cursor: "pointer" }}
          >
            <option value="ALL" style={{ background: "#0b1426" }}>All Warehouses ({warehouses.length})</option>
            {warehouses.map((w) => (
              <option key={w.warehouse_id} value={w.warehouse_id} style={{ background: "#0b1426" }}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        {/* View Camera Presets */}
        <div style={{ display: "flex", gap: "6px", background: "rgba(10, 18, 34, 0.85)", backdropFilter: "blur(12px)", padding: "4px 8px", borderRadius: "8px", border: "1px solid rgba(56, 189, 248, 0.2)" }}>
          <span style={{ fontSize: "10px", color: "var(--foreground-muted)", alignSelf: "center", marginRight: "4px", fontFamily: "var(--font-geist-mono), monospace" }}>CAMERA:</span>
          {(["iso", "aisle", "top"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => { setViewPreset(mode); playHoverSound(); }}
              style={{
                padding: "4px 8px",
                borderRadius: "5px",
                fontSize: "10px",
                fontFamily: "var(--font-geist-mono), monospace",
                fontWeight: 600,
                color: viewPreset === mode ? "#fff" : "var(--foreground-muted)",
                background: viewPreset === mode ? "rgba(0, 240, 255, 0.22)" : "transparent",
                border: viewPreset === mode ? "1px solid var(--cyan)" : "1px solid transparent",
              }}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Floating HUD Inspector Panel for Selected Crate */}
      {inspectedRecord && (
        <div
          style={{
            position: "absolute",
            bottom: "16px",
            right: "16px",
            width: "320px",
            background: "rgba(10, 18, 34, 0.92)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(0, 240, 255, 0.45)",
            boxShadow: "0 16px 40px rgba(0, 0, 0, 0.8), 0 0 20px rgba(0, 240, 255, 0.15)",
            borderRadius: "12px",
            padding: "16px",
            zIndex: 20,
            animation: "arrive 0.2s ease-out",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
            <div>
              <span style={{ fontSize: "9px", color: "var(--cyan)", fontFamily: "var(--font-geist-mono), monospace", letterSpacing: "1px" }}>
                INSPECTED POD · {inspectedRecord.sku}
              </span>
              <h3 style={{ fontSize: "14px", color: "#fff", fontWeight: 700, margin: "2px 0 0" }}>
                {inspectedRecord.product_name}
              </h3>
            </div>
            <button
              onClick={() => setInspectedRecord(null)}
              style={{ color: "var(--foreground-muted)", fontSize: "14px", padding: "2px 6px" }}
              aria-label="Close inspection panel"
            >
              ×
            </button>
          </div>

          <div style={{ fontSize: "11px", color: "var(--foreground-dim)", marginBottom: "12px" }}>
            Warehouse: <strong style={{ color: "#fff" }}>{inspectedRecord.warehouse}</strong>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", background: "rgba(14, 25, 46, 0.7)", padding: "10px", borderRadius: "8px", border: "1px solid rgba(56, 189, 248, 0.15)", marginBottom: "12px" }}>
            <div style={{ textAlign: "center" }}>
              <span style={{ display: "block", fontSize: "9px", color: "var(--foreground-muted)" }}>ON HAND</span>
              <strong style={{ fontSize: "14px", color: "#fff", fontFamily: "var(--font-geist-mono), monospace" }}>{inspectedRecord.total}</strong>
            </div>
            <div style={{ textAlign: "center" }}>
              <span style={{ display: "block", fontSize: "9px", color: "var(--foreground-muted)" }}>RESERVED</span>
              <strong style={{ fontSize: "14px", color: "var(--violet)", fontFamily: "var(--font-geist-mono), monospace" }}>{inspectedRecord.reserved}</strong>
            </div>
            <div style={{ textAlign: "center" }}>
              <span style={{ display: "block", fontSize: "9px", color: "var(--foreground-muted)" }}>AVAILABLE</span>
              <strong style={{ fontSize: "14px", color: inspectedRecord.available <= threshold ? "var(--amber)" : "var(--teal)", fontFamily: "var(--font-geist-mono), monospace" }}>
                {inspectedRecord.available}
              </strong>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span
              style={{
                fontSize: "10px",
                padding: "3px 8px",
                borderRadius: "4px",
                fontWeight: 600,
                color: inspectedRecord.available <= 0 ? "var(--red)" : inspectedRecord.available <= threshold ? "var(--amber)" : "var(--teal)",
                background: inspectedRecord.available <= 0 ? "rgba(239, 68, 68, 0.15)" : inspectedRecord.available <= threshold ? "rgba(245, 158, 11, 0.15)" : "rgba(20, 184, 166, 0.15)",
                border: "1px solid currentColor",
              }}
            >
              {inspectedRecord.available <= 0 ? "OUT OF STOCK" : inspectedRecord.available <= threshold ? "LOW STOCK" : "OPTIMAL LEVEL"}
            </span>
            <button
              className="button"
              onClick={() => {
                onSelectRecord?.(inspectedRecord);
                playInspectSound();
              }}
              style={{ minHeight: "28px", padding: "4px 10px", fontSize: "10px" }}
            >
              Filter in Table →
            </button>
          </div>
        </div>
      )}

      {/* Legend pill bottom left */}
      <div style={{ position: "absolute", bottom: "16px", left: "16px", display: "flex", gap: "12px", background: "rgba(10, 18, 34, 0.8)", backdropFilter: "blur(8px)", padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(56, 189, 248, 0.15)", fontSize: "10px", fontFamily: "var(--font-geist-mono), monospace" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "5px", color: "var(--teal)" }}>
          <span style={{ width: "8px", height: "8px", background: "var(--cyan)", borderRadius: "2px" }} /> Healthy
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "5px", color: "var(--amber)" }}>
          <span style={{ width: "8px", height: "8px", background: "var(--amber)", borderRadius: "2px" }} /> Low Stock
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "5px", color: "var(--violet)" }}>
          <span style={{ width: "8px", height: "8px", background: "var(--violet)", borderRadius: "2px" }} /> Reserved
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "5px", color: "var(--red)" }}>
          <span style={{ width: "8px", height: "8px", border: "1px solid var(--red)", borderRadius: "2px" }} /> Out
        </span>
      </div>
    </div>
  );
}
