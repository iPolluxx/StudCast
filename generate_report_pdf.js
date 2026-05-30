const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>System Intelligence Report — Lone Ranger Estimator</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

  :root {
    --base-bg: #0d0d14;
    --card-bg: #13131f;
    --border: #2a2a3d;
    --primary-accent: #7c3aed;
    --accent-glow: #9d6eff;
    --accent-light: #c4b5fd;
    --danger: #ef4444;
    --warning: #f59e0b;
    --success: #22c55e;
    --info: #38bdf8;
    --text-primary: #e8e8f0;
    --text-secondary: #9898b0;
    --text-muted: #5a5a72;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Inter', 'Segoe UI', sans-serif;
    background: var(--base-bg);
    color: var(--text-primary);
    font-size: 9.5pt;
    line-height: 1.65;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── PAGE STRUCTURE ── */
  .page { padding: 0; }

  /* ── COVER PAGE ── */
  .cover {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: linear-gradient(160deg, #0d0d14 0%, #120e1f 50%, #0a0a14 100%);
    page-break-after: always;
    position: relative;
    overflow: hidden;
  }

  .cover::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 80% 50% at 50% 0%, rgba(124,58,237,0.15) 0%, transparent 70%),
      radial-gradient(ellipse 40% 30% at 80% 80%, rgba(157,110,255,0.08) 0%, transparent 60%);
    pointer-events: none;
  }

  .cover-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(124,58,237,0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(124,58,237,0.06) 1px, transparent 1px);
    background-size: 40px 40px;
    mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, black 0%, transparent 100%);
    -webkit-mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, black 0%, transparent 100%);
  }

  .cover-content { position: relative; z-index: 1; text-align: center; padding: 60px 80px; }

  .cover-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(124,58,237,0.15);
    border: 1px solid rgba(124,58,237,0.4);
    border-radius: 20px;
    padding: 5px 16px;
    font-size: 7.5pt;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent-light);
    margin-bottom: 32px;
  }

  .cover-badge::before {
    content: '●';
    color: #22c55e;
    font-size: 8pt;
    animation: none;
  }

  .cover-title {
    font-size: 28pt;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.1;
    background: linear-gradient(135deg, #ffffff 0%, var(--accent-light) 60%, var(--primary-accent) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 12px;
  }

  .cover-subtitle {
    font-size: 13pt;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: 48px;
    letter-spacing: 0.01em;
  }

  .cover-divider {
    width: 80px;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--primary-accent), transparent);
    margin: 0 auto 48px;
  }

  .cover-meta {
    display: flex;
    gap: 40px;
    justify-content: center;
    flex-wrap: wrap;
  }

  .cover-meta-item {
    text-align: center;
  }

  .cover-meta-label {
    font-size: 7pt;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 4px;
  }

  .cover-meta-value {
    font-size: 9pt;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .cover-section-count {
    position: absolute;
    bottom: 48px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 8px;
  }

  .section-dot {
    width: 24px;
    height: 3px;
    border-radius: 2px;
    background: rgba(124,58,237,0.3);
  }

  .section-dot:first-child {
    background: var(--primary-accent);
    width: 40px;
  }

  /* ── TOC PAGE ── */
  .toc-page {
    padding: 60px 70px;
    page-break-after: always;
    min-height: 100vh;
  }

  .toc-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 36px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }

  .toc-header-accent {
    width: 4px;
    height: 24px;
    background: linear-gradient(180deg, var(--primary-accent), var(--accent-glow));
    border-radius: 2px;
  }

  .toc-title {
    font-size: 14pt;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.01em;
  }

  .toc-items { list-style: none; }

  .toc-item {
    display: flex;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid rgba(42,42,61,0.5);
    cursor: default;
  }

  .toc-num {
    width: 28px;
    height: 28px;
    background: rgba(124,58,237,0.12);
    border: 1px solid rgba(124,58,237,0.25);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 7.5pt;
    font-weight: 700;
    color: var(--accent-light);
    flex-shrink: 0;
    margin-right: 14px;
  }

  .toc-item-title {
    flex: 1;
    font-size: 9.5pt;
    font-weight: 500;
    color: var(--text-primary);
  }

  .toc-item-sub {
    font-size: 8pt;
    color: var(--text-muted);
    margin-top: 2px;
  }

  .toc-dots {
    flex: 1;
    border-bottom: 1px dotted var(--border);
    margin: 0 12px;
    height: 1px;
    align-self: flex-end;
    margin-bottom: 6px;
  }

  /* ── MAIN CONTENT ── */
  .content-page {
    padding: 56px 70px;
  }

  /* ── SECTION HEADERS ── */
  .section {
    page-break-inside: avoid;
    margin-bottom: 36px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 20px;
    padding: 16px 20px;
    background: linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(124,58,237,0.02) 100%);
    border: 1px solid rgba(124,58,237,0.2);
    border-left: 3px solid var(--primary-accent);
    border-radius: 0 8px 8px 0;
  }

  .section-num {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8pt;
    font-weight: 500;
    color: var(--primary-accent);
    background: rgba(124,58,237,0.1);
    padding: 3px 8px;
    border-radius: 4px;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  .section-title {
    font-size: 13pt;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.01em;
  }

  /* ── SUBSECTION HEADERS ── */
  h3 {
    font-size: 10pt;
    font-weight: 600;
    color: var(--accent-light);
    margin: 20px 0 10px;
    padding-left: 10px;
    border-left: 2px solid rgba(196,181,253,0.3);
    letter-spacing: 0.02em;
  }

  h4 {
    font-size: 9pt;
    font-weight: 600;
    color: var(--text-secondary);
    margin: 14px 0 8px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  p {
    color: var(--text-secondary);
    margin-bottom: 10px;
    line-height: 1.7;
  }

  /* ── TABLES ── */
  .table-wrap {
    overflow: hidden;
    border-radius: 8px;
    border: 1px solid var(--border);
    margin: 16px 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 7.5pt;
    font-family: 'JetBrains Mono', monospace;
  }

  thead tr {
    background: rgba(124,58,237,0.15);
  }

  thead th {
    padding: 8px 10px;
    text-align: left;
    font-weight: 600;
    color: var(--accent-light);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-size: 6.5pt;
    border-bottom: 1px solid rgba(124,58,237,0.25);
    white-space: nowrap;
  }

  tbody tr {
    border-bottom: 1px solid rgba(42,42,61,0.6);
  }

  tbody tr:last-child { border-bottom: none; }

  tbody tr:nth-child(even) {
    background: rgba(255,255,255,0.015);
  }

  tbody td {
    padding: 7px 10px;
    color: var(--text-secondary);
    vertical-align: top;
    line-height: 1.5;
  }

  .badge {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 6.5pt;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .badge-method-get  { background: rgba(34,197,94,0.12);  color: #4ade80; border: 1px solid rgba(34,197,94,0.25); }
  .badge-method-post { background: rgba(56,189,248,0.12); color: #67e8f9; border: 1px solid rgba(56,189,248,0.25); }
  .badge-method-put  { background: rgba(245,158,11,0.12); color: #fcd34d; border: 1px solid rgba(245,158,11,0.25); }
  .badge-method-del  { background: rgba(239,68,68,0.12);  color: #f87171; border: 1px solid rgba(239,68,68,0.25); }
  .badge-yes { background: rgba(34,197,94,0.1); color: #4ade80; border: 1px solid rgba(34,197,94,0.2); }
  .badge-no  { background: rgba(90,90,114,0.15); color: #6b7280; border: 1px solid rgba(90,90,114,0.2); }

  /* ── CODE BLOCKS ── */
  .code-block {
    background: #0a0a12;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
    margin: 14px 0;
    overflow: hidden;
  }

  .code-block-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }

  .code-dots { display: flex; gap: 5px; }
  .code-dot {
    width: 8px; height: 8px; border-radius: 50%;
  }
  .code-dot:nth-child(1) { background: #ef4444; }
  .code-dot:nth-child(2) { background: #f59e0b; }
  .code-dot:nth-child(3) { background: #22c55e; }

  .code-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7pt;
    color: var(--text-muted);
    letter-spacing: 0.05em;
  }

  pre {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7.5pt;
    color: #a8b1c8;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.6;
    margin: 0;
  }

  .kw { color: #c792ea; }
  .str { color: #c3e88d; }
  .cmt { color: #546e7a; font-style: italic; }
  .num { color: #f78c6c; }
  .prop { color: #82aaff; }

  /* ── ALERT BOXES ── */
  .alert {
    border-radius: 8px;
    padding: 12px 16px;
    margin: 14px 0;
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .alert-icon {
    font-size: 13pt;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .alert-content { flex: 1; }

  .alert-title {
    font-size: 8.5pt;
    font-weight: 700;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .alert-body {
    font-size: 8.5pt;
    line-height: 1.6;
    margin: 0;
  }

  .alert-critical {
    background: rgba(239,68,68,0.07);
    border: 1px solid rgba(239,68,68,0.25);
    border-left: 3px solid var(--danger);
  }
  .alert-critical .alert-title { color: #f87171; }
  .alert-critical .alert-body  { color: #fca5a5; }

  .alert-warning {
    background: rgba(245,158,11,0.07);
    border: 1px solid rgba(245,158,11,0.25);
    border-left: 3px solid var(--warning);
  }
  .alert-warning .alert-title { color: #fcd34d; }
  .alert-warning .alert-body  { color: #fde68a; }

  .alert-info {
    background: rgba(56,189,248,0.07);
    border: 1px solid rgba(56,189,248,0.25);
    border-left: 3px solid var(--info);
  }
  .alert-info .alert-title { color: #67e8f9; }
  .alert-info .alert-body  { color: #bae6fd; }

  /* ── FLOW STEPS ── */
  .flow-steps { margin: 14px 0; }

  .flow-step {
    display: flex;
    gap: 14px;
    margin-bottom: 12px;
    align-items: flex-start;
  }

  .flow-step-num {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--primary-accent), var(--accent-glow));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 7.5pt;
    font-weight: 700;
    color: white;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .flow-step-content { flex: 1; }
  .flow-step-title {
    font-size: 9pt;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 3px;
  }
  .flow-step-desc {
    font-size: 8.5pt;
    color: var(--text-secondary);
    line-height: 1.6;
    margin: 0;
  }

  /* ── WATERFALL ── */
  .waterfall {
    margin: 12px 0;
  }

  .waterfall-item {
    display: flex;
    gap: 10px;
    padding: 8px 12px;
    border-left: 2px solid var(--border);
    margin-bottom: 0;
    position: relative;
  }

  .waterfall-item:first-child { border-left-color: #22c55e; }
  .waterfall-item:nth-child(2) { border-left-color: #38bdf8; }
  .waterfall-item:nth-child(3) { border-left-color: #f59e0b; }
  .waterfall-item:last-child { border-left-color: #9d6eff; }

  .waterfall-rank {
    font-size: 7pt;
    font-weight: 700;
    color: var(--text-muted);
    width: 16px;
    text-align: right;
    flex-shrink: 0;
    padding-top: 1px;
  }

  .waterfall-label {
    font-size: 8.5pt;
    font-weight: 600;
    color: var(--text-primary);
  }

  .waterfall-desc {
    font-size: 8pt;
    color: var(--text-muted);
  }

  /* ── SCALABILITY CARDS ── */
  .scale-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
    margin: 14px 0;
  }

  .scale-card {
    background: rgba(19,19,31,0.8);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px;
  }

  .scale-card-header {
    font-size: 11pt;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .scale-card-sub {
    font-size: 7pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    margin-bottom: 10px;
  }

  .scale-card ul {
    list-style: none;
    padding: 0;
  }

  .scale-card li {
    font-size: 7.5pt;
    color: var(--text-secondary);
    padding: 3px 0 3px 12px;
    position: relative;
    line-height: 1.5;
  }

  .scale-card li::before {
    content: '▸';
    position: absolute;
    left: 0;
    color: var(--primary-accent);
    font-size: 7pt;
  }

  .scale-100 .scale-card-header { color: #fcd34d; }
  .scale-1k  .scale-card-header { color: #f87171; }
  .scale-10k .scale-card-header { color: #c084fc; }

  /* ── INLINE CODE ── */
  code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7.5pt;
    background: rgba(124,58,237,0.1);
    color: var(--accent-light);
    padding: 1px 5px;
    border-radius: 3px;
    border: 1px solid rgba(124,58,237,0.15);
  }

  /* ── PAGE FOOTER ── */
  .page-footer {
    margin-top: 48px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .footer-brand {
    font-size: 7.5pt;
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .footer-brand span {
    color: var(--primary-accent);
  }

  .footer-meta {
    font-size: 7pt;
    color: var(--text-muted);
    font-family: 'JetBrains Mono', monospace;
  }

  /* ── PAGE BREAKS ── */
  .page-break { page-break-after: always; }
  .no-break { page-break-inside: avoid; }

  @media print {
    body { background: var(--base-bg); }
    .cover { min-height: 100vh; }
  }
</style>
</head>
<body>

<!-- ═══════════════════════════════════════════════════════════ -->
<!--  COVER PAGE                                                 -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="cover">
  <div class="cover-grid"></div>
  <div class="cover-content">
    <div class="cover-badge">⬡ CONFIDENTIAL &nbsp;·&nbsp; INTERNAL ARCHITECTURE REVIEW</div>
    <div class="cover-title">System Intelligence<br>Report</div>
    <div class="cover-subtitle">Lone Ranger Estimator — Production Architecture Analysis</div>
    <div class="cover-divider"></div>
    <div class="cover-meta">
      <div class="cover-meta-item">
        <div class="cover-meta-label">Platform</div>
        <div class="cover-meta-value">Lone Ranger Estimator</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">Runtime</div>
        <div class="cover-meta-value">Node.js / Express / Cloud Run</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">Report Version</div>
        <div class="cover-meta-value">1.0.0</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">Generated</div>
        <div class="cover-meta-value">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
      </div>
    </div>
  </div>
  <div class="cover-section-count">
    <div class="section-dot"></div>
    <div class="section-dot"></div>
    <div class="section-dot"></div>
    <div class="section-dot"></div>
    <div class="section-dot"></div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!--  TABLE OF CONTENTS                                          -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="toc-page">
  <div class="toc-header">
    <div class="toc-header-accent"></div>
    <div class="toc-title">Table of Contents</div>
  </div>
  <ul class="toc-items">
    <li class="toc-item">
      <div class="toc-num">01</div>
      <div>
        <div class="toc-item-title">Full Express Route Map</div>
        <div class="toc-item-sub">HTTP method registry · middleware chain · auth guards · request/response schemas</div>
      </div>
    </li>
    <li class="toc-item">
      <div class="toc-num">02</div>
      <div>
        <div class="toc-item-title">Firestore Access Patterns</div>
        <div class="toc-item-sub">Data model paths · CRUD operations · transactions · hot-path calls</div>
      </div>
    </li>
    <li class="toc-item">
      <div class="toc-num">03</div>
      <div>
        <div class="toc-item-title">Frontend State Machine Flow</div>
        <div class="toc-item-sub">Boot sequence · auth hydration · subscription gating · polling loops</div>
      </div>
    </li>
    <li class="toc-item">
      <div class="toc-num">04</div>
      <div>
        <div class="toc-item-title">Gemini Pipeline Structure</div>
        <div class="toc-item-sub">Prompt construction · JSON schema · pricing waterfall · failure recovery</div>
      </div>
    </li>
    <li class="toc-item">
      <div class="toc-num">05</div>
      <div>
        <div class="toc-item-title">PDF Generation Pipeline</div>
        <div class="toc-item-sub">Puppeteer orchestration · CSS rendering · email transmission</div>
      </div>
    </li>
    <li class="toc-item">
      <div class="toc-num">06</div>
      <div>
        <div class="toc-item-title">Performance Analysis</div>
        <div class="toc-item-sub">Firestore hot-path reads · Puppeteer latency · frontend redundancy</div>
      </div>
    </li>
    <li class="toc-item">
      <div class="toc-num">07</div>
      <div>
        <div class="toc-item-title">Security Analysis</div>
        <div class="toc-item-sub">Auth bypass vectors · Twilio spoofing · HTML injection risks</div>
      </div>
    </li>
    <li class="toc-item">
      <div class="toc-num">08</div>
      <div>
        <div class="toc-item-title">Component Coupling Report</div>
        <div class="toc-item-sub">Collection coupling · webhook race conditions · fragile sequences</div>
      </div>
    </li>
    <li class="toc-item">
      <div class="toc-num">09</div>
      <div>
        <div class="toc-item-title">Future Scalability Constraints</div>
        <div class="toc-item-sub">100 · 1,000 · 10,000 user thresholds and failure modes</div>
      </div>
    </li>
  </ul>

  <div class="page-footer">
    <div class="footer-brand">Lone Ranger <span>Estimator</span></div>
    <div class="footer-meta">SYSTEM INTELLIGENCE REPORT · CONFIDENTIAL</div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!--  SECTION 1: EXPRESS ROUTE MAP                               -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="content-page">
  <div class="section-header">
    <span class="section-num">SECTION 01</span>
    <span class="section-title">Full Express Route Map</span>
  </div>

  <p>The application runs on Node.js Express configured for serverless deployment on Google Cloud Run. The middleware sequence is split to isolate raw-body ingestion for Stripe signature validation from standard JSON/form payloads.</p>

  <h3>Route Registry &amp; Security Schema</h3>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Method</th>
          <th>Route Path</th>
          <th>Middlewares (Exec Order)</th>
          <th>Auth</th>
          <th>Stripe</th>
          <th>Request Schema</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="badge badge-method-get">GET</span></td>
          <td><code>/</code></td>
          <td>Static fallback</td>
          <td><span class="badge badge-no">None</span></td>
          <td><span class="badge badge-no">No</span></td>
          <td>— Serves <code>public/index.html</code> (marketing)</td>
        </tr>
        <tr>
          <td><span class="badge badge-method-get">GET</span></td>
          <td><code>/dashboard</code></td>
          <td>Static fallback</td>
          <td><span class="badge badge-no">None</span></td>
          <td><span class="badge badge-no">No</span></td>
          <td>— Serves <code>public/dashboard.html</code></td>
        </tr>
        <tr>
          <td><span class="badge badge-method-post">POST</span></td>
          <td><code>/api/webhooks/stripe</code></td>
          <td><code>express.raw({type:'application/json'})</code></td>
          <td><span class="badge badge-no">None</span></td>
          <td><span class="badge badge-no">No</span></td>
          <td>Raw binary payload + Stripe-Signature header</td>
        </tr>
        <tr>
          <td><span class="badge badge-method-post">POST</span></td>
          <td><code>/api/webhook</code></td>
          <td><code>express.json()</code>, <code>express.urlencoded()</code>, <code>authorizePhone</code></td>
          <td><span class="badge badge-yes">Yes</span></td>
          <td><span class="badge badge-no">No</span></td>
          <td><code>req.body.Body</code> (SMS), <code>req.body.From</code> (phone)</td>
        </tr>
        <tr>
          <td><span class="badge badge-method-post">POST</span></td>
          <td><code>/api/process-text</code></td>
          <td><code>requireAuth</code>, <code>requireSubscription</code></td>
          <td><span class="badge badge-yes">Yes</span></td>
          <td><span class="badge badge-yes">Yes</span></td>
          <td><code>{ text: string, estimateId: string|null }</code></td>
        </tr>
        <tr>
          <td><span class="badge badge-method-post">POST</span></td>
          <td><code>/api/process</code></td>
          <td><code>multer.single('audio')</code>, <code>requireAuth</code>, <code>requireSubscription</code></td>
          <td><span class="badge badge-yes">Yes</span></td>
          <td><span class="badge badge-yes">Yes</span></td>
          <td>Multipart: file key <code>audio</code>, field <code>estimateId</code></td>
        </tr>
        <tr>
          <td><span class="badge badge-method-post">POST</span></td>
          <td><code>/api/generate-pdf</code></td>
          <td><code>requireAuth</code>, <code>requireSubscription</code></td>
          <td><span class="badge badge-yes">Yes</span></td>
          <td><span class="badge badge-yes">Yes</span></td>
          <td><code>{ projectName, project: { materials[], labor[], client_name, client_address, scope_of_work } }</code></td>
        </tr>
        <tr>
          <td><span class="badge badge-method-post">POST</span></td>
          <td><code>/api/upload-csv</code></td>
          <td><code>multer.single('file')</code>, <code>requireAuth</code></td>
          <td><span class="badge badge-yes">Yes</span></td>
          <td><span class="badge badge-no">No</span></td>
          <td>Multipart: CSV file (max 5MB)</td>
        </tr>
        <tr>
          <td><span class="badge badge-method-get">GET</span></td>
          <td><code>/api/estimates</code></td>
          <td><code>requireAuth</code></td>
          <td><span class="badge badge-yes">Yes</span></td>
          <td><span class="badge badge-no">No</span></td>
          <td>—</td>
        </tr>
        <tr>
          <td><span class="badge badge-method-get">GET</span></td>
          <td><code>/api/estimates/:id</code></td>
          <td><code>requireAuth</code></td>
          <td><span class="badge badge-yes">Yes</span></td>
          <td><span class="badge badge-no">No</span></td>
          <td>—</td>
        </tr>
        <tr>
          <td><span class="badge badge-method-post">POST</span></td>
          <td><code>/api/estimates/:id/save</code></td>
          <td><code>requireAuth</code></td>
          <td><span class="badge badge-yes">Yes</span></td>
          <td><span class="badge badge-no">No</span></td>
          <td><code>{ project_name, items[], total_amount, item_count, client_name, client_address, scope_of_work }</code></td>
        </tr>
        <tr>
          <td><span class="badge badge-method-put">PUT</span></td>
          <td><code>/api/estimates/:id/save</code></td>
          <td><code>requireAuth</code></td>
          <td><span class="badge badge-yes">Yes</span></td>
          <td><span class="badge badge-no">No</span></td>
          <td><code>{ project_name, items[], total_amount, item_count, client_name, client_address, scope_of_work }</code></td>
        </tr>
        <tr>
          <td><span class="badge badge-method-del">DELETE</span></td>
          <td><code>/api/estimates/:id</code></td>
          <td><code>requireAuth</code></td>
          <td><span class="badge badge-yes">Yes</span></td>
          <td><span class="badge badge-no">No</span></td>
          <td>—</td>
        </tr>
        <tr>
          <td><span class="badge badge-method-get">GET</span></td>
          <td><code>/api/settings</code></td>
          <td><code>requireAuth</code></td>
          <td><span class="badge badge-yes">Yes</span></td>
          <td><span class="badge badge-no">No</span></td>
          <td>—</td>
        </tr>
        <tr>
          <td><span class="badge badge-method-post">POST</span></td>
          <td><code>/api/settings</code></td>
          <td><code>requireAuth</code></td>
          <td><span class="badge badge-yes">Yes</span></td>
          <td><span class="badge badge-no">No</span></td>
          <td><code>{ company_name, company_address, license_number, contact_email, default_labor_rate, global_markup_percent, tax_rate, isOnboarded }</code></td>
        </tr>
        <tr>
          <td><span class="badge badge-method-post">POST</span></td>
          <td><code>/api/settings/logo</code></td>
          <td><code>requireAuth</code>, <code>multerMemory.single('logo')</code></td>
          <td><span class="badge badge-yes">Yes</span></td>
          <td><span class="badge badge-no">No</span></td>
          <td>Multipart: image file <code>logo</code> (max 2MB)</td>
        </tr>
        <tr>
          <td><span class="badge badge-method-post">POST</span></td>
          <td><code>/api/billing/create-checkout-session</code></td>
          <td><code>requireAuth</code></td>
          <td><span class="badge badge-yes">Yes</span></td>
          <td><span class="badge badge-no">No</span></td>
          <td>—</td>
        </tr>
        <tr>
          <td><span class="badge badge-method-get">GET</span></td>
          <td><code>/api/me</code></td>
          <td><code>requireAuth</code></td>
          <td><span class="badge badge-yes">Yes</span></td>
          <td><span class="badge badge-no">No</span></td>
          <td>— Returns <code>{ phone: string }</code></td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="page-footer">
    <div class="footer-brand">Lone Ranger <span>Estimator</span></div>
    <div class="footer-meta">§01 Express Route Map · CONFIDENTIAL</div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!--  SECTION 2: FIRESTORE ACCESS PATTERNS                       -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="content-page page-break">
  <div class="section-header">
    <span class="section-num">SECTION 02</span>
    <span class="section-title">Firestore Access Patterns</span>
  </div>

  <p>Database operations execute directly through the <code>@google-cloud/firestore</code> SDK. All writes use <code>{ merge: true }</code> to prevent partial overwrites.</p>

  <h3>Data Model &amp; Collection Paths</h3>
  <div class="code-block">
    <div class="code-block-header">
      <div class="code-dots">
        <div class="code-dot"></div><div class="code-dot"></div><div class="code-dot"></div>
      </div>
      <span class="code-label">Firestore Schema</span>
    </div>
    <pre>/users/{userPhone}                              <span class="cmt">← Root document per contractor</span>
   fields: { companyName, email, zipCode, status }

   ├── /estimates/{estimateId}                   <span class="cmt">← Per-project estimate documents</span>
   │      fields: { project_name, scope_of_work, items[], total_amount,
   │                item_count, client_name, client_address, updatedAt }
   │
   ├── /price_book/{sanitizedItemId}             <span class="cmt">← Self-teaching price catalog</span>
   │      fields: { name: string, price: number }
   │
   └── /settings/config                          <span class="cmt">← Business profile + subscription state</span>
          fields: { company_name, company_address, company_logo_url,
                    license_number, contact_email, default_labor_rate,
                    global_markup_percent, tax_rate, estimateCount,
                    isOnboarded, active_subscription, subscription_status }

/ledgers/{userPhone}                            <span class="cmt">← Legacy fallback document</span>
   fields: { [projectName]: { materials[], labor[] } }</pre>
  </div>

  <h3>Operation Execution Schema</h3>

  <div class="no-break">
    <h4>User Document Operations</h4>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Operation</th><th>Path</th><th>Method</th><th>Called From</th></tr>
        </thead>
        <tbody>
          <tr><td>Read user</td><td><code>users/{phone}</code></td><td><code>.get()</code></td><td><code>loadUser</code>, <code>requireAuth</code></td></tr>
          <tr><td>Write user</td><td><code>users/{phone}</code></td><td><code>.set(data, { merge: true })</code></td><td><code>saveUser</code></td></tr>
          <tr><td>Settings read/provision</td><td><code>users/{phone}/settings/config</code></td><td><code>.get()</code> → <code>.set(defaults)</code> if absent</td><td><code>GET /api/settings</code></td></tr>
          <tr><td>Stripe webhook resolve</td><td>Collection group: <code>settings</code></td><td><code>.where('stripe_customer_id','==',id).limit(1).get()</code></td><td>Stripe webhook handler</td></tr>
          <tr><td>Estimate counter</td><td><code>users/{phone}/settings/config</code></td><td><code>.runTransaction()</code> → increment <code>estimateCount</code></td><td><code>saveEstimateHandler</code></td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="no-break">
    <h4>Estimates CRUD Operations</h4>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Operation</th><th>Method</th><th>Notes</th></tr>
        </thead>
        <tbody>
          <tr><td>Create / Update</td><td><code>.set(updateObj, { merge: true })</code></td><td>Partial edits safe — never overwrites client fields</td></tr>
          <tr><td>Read Single</td><td><code>.doc(estimateId).get()</code></td><td>Used in <code>GET /api/estimates/:id</code> and <code>POST /api/generate-pdf</code></td></tr>
          <tr><td>List All</td><td><code>.collection('estimates').get()</code></td><td>Sorted in-memory by <code>updatedAt</code> to bypass index latency</td></tr>
          <tr><td>Delete</td><td><code>.doc(estimateId).delete()</code></td><td>Hard delete — no soft-delete / tombstone</td></tr>
          <tr><td>Price Book Update</td><td><code>.set({ name, price }, { merge: true })</code></td><td>Self-teaching: auto-captures edited item costs on save/PDF gen</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="page-footer">
    <div class="footer-brand">Lone Ranger <span>Estimator</span></div>
    <div class="footer-meta">§02 Firestore Patterns · CONFIDENTIAL</div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!--  SECTION 3: FRONTEND STATE MACHINE                          -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="content-page page-break">
  <div class="section-header">
    <span class="section-num">SECTION 03</span>
    <span class="section-title">Frontend State Machine Flow</span>
  </div>

  <p>The dashboard operates as a single-page application (SPA) in <code>public/dashboard.html</code> governed by sequential state transitions executed at boot.</p>

  <div class="flow-steps">
    <div class="flow-step">
      <div class="flow-step-num">1</div>
      <div class="flow-step-content">
        <div class="flow-step-title">Initial Page Boot</div>
        <p class="flow-step-desc">Executes <code>autoLogin()</code> immediately on script evaluation. Pulls <code>localStorage.getItem('userPhone')</code>. If found, populates <code>#phoneInput</code> and calls <code>attemptLogin(saved)</code>.</p>
      </div>
    </div>
    <div class="flow-step">
      <div class="flow-step-num">2</div>
      <div class="flow-step-content">
        <div class="flow-step-title">Authentication Hydration</div>
        <p class="flow-step-desc"><code>attemptLogin(phone)</code> normalizes to E.164 format. Issues <code>GET /api/estimates?phone={normalized}</code>. On HTTP 200: sets <code>currentUserPhone</code>, commits to <code>localStorage</code>, triggers <code>activateDashboard()</code>.</p>
      </div>
    </div>
    <div class="flow-step">
      <div class="flow-step-num">3</div>
      <div class="flow-step-content">
        <div class="flow-step-title">Onboarding Verification &amp; Gate</div>
        <p class="flow-step-desc">Inside <code>activateDashboard()</code>, calls <code>loadSettingsProfile()</code> → populates <code>window.userSettings</code>. If <code>isOnboarded</code> is false/missing: opens <code>#onboardWizardModal</code> with <code>backdrop-filter: blur(12px)</code> and calls <code>setInputsDisabled(true)</code>. Completing the wizard issues <code>POST /api/settings</code> with <code>isOnboarded: true</code>.</p>
      </div>
    </div>
    <div class="flow-step">
      <div class="flow-step-num">4</div>
      <div class="flow-step-content">
        <div class="flow-step-title">Subscription Gate &amp; Webhook Race Condition Handler</div>
        <p class="flow-step-desc">Checks <code>window.userSettings.active_subscription</code>. Three execution paths:</p>
      </div>
    </div>
  </div>

  <div class="no-break">
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Case</th><th>Condition</th><th>Action</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="badge badge-yes">A</span> Subscribed</td>
            <td><code>active_subscription === true</code></td>
            <td>Unlocks workspace. If <code>session_id</code> in URL → strips via <code>history.replaceState()</code> + fires celebration toast.</td>
          </tr>
          <tr>
            <td><span class="badge badge-warning">B</span> Race Condition</td>
            <td><code>active_subscription === false</code> AND <code>session_id</code> in URL</td>
            <td>Shows optimistic loading toast: <em>"Activating workspace tokens…"</em>. Polls <code>GET /api/settings</code> every 1500ms, max 4 retries. On success → <code>replaceState()</code> + unlock. On timeout → locks UI + shows <code>#subscriptionGateModal</code>.</td>
          </tr>
          <tr>
            <td><span class="badge badge-no">C</span> Unsubscribed</td>
            <td><code>active_subscription === false</code> AND no <code>session_id</code></td>
            <td>Shows <code>#subscriptionGateModal</code> blocking modal. Disables all inputs.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="page-footer">
    <div class="footer-brand">Lone Ranger <span>Estimator</span></div>
    <div class="footer-meta">§03 Frontend State Machine · CONFIDENTIAL</div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!--  SECTION 4: GEMINI PIPELINE                                 -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="content-page page-break">
  <div class="section-header">
    <span class="section-num">SECTION 04</span>
    <span class="section-title">Gemini Pipeline Structure</span>
  </div>

  <p>The extraction core uses the <code>@google/genai</code> SDK communicating with <code>gemini-3.5-flash</code>. Two ingestion paths feed the same prompt instruction layer.</p>

  <h3>Ingestion Pipelines</h3>
  <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Route</th><th>Input Type</th><th>Processing Steps</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><code>/api/process-text</code></td>
          <td>Plain text string</td>
          <td>Appended directly to the extraction system prompt → model inference.</td>
        </tr>
        <tr>
          <td><code>/api/process</code></td>
          <td>Binary audio (<code>.webm</code> / <code>.m4a</code>)</td>
          <td>Written to <code>/tmp</code> → uploaded via Gemini File API → model passed <code>createPartFromUri</code> reference + prompt. Local file + remote Gemini File reference deleted in <code>finally</code> block.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <h3>Prompt Instruction Specification</h3>
  <p>The model is instructed to extract and structure the following from contractor voice/text input:</p>
  <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Output Field</th><th>Instruction</th></tr>
      </thead>
      <tbody>
        <tr><td><code>projectName</code></td><td>Inferred from context; fallback to <code>'General'</code></td></tr>
        <tr><td><code>scope_of_work</code></td><td>2–3 sentence professional project summary for invoice document</td></tr>
        <tr><td>Material names</td><td>Descriptive, industry-standard terminology enforced</td></tr>
        <tr><td><code>trade</code></td><td>Strict enum mapping (e.g., <code>electrical</code>, <code>plumbing</code>, <code>hvac</code>)</td></tr>
        <tr><td><code>estimated_unit_cost</code></td><td>AI-estimated fallback unit cost when no explicit price given</td></tr>
        <tr><td><code>explicit_user_price</code></td><td>Exact price from transcript; <code>null</code> if not mentioned</td></tr>
      </tbody>
    </table>
  </div>

  <h3>Pricing Normalization Waterfall</h3>
  <p>Each extracted item passes through a strict resolution waterfall in <code>assignUnitPrice()</code> before merging into the estimate:</p>
  <div class="waterfall">
    <div class="waterfall-item">
      <div class="waterfall-rank">①</div>
      <div>
        <div class="waterfall-label">Explicit Override</div>
        <div class="waterfall-desc">Check if <code>explicit_user_price</code> is non-null, non-undefined, and finite. Apply directly.</div>
      </div>
    </div>
    <div class="waterfall-item">
      <div class="waterfall-rank">②</div>
      <div>
        <div class="waterfall-label">Private Price Book</div>
        <div class="waterfall-desc">Query Firestore path <code>users/{phone}/price_book/{sanitizeItemId(name)}</code>. Apply if found.</div>
      </div>
    </div>
    <div class="waterfall-item">
      <div class="waterfall-rank">③</div>
      <div>
        <div class="waterfall-label">Default Labor Rate</div>
        <div class="waterfall-desc">If trade is <code>labor-general</code> or type is <code>labor</code>, check <code>settings.default_labor_rate</code>. Fallback: <code>$55/hr</code>.</div>
      </div>
    </div>
    <div class="waterfall-item">
      <div class="waterfall-rank">④</div>
      <div>
        <div class="waterfall-label">AI Fallback</div>
        <div class="waterfall-desc">Apply <code>estimated_unit_cost</code> returned by the Gemini model.</div>
      </div>
    </div>
  </div>

  <div class="page-footer">
    <div class="footer-brand">Lone Ranger <span>Estimator</span></div>
    <div class="footer-meta">§04 Gemini Pipeline · CONFIDENTIAL</div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!--  SECTION 5: PDF PIPELINE                                    -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="content-page page-break">
  <div class="section-header">
    <span class="section-num">SECTION 05</span>
    <span class="section-title">PDF Generation Pipeline</span>
  </div>

  <p>Invoice PDFs are generated via a headless Chromium process orchestrated by Puppeteer, compiling contractor data dynamically into a styled print document and emailing the result.</p>

  <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Stage</th><th>Implementation Detail</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Browser Launch</td>
          <td>Headless Chromium launched inside Cloud Run container with <code>--no-sandbox</code>, <code>--disable-gpu</code> flags. New instance per request.</td>
        </tr>
        <tr>
          <td>HTML Compilation</td>
          <td>Dynamic HTML string compiled in-memory from estimate data. Loaded via <code>page.setContent()</code>.</td>
        </tr>
        <tr>
          <td>PDF Export</td>
          <td><code>page.pdf({ format: 'Letter', printBackground: true })</code> — Letter format, cyber-purple accents, white background.</td>
        </tr>
        <tr>
          <td>Scope Injection</td>
          <td>Summary injected into dedicated card below client billing, above line items. Empty scope → legal disclaimer fallback.</td>
        </tr>
        <tr>
          <td>Email Transmission</td>
          <td><code>nodemailer</code> SMTP transport via Gmail credentials in <code>.env</code>. Sent to <code>settings.contact_email</code>.</td>
        </tr>
        <tr>
          <td>Cleanup</td>
          <td>Temp PDF file at <code>/tmp</code> deleted via <code>fs.unlinkSync()</code> in <code>finally</code> block.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="alert alert-warning">
    <div class="alert-icon">⚠</div>
    <div class="alert-content">
      <div class="alert-title">Performance Risk — Synchronous Chromium Launch</div>
      <p class="alert-body">Launching a full Chromium instance per request introduces 3–5 second cold-start overhead. Under concurrent load, multiple Chromium processes will compete for Cloud Run container memory, creating a risk of Out-of-Memory (OOM) container crashes.</p>
    </div>
  </div>

  <div class="page-footer">
    <div class="footer-brand">Lone Ranger <span>Estimator</span></div>
    <div class="footer-meta">§05 PDF Pipeline · CONFIDENTIAL</div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!--  SECTION 6: PERFORMANCE ANALYSIS                            -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="content-page page-break">
  <div class="section-header">
    <span class="section-num">SECTION 06</span>
    <span class="section-title">Performance Analysis</span>
  </div>

  <p>A technical audit of the codebase reveals three primary processing bottlenecks and optimization targets.</p>

  <div class="no-break">
    <h3>1. Repeated Firestore Reads — Hot-Path Database Calls</h3>
    <p>The pricing engine resolves items concurrently inside <code>mergeIntoLedger</code> using <code>Promise.all</code>. For payloads containing many items, concurrent read requests are dispatched to Firestore for the <em>same</em> configuration document path per item.</p>
    <div class="alert alert-warning">
      <div class="alert-icon">⚡</div>
      <div class="alert-content">
        <div class="alert-title">Optimization Strategy</div>
        <p class="alert-body">Retrieve the settings configuration document exactly <strong>once</strong> at the beginning of the <code>mergeIntoLedger</code> block and pass the pre-loaded data down to <code>assignUnitPrice()</code> and <code>assignLaborRate()</code>. Eliminates <code>O(N)</code> reads per estimate save.</p>
      </div>
    </div>
  </div>

  <div class="no-break">
    <h3>2. Puppeteer Launch Latency — Synchronous Bottleneck</h3>
    <p>During <code>/api/generate-pdf</code> execution, Puppeteer launches a full headless Chromium browser instance per request. Container cold-start overhead: <strong>3–5 seconds</strong> per PDF generation call.</p>
    <div class="alert alert-warning">
      <div class="alert-icon">⚡</div>
      <div class="alert-content">
        <div class="alert-title">Optimization Strategy</div>
        <p class="alert-body">Maintain a persistent browser instance or implement a warm browser pool. Reuse the same Chromium process across requests rather than spawning and destroying on each PDF call.</p>
      </div>
    </div>
  </div>

  <div class="no-break">
    <h3>3. Redundant Frontend Profile Fetching</h3>
    <p>Upon initial dashboard authorization, the frontend issues redundant concurrent settings, credentials, and estimates queries. During the Stripe webhook polling loop, <code>GET /api/settings</code> is re-queried repeatedly, triggering unnecessary reads.</p>
    <div class="alert alert-info">
      <div class="alert-icon">ℹ</div>
      <div class="alert-content">
        <div class="alert-title">Optimization Strategy</div>
        <p class="alert-body">Implement a local settings cache with an explicit invalidation signal. Only re-fetch <code>/api/settings</code> when a subscription state change is expected (i.e., during the post-checkout polling window).</p>
      </div>
    </div>
  </div>

  <div class="page-footer">
    <div class="footer-brand">Lone Ranger <span>Estimator</span></div>
    <div class="footer-meta">§06 Performance Analysis · CONFIDENTIAL</div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!--  SECTION 7: SECURITY ANALYSIS                               -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="content-page page-break">
  <div class="section-header">
    <span class="section-num">SECTION 07</span>
    <span class="section-title">Security Analysis</span>
  </div>

  <p>An assessment of data boundaries, authentication patterns, and validation layers identifies the following security attack vectors in the current production architecture.</p>

  <div class="no-break">
    <h3>1. REST Endpoint Authentication Bypass — Critical</h3>
    <p>The <code>requireAuth</code> middleware reads a phone number from <code>req.query.phone</code> or <code>req.body.phone</code>, normalizes it, and checks if that user is active in Firestore. <strong>No cryptographic tokens, session cookies, OTPs, or API keys are used.</strong></p>
    <div class="alert alert-critical">
      <div class="alert-icon">🛑</div>
      <div class="alert-content">
        <div class="alert-title">Critical Vulnerability — Zero-Barrier Impersonation</div>
        <p class="alert-body">Any external client can query, mutate, delete, or overwrite estimates, private price books, and business profile settings for <em>any contractor</em> by supplying their target phone number in the request. No prior authentication or account ownership required. Entire contractor database exposed.</p>
      </div>
    </div>
  </div>

  <div class="no-break">
    <h3>2. Insecure Twilio Webhook — Spoofing Risk</h3>
    <p>The SMS intake endpoint <code>POST /api/webhook</code> extracts the sender's phone number directly from <code>req.body.From</code> without validating that the request originated from Twilio's infrastructure.</p>
    <div class="alert alert-critical">
      <div class="alert-icon">🛑</div>
      <div class="alert-content">
        <div class="alert-title">Critical Vulnerability — Forged SMS Injection</div>
        <p class="alert-body">Attackers can send forged HTTP POST requests directly to <code>/api/webhook</code>, spoofing the <code>From</code> parameter to manipulate any target contractor's ledger or execute prompt-injection attacks against the Gemini extraction pipeline via crafted <code>Body</code> payloads.</p>
      </div>
    </div>
  </div>

  <div class="no-break">
    <h3>3. Unsafe HTML Injection — Puppeteer Execution Context</h3>
    <p>While client details and material names pass through the <code>escapeHtml()</code> utility before PDF rendering, the <strong>company logo URL is injected raw</strong> into the Puppeteer HTML template without sanitization.</p>
    <div class="alert alert-warning">
      <div class="alert-icon">⚠</div>
      <div class="alert-content">
        <div class="alert-title">High Vulnerability — Headless Browser Code Execution</div>
        <p class="alert-body">An attacker who modifies a business settings profile to save a malicious string as <code>company_logo_url</code> can execute arbitrary code inside the headless Chromium browser context when any PDF is compiled for that account.</p>
      </div>
    </div>
  </div>

  <div class="page-footer">
    <div class="footer-brand">Lone Ranger <span>Estimator</span></div>
    <div class="footer-meta">§07 Security Analysis · CONFIDENTIAL</div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!--  SECTION 8 + 9: COUPLING & SCALABILITY                      -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="content-page page-break">
  <div class="section-header">
    <span class="section-num">SECTION 08</span>
    <span class="section-title">Component Coupling Report</span>
  </div>

  <p>The platform architecture exhibits tight coupling between database collections, translation schemas, and client UI that creates fragile sequence dependencies.</p>

  <div class="no-break">
    <h3>1. Tight Collection Coupling &amp; Shared State</h3>
    <p>The pricing waterfall in <code>assignUnitPrice()</code> falls back to the user's settings config document. This couples material pricing logic directly to the business profile document. If a contractor edits settings while a background audio prompt is processing, calculation discrepancies may occur due to mid-flight state changes.</p>
  </div>

  <div class="no-break">
    <h3>2. Fragile Sequence Dependencies — Stripe Webhook Race</h3>
    <p>The Stripe payment verification loop relies on the webhook worker writing <code>active_subscription: true</code> to Firestore faster than the user's browser completes the redirect from Stripe's checkout page. The frontend polling interval (1500ms × 4 retries = 6s window) mitigates this, but a slow network callback or transient Firestore latency can exceed the timeout, locking valid paying users out of the workspace.</p>
  </div>

  <!-- SECTION 9 -->
  <div class="section-header" style="margin-top: 40px;">
    <span class="section-num">SECTION 09</span>
    <span class="section-title">Future Scalability Constraints</span>
  </div>

  <p>Three user-count thresholds reveal distinct failure modes and scaling bottlenecks in the current architecture.</p>

  <div class="scale-grid">
    <div class="scale-card scale-100">
      <div class="scale-card-header">100</div>
      <div class="scale-card-sub">Users — Early Warning</div>
      <ul>
        <li>Webhook race conditions cause transient checkout redirect freezes for ~1-5% of users</li>
        <li>Multer disk write queuing under concurrent voice processing introduces minor transcription delays</li>
        <li>Performance degradation remains tolerable but visible</li>
      </ul>
    </div>
    <div class="scale-card scale-1k">
      <div class="scale-card-header">1,000</div>
      <div class="scale-card-sub">Users — Critical Failure Risk</div>
      <ul>
        <li>Multiple concurrent Chromium instances → Cloud Run OOM crashes on PDF generation</li>
        <li>Phone-based auth bypass → full contractor database exposed at scale</li>
        <li>O(N) duplicated Firestore reads → significant database read cost accumulation</li>
        <li>Security breach probability becomes near-certain</li>
      </ul>
    </div>
    <div class="scale-card scale-10k">
      <div class="scale-card-header">10,000</div>
      <div class="scale-card-sub">Users — Architecture Rebuild Required</div>
      <ul>
        <li>Base64 logos in Firestore documents hit 1MB doc size limit → profile corruption</li>
        <li>Twilio webhook queues exceed Gemini API concurrent rate limits → dropped voice transcriptions</li>
        <li>Bulk CSV uploads (10k+ items) exceed Firestore batch-write throttle limits</li>
      </ul>
    </div>
  </div>

  <div class="page-footer" style="margin-top: 32px;">
    <div class="footer-brand">Lone Ranger <span>Estimator</span></div>
    <div class="footer-meta">§08–09 Coupling &amp; Scalability · CONFIDENTIAL</div>
  </div>
</div>

</body>
</html>`;

async function generatePDF() {
  console.log('Launching Puppeteer...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const outputPath = path.join(__dirname, 'system_intelligence_report.pdf');

  await page.pdf({
    path: outputPath,
    format: 'Letter',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' }
  });

  await browser.close();
  console.log(`✅ PDF generated: ${outputPath}`);
  console.log(`   Size: ${(require('fs').statSync(outputPath).size / 1024).toFixed(1)} KB`);
}

generatePDF().catch(err => {
  console.error('❌ PDF generation failed:', err);
  process.exit(1);
});
