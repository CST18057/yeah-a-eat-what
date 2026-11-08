"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const REQUIRED_SCRIPTS = ["test", "test:browser", "test:cross-feature"];
const ARTIFACT_DIRS = ["test-results", "dist", "build", "coverage"];
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const OUTPUT_TAIL_CHARS = 6000;

function usage() {
  return `
Usage:
  node release-gate.js --repo <url-or-path> --ref <git-ref> [options]

Options:
  --project-subdir <path>  App directory inside the repository. Default: auto
                           detect lunch-picker, otherwise repository root.
  --output <path>          Also write the JSON report to this file.
  --timeout-ms <number>    Per-command timeout. Default: ${DEFAULT_TIMEOUT_MS}.
  --known-blocker <text>   Repeatable external blocker that always makes the
                           release gate fail, even when automated checks pass.
  --keep-temp              Retain the isolated checkout for debugging.
  --help                   Show this help.

Exit codes:
  0  Candidate passed all automated gates and has no known blockers.
  1  Candidate is blocked or a required command failed.
  2  Invalid arguments or preflight failure.
`.trim();
}

function parseArgs(argv) {
  const options = {
    projectSubdir: null,
    output: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    knownBlockers: [],
    keepTemp: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (value === undefined) {
        throw new Error(`Missing value for ${argument}`);
      }
      index += 1;
      return value;
    };

    if (argument === "--help") {
      options.help = true;
    } else if (argument === "--repo") {
      options.repo = next();
    } else if (argument === "--ref") {
      options.ref = next();
    } else if (argument === "--project-subdir") {
      options.projectSubdir = next();
    } else if (argument === "--output") {
      options.output = next();
    } else if (argument === "--timeout-ms") {
      const value = Number(next());
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error("--timeout-ms must be a positive integer");
      }
      options.timeoutMs = value;
    } else if (argument === "--known-blocker") {
      options.knownBlockers.push(next());
    } else if (argument === "--keep-temp") {
      options.keepTemp = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!options.help && (!options.repo || !options.ref)) {
    throw new Error("--repo and --ref are required");
  }
  return options;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let forceKill = null;
    const timeout = setTimeout(() => {
      timedOut = true;
      try {
        if (process.platform === "win32") {
          child.kill("SIGTERM");
        } else {
          process.kill(-child.pid, "SIGTERM");
        }
      } catch {
        child.kill("SIGTERM");
      }
      forceKill = setTimeout(() => {
        try {
          if (process.platform === "win32") {
            child.kill("SIGKILL");
          } else {
            process.kill(-child.pid, "SIGKILL");
          }
        } catch {}
      }, 5000);
    }, options.timeoutMs || DEFAULT_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      stderr += `\n${error.stack || error.message}`;
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timeout);
      if (forceKill) {
        clearTimeout(forceKill);
      }
      resolve({
        command: [command, ...args].join(" "),
        exitCode: exitCode === null ? 1 : exitCode,
        signal: signal || null,
        timedOut,
        durationMs: Date.now() - started,
        stdout,
        stderr,
      });
    });
  });
}

function tail(value, limit = OUTPUT_TAIL_CHARS) {
  const text = String(value || "").trim();
  return text.length <= limit ? text : text.slice(-limit);
}

function redact(value, replacements) {
  let text = String(value || "");
  for (const replacement of replacements) {
    if (replacement.from) {
      text = text.split(replacement.from).join(replacement.to);
    }
  }
  return text;
}

function stepFromResult(name, result, replacements = []) {
  const passed = result.exitCode === 0 && !result.timedOut;
  return {
    name,
    command: redact(result.command, replacements),
    status: passed ? "pass" : "fail",
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    stdoutTail: redact(tail(result.stdout), replacements),
    stderrTail: redact(tail(result.stderr), replacements),
  };
}

function failedStep(name, message) {
  return {
    name,
    command: null,
    status: "fail",
    exitCode: null,
    signal: null,
    timedOut: false,
    durationMs: 0,
    stdoutTail: "",
    stderrTail: message,
  };
}

function skippedStep(name, message) {
  return {
    name,
    command: null,
    status: "skipped",
    exitCode: null,
    signal: null,
    timedOut: false,
    durationMs: 0,
    stdoutTail: "",
    stderrTail: message,
  };
}

async function hashFile(filePath) {
  const hash = crypto.createHash("sha256");
  const handle = await fsp.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) {
        break;
      }
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

async function collectFiles(root, current = root, files = []) {
  let entries;
  try {
    entries = await fsp.readdir(current, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return files;
    }
    throw error;
  }

  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(root, absolute, files);
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}

async function hashArtifacts(projectDir) {
  const artifacts = [];
  for (const directory of ARTIFACT_DIRS) {
    const root = path.join(projectDir, directory);
    const files = await collectFiles(root);
    for (const file of files) {
      const stat = await fsp.stat(file);
      artifacts.push({
        path: path.relative(projectDir, file).split(path.sep).join("/"),
        bytes: stat.size,
        sha256: await hashFile(file),
      });
    }
  }
  return artifacts.sort((left, right) => left.path.localeCompare(right.path));
}

