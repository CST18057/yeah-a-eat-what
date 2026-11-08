"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildFingerprint,
  parseArgs,
  redact,
  tail,
} = require("./release-gate");

function sampleReport() {
  return {
    candidate: {
      repo: "owner/repo",
      requestedRef: "main",
      commit: "a".repeat(40),
      tree: "b".repeat(40),
      projectSubdir: "lunch-picker",
    },
    environment: {
      node: "v20.0.0",
      npm: "10.0.0",
      git: "git version 2.0.0",
      platform: "linux-x64",
    },
    knownBlockers: [],
    steps: [
      {
        name: "service tests",
        command: "npm test",
        status: "pass",
        exitCode: 0,
        timedOut: false,
        durationMs: 10,
      },
    ],
    artifacts: [
      {
        path: "test-results/report.json",
        bytes: 20,
        sha256: "c".repeat(64),
      },
    ],
    releaseReady: true,
  };
}

test("parseArgs accepts repeatable known blockers and defaults", () => {
  const options = parseArgs([
    "--repo",
    "owner/repo",
    "--ref",
    "main",
    "--known-blocker",
    "first",
    "--known-blocker",
    "second",
  ]);
  assert.equal(options.repo, "owner/repo");
  assert.equal(options.ref, "main");
  assert.deepEqual(options.knownBlockers, ["first", "second"]);
  assert.equal(options.timeoutMs, 15 * 60 * 1000);
});

test("fingerprint ignores timings but changes with gate state", () => {
  const report = sampleReport();
  const first = buildFingerprint(report);
  report.steps[0].durationMs = 999999;
  report.finishedAt = "later";
  report.artifacts[0].sha256 = "d".repeat(64);
  assert.equal(buildFingerprint(report), first);

  report.steps[0].status = "fail";
  assert.notEqual(buildFingerprint(report), first);
});

test("redact and tail keep reports bounded and free of temp roots", () => {
  assert.equal(
    redact("failed at /tmp/gate-123/checkout", [
      { from: "/tmp/gate-123", to: "<temporary-checkout>" },
    ]),
    "failed at <temporary-checkout>/checkout",
  );
  assert.equal(tail("abcdef", 3), "def");
});
