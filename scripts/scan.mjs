#!/usr/bin/env node
/**
 * 桃源镇 · 一键进度更新
 * 扫描文件系统 + 刷新 HTML 嵌入数据
 *
 * 使用: node scripts/scan.mjs
 */
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import * as fs from 'fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = resolve(ROOT, 'architecture-comparison.html');
const JSON_FILE = resolve(ROOT, 'progress-data.json');

try {
  // ── 1. 扫描文件系统 ──
  console.log('🔍 扫描桃源镇项目...');
  execSync('node scripts/update-progress.mjs', { cwd: ROOT, timeout: 60000, encoding: 'utf-8', stdio: 'inherit' });

  // ── 2. 读取扫描结果 ──
  const data = JSON.parse(fs.readFileSync(JSON_FILE, 'utf-8'));
  const html = fs.readFileSync(HTML, 'utf-8');

  // ── 3. 构造新的 EMBEDDED_DATA 块 ──
  // 压缩模块数据到一行一个
  const modulesJson = data.modules.map(m =>
    JSON.stringify({
      name: m.name, weight: m.weight,
      expected: m.expected, present: m.present,
      presentFiles: m.presentFiles, missingFiles: m.missingFiles, extraFiles: m.extraFiles,
      pct: m.pct, loc: m.loc, absPct: m.absPct, desc: m.desc
    })
  ).join(',\n    ');

  const embeddedBlock = `// ═══ 嵌入的进度数据 (由 scripts/scan.mjs 自动更新) ═══
const EMBEDDED_DATA = {
  "scannedAt": "${data.scannedAt}",
  "overall": {
    "pct": ${data.overall.pct},
    "sourceFiles": ${data.overall.sourceFiles}, "expectedFiles": ${data.overall.expectedFiles}, "loc": ${data.overall.loc},
    "compileErrors": ${data.overall.compileErrors},
    "test": { "passed": ${data.overall.test.passed}, "total": ${data.overall.test.total}, "files": ${data.overall.test.files}, "ok": ${data.overall.test.ok} },
    "modulesImplemented": ${data.overall.modulesImplemented}, "modulesTotal": ${data.overall.modulesTotal}, "emptyDirs": ${JSON.stringify(data.overall.emptyDirs)}
  },
  "modules": [
    ${modulesJson}
  ]
};`;

  // ── 4. 替换 HTML 中的 EMBEDDED_DATA ──
  const startMarker = '// ═══ 嵌入的进度数据';
  const endMarker = '// ── Load progress data ──';
  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    console.error('❌ 无法在 HTML 中找到 EMBEDDED_DATA 标记位置');
    process.exit(1);
  }

  const newHtml = html.slice(0, startIdx) + embeddedBlock + '\n\n' + html.slice(endIdx);
  fs.writeFileSync(HTML, newHtml, 'utf-8');

  // ── 5. 完成 ──
  const pct = data.overall.pct;
  const barLen = Math.round(pct / 5);
  const bar = '█'.repeat(barLen) + '░'.repeat(20 - barLen);
  console.log(`\n✅ 完成！HTML 已更新 (architecture-comparison.html)`);
  console.log(`   总体进度: ${pct}%  ${bar}`);
  console.log(`   文件: ${data.overall.sourceFiles}/${data.overall.expectedFiles} · 测试: ${data.overall.test.passed}/${data.overall.test.total}`);
  console.log(`   刷新 HTML 页面即可查看最新进度`);
} catch (err) {
  console.error('❌ 扫描失败:', err.message);
  process.exit(1);
}
