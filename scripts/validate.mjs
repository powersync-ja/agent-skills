#!/usr/bin/env node

/**
 * Validates agent skills against the Agent Skills specification (agentskills.io)
 * and verifies the Claude plugin marketplace manifest.
 *
 * Usage: node scripts/validate.mjs
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let errors = 0;
let warnings = 0;

function error(msg) {
  console.error(`  ✗ ${msg}`);
  errors++;
}

function warn(msg) {
  console.warn(`  ⚠ ${msg}`);
  warnings++;
}

function pass(msg) {
  console.log(`  ✓ ${msg}`);
}

// ---------------------------------------------------------------------------
// 1. Validate SKILL.md frontmatter and structure
// ---------------------------------------------------------------------------

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fm = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.+)/);
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return fm;
}

function validateSkillMd(skillDir, skillName) {
  console.log(`\n[SKILL.md] ${skillName}`);
  const skillMdPath = join(skillDir, 'SKILL.md');

  if (!existsSync(skillMdPath)) {
    error('SKILL.md not found');
    return;
  }

  const content = readFileSync(skillMdPath, 'utf-8');
  const fm = parseFrontmatter(content);

  if (!fm) {
    error('No YAML frontmatter found (must be between --- markers)');
    return;
  }

  // name field
  if (!fm.name) {
    error('Missing required field: name');
  } else {
    if (fm.name.length > 64) error(`name exceeds 64 characters (${fm.name.length})`);
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(fm.name)) error(`name "${fm.name}" must be lowercase alphanumeric with hyphens, no leading/trailing hyphens`);
    if (/--/.test(fm.name)) error(`name "${fm.name}" must not contain consecutive hyphens`);
    if (fm.name !== skillName) error(`name "${fm.name}" must match directory name "${skillName}"`);
    if (fm.name === skillName) pass(`name matches directory: ${fm.name}`);
  }

  // description field
  if (!fm.description) {
    error('Missing required field: description');
  } else {
    if (fm.description.length > 1024) error(`description exceeds 1024 characters (${fm.description.length})`);
    if (fm.description.length < 50) warn(`description is short (${fm.description.length} chars) — consider adding more detail`);
    pass('description present');
  }

  // body length
  const bodyStart = content.indexOf('---', content.indexOf('---') + 3) + 3;
  const body = content.slice(bodyStart).trim();
  const bodyLines = body.split('\n').length;
  if (bodyLines > 500) warn(`SKILL.md body is ${bodyLines} lines — spec recommends < 500`);
  pass(`body length: ${bodyLines} lines`);

  // companion files
  for (const companion of ['AGENTS.md', 'CLAUDE.md']) {
    if (existsSync(join(skillDir, companion))) {
      pass(`${companion} exists`);
    } else {
      warn(`${companion} not found — recommended for multi-agent compatibility`);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Validate file references resolve
// ---------------------------------------------------------------------------

function extractReferences(content) {
  const refs = new Set();

  // Backtick references to .md files: `references/sdks/powersync-js.md`
  for (const m of content.matchAll(/`((?:references|scripts|assets)\/[^`]+\.md)`/g)) {
    refs.add(m[1]);
  }

  // Markdown link references to local .md files: [text](references/foo.md)
  for (const m of content.matchAll(/\]\(((?:references|scripts|assets)\/[^)]+\.md)\)/g)) {
    refs.add(m[1]);
  }

  return refs;
}

function validateReferences(skillDir, skillName) {
  console.log(`\n[References] ${skillName}`);

  const mdFiles = [];
  function collectMd(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) collectMd(full);
      else if (entry.name.endsWith('.md')) mdFiles.push(full);
    }
  }
  collectMd(skillDir);

  let totalRefs = 0;
  let brokenRefs = 0;

  for (const file of mdFiles) {
    const content = readFileSync(file, 'utf-8');
    const refs = extractReferences(content);
    const relFile = file.replace(skillDir + '/', '');

    for (const ref of refs) {
      totalRefs++;
      const resolved = join(skillDir, ref);
      if (!existsSync(resolved)) {
        error(`${relFile} → ${ref} (file not found)`);
        brokenRefs++;
      }
    }
  }

  if (brokenRefs === 0 && totalRefs > 0) {
    pass(`all ${totalRefs} file references resolve`);
  } else if (totalRefs === 0) {
    warn('no file references found');
  }
}

// ---------------------------------------------------------------------------
// 3. Validate marketplace.json
// ---------------------------------------------------------------------------

function validateMarketplace() {
  console.log('\n[Marketplace] .claude-plugin/marketplace.json');
  const manifestPath = join(ROOT, '.claude-plugin', 'marketplace.json');

  if (!existsSync(manifestPath)) {
    warn('marketplace.json not found — skipping');
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch (e) {
    error(`Invalid JSON: ${e.message}`);
    return;
  }

  // name
  if (!manifest.name) {
    error('Missing marketplace name');
  } else if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(manifest.name)) {
    error(`Marketplace name "${manifest.name}" must be lowercase kebab-case`);
  } else {
    pass(`marketplace name: ${manifest.name}`);
  }

  // owner
  if (!manifest.owner?.name) {
    error('Missing owner.name');
  } else {
    pass(`owner: ${manifest.owner.name}`);
  }

  // plugins
  if (!Array.isArray(manifest.plugins) || manifest.plugins.length === 0) {
    error('plugins array is missing or empty');
    return;
  }

  const seenNames = new Set();
  for (const plugin of manifest.plugins) {
    if (!plugin.name) {
      error('Plugin missing name');
      continue;
    }
    if (seenNames.has(plugin.name)) {
      error(`Duplicate plugin name: ${plugin.name}`);
    }
    seenNames.add(plugin.name);

    // Validate skill paths (relative to repo root)
    if (Array.isArray(plugin.skills)) {
      for (const skillPath of plugin.skills) {
        const resolved = resolve(ROOT, skillPath);
        if (!existsSync(resolved)) {
          error(`Plugin "${plugin.name}" skill path not found: ${skillPath}`);
        } else if (!existsSync(join(resolved, 'SKILL.md'))) {
          error(`Plugin "${plugin.name}" skill path missing SKILL.md: ${skillPath}`);
        } else {
          pass(`plugin "${plugin.name}" → ${skillPath}`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('Validating agent skills...');

// Discover all skills
const skillsRoot = join(ROOT, 'skills');
if (!existsSync(skillsRoot)) {
  error('skills/ directory not found');
} else {
  const skillDirs = readdirSync(skillsRoot, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(join(skillsRoot, d.name, 'SKILL.md')));

  if (skillDirs.length === 0) {
    error('No skills found (no directories with SKILL.md)');
  }

  for (const dir of skillDirs) {
    const skillDir = join(skillsRoot, dir.name);
    validateSkillMd(skillDir, dir.name);
    validateReferences(skillDir, dir.name);
  }
}

validateMarketplace();

// Summary
console.log('\n' + '─'.repeat(40));
if (errors > 0) {
  console.error(`\n✗ ${errors} error(s), ${warnings} warning(s)`);
  process.exit(1);
} else {
  console.log(`\n✓ All checks passed (${warnings} warning(s))`);
}
