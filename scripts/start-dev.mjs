#!/usr/bin/env node

/**
 * InkOS 开发环境一键启动脚本（跨平台）
 * 手动管理各子进程，避免 Studio dev 脚本中的 Unix 语法在 Windows 下不兼容
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const packagesDir = resolve(root, 'packages');
const PNPM_VERSION = '11.9.0';

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

const children = [];

function log(tag, msg, color = CYAN) {
  const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  console.log(`${color}[${ts}][${tag}]${RESET} ${msg}`);
}

function quoteShellArg(value) {
  const text = String(value);
  if (process.platform === 'win32') {
    if (!/[\s"&|<>^]/.test(text)) return text;
    return `"${text.replaceAll('"', '""')}"`;
  }
  return `'${text.replaceAll("'", "'\\''")}'`;
}

function commandWorks(command) {
  const commandLine = [command, '--version'].map(quoteShellArg).join(' ');
  const result = spawnSync(commandLine, {
    cwd: root,
    shell: true,
    stdio: 'ignore',
  });
  return result.status === 0;
}

function spawnCommand(cmd, args, options) {
  const commandLine = [cmd, ...args].map(quoteShellArg).join(' ');
  return spawn(commandLine, {
    shell: true,
    ...options,
  });
}

function resolvePnpmCommand() {
  if (commandWorks('pnpm')) return { cmd: 'pnpm', prefixArgs: [] };
  if (commandWorks('corepack')) {
    log('inkos', '未检测到全局 pnpm，将通过 Corepack 启动', YELLOW);
    return { cmd: 'corepack', prefixArgs: ['pnpm'] };
  }
  if (commandWorks('npx')) {
    log('inkos', `未检测到全局 pnpm，将通过 npx 使用 pnpm@${PNPM_VERSION}`, YELLOW);
    return { cmd: 'npx', prefixArgs: ['--yes', `pnpm@${PNPM_VERSION}`] };
  }
  throw new Error('未检测到 pnpm、corepack 或 npx，请先安装 Node.js（含 npm）');
}

function runSync(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnCommand(cmd, args, {
      stdio: 'inherit',
      cwd: root,
      ...options,
    });
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`退出码: ${code}`));
      else resolve();
    });
    child.on('error', reject);
  });
}

function startDaemon(tag, cmd, args, options = {}) {
  log(tag, `> ${cmd} ${args.join(' ')}`, GREEN);
  const child = spawnCommand(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: root,
    ...options,
  });

  child.stdout.on('data', (data) => {
    for (const line of data.toString().split('\n')) {
      if (line.trim()) log(tag, line);
    }
  });
  child.stderr.on('data', (data) => {
    for (const line of data.toString().split('\n')) {
      if (line.trim()) log(tag, line, YELLOW);
    }
  });
  child.on('close', (code) => {
    log(tag, `进程退出，退出码: ${code}`, code === 0 ? GREEN : RED);
  });

  children.push(child);
  return child;
}

function cleanup(exitCode = 0) {
  log('inkos', '正在关闭所有子进程...', YELLOW);
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
  process.exit(exitCode);
}

process.on('SIGINT', () => cleanup());
process.on('SIGTERM', () => cleanup());

async function main() {
  log('inkos', '🚀 InkOS 开发环境启动中...', GREEN);
  console.log();

  const pnpm = resolvePnpmCommand();
  const runPnpm = (args, options) => runSync(pnpm.cmd, [...pnpm.prefixArgs, ...args], options);
  const startPnpm = (tag, args, options) => startDaemon(tag, pnpm.cmd, [...pnpm.prefixArgs, ...args], options);

  // 1. 同步依赖。仅检查 node_modules 是否存在无法覆盖拉取代码后锁文件已变化的情况，
  //    CI 模式可避免 pnpm 因需要重建 modules 目录而等待交互确认。
  log('inkos', '📦 正在同步项目依赖...');
  await runPnpm(['install', '--frozen-lockfile', '--prefer-offline'], {
    env: {
      ...process.env,
      CI: 'true',
    },
  });
  log('inkos', '✅ 项目依赖已同步', GREEN);

  // 2. 检查环境变量
  if (!existsSync(resolve(root, '.env'))) {
    log('inkos', '⚠️  未检测到 .env 文件，建议从 .env.example 复制', YELLOW);
  }

  // 3. 先构建 core（cli 和 studio 都依赖它）
  log('inkos', '🔨 构建 @actalk/inkos-core...');
  await runPnpm(['--filter', '@actalk/inkos-core', 'build']);
  log('inkos', '✅ Core 构建完成', GREEN);

  // 4. 启动 core watch（增量编译）
  startPnpm('core', ['--filter', '@actalk/inkos-core', 'dev']);

  // 5. 启动 Studio 前端（Vite）
  startPnpm('studio-fe', ['--filter', '@actalk/inkos-studio', 'dev:client']);

  // 6. 启动 Studio 后端（Hono API Server）
  //    直接用 tsx 启动，避免 dev:server 脚本中的 Unix 语法在 Windows 下不兼容
  const studioDir = resolve(packagesDir, 'studio');
  const tsxPath = resolve(studioDir, 'node_modules', '.bin', 'tsx');
  startDaemon('studio-be', tsxPath, ['watch', '--clear-screen=false', 'src/api/index.ts'], {
    cwd: studioDir,
    env: {
      ...process.env,
      INKOS_STUDIO_PORT: '4569',
      INKOS_PROJECT_ROOT: resolve(root, 'test-project'),
    },
  });

  // 7. 启动 CLI watch
  startPnpm('cli', ['--filter', '@actalk/inkos', 'dev']);

  console.log();
  log('inkos', '✅ 所有服务已启动：', GREEN);
  log('inkos', '  Studio 前端: http://localhost:4567', CYAN);
  log('inkos', '  Studio API:   http://localhost:4569', CYAN);
  log('inkos', '  按 Ctrl+C 停止所有服务', YELLOW);
  console.log();

  // 保持主进程存活
  await new Promise(() => {});
}

main().catch((err) => {
  log('inkos', `❌ 启动失败: ${err.message}`, RED);
  cleanup(1);
});