function buildFingerprint(report) {
  const normalized = {
    candidate: report.candidate,
    environment: report.environment,
    knownBlockers: report.knownBlockers,
    steps: report.steps.map((step) => ({
      name: step.name,
      command: step.command,
      status: step.status,
      exitCode: step.exitCode,
      timedOut: step.timedOut,
    })),
    artifacts: report.artifacts.map((artifact) => ({
      path: artifact.path,
    })),
    releaseReady: report.releaseReady,
  };
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

async function exists(filePath) {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveProjectSubdir(checkoutDir, requested) {
  if (requested) {
    return requested.replace(/^[/]+|[/]+$/g, "");
  }
  if (await exists(path.join(checkoutDir, "lunch-picker", "package.json"))) {
    return "lunch-picker";
  }
  return "";
}

async function readProjectMetadata(projectDir) {
  const packagePath = path.join(projectDir, "package.json");
  if (!(await exists(packagePath))) {
    throw new Error(`package.json not found at ${packagePath}`);
  }
  const packageJson = JSON.parse(await fsp.readFile(packagePath, "utf8"));
  const lockPath = path.join(projectDir, "package-lock.json");
  if (!(await exists(lockPath))) {
    throw new Error("package-lock.json is required for npm ci");
  }
  const missingScripts = REQUIRED_SCRIPTS.filter(
    (script) => !packageJson.scripts || !packageJson.scripts[script],
  );
  return { packageJson, missingScripts };
}

function buildFailureSummary(steps) {
  return steps
    .filter((step) => step.status === "fail")
    .map((step) => {
      const detail = tail(step.stderrTail || step.stdoutTail, 1200);
      return {
        step: step.name,
        exitCode: step.exitCode,
        timedOut: step.timedOut,
        detail,
      };
    });
}

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function main(argv = process.argv.slice(2)) {
  const startedAt = new Date().toISOString();
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }

  const tempRoot = await fsp.mkdtemp(
    path.join(os.tmpdir(), "lunch-picker-release-gate-"),
  );
  const checkoutDir = path.join(tempRoot, "checkout");
  const replacements = [{ from: tempRoot, to: "<temporary-checkout>" }];
  const steps = [];
  let checkoutComplete = false;
  let projectDir = tempRoot;
  let projectSubdir = "";
  let artifacts = [];
  let candidate = { repo: options.repo, ref: options.ref };
  let environment = {
    node: process.version,
    npm: null,
    git: null,
    platform: `${process.platform}-${process.arch}`,
  };

  try {
    console.error(`Cloning ${options.repo} at ${options.ref}`);
    const clone = await runCommand(
      "git",
      ["clone", "--quiet", "--no-checkout", options.repo, checkoutDir],
      { timeoutMs: options.timeoutMs },
    );
    steps.push(stepFromResult("clone candidate", clone, replacements));
    if (clone.exitCode !== 0) {
      return finish();
    }

    const checkout = await runCommand(
      "git",
      ["checkout", "--quiet", "--detach", options.ref],
      { cwd: checkoutDir, timeoutMs: options.timeoutMs },
    );
    steps.push(stepFromResult("checkout candidate ref", checkout, replacements));
    if (checkout.exitCode !== 0) {
      return finish();
    }
    checkoutComplete = true;

    const versions = await Promise.all([
      runCommand("git", ["--version"], { timeoutMs: options.timeoutMs }),
      runCommand("node", ["--version"], { timeoutMs: options.timeoutMs }),
      runCommand("npm", ["--version"], { timeoutMs: options.timeoutMs }),
    ]);
    steps.push(stepFromResult("tool versions", {
      command: "git --version && node --version && npm --version",
      exitCode: versions.every((result) => result.exitCode === 0) ? 0 : 1,
      signal: null,
      timedOut: versions.some((result) => result.timedOut),
      durationMs: versions.reduce(
        (total, result) => total + result.durationMs,
        0,
      ),
      stdout: versions.map((result) => result.stdout.trim()).join("\n"),
      stderr: versions.map((result) => result.stderr.trim()).join("\n"),
    }, replacements));
    environment = {
      ...environment,
      git: versions[0].stdout.trim(),
      node: versions[1].stdout.trim() || process.version,
      npm: versions[2].stdout.trim(),
    };

    const commit = await runCommand("git", ["rev-parse", "HEAD"], {
      cwd: checkoutDir,
      timeoutMs: options.timeoutMs,
    });
    const tree = await runCommand("git", ["rev-parse", "HEAD^{tree}"], {
      cwd: checkoutDir,
      timeoutMs: options.timeoutMs,
    });
    steps.push(stepFromResult("resolve commit and tree", {
      command: "git rev-parse HEAD && git rev-parse HEAD^{tree}",
      exitCode:
        commit.exitCode === 0 && tree.exitCode === 0 ? 0 : 1,
      signal: null,
      timedOut: commit.timedOut || tree.timedOut,
      durationMs: commit.durationMs + tree.durationMs,
      stdout: `${commit.stdout.trim()}\n${tree.stdout.trim()}`,
      stderr: `${commit.stderr}${tree.stderr}`,
    }, replacements));
    candidate = {
      repo: options.repo,
      requestedRef: options.ref,
      commit: commit.stdout.trim() || null,
      tree: tree.stdout.trim() || null,
    };

    projectSubdir = await resolveProjectSubdir(
      checkoutDir,
      options.projectSubdir,
    );
    projectDir = projectSubdir
      ? path.join(checkoutDir, projectSubdir)
      : checkoutDir;
    candidate.projectSubdir = projectSubdir || ".";

    let metadata;
    try {
      metadata = await readProjectMetadata(projectDir);
      if (metadata.missingScripts.length) {
        steps.push(
          failedStep(
            "preflight required scripts",
            `Missing required package scripts: ${metadata.missingScripts.join(
              ", ",
            )}`,
          ),
        );
        steps.push(
          skippedStep(
            "remaining automated gates",
            "Skipped because the candidate does not expose all required scripts",
          ),
        );
        return finish();
      }
      steps.push({
        name: "preflight required scripts",
        command: null,
        status: "pass",
        exitCode: 0,
        signal: null,
        timedOut: false,
        durationMs: 0,
        stdoutTail: REQUIRED_SCRIPTS.join(", "),
        stderrTail: "",
      });
    } catch (error) {
      steps.push(failedStep("preflight project metadata", error.message));
      return finish();
    }

    const commands = [
      ["lockfile install", "npm", ["ci"]],
      ["service tests", "npm", ["test"]],
      ["browser tests", "npm", ["run", "test:browser"]],
      ["cross-feature tests", "npm", ["run", "test:cross-feature"]],
    ];
    for (const [name, command, args] of commands) {
      console.error(`Running ${name}`);
      const result = await runCommand(command, args, {
        cwd: projectDir,
        timeoutMs: options.timeoutMs,
      });
      const step = stepFromResult(name, result, replacements);
      steps.push(step);
      if (step.status !== "pass" && name === "lockfile install") {
        break;
      }
    }

    const diffCheck = await runCommand("git", ["diff", "--check"], {
      cwd: checkoutDir,
      timeoutMs: options.timeoutMs,
    });
    steps.push(stepFromResult("diff check", diffCheck, replacements));
    artifacts = await hashArtifacts(projectDir);
    return finish();
  } finally {
    if (!options.keepTemp && (await exists(tempRoot))) {
      await fsp.rm(tempRoot, { recursive: true, force: true });
    }
  }

  async function finish() {
    const failed = steps.filter((step) => step.status === "fail");
    const skipped = steps.filter((step) => step.status === "skipped");
    const blockers = [
      ...options.knownBlockers.map((reason) => ({
        kind: "known-blocker",
        reason,
      })),
      ...failed.map((step) => ({
        kind: "failed-gate",
        reason: `${step.name}: ${tail(
          step.stderrTail || step.stdoutTail,
          500,
        )}`,
      })),
      ...skipped.map((step) => ({
        kind: "incomplete-gate",
        reason: `${step.name}: ${step.stderrTail}`,
      })),
    ];
    if (blockers.length === 0 && artifacts.length === 0) {
      blockers.push({
        kind: "missing-evidence",
        reason: "No test-results, dist, build, or coverage artifact was found",
      });
    }
    const releaseReady = blockers.length === 0 && artifacts.length > 0;
    const report = {
      schemaVersion: 1,
      startedAt,
      finishedAt: new Date().toISOString(),
      candidate,
      environment,
      projectSubdir: projectSubdir || ".",
      knownBlockers: options.knownBlockers,
      steps,
      failureSummary: buildFailureSummary(steps),
      artifacts,
      artifactCount: artifacts.length,
      releaseReady,
      verdict: releaseReady ? "release-ready" : "blocked",
      blockers,
      workspaceRetained: Boolean(options.keepTemp),
      workspacePath: options.keepTemp
        ? "<temporary-checkout>"
        : null,
    };
    report.resultFingerprint = buildFingerprint(report);

    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    process.stdout.write(serialized);
    if (options.output) {
      await writeJson(options.output, report);
    }
    console.error(
      `Gate verdict: ${report.verdict} (${report.blockers.length} blocker${
        report.blockers.length === 1 ? "" : "s"
      })`,
    );
    return checkoutComplete && releaseReady ? 0 : 1;
  }
}

if (require.main === module) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 2;
    });
}

module.exports = {
  ARTIFACT_DIRS,
  REQUIRED_SCRIPTS,
  buildFingerprint,
  parseArgs,
  redact,
  runCommand,
  tail,
};
