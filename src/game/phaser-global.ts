import Phaser from "phaser";
// Rex's independently packaged joystick references the engine global.
// Keep this compatibility boundary here rather than importing the entire plugin suite.
(globalThis as unknown as { Phaser: typeof Phaser }).Phaser = Phaser;
