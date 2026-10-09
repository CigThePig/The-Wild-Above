import "./phaser-global";
import Phaser from "phaser";
import VirtualJoystick from "phaser3-rex-plugins/plugins/virtualjoystick.js";
import { Simulation, DT } from "../animation/simulation";
import { buildRig } from "../animation/rig";
import { drawRig } from "../rendering/draw";
import { project } from "../rendering/geometry";
import type { Input } from "../animation/types";
export class FieldScene extends Phaser.Scene {
  sim = new Simulation();
  lab = false;
  isolated = true;
  paused = false;
  rate = 1;
  guides = true;
  selected = "mech.leg.right.knee";
  accumulator = 0;
  droppedSeconds = 0;
  renderMs = 0;
  rig = buildRig(this.sim.world, this.sim.config, true);
  graphics!: Phaser.GameObjects.Graphics;
  joystick!: VirtualJoystick;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  onFrame?: () => void;
  onReady?: () => void;
  constructor() {
    super("field");
  }
  create() {
    this.lab =
      import.meta.env.DEV && new URLSearchParams(location.search).has("lab");
    this.paused = this.lab;
    this.graphics = this.add.graphics();
    const ground = this.add.graphics().setDepth(-1);
    ground.lineStyle(0.5, 0x79978b, 0.14);
    for (let x = -500; x <= 500; x += 48) ground.lineBetween(x, -300, x, 300);
    for (let y = -300; y <= 300; y += 48) ground.lineBetween(-500, y, 500, y);
    ground.lineStyle(2, 0x79978b, 0.5);
    ground.strokeRect(-450, -252, 900, 504);
    this.keys = this.input.keyboard!.addKeys(
      "W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,Q,E,F",
    ) as typeof this.keys;
    this.input.keyboard!.on("keydown-F", () => {
      if (!this.lab) this.sim.interact();
    });
    this.input.addPointer(2);
    this.joystick = new VirtualJoystick(this, {
      x: 90,
      y: this.scale.height - 95,
      radius: 45,
      base: this.add
        .circle(0, 0, 54, 0x96b9a5, 0.17)
        .setScrollFactor(0)
        .setDepth(10),
      thumb: this.add
        .circle(0, 0, 22, 0xb9d1af, 0.65)
        .setScrollFactor(0)
        .setDepth(11),
      dir: "8dir",
      forceMin: 5,
    });
    this.joystick.setEnable(!this.lab);
    (this.joystick.base as Phaser.GameObjects.Arc).setVisible(!this.lab);
    (this.joystick.thumb as Phaser.GameObjects.Arc).setVisible(!this.lab);
    this.cameras.main.ignore([this.joystick.base, this.joystick.thumb]);
    const hud = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    hud.ignore([this.graphics, ground]);
    this.scale.on("resize", () =>
      hud.setSize(this.scale.width, this.scale.height),
    );
    this.scale.on("resize", () => this.layout());
    this.game.events.on("blur", () => {
      this.input.keyboard?.resetKeys();
      this.accumulator = 0;
    });
    this.layout();
    document.getElementById("interact")!.onclick = () => {
      this.sim.interact();
      this.refresh();
    };
    this.refresh();
    this.onReady?.();
  }
  layout() {
    const zoom = this.lab
      ? this.sim.config.actor === "pilot"
        ? 6
        : 3
      : Math.max(1.25, Math.min(2.5, this.scale.width / 480));
    this.cameras.main.setZoom(zoom);
    this.joystick?.setPosition(85, this.scale.height - 85);
  }
  movement(): Input {
    const k = this.keys;
    const input = {
      x:
        Number(k.D.isDown || k.RIGHT.isDown) -
        Number(k.A.isDown || k.LEFT.isDown) +
        (this.joystick.force > 5
          ? Math.cos(this.joystick.rotation) *
            Math.min(1, this.joystick.force / 45)
          : 0),
      y:
        Number(k.S.isDown || k.DOWN.isDown) -
        Number(k.W.isDown || k.UP.isDown) +
        (this.joystick.force > 5
          ? Math.sin(this.joystick.rotation) *
            Math.min(1, this.joystick.force / 45)
          : 0),
      fast: k.SHIFT.isDown || this.joystick.force > 35,
      turn: Number(k.E.isDown) - Number(k.Q.isDown),
    };
    const length = Math.max(1, Math.hypot(input.x, input.y));
    input.x /= length;
    input.y /= length;
    return input;
  }
  update(_time: number, delta: number) {
    if (!this.graphics) return;
    if (!this.paused) {
      const seconds = (delta / 1000) * this.rate;
      this.droppedSeconds += Math.max(0, seconds - 0.1);
      this.accumulator += Math.min(0.1, seconds);
      while (this.accumulator >= DT) {
        this.sim.step(1, this.lab ? undefined : this.movement());
        this.accumulator -= DT;
      }
    }
    this.refresh();
  }
  refresh() {
    if (!this.graphics) return;
    const start = performance.now();
    this.rig = buildRig(
      this.sim.world,
      this.sim.config,
      this.lab && this.isolated,
    );
    drawRig(
      this.graphics,
      this.rig,
      this.lab && this.guides,
      this.lab ? this.selected : "",
    );
    const actor = this.sim.world.actor,
      p = project({
        x: actor.x,
        y: actor.y,
        z: this.lab ? (this.sim.config.actor === "pilot" ? 18 : 40) : 22,
      });
    this.cameras.main.centerOn(p.x, p.y);
    this.renderMs = performance.now() - start;
    const w = this.sim.world;
    document.getElementById("status")!.textContent =
      `${this.lab ? "RIG LAB" : w.control === "foot" ? "PILOT" : "MECH"} · ${w.transition?.stage ?? this.sim.config.animation} · ${Math.round(this.game.loop.actualFps)} FPS · ${this.renderMs.toFixed(1)} ms rig`;
    const button = document.getElementById("interact") as HTMLButtonElement;
    button.hidden = this.lab;
    button.disabled = !!w.transition || (w.control === "foot" && !w.nearby);
    button.textContent = w.transition
      ? "Transferring…"
      : w.control === "foot"
        ? "Enter Mech · F"
        : "Exit Mech · F";
    this.onFrame?.();
  }
}
