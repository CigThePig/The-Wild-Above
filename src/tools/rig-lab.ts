import { Pane } from "tweakpane";
import type { FieldScene } from "../game/scene";
import { configSchema, type RigConfig } from "../animation/config";
import type { ActorId, Input } from "../animation/types";
export function installLab(scene: FieldScene) {
  let syncUI = () => {};
  let syncing = false;
  const refresh = () => {
    scene.accumulator = 0;
    scene.layout();
    scene.refresh();
    syncUI();
  };
  const api = {
    setIsolation: (value: boolean) => {
      if (syncing) return;
      scene.isolated = value;
      scene.refresh();
      syncUI();
    },
    setGuides: (value: boolean) => {
      if (syncing) return;
      scene.guides = value;
      scene.refresh();
      syncUI();
    },
    selectComponent: (id: string) => {
      if (id && !scene.rig.components.some((c) => c.id === id))
        throw Error(`Unknown component: ${id}`);
      scene.selected = id;
      scene.refresh();
    },
    selectActor: (actor: ActorId) => {
      if (syncing) return;
      scene.sim.configure({ actor });
      refresh();
    },
    setHeading: (heading: number) => {
      if (syncing) return;
      scene.sim.configure({ heading });
      refresh();
    },
    setAnimation: (animation: RigConfig["animation"]) => {
      if (syncing) return;
      scene.sim.configure({ animation });
      refresh();
    },
    setAnimationTime: (seconds: number) => {
      if (syncing) return;
      scene.sim.seek(seconds);
      refresh();
    },
    pause: () => {
      scene.paused = true;
      scene.accumulator = 0;
      syncUI();
    },
    resume: () => {
      scene.paused = false;
      syncUI();
    },
    step: (frames = 1) => {
      scene.sim.step(frames);
      refresh();
    },
    advance: (frames: number, input: Input) => {
      scene.sim.step(frames, input);
      refresh();
    },
    interact: () => scene.sim.interact(),
    configure: (config: Partial<RigConfig>) => {
      if (syncing) return;
      scene.sim.configure(config);
      refresh();
    },
    inspect: () => ({
      version: 1,
      seed: scene.sim.seed,
      tick: scene.sim.tick,
      config: { ...scene.sim.config },
      control: scene.sim.world.control,
      selected: scene.selected,
      transition: structuredClone(scene.sim.world.transition),
      interactionFailure: scene.sim.world.interactionFailure,
      components: structuredClone(scene.rig.components),
      drawOrder: scene.rig.shapes.map((s) => s.id),
      surfaceStats: scene.rig.occlusion.stats,
      occlusionMethod: scene.rig.occlusion.method,
      occlusionDiagnostics: scene.rig.occlusion.diagnostics,
      diagnostics: scene.rig.components.flatMap((c) =>
        c.issues.map((issue) => ({ component: c.id, issue })),
      ),
      performance: {
        renderMs: scene.renderMs,
        droppedSeconds: scene.droppedSeconds,
      },
      snapshot: scene.sim.snapshot(),
    }),
    inspectComponent: (id: string) => {
      const c = scene.rig.components.find((c) => c.id === id);
      if (!c) throw Error(`Unknown component: ${id}`);
      return {
        ...structuredClone(c),
        geometry: structuredClone(
          scene.rig.shapes.filter((s) => s.component === id),
        ),
      };
    },
    inspectPerformance: () => ({
      renderMs: scene.renderMs,
      generationMs: scene.rig.generationMs,
      resolutionMs: scene.rig.occlusion.stats.resolutionMs,
      fragments: scene.rig.occlusion.stats.fragments,
      comparisons: scene.rig.occlusion.stats.comparisons,
      drawVertices: scene.rig.occlusion.stats.drawVertices,
    }),
    inspectSurface: (id: string) => {
      const surface = scene.rig.surfaces.find((s) => s.id === id);
      if (!surface) throw Error(`Unknown surface: ${id}`);
      return {
        ...structuredClone(surface),
        geometry: structuredClone(
          scene.rig.occlusion.fragments.filter((f) => f.source === id),
        ),
        exception: null,
        resolution: scene.rig.occlusion.method,
        decisions: structuredClone(
          scene.rig.occlusion.decisions.filter((d) => d.a === id || d.b === id),
        ),
      };
    },
    inspectOcclusion: () =>
      structuredClone({
        method: scene.rig.occlusion.method,
        fallbackReason: scene.rig.occlusion.fallbackReason,
        surfaces: scene.rig.surfaces,
        decisions: scene.rig.occlusion.decisions,
        diagnostics: scene.rig.occlusion.diagnostics,
        stats: scene.rig.occlusion.stats,
        generationMs: scene.rig.generationMs,
        exceptions: [
          {
            component: "mech.cockpit.hatch",
            reason:
              "continuous directional width collapse and legacy +15 depth bias",
            depthModel: "representative",
          },
        ],
        approximations:
          "Legacy silhouettes and limb slices use constant representative depth. Transparent legacy pairs retain painter ordering.",
      }),
    selectSurface: (id: string) => {
      if (id && !scene.rig.surfaces.some((s) => s.id === id))
        throw Error(`Unknown surface: ${id}`);
      scene.selectedSurface = id;
      scene.refresh();
    },
    setSurfaceGuides: (value: boolean) => {
      if (syncing) return;
      scene.surfaceGuides = value;
      scene.refresh();
      syncUI();
    },
    recording: () => scene.sim.recording(),
    replay: (recording: unknown) => {
      scene.sim.replay(recording);
      refresh();
    },
    exportConfig: () => JSON.stringify(scene.sim.config, null, 2),
    importConfig: (json: string) => {
      scene.sim.configure(configSchema.parse(JSON.parse(json)));
      refresh();
    },
  };
  window.rigLab = api;
  if (!scene.lab) return;
  document.getElementById("inspector")!.hidden = false;
  document.getElementById("help")!.textContent =
    "Fixed 60 Hz · time seeks replay from reset";
  const state = {
    ...scene.sim.config,
    paused: scene.paused,
    playbackSpeed: 1,
    guides: true,
    isolated: true,
    surfaces: false,
    time: 0,
    elapsed: 0,
  };
  const pane = new Pane({
    container: document.getElementById("pane")!,
    title: "Rig Lab · deterministic preview",
  });
  pane
    .addBinding(state, "actor", { options: { Mech: "mech", Pilot: "pilot" } })
    .on("change", (e) => api.selectActor(e.value));
  pane
    .addBinding(state, "heading", { min: 0, max: 359, step: 1 })
    .on("change", (e) => api.setHeading(e.value));
  pane
    .addBinding(state, "animation", {
      options: { Idle: "idle", Walk: "walk", Run: "run" },
    })
    .on("change", (e) => api.setAnimation(e.value));
  pane.addBinding(state, "paused").on("change", (e) => {
    scene.paused = e.value;
    scene.accumulator = 0;
  });
  pane
    .addBinding(state, "playbackSpeed", { min: 0.1, max: 2 })
    .on("change", (e) => (scene.rate = e.value));
  // Scrubbing is capped at the deterministic 60 s seek horizon; the read-only
  // elapsed monitor continues to show the actual clock during longer playback.
  pane
    .addBinding(state, "time", { min: 0, max: 60, step: 1 / 60 })
    .on("change", (e) => api.setAnimationTime(e.value));
  pane.addBinding(state, "elapsed", {
    label: "Elapsed (s)",
    readonly: true,
  });
  pane.addButton({ title: "Step 1 frame" }).on("click", () => {
    api.pause();
    state.paused = true;
    api.step();
    pane.refresh();
  });
  pane
    .addBinding(state, "guides")
    .on("change", (e) => (scene.guides = e.value));
  pane
    .addBinding(state, "isolated", { label: "Isolate actor" })
    .on("change", (e) => api.setIsolation(e.value));
  pane
    .addBinding(state, "surfaces", { label: "Surface boundaries" })
    .on("change", (e) => api.setSurfaceGuides(e.value));
  const motion = pane.addFolder({
    title: "Motion parameters",
    expanded: false,
  });
  for (const key of ["speed", "stride", "stepHeight", "bob"] as const)
    motion
      .addBinding(state, key, {
        min: key === "speed" ? 0.25 : key === "stride" ? 0.5 : 0,
        max: key === "speed" || key === "stride" ? 1.25 : 1.5,
        step: 0.05,
      })
      .on("change", (e) => api.configure({ [key]: e.value }));
  motion
    .addBinding(state, "kneeLimit", {
      label: "Flexion warning °",
      min: 30,
      max: 180,
      step: 1,
    })
    .on("change", (e) => api.configure({ kneeLimit: e.value }));
  motion
    .addBinding(state, "color")
    .on("change", (e) => api.configure({ color: e.value }));
  syncUI = () => {
    syncing = true;
    try {
      Object.assign(state, scene.sim.config, {
        paused: scene.paused,
        time: Math.min(scene.sim.tick / 60, 60),
        elapsed: scene.sim.tick / 60,
        guides: scene.guides,
        surfaces: scene.surfaceGuides,
        isolated: scene.isolated,
      });
      pane.refresh();
    } finally {
      syncing = false;
    }
  };
  const select = document.getElementById("components") as HTMLSelectElement;
  const surfaceSelect = document.createElement("select");
  surfaceSelect.id = "surfaces";
  surfaceSelect.setAttribute("aria-label", "Surface selection");
  select.after(surfaceSelect);
  surfaceSelect.onchange = () => api.selectSurface(surfaceSelect.value);
  let surfaceSignature = "";
  let signature = "";
  let lastSyncedTick = -Infinity;
  let lastSyncedPaused = scene.paused;
  scene.onFrame = () => {
    // Updating all pane bindings each draw is costly; 10 Hz is enough for
    // readable timing while pause/resume and seeks synchronize immediately.
    const tick = scene.sim.tick;
    if (
      scene.paused !== lastSyncedPaused ||
      tick < lastSyncedTick ||
      tick - lastSyncedTick >= 6
    ) {
      syncUI();
      lastSyncedTick = tick;
      lastSyncedPaused = scene.paused;
    }
    const next = scene.rig.components.map((c) => c.id).join();
    if (signature !== next) {
      signature = next;
      const none = document.createElement("option");
      none.value = "";
      none.textContent = "None / no highlight";
      select.replaceChildren(
        none,
        ...scene.rig.components.map((c) => {
          const o = document.createElement("option");
          o.value = c.id;
          o.textContent = `${"  ".repeat(c.id.split(".").length - 1)}${c.id}`;
          return o;
        }),
      );
      if (
        scene.selected &&
        !scene.rig.components.some((c) => c.id === scene.selected)
      )
        scene.selected = scene.rig.components[0].id;
      select.value = scene.selected;
    }
    select.value = scene.selected;
    const surfaceNext = scene.rig.surfaces.map((s) => s.id).join();
    if (surfaceSignature !== surfaceNext) {
      surfaceSignature = surfaceNext;
      surfaceSelect.replaceChildren(
        ...["", ...scene.rig.surfaces.map((s) => s.id)].map((id) => {
          const o = document.createElement("option");
          o.value = id;
          o.textContent = id || "None / surface highlight";
          return o;
        }),
      );
      if (!scene.rig.surfaces.some((s) => s.id === scene.selectedSurface))
        scene.selectedSurface = "";
    }
    surfaceSelect.value = scene.selectedSurface;
    const c = scene.selectedSurface
      ? api.inspectSurface(scene.selectedSurface)
      : scene.rig.components.find((c) => c.id === scene.selected);
    document.getElementById("details")!.textContent = JSON.stringify(
      c,
      null,
      2,
    );
  };
  select.onchange = () => {
    scene.selected = select.value;
    scene.refresh();
  };
  document.getElementById("export")!.onclick = () => {
    const url = URL.createObjectURL(
        new Blob([api.exportConfig()], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "rig-config.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  document.getElementById("import")!.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      api.importConfig(await file.text());
      Object.assign(state, scene.sim.config);
      pane.refresh();
      document.getElementById("error")!.textContent = "";
    } catch (error) {
      document.getElementById("error")!.textContent = String(error);
    }
  };
  refresh();
  return api;
}
export type RigLab = NonNullable<ReturnType<typeof installLab>>;
declare global {
  interface Window {
    rigLab: RigLab;
  }
}
