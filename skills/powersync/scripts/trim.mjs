#!/usr/bin/env node

/**
 * Trims this installed copy of the powersync skill to the platforms a repo
 * actually uses, with the operator's approval.
 *
 * The default run is a read-only report: it detects which PowerSync platforms
 * the surrounding repo uses and lists the reference files this copy does not
 * need. Only --apply changes files, and only inside this skill's own
 * directory. The script makes no network requests and imports node builtins
 * only. Reinstalling the skill or running `npx skills update` restores the
 * full copy.
 *
 * Usage:
 *   node scripts/trim.mjs                 read-only detect + report
 *   node scripts/trim.mjs --apply         prune unused reference files
 *   node scripts/trim.mjs --decline       record "keep the full copy", ask never again
 *   node scripts/trim.mjs --repo <path>   override repo root discovery
 *   node scripts/trim.mjs --keep <p1,p2>  keep platforms regardless of detection
 *   node scripts/trim.mjs --json          machine-readable report
 *
 * Exit codes: 0 success or recorded no-op, 1 verification failure (nothing
 * written), 2 refused or not applicable (shared install, skill source repo,
 * no repo root, nothing detected).
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_FILE = '.trim-state.json';
const INDEX_FILES = ['SKILL.md', 'AGENTS.md'];
const UPSTREAM = 'https://github.com/powersync-ja/agent-skills';

// Platform names -> the reference files kept when that platform is detected.
// Adding or removing a file under references/sdks/ requires updating this
// table (pnpm validate in the source repo enforces it).
const PLATFORMS = {
  js: {
    label: 'JavaScript / TypeScript',
    files: [
      'references/sdks/powersync-js.md',
      'references/sdks/powersync-js-node.md',
      'references/sdks/powersync-js-orm.md',
      'references/sdks/powersync-js-react.md',
      'references/sdks/powersync-js-react-native.md',
      'references/sdks/powersync-js-tanstack.md',
      'references/sdks/powersync-js-vue.md',
    ],
  },
  dart: { label: 'Dart / Flutter', files: ['references/sdks/powersync-dart.md'] },
  kotlin: { label: 'Kotlin', files: ['references/sdks/powersync-kotlin.md'] },
  swift: { label: 'Swift', files: ['references/sdks/powersync-swift.md'] },
  dotnet: { label: '.NET', files: ['references/sdks/powersync-dotnet.md'] },
  terraform: { label: 'Terraform', files: ['references/terraform.md'] },
};

const MATCHERS = [
  { platform: 'js', match: (n) => n === 'package.json', pattern: /"@powersync\/|wa-sqlite/ },
  { platform: 'dart', match: (n) => n === 'pubspec.yaml', pattern: /powersync/i },
  {
    platform: 'kotlin',
    match: (n) => n === 'build.gradle' || n === 'build.gradle.kts' || n === 'libs.versions.toml',
    pattern: /com\.powersync/,
  },
  { platform: 'swift', match: (n) => n === 'Package.swift' || n === 'Podfile', pattern: /powersync/i },
  { platform: 'dotnet', match: (n) => n.endsWith('.csproj'), pattern: /powersync/i },
  { platform: 'terraform', match: (n) => n.endsWith('.tf'), pattern: /powersync/i },
];

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', 'Pods', 'vendor', 'target', 'bin', 'obj',
  'DerivedData', 'coverage',
]);
const MAX_DEPTH = 8;
const MAX_MANIFEST_BYTES = 1024 * 1024;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { apply: false, decline: false, json: false, repo: null, keep: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--decline') args.decline = true;
    else if (a === '--json') args.json = true;
    else if (a === '--repo') args.repo = argv[++i];
    else if (a === '--keep') args.keep = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else {
      console.error(`Unknown argument: ${a}`);
      console.error('Usage: node scripts/trim.mjs [--apply | --decline] [--repo <path>] [--keep <p1,p2>] [--json]');
      process.exit(2);
    }
  }
  if (args.apply && args.decline) {
    console.error('--apply and --decline are mutually exclusive');
    process.exit(2);
  }
  const invalid = args.keep.filter((k) => !PLATFORMS[k]);
  if (invalid.length > 0) {
    console.error(`Unknown --keep platform(s): ${invalid.join(', ')} (valid: ${Object.keys(PLATFORMS).join(', ')})`);
    process.exit(2);
  }
  return args;
}

// ---------------------------------------------------------------------------
// Install classification
// ---------------------------------------------------------------------------

function caseFold(p) {
  return process.platform === 'win32' ? p.toLowerCase() : p;
}

function isInside(parent, child) {
  const rel = relative(caseFold(parent), caseFold(child));
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

function classifyInstall(repoArg) {
  // Plugin-cache installs are shared by every project on the machine, so a
  // per-repo trim must never touch them. Checked before repo-root discovery
  // because a dotfiles .git in $HOME could otherwise masquerade as a repo.
  const segs = caseFold(SKILL_DIR).split(sep);
  if ((segs.includes('.claude') && segs.includes('plugins')) || segs.includes('marketplaces')) {
    return { kind: 'shared', detail: 'this copy lives in a plugin cache shared across projects' };
  }

  let root = null;
  if (repoArg) {
    root = resolve(repoArg);
    if (!existsSync(root)) return { kind: 'unknown', detail: `--repo path not found: ${root}` };
  } else {
    let dir = SKILL_DIR;
    for (;;) {
      if (existsSync(join(dir, '.git'))) { root = dir; break; }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    if (!root) {
      const cwd = process.cwd();
      const hasManifest = readdirSync(cwd).some((n) => MATCHERS.some((m) => m.match(n)));
      if (hasManifest && isInside(cwd, SKILL_DIR)) root = cwd;
    }
  }

  if (root) {
    if (existsSync(join(root, '.claude-plugin', 'marketplace.json'))) {
      const rel = relative(root, SKILL_DIR);
      if (rel === join('skills', 'powersync') || rel.startsWith('skills' + sep)) {
        return { kind: 'source', detail: 'this is the skill source repository; trim only installed copies' };
      }
    }
    if (!isInside(root, SKILL_DIR)) {
      return { kind: 'unknown', detail: 'the skill directory is not inside the repo root; pass --repo <path>' };
    }
    return { kind: 'repo-local', root };
  }

  if (isInside(homedir(), SKILL_DIR)) {
    return { kind: 'shared', detail: 'this looks like a user-level install shared across projects' };
  }
  return { kind: 'unknown', detail: 'no repo root found; pass --repo <path>' };
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

function detectPlatforms(root) {
  const found = {};
  const walk = (dir, depth) => {
    if (Object.keys(found).length === MATCHERS.length) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (Object.keys(found).length === MATCHERS.length) return;
      const name = entry.name;
      if (entry.isDirectory()) {
        // Dot-dirs are skipped so installed skill copies never count as usage.
        if (!name.startsWith('.') && !SKIP_DIRS.has(name) && depth < MAX_DEPTH) {
          walk(join(dir, name), depth + 1);
        }
        continue;
      }
      if (!entry.isFile()) continue;
      const applicable = MATCHERS.filter((m) => !found[m.platform] && m.match(name));
      if (applicable.length === 0) continue;
      const full = join(dir, name);
      let size;
      try { size = statSync(full).size; } catch { continue; }
      if (size > MAX_MANIFEST_BYTES) continue;
      let lines;
      try { lines = readFileSync(full, 'utf-8').split(/\r?\n/); } catch { continue; }
      for (const m of applicable) {
        const idx = lines.findIndex((l) => m.pattern.test(l));
        if (idx !== -1) {
          found[m.platform] = {
            file: relative(root, full).split(sep).join('/'),
            line: idx + 1,
            text: lines[idx].trim().slice(0, 80),
          };
        }
      }
    }
  };
  walk(root, 0);
  return found;
}

// ---------------------------------------------------------------------------
// Index rewriting (SKILL.md and AGENTS.md)
// ---------------------------------------------------------------------------

const TABLE_SEPARATOR = /^\|[\s\-:|]*$/;

function dropOrphanTables(lines) {
  const result = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].startsWith('|')) {
      result.push(lines[i]);
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && lines[j].startsWith('|')) j++;
    const run = lines.slice(i, j);
    // A table reduced to its header row and separator carries no content.
    const contentRows = run.filter((l) => !TABLE_SEPARATOR.test(l));
    if (contentRows.length > 1) result.push(...run);
    i = j;
  }
  return result;
}

function dropEmptySections(lines) {
  const heading = /^(#{1,6})\s/;
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(heading);
      if (!m) continue;
      const level = m[1].length;
      let j = i + 1;
      while (j < lines.length) {
        const h = lines[j].match(heading);
        if (h && h[1].length <= level) break;
        j++;
      }
      if (lines.slice(i + 1, j).every((l) => l.trim() === '')) {
        lines = lines.slice(0, i).concat(lines.slice(j));
        changed = true;
        break;
      }
    }
  }
  return lines;
}

function collapseBlankRuns(lines) {
  const result = [];
  let prevBlank = false;
  for (const line of lines) {
    const blank = line.trim() === '';
    if (blank && prevBlank) continue;
    result.push(line);
    prevBlank = blank;
  }
  while (result.length > 0 && result[result.length - 1].trim() === '') result.pop();
  result.push('');
  return result;
}

function rewriteIndexContent(content, removedPaths) {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  let lines = content.split(/\r?\n/);
  lines = lines.filter((line) => !removedPaths.some((p) => line.includes(p)));
  lines = dropOrphanTables(lines);
  lines = dropEmptySections(lines);
  lines = collapseBlankRuns(lines);
  return { text: lines.join(eol), eol };
}

// The note lists removed files by base name only, so no kept file ever
// contains a full removed path (the dangling-reference check depends on that).
function appendTrimNote(text, eol, keptPlatforms, removedPaths) {
  if (text.includes('## Trimmed copy')) return text;
  const names = removedPaths.map((p) => p.split('/').pop()).join(', ');
  const note = [
    '## Trimmed copy',
    '',
    `This installed copy was trimmed on ${today()} with the operator's approval to`,
    `match the platforms detected in this repo: ${keptPlatforms.join(', ')}. Unused`,
    `reference documents were removed from this local copy only: ${names}.`,
    'Reinstalling the skill or running `npx skills update` restores the full copy.',
    `Full skill: ${UPSTREAM}`,
  ];
  if (removedPaths.includes('references/terraform.md')) {
    note.push('', 'Retained warning from the removed Terraform reference: do not run `powersync deploy` against an instance managed by Terraform.');
  }
  return text + eol + note.join(eol) + eol;
}

// ---------------------------------------------------------------------------
// Verification and application
// ---------------------------------------------------------------------------

function collectMdFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectMdFiles(full));
    else if (entry.name.endsWith('.md')) files.push(full);
  }
  return files;
}

// prospective maps a skill-relative path to its planned content; pass null to
// check what is on disk.
function findDanglingRefs(removedPaths, prospective) {
  const problems = [];
  for (const file of collectMdFiles(SKILL_DIR)) {
    const rel = relative(SKILL_DIR, file).split(sep).join('/');
    if (removedPaths.includes(rel)) continue;
    const content = prospective && prospective[rel] !== undefined
      ? prospective[rel]
      : readFileSync(file, 'utf-8');
    for (const p of removedPaths) {
      if (content.includes(p)) problems.push(`${rel} still references ${p}`);
    }
  }
  return problems;
}

function assertInSkillDir(absPath) {
  if (!isInside(SKILL_DIR, absPath)) {
    console.error(`Refusing to touch a path outside the skill directory: ${absPath}`);
    process.exit(1);
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function skillVersion() {
  try {
    const content = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf-8');
    const m = content.match(/^[ \t]+version:[ \t]*["']?([^"'\s#]+)/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function writeState(decision, detected, kept, removed) {
  const state = {
    schema: 1,
    skillVersion: skillVersion() || 'unknown',
    date: today(),
    decision,
    detected,
    kept,
    removed,
  };
  const file = join(SKILL_DIR, STATE_FILE);
  assertInSkillDir(file);
  writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
  return state;
}

function applyTrim(keptPlatforms, removedPaths, say) {
  const prospective = {};
  for (const name of INDEX_FILES) {
    const file = join(SKILL_DIR, name);
    if (!existsSync(file)) continue;
    const { text, eol } = rewriteIndexContent(readFileSync(file, 'utf-8'), removedPaths);
    prospective[name] = appendTrimNote(text, eol, keptPlatforms, removedPaths);
  }

  const missing = removedPaths.filter((p) => !existsSync(join(SKILL_DIR, p)));
  if (missing.length > 0) {
    console.error(`Files slated for removal are already absent: ${missing.join(', ')}`);
    console.error('This copy looks partially modified. Reinstall or run `npx skills update`, then retry.');
    process.exit(1);
  }
  if (!prospective['SKILL.md'] || !prospective['SKILL.md'].startsWith('---') || !prospective['SKILL.md'].includes('name: powersync')) {
    console.error('Rewrite verification failed: SKILL.md frontmatter would be damaged. Nothing was written.');
    process.exit(1);
  }
  const problems = findDanglingRefs(removedPaths, prospective);
  if (problems.length > 0) {
    for (const p of problems) console.error(`Dangling reference: ${p}`);
    console.error('Rewrite verification failed. Nothing was written.');
    process.exit(1);
  }

  for (const name of INDEX_FILES) {
    if (prospective[name] === undefined) continue;
    const file = join(SKILL_DIR, name);
    assertInSkillDir(file);
    writeFileSync(file, prospective[name]);
    say(`rewrote ${name}`);
  }
  for (const p of removedPaths) {
    const file = join(SKILL_DIR, p);
    assertInSkillDir(file);
    unlinkSync(file);
    say(`removed ${p}`);
  }

  const post = findDanglingRefs(removedPaths, null);
  if (post.length > 0) {
    for (const p of post) console.error(`Post-write check failed: ${p}`);
    console.error('Reinstall or run `npx skills update` to restore the full copy.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  const say = args.json ? () => {} : (msg) => console.log(msg);
  const emit = (obj) => { if (args.json) console.log(JSON.stringify(obj, null, 2)); };

  const install = classifyInstall(args.repo);
  if (install.kind !== 'repo-local') {
    emit({ install: { kind: install.kind, skillDir: SKILL_DIR }, error: install.detail });
    say(`Not applicable (${install.kind}): ${install.detail}. No changes made.`);
    process.exit(2);
  }

  const statePath = join(SKILL_DIR, STATE_FILE);
  if (existsSync(statePath)) {
    let state = null;
    try { state = JSON.parse(readFileSync(statePath, 'utf-8')); } catch { /* report raw below */ }
    const decision = state && state.decision ? state.decision : 'unreadable';
    emit({ install: { kind: install.kind, root: install.root }, state, applied: false });
    if (args.apply) {
      say(`A decision is already recorded in ${STATE_FILE} (${decision}). Delete that file to decide again.`);
      process.exit(2);
    }
    say(`Decision already recorded in ${STATE_FILE}: ${decision} (${state && state.date ? state.date : 'unknown date'}). Nothing to do.`);
    process.exit(0);
  }

  const detected = detectPlatforms(install.root);
  const detectedList = Object.keys(PLATFORMS).filter((p) => detected[p]);

  if (args.decline) {
    const state = writeState('declined', detectedList, [], []);
    emit({ install: { kind: install.kind, root: install.root }, state, applied: false });
    say(`Recorded the operator's decision to keep the full copy in ${STATE_FILE}.`);
    process.exit(0);
  }

  if (detectedList.length === 0) {
    emit({ install: { kind: install.kind, root: install.root }, detected: {}, wouldRemove: [], applied: false });
    say('No PowerSync usage detected in this repo yet; keeping the full copy.');
    say('Re-run after onboarding, once a PowerSync SDK dependency exists.');
    process.exit(args.apply ? 2 : 0);
  }

  const kept = Object.keys(PLATFORMS).filter((p) => detectedList.includes(p) || args.keep.includes(p));
  const removedPaths = Object.keys(PLATFORMS)
    .filter((p) => !kept.includes(p))
    .flatMap((p) => PLATFORMS[p].files);

  if (!args.json) {
    say(`PowerSync skill trim (${args.apply ? 'apply' : 'detect'})`);
    say(`Install: ${install.kind}  Skill: ${SKILL_DIR}  Repo: ${install.root}`);
    say('');
    say('Platform   Detected  Evidence');
    for (const p of Object.keys(PLATFORMS)) {
      const ev = detected[p];
      const flag = ev ? 'yes' : (args.keep.includes(p) ? 'kept' : 'no');
      say(`${p.padEnd(10)} ${flag.padEnd(9)} ${ev ? `${ev.file}:${ev.line} ${ev.text}` : ''}`.trimEnd());
    }
    say('');
  }

  if (removedPaths.length === 0) {
    if (args.apply) {
      const state = writeState('trimmed', detectedList, kept, []);
      emit({ install: { kind: install.kind, root: install.root }, detected, state, applied: true });
      say(`Every platform is in use; nothing to remove. Decision recorded in ${STATE_FILE}.`);
    } else {
      emit({ install: { kind: install.kind, root: install.root }, detected, wouldRemove: [], applied: false });
      say('Every platform is in use; nothing to remove. Run with --apply to record that.');
    }
    process.exit(0);
  }

  if (!args.apply) {
    emit({ install: { kind: install.kind, root: install.root }, detected, kept, wouldRemove: removedPaths, applied: false });
    say(`Would remove ${removedPaths.length} unused reference file(s):`);
    for (const p of removedPaths) say(`  ${p}`);
    say('');
    say('Apply:   node scripts/trim.mjs --apply');
    say('Decline: node scripts/trim.mjs --decline   (records the decision, asks never again)');
    process.exit(0);
  }

  applyTrim(kept, removedPaths, say);
  const state = writeState('trimmed', detectedList, kept, removedPaths);
  emit({ install: { kind: install.kind, root: install.root }, detected, state, applied: true });
  say('');
  say(`Trimmed to: ${kept.join(', ')}. Decision recorded in ${STATE_FILE}.`);
  say('Reinstalling the skill or running `npx skills update` restores the full copy.');
}

main();
