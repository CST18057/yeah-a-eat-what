# Lunch Picker Release Gate

`release-gate.js` creates an isolated checkout of a candidate and runs the v0.5
release checks without modifying the candidate branch.

## Requirements

- Node.js 20 or newer
- Git
- Network access for repository fetch and `npm ci`
- Playwright browser dependencies available through the candidate's install path

## Usage

```sh
node tools/release-gate/release-gate.js \
  --repo https://github.com/CST18057/yeah-a-eat-what.git \
  --ref <commit-or-ref> \
  --output release-gate.json
```

The command exits `0` only when all automated checks pass, at least one evidence
artifact exists, and no external blocker was supplied.

Use `--known-blocker` for facts the script cannot infer from tests. Repeat the
option as needed:

```sh
node tools/release-gate/release-gate.js \
  --repo https://github.com/CST18057/yeah-a-eat-what.git \
  --ref e167a4e581040501bf579a39bbf2780e9a61f1cc \
  --known-blocker "Keyboard pan invalidation fix is not present" \
  --known-blocker "Public-release compliance fixes are not present"
```

## Checks

The gate requires these package scripts:

- `test`
- `test:browser`
- `test:cross-feature`

It runs:

1. `git clone` and detached checkout of the requested ref.
2. Commit, tree, Node, npm, and Git version capture.
3. `npm ci`.
4. `npm test`.
5. `npm run test:browser`.
6. `npm run test:cross-feature`.
7. `git diff --check`.
8. SHA-256 hashes for files under `test-results`, `dist`, `build`, and
   `coverage`.

A missing lockfile or required script stops the gate before installation and is
reported as a blocker. An install failure stops later checks. Once installation
succeeds, each test command is recorded even if an earlier test fails, and
`git diff --check` plus artifact hashing still run. The temporary checkout is
removed unless `--keep-temp` is used.

## Output

The JSON report contains:

- requested repo/ref plus exact commit and tree hashes;
- Node, npm, Git, and platform versions;
- every command, exit status, duration, and bounded failure output;
- browser/test artifact sizes and SHA-256 hashes;
- known blockers, failure summaries, and a release verdict;
- a `resultFingerprint` that excludes timestamps, durations, artifact sizes, and
  artifact content hashes so repeated run verdicts and artifact path sets can be
  compared for consistency. Artifact sizes and content hashes remain in the
  report for audit.

The tool verifies only the automated gates listed above. Authorization,
attribution, supplier terms, and other release decisions must be supplied as
known blockers until separately resolved.

## Sample runs

- `sample-e167a4e-run1.json` and `sample-e167a4e-run2.json` check the original
  v0.5 candidate. Both return `blocked`, report the missing
  `test:cross-feature` script and supplied external blockers, and produce the
  same result fingerprint
  `715df2572e82f0291c9b7aad6292824df352770b5c692a2629f8a31960ad8639`.
- `sample-cc73705.json` exercises the full command path on the reviewed
  cross-feature candidate. It records every test command and artifact hash even
  when browser checks fail on the runner.
