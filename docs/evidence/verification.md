# Phase 0 validation evidence

2026-10-09, Linux container. Node 24.19; Phaser 4.2.1.

- Dependency installation succeeded; exact lockfile committed.
- TypeScript, ESLint, 9 Vitest tests (including seeded properties) and production Vite build passed.
- Five Playwright scenarios passed: lab controls/inspection/replay, keyboard/boarding at 844×390, seven frozen-angle visual regressions, actual touch dragging at DPR 2, and production gameplay with no debug API. Production boarding was exercised in real time.
- Inspected pilot-lab.png, mobile-play.png, mobile-touch.png and the 13-frame contact sheet. Reviewed cardinal/359° views and each 60–66° view before initial baseline acceptance. Baseline comparison then passed without regeneration.
- Narrow sweep at tick 21: 292–340 changed pixels per adjacent angle, zero component visibility changes, zero geometry/constraint warnings. Drawing-order positions do change; no corresponding whole-leg pop was visible in this specific sweep. This is not proof of correctness for all poses.
- Production bundle excludes the dev API/Tweakpane module. Build is approximately 1.50 MB uncompressed / 394 KB gzip, primarily Phaser.

Environment limitation: Playwright's normal browser CDN returned invalid archives here. Local browser execution used a separately extracted Chromium 133 executable, selected by PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH. That browser is not a project dependency or required end-user workaround. CI installs Playwright 1.58.2's pinned Chromium normally. Browser/platform rasterization differences can affect baselines; investigate differences, do not automatically accept them.

No physical Android device, thermal test, native Capacitor package or multi-actor load test was available. No real-device 60 FPS claim is made. Broad-body occlusion remains a known limit. The motion module was subsequently fully typed; see [review follow-up evidence](motion-review.md).

Evidence files are repository review artifacts, not golden performance benchmarks. The contact sheet order and diagnostic changes are in sweep.json.
