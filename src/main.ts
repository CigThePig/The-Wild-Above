import Phaser from "phaser";
import { FieldScene } from "./game/scene";
import "./style.css";
const lab =
  import.meta.env.DEV && new URLSearchParams(location.search).has("lab");
document.body.classList.toggle("lab", lab);
if (!import.meta.env.DEV) document.getElementById("lab-link")!.remove();
const scene = new FieldScene();
if (import.meta.env.DEV)
  scene.onReady = () => {
    import("./tools/rig-lab")
      .then(({ installLab }) => installLab(scene))
      .catch((error: unknown) =>
        console.error("Rig Lab failed to load", error),
      );
  };
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#263934",
  scale: { mode: Phaser.Scale.RESIZE, width: 800, height: 500 },
  scene: [scene],
  input: { activePointers: 3 },
  // Clipped fragments share exact edges; Phaser's default 1px path
  // simplification can independently discard their boundary vertices.
  render: { antialias: true, pathDetailThreshold: 0 },
  fps: { target: 60 },
});

const host = document.getElementById("game")!;
new ResizeObserver(() =>
  game.scale.setParentSize(host.clientWidth, host.clientHeight),
).observe(host);
