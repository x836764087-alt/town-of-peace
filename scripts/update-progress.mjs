#!/usr/bin/env node
/**
 * 桃源镇 · 进度扫描器 (v2)
 * 基于设计文档 v6.0 的完整模块定义，扫描真实文件系统
 * 输出进度数据到 progress-data.json
 *
 * 用法: node scripts/update-progress.mjs
 * 建议: cron 每小时自动更新
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUTPUT = path.join(ROOT, 'progress-data.json');

// ── Module definitions (design-doc expected files vs actual) ──
const MODULES = [
  {
    name: 'config/',
    weight: 10,
    files: [
      'characters.ts', 'events-pool.ts', 'innovation-tree.ts', 'items.ts',
      'prices.ts', 'resource-system.ts', 'skills.ts', 'tech-tree.ts', 'world.ts'
    ],
    dir: 'config',
    desc: '7 个配置文件 + 类型约束',
  },
  {
    name: 'core/',
    weight: 12,
    files: ['event-bus.ts', 'rng.ts', 'types.ts', 'world-engine.ts'],
    dir: 'core',
    desc: '世界引擎 · 种子RNG · EventBus · 类型系统',
  },
  {
    name: 'agents/',
    weight: 20,
    files: [
      'agent-factory.ts', 'lifecycle-system.ts', 'knowledge-transfer.ts',
      'trade-system.ts', 'dialogue-topics.ts', 'rumor-mill.ts',
      'group-system.ts', 'town-events.ts',
    ],
    dir: 'agents',
    desc: 'Agent 工厂 · 生命周期 · 交易 · 对话 · 谣言 · 群体 · 事件',
  },
  {
    name: 'economy/',
    weight: 12,
    files: ['currency.ts', 'employment-system.ts', 'market.ts', 'inventory.ts', 'trade.ts'],
    dir: 'economy',
    desc: '货币 · 雇佣 · 市场 · 库存 · 交易',
  },
  {
    name: 'world/',
    weight: 10,
    files: ['resources.ts', 'seasons.ts', 'map.ts', 'buildings.ts'],
    dir: 'world',
    desc: '资源 · 季节 · 地图 · 建筑系统',
  },
  {
    name: 'society/',
    weight: 14,
    files: ['laws.ts', 'festivals.ts', 'groups.ts', 'archives.ts', 'knowledge-transfer.ts'],
    dir: 'society',
    desc: '法律 · 节日 · 群体 · 档案 · 知识传承',
  },
  {
    name: 'innovation/',
    weight: 8,
    files: ['innovation-tree.ts', 'tech-checker.ts', 'discoveries.ts'],
    dir: 'innovation',
    desc: '创新树 · 技术前提检测 · 发现事件',
  },
  {
    name: 'narrative/',
    weight: 8,
    files: ['chronicle.ts', 'chronicle-generator.ts', 'event-emitter.ts', 'templates.ts'],
    dir: 'narrative',
    desc: '镇志生成 · 事件叙事化 · 模板库',
  },
  {
    name: 'index.ts',
    weight: 6,
    files: ['index.ts'],  // 主入口 + 主循环
    dir: '',
    desc: '主循环 · CLI · 存档',
  },
];

// ── Scan actual files ──
function scanModules() {
  const results = [];
  for (const mod of MODULES) {
    const dirPath = mod.dir ? path.join(SRC, mod.dir) : SRC;

    const present = [];
    const missing = [];
    let extra = [];

    // Check expected files
    for (const f of mod.files) {
      const fp = path.join(dirPath, f);
      if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        present.push(f);
      } else {
        missing.push(f);
      }
    }

    // Check for extra files (present but not in design)
    if (fs.existsSync(dirPath)) {
      const allFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.ts'));
      extra = allFiles.filter(f => !mod.files.includes(f));
    }

    // Count LOC
    const loc = [...present, ...extra].reduce((sum, f) => {
      try {
        const content = fs.readFileSync(path.join(dirPath, f), 'utf-8');
        return sum + content.split('\n').length;
      } catch { return sum; }
    }, 0);

    results.push({
      name: mod.name,
      weight: mod.weight,
      expected: mod.files.length,
      present: present.length + extra.length,
      presentFiles: present.map(f => f.replace('.ts', '')),
      missingFiles: missing.map(f => f.replace('.ts', '')),
      extraFiles: extra.map(f => f.replace('.ts', '')),
      pct: Math.round(((present.length + extra.length) / (mod.files.length + extra.length)) * 100),
      loc,
      absPct: Math.round((present.length / mod.files.length) * 100), // strict: only match design
      desc: mod.desc,
    });
  }
  return results;
}

// ── Compile check ──
function checkCompile() {
  try {
    const out = execSync('npx tsc --noEmit 2>&1 || true', { cwd: ROOT, timeout: 30000, encoding: 'utf-8' });
    const errors = out.split('\n').filter(l => l.includes('error TS')).length;
    return { errors };
  } catch {
    return { errors: -1 };
  }
}

// ── Test results ──
function checkTests() {
  try {
    const out = execSync('npx vitest run 2>&1', { cwd: ROOT, timeout: 60000, encoding: 'utf-8' });
    const files = parseInt(out.match(/Test Files\s+(\d+)/)?.[1] || '0');
    const passed = parseInt(out.match(/Tests\s+(\d+) passed/)?.[1] || '0');
    const total = parseInt(out.match(/Tests\s+\d+ passed.*\((\d+)\)/)?.[1] || passed);
    return { files, passed, total, ok: !out.includes('FAIL') };
  } catch {
    return { files: 0, passed: 0, total: 0, ok: false };
  }
}

// ── Full source LOC ──
function totalLoc() {
  let total = 0;
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) { walk(p); }
      else if (f.endsWith('.ts')) {
        total += fs.readFileSync(p, 'utf-8').split('\n').length;
      }
    }
  };
  walk(SRC);
  // Also count tests
  const testsDir = path.join(ROOT, 'tests');
  if (fs.existsSync(testsDir)) walk(testsDir);
  return total;
}

// ── Main ──
function main() {
  const modules = scanModules();
  const compile = checkCompile();
  const tests = checkTests();
  const total = totalLoc();

  // Weighted overall progress (uses absPct — strict matching against design)
  const weighted = modules.reduce((s, m) => s + m.absPct * m.weight, 0);
  const totalW = modules.reduce((s, m) => s + m.weight, 0);
  const overallPct = Math.round(weighted / totalW);

  const data = {
    scannedAt: new Date().toISOString(),
    overall: {
      pct: overallPct,
      sourceFiles: modules.reduce((s, m) => s + m.present, 0),
      expectedFiles: modules.reduce((s, m) => s + m.expected, 0),
      loc: total,
      compileErrors: compile.errors,
      test: {
        passed: tests.passed,
        total: tests.total,
        files: tests.files,
        ok: tests.ok,
      },
      modulesImplemented: modules.filter(m => m.present > 0).length,
      modulesTotal: modules.length,
      emptyDirs: modules.filter(m => m.dir && m.present === 0 && fs.existsSync(path.join(SRC, m.dir))).map(m => m.name),
    },
    modules,
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(data, null, 2));
  console.log(`✅ 进度扫描完成 → ${OUTPUT}`);
  console.log(`   总体进度: ${overallPct}%`);
  console.log(`   源文件: ${data.overall.sourceFiles}/${data.overall.expectedFiles}`);
  console.log(`   代码行: ${total}`);
  console.log(`   测试: ${tests.passed}/${tests.total}`);
  console.log(`   编译: ${compile.errors} 错误`);

  // Print module breakdown
  for (const m of modules) {
    const icon = m.absPct === 100 ? '✅' : m.absPct > 0 ? '🔄' : '⬜';
    console.log(`   ${icon} ${m.name}: ${m.absPct}% (${m.present}/${m.expected + m.extraFiles.length} 文件)`);
    if (m.missingFiles.length > 0) console.log(`       缺失: ${m.missingFiles.join(', ')}`);
  }
}

main();
