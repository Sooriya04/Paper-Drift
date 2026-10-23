/**
 * @file src/skill/installer.js
 * @description Installs the paper-drift Agent Skill directly into local agent workspaces or global directories.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Locate packaged SKILL.md
const SKILL_SOURCE = path.resolve(__dirname, '../../skills/paper-drift/SKILL.md');

/**
 * Reads the canonical paper-drift SKILL.md definition.
 * @returns {string} Raw markdown skill content.
 */
export function getSkillContent() {
  if (!fs.existsSync(SKILL_SOURCE)) {
    throw new Error(`Could not find SKILL.md at ${SKILL_SOURCE}`);
  }
  return fs.readFileSync(SKILL_SOURCE, 'utf-8');
}

/**
 * Installs the paper-drift skill into agent workspaces.
 * @param {Object} options Installation options.
 * @param {boolean} [options.global=false] Install globally to user home directories.
 * @param {boolean} [options.claude=false] Explicitly target Claude Code (.claude/skills).
 * @param {boolean} [options.cursor=false] Explicitly target Cursor rules (.cursor/rules).
 * @param {boolean} [options.agent=false] Explicitly target standard .agent/skills.
 * @param {string} [options.dest] Custom destination path.
 * @returns {string[]} List of installed file paths.
 */
export function installSkill(options = {}) {
  const content = getSkillContent();
  const installedPaths = [];
  const cwd = process.cwd();

  if (options.dest) {
    const destPath = path.resolve(cwd, options.dest);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, content, 'utf-8');
    installedPaths.push(destPath);
    return installedPaths;
  }

  if (options.global) {
    const home = os.homedir();
    const globalTargets = [
      path.join(home, '.claude', 'skills', 'paper-drift', 'SKILL.md'),
      path.join(home, '.gemini', 'antigravity-cli', 'skills', 'paper-drift', 'SKILL.md')
    ];
    for (const target of globalTargets) {
      try {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content, 'utf-8');
        installedPaths.push(target);
      } catch (err) {
        // Silently skip if user permissions or folder structure don't allow
      }
    }
    return installedPaths;
  }

  const explicit = options.claude || options.cursor || options.agent;

  if (options.claude || (!explicit && fs.existsSync(path.join(cwd, '.claude')))) {
    const claudePath = path.join(cwd, '.claude', 'skills', 'paper-drift', 'SKILL.md');
    fs.mkdirSync(path.dirname(claudePath), { recursive: true });
    fs.writeFileSync(claudePath, content, 'utf-8');
    installedPaths.push(claudePath);
  }

  if (options.cursor || (!explicit && fs.existsSync(path.join(cwd, '.cursor')))) {
    const cursorPath = path.join(cwd, '.cursor', 'rules', 'paper-drift.md');
    fs.mkdirSync(path.dirname(cursorPath), { recursive: true });
    fs.writeFileSync(cursorPath, content, 'utf-8');
    installedPaths.push(cursorPath);
  }

  // Always install to .agent/skills/paper-drift/SKILL.md by default
  if (options.agent || !explicit || installedPaths.length === 0) {
    const agentPath = path.join(cwd, '.agent', 'skills', 'paper-drift', 'SKILL.md');
    fs.mkdirSync(path.dirname(agentPath), { recursive: true });
    fs.writeFileSync(agentPath, content, 'utf-8');
    installedPaths.push(agentPath);
  }

  return installedPaths;
}
