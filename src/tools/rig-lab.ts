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
    },
    resume: () => {
      scene.paused = false;
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
      transition: scene.sim.world.transition,
      components: structuredClone(scene.rig.components),
      drawOrder: scene.rig.shapes.map((s) => s.id),
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
    time: 0,
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
  pane
    .addBinding(state, "time", { min: 0, max: 10, step: 1 / 60 })
    .on("change", (e) => api.setAnimationTime(e.value));
  pane.addButton({ title: "Step 1 frame" }).on("click", () => {
    api.pause();
    state.paused = true;
    api.step();
    pane.refresh();
  });
  pane
    .addBinding(state, "guides")
    .on("change", (e) => (scene.guides = e.value));
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
    Object.assign(state, scene.sim.config, {
      paused: scene.paused,
      time: scene.sim.tick / 60,
    });
    pane.refresh();
    syncing = false;
  };
  const select = document.getElementById("components") as HTMLSelectElement;
  let signature = "";
  scene.onFrame = () => {
    const next = scene.rig.components.map((c) => c.id).join();
    if (signature !== next) {
      signature = next;
      select.replaceChildren(
        ...scene.rig.components.map((c) => {
          const o = document.createElement("option");
          o.value = c.id;
          o.textContent = `${"  ".repeat(c.id.split(".").length - 1)}${c.id}`;
          return o;
        }),
      );
      if (!scene.rig.components.some((c) => c.id === scene.selected))
        scene.selected = scene.rig.components[0].id;
      select.value = scene.selected;
    }
    const c = scene.rig.components.find((c) => c.id === scene.selected);
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
