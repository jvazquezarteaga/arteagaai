// Frontend logic for the audit tool. No libraries, no build step.
//
// Flow:  form submit -> POST /api/audit -> render(report)
// Every piece of text from the audited site is inserted with textContent
// (through the el() helper), never as HTML, so a hostile page cannot inject code.

(() => {
  'use strict';

  // ---------- Page elements ----------
  const form = document.getElementById('audit-form');
  const urlInput = document.getElementById('url');
  const submitButton = document.getElementById('submit');
  const errorBox = document.getElementById('form-error');
  const statusBox = document.getElementById('form-status');
  const resultsSection = document.getElementById('results');
  const resultsTitle = document.getElementById('results-title');
  const pastePanel = document.getElementById('paste-panel');
  const htmlInput = document.getElementById('html');
  const pasteButton = document.getElementById('submit-html');

  // ---------- Settings you may want to change ----------
  const STATUS_LABEL = { pass: 'Pass', warn: 'Warning', fail: 'Fail', skipped: 'Skipped' };
  const STATUS_ICON = { pass: '\u2713', warn: '!', fail: '\u2715', skipped: '-' };
  const STATUS_ORDER = { fail: 0, warn: 1, pass: 2, skipped: 3 }; // worst first

  // ---------- Call to action settings ----------
  const CTA_URL = 'https://www.arteaga.com/contact-us';
  const CTA_BUTTON = 'Talk to our team';

  let report = null; // the last audit result
  let activeFilter = 'all';

  // ---------- Tiny helper to build HTML safely ----------
  // el('div', { class: 'card', text: 'Hi' }, childNode, 'text child')
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value === true ? '' : value);
    });
    children.forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      node.append(child); // strings become text nodes, so they are safe
    });
    return node;
  }

  // ---------- Form ----------
  // Normal mode: we download the page from the address.
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const url = urlInput.value.trim();
    if (!url) {
      showError('Please enter a website address.');
      return;
    }
    startAudit({ url });
  });

  // Fallback mode: the visitor pasted the page's HTML. The address is optional.
  pasteButton.addEventListener('click', () => {
    const html = htmlInput.value.trim();
    if (!html) {
      showError('Paste your page HTML first.');
      return;
    }
    startAudit({ url: urlInput.value.trim(), html });
  });

  async function startAudit(payload) {
    setLoading(true);
    try {
      report = await requestAudit(payload);
      activeFilter = 'all';
      render(report);
    } catch (error) {
      let message = error.message;
      if (error.canPaste) {
        // The site refused us: guide the visitor to the paste option.
        message += " You can paste the page's HTML below instead.";
        pastePanel.open = true;
      }
      showError(message);
    } finally {
      setLoading(false);
    }
  }

  async function requestAudit(payload) {
    const response = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null); // server may send non-JSON on a timeout
    if (!response.ok || !data) {
      const error = new Error((data && data.error) || 'The audit could not be completed. Please try again.');
      error.canPaste = Boolean(data && data.canPaste);
      throw error;
    }
    return data;
  }

  function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    pasteButton.disabled = isLoading;
    submitButton.textContent = isLoading ? 'Analyzing...' : 'Run audit';
    statusBox.textContent = isLoading ? 'Analyzing your page. This usually takes a few seconds.' : '';
    if (isLoading) errorBox.hidden = true;
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  // ---------- Rendering ----------
  function render(data) {
    document.getElementById('results-meta').textContent =
      `${data.url || 'Pasted HTML'} \u00b7 ${new Date(data.auditedAt).toLocaleString()} \u00b7 ${(data.durationMs / 1000).toFixed(1)}s`;

    // Explain why some checks were skipped when the HTML was pasted.
    const note = document.getElementById('results-note');
    note.hidden = data.source !== 'pasted';
    note.textContent =
      'You audited pasted HTML, so checks that need the live server (response time, HTTPS' +
      ', robots.txt, sitemap) are skipped when they cannot be measured, and do not affect the score.';

    renderSummary(data);
    renderFilters(data);
    renderDetails(data);
    renderCta(data);
    applyFilter();

    resultsSection.hidden = false;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    resultsSection.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    resultsTitle.focus({ preventScroll: true }); // tells screen readers results arrived
  }

  function scoreLabel(score) {
    if (score >= 80) return 'Looking good';
    if (score >= 50) return 'Needs some work';
    return 'Needs attention';
  }

  function renderSummary(data) {
    const summary = document.getElementById('summary');
    summary.replaceChildren();

    // Overall score ring
    const ring = el('div', { class: 'score-ring', role: 'img', 'aria-label': `Overall score ${data.overall} out of 100` },
      el('strong', { text: data.overall }));
    ring.style.setProperty('--score', data.overall);
    summary.append(
      el('div', { class: 'card overall' }, ring,
        el('div', {}, el('h3', { text: 'Overall score' }), el('p', { text: scoreLabel(data.overall) })))
    );

    // One card per category (SEO, AEO, GEO)
    Object.entries(data.categories).forEach(([id, category]) => {
      const bar = el('div', { class: 'bar', 'aria-hidden': 'true' }, el('span'));
      bar.firstChild.style.width = `${category.score}%`;

      summary.append(
        el('a', { class: 'card category-card', href: `#category-${id}` },
          el('header', {}, el('h3', { text: category.label }),
            el('span', { class: 'category-score', text: `${category.score}/100` })),
          el('p', { class: 'muted', text: category.description }),
          bar,
          el('p', { class: 'counts' },
            el('span', { text: `${category.counts.pass} passed` }),
            el('span', { text: `${category.counts.warn} warnings` }),
            el('span', { text: `${category.counts.fail} failed` }),
            category.counts.skipped > 0 && el('span', { text: `${category.counts.skipped} skipped` })))
      );
    });
  }

  // The closing call to action. The message depends on the score so it feels
  // relevant to the visitor, and the link carries UTM tags (plus the score) so
  // you can see in analytics which leads came from the audit.
  function renderCta(data) {
    let issues = 0;
    let warnings = 0;
    Object.values(data.categories).forEach((c) => {
      issues += c.counts.fail;
      warnings += c.counts.warn;
    });

    let title;
    let text;
    if (data.overall >= 80) {
      title = 'A strong start. Let’s make it even better.';
      text = 'Your page covers the basics. Our team can help you stay ahead as search and AI assistants keep changing.';
    } else if (data.overall >= 50) {
      title = 'You’re close. Let’s close the gaps.';
      text = 'A few fixes could noticeably improve how search engines and AI assistants find and quote your site. We can handle them for you.';
    } else {
      title = 'Your site is missing out on search and AI visibility.';
      text = 'The good news is that most of these issues are fixable. Tell us about your project and we will show you where to start.';
    }

    const link = new URL(CTA_URL);
    link.searchParams.set('utm_source', 'audit-tool');
    link.searchParams.set('utm_medium', 'results-cta');
    link.searchParams.set('utm_campaign', 'ai-visibility-audit');
    link.searchParams.set('audit_score', data.overall);

    const cta = document.getElementById('cta');
    cta.replaceChildren(
      el('h3', { id: 'cta-title', text: title }),
      el('p', { class: 'cta-stats', text: `${issues} issue(s) and ${warnings} warning(s) found.` }),
      el('p', { text }),
      // target=_blank keeps the results open in this tab; noopener is a security best practice.
      el('a', { class: 'btn', href: link.href, target: '_blank', rel: 'noopener', text: CTA_BUTTON })
    );
    cta.hidden = false;
  }

  function renderFilters(data) {
    const totals = { pass: 0, warn: 0, fail: 0, skipped: 0 };
    Object.values(data.categories).forEach((c) => {
      Object.keys(totals).forEach((status) => (totals[status] += c.counts[status]));
    });

    const options = [
      ['all', `All (${totals.pass + totals.warn + totals.fail + totals.skipped})`],
      ['fail', `Failed (${totals.fail})`],
      ['warn', `Warnings (${totals.warn})`],
      ['pass', `Passed (${totals.pass})`],
    ];
    if (totals.skipped > 0) options.push(['skipped', `Skipped (${totals.skipped})`]);

    const container = document.getElementById('filters');
    container.replaceChildren(
      ...options.map(([value, label]) => {
        const button = el('button', { type: 'button', class: 'filter', 'data-filter': value, text: label });
        button.addEventListener('click', () => {
          activeFilter = value;
          applyFilter();
        });
        return button;
      })
    );
  }

  function renderDetails(data) {
    const container = document.getElementById('details');
    container.replaceChildren();

    Object.entries(data.categories).forEach(([id, category]) => {
      const checks = [...category.checks].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

      container.append(
        el('section', { class: 'category', id: `category-${id}` },
          el('h3', {}, category.label, el('small', { text: `${category.score}/100` })),
          el('ul', { class: 'check-list' }, ...checks.map(renderCheck)))
      );
    });
  }

  function renderCheck(check) {
    return el('li', { class: 'check', 'data-status': check.status },
      el('details', { open: check.status === 'fail' }, // failures start expanded
        el('summary', {},
          el('span', { class: `badge badge-${check.status}` },
            el('span', { 'aria-hidden': 'true', text: STATUS_ICON[check.status] }),
            STATUS_LABEL[check.status]),
          el('span', { class: 'check-title', text: check.title })),
        el('div', { class: 'check-body' },
          el('p', { text: check.message }),
          check.fix && el('p', { class: 'check-fix' }, el('strong', { text: 'How to fix: ' }), check.fix))));
  }

  function applyFilter() {
    document.querySelectorAll('#details .check').forEach((item) => {
      item.hidden = activeFilter !== 'all' && item.dataset.status !== activeFilter;
    });
    // Hide a category entirely when none of its checks match the filter.
    document.querySelectorAll('#details .category').forEach((section) => {
      section.hidden = !section.querySelector('.check:not([hidden])');
    });
    document.querySelectorAll('#filters .filter').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.filter === activeFilter));
    });
  }

  // ---------- Downloads (all done in the browser, no server needed) ----------
  function fileName(extension) {
    const host = report.url ? new URL(report.url).hostname.replace(/[^a-z0-9.-]/gi, '') : 'pasted-html';
    return `audit-${host}-${report.auditedAt.slice(0, 10)}.${extension}`;
  }

  function downloadFile(content, type, name) {
    const link = el('a', { href: URL.createObjectURL(new Blob([content], { type })), download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  // Wraps a value in quotes for CSV. A leading = + - @ is neutralized so
  // spreadsheet apps never treat page text as a formula.
  function csvCell(value) {
    let text = String(value ?? '');
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function buildCsv() {
    const header = ['Category', 'Check', 'Status', 'Finding', 'How to fix', 'Weight', 'URL'];
    const rows = [header];
    Object.values(report.categories).forEach((category) => {
      category.checks.forEach((c) => {
        rows.push([category.label, c.title, STATUS_LABEL[c.status], c.message, c.fix, c.weight, report.url || '']);
      });
    });
    // The BOM at the start makes Excel read accents (UTF-8) correctly.
    return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  }

  document.getElementById('download-json').addEventListener('click', () => {
    downloadFile(JSON.stringify(report, null, 2), 'application/json', fileName('json'));
  });

  document.getElementById('download-csv').addEventListener('click', () => {
    downloadFile(buildCsv(), 'text/csv;charset=utf-8', fileName('csv'));
  });

  // "Save as PDF" = the browser's print dialog (choose "Save as PDF" as the printer).
  document.getElementById('print').addEventListener('click', () => window.print());

  // While printing, expand every check so the PDF has the full details.
  window.addEventListener('beforeprint', () => {
    document.querySelectorAll('#details details').forEach((d) => {
      d.dataset.wasOpen = d.open;
      d.open = true;
    });
  });
  window.addEventListener('afterprint', () => {
    document.querySelectorAll('#details details').forEach((d) => {
      d.open = d.dataset.wasOpen === 'true';
    });
  });

  document.getElementById('year').textContent = new Date().getFullYear();
})();
