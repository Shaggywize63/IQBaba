/**
 * Shared CSV helpers + reusable bulk-upload widget wiring.
 *
 * Every bulk-upload screen in the portal (schools, students, questions) uses the
 * same flow: download a CSV template -> fill it in Excel/Sheets -> drop it back in
 * -> preview + row-level validation -> submit to the API. This file owns that flow
 * so the individual pages only describe their columns and how a row maps to a
 * payload object.
 */

(function () {
  // --- CSV parsing (RFC 4180: quoted fields, escaped quotes, embedded newlines) ---
  function parseCsv(text) {
    // Strip UTF-8 BOM that Excel likes to prepend.
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let fieldWasQuoted = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"' && field === '') {
        inQuotes = true;
        fieldWasQuoted = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
        fieldWasQuoted = false;
      } else if (char === '\n' || char === '\r') {
        // Treat \r\n as a single break.
        if (char === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        fieldWasQuoted = false;
      } else {
        field += char;
      }
    }

    if (field !== '' || fieldWasQuoted || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    // Drop rows that are entirely empty (trailing newlines, blank separator lines).
    return rows.filter(r => r.some(cell => String(cell).trim() !== ''));
  }

  /**
   * Parse a CSV file into objects keyed by header name.
   * Header matching is case-insensitive and ignores spaces/underscores, so
   * "Full Name", "full_name" and "fullname" all resolve to the same column.
   */
  function parseCsvToObjects(text) {
    const rows = parseCsv(text);
    if (rows.length === 0) return { headers: [], rows: [] };

    const headers = rows[0].map(h => String(h).trim());
    const keys = headers.map(normalizeKey);

    const objects = rows.slice(1).map((cells, index) => {
      const obj = {};
      keys.forEach((key, i) => {
        if (!key) return;
        obj[key] = cells[i] === undefined ? '' : String(cells[i]).trim();
      });
      obj.__line = index + 2; // 1-based line number in the file, header included
      return obj;
    });

    return { headers, rows: objects };
  }

  function normalizeKey(header) {
    return String(header || '').trim().toLowerCase().replace(/[\s_\-./]+/g, '');
  }

  function escapeCsvValue(value) {
    const str = value === undefined || value === null ? '' : String(value);
    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function buildCsv(headers, rows) {
    const lines = [headers.map(escapeCsvValue).join(',')];
    (rows || []).forEach(row => {
      const cells = Array.isArray(row) ? row : headers.map(h => row[h]);
      lines.push(cells.map(escapeCsvValue).join(','));
    });
    return lines.join('\r\n');
  }

  function downloadCsv(filename, content) {
    // Prepend a BOM so Excel opens UTF-8 content (names with accents) correctly.
    const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke on the next tick so Firefox has time to start the download.
    setTimeout(() => window.URL.revokeObjectURL(url), 1000);
  }

  function downloadTemplate(filename, headers, sampleRows) {
    downloadCsv(filename, buildCsv(headers, sampleRows));
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  window.CSV = {
    parse: parseCsv,
    parseToObjects: parseCsvToObjects,
    build: buildCsv,
    download: downloadCsv,
    downloadTemplate,
    normalizeKey,
    escapeHtml
  };

  /**
   * Wire up a bulk-upload modal.
   *
   * config:
   *   templateBtn      - id of the "download template" button
   *   templateName     - file name for the generated template
   *   templateHeaders  - array of column headers
   *   templateSample   - array of sample rows (arrays matching templateHeaders)
   *   dropzone         - id of the drag/drop area
   *   fileInput        - id of the (hidden) file input
   *   preview          - id of the element that shows parse results
   *   submitBtn        - id of the "upload & process" button
   *   modal            - id of the enclosing modal, closed automatically once
   *                      every row has been accepted
   *   mapRow(row, ctx) - turn a normalized CSV row into a payload object.
   *                      Return { error: 'reason' } to reject the row.
   *   submit(items)    - async function that posts the valid rows
   *   onSuccess(result, items) - called after a successful submit
   */
  window.setupBulkUpload = function (config) {
    const el = id => (typeof id === 'string' ? document.getElementById(id) : id);

    const dropzone = el(config.dropzone);
    const fileInput = el(config.fileInput);
    const preview = el(config.preview);
    const submitBtn = el(config.submitBtn);
    const templateBtn = el(config.templateBtn);

    let validRows = [];
    let invalidRows = [];

    function reset() {
      validRows = [];
      invalidRows = [];
      if (preview) preview.innerHTML = '';
      if (fileInput) fileInput.value = '';
      if (submitBtn) submitBtn.disabled = false;
    }

    function renderPreview(fileName) {
      if (!preview) return;

      if (validRows.length === 0 && invalidRows.length === 0) {
        preview.innerHTML = `<p style="color:#B91C1C; font-size:0.85rem; margin:0;">No data rows found in <strong>${escapeHtml(fileName)}</strong>. Make sure the file has a header row followed by at least one record.</p>`;
        return;
      }

      let html = `<div style="border:1px solid #E5E7EB; border-radius:8px; padding:0.75rem; background:#F9FAFB; font-size:0.8rem;">`;
      html += `<div style="font-weight:700; margin-bottom:0.35rem;">${escapeHtml(fileName)}</div>`;
      html += `<div style="color:#047857;">✔ ${validRows.length} row${validRows.length === 1 ? '' : 's'} ready to upload</div>`;

      if (invalidRows.length > 0) {
        html += `<div style="color:#B91C1C; margin-top:0.25rem;">✖ ${invalidRows.length} row${invalidRows.length === 1 ? '' : 's'} skipped:</div>`;
        html += '<ul style="margin:0.35rem 0 0 1.1rem; padding:0; max-height:140px; overflow-y:auto;">';
        invalidRows.slice(0, 25).forEach(r => {
          html += `<li style="color:#B91C1C;">Line ${r.line}: ${escapeHtml(r.error)}</li>`;
        });
        if (invalidRows.length > 25) {
          html += `<li style="color:#B91C1C;">…and ${invalidRows.length - 25} more</li>`;
        }
        html += '</ul>';
      }
      html += '</div>';
      preview.innerHTML = html;
    }

    async function handleFile(file) {
      if (!file) return;

      const name = file.name || 'file';
      if (!/\.(csv|txt)$/i.test(name)) {
        reset();
        if (preview) {
          preview.innerHTML = `<p style="color:#B91C1C; font-size:0.85rem; margin:0;">Unsupported file type. Please save your sheet as <strong>CSV</strong> (in Excel: File → Save As → CSV UTF-8) and upload that.</p>`;
        }
        return;
      }

      const text = await file.text();
      const parsed = parseCsvToObjects(text);

      validRows = [];
      invalidRows = [];

      parsed.rows.forEach(row => {
        let mapped;
        try {
          mapped = config.mapRow(row);
        } catch (err) {
          mapped = { error: err.message || 'Could not read this row' };
        }
        if (!mapped || mapped.error) {
          invalidRows.push({ line: row.__line, error: (mapped && mapped.error) || 'Could not read this row' });
        } else {
          validRows.push(mapped);
        }
      });

      renderPreview(name);
    }

    if (templateBtn) {
      templateBtn.addEventListener('click', e => {
        e.preventDefault();
        downloadTemplate(config.templateName, config.templateHeaders, config.templateSample || []);
        if (window.showNotification) window.showNotification('Template downloaded', 'success');
      });
    }

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());
      dropzone.addEventListener('dragover', e => {
        e.preventDefault();
        dropzone.style.borderColor = '#2563EB';
      });
      dropzone.addEventListener('dragleave', () => {
        dropzone.style.borderColor = '';
      });
      dropzone.addEventListener('drop', e => {
        e.preventDefault();
        dropzone.style.borderColor = '';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', e => {
        if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', async e => {
        e.preventDefault();
        if (validRows.length === 0) {
          window.showNotification('Nothing to upload — pick a CSV file with at least one valid row first', 'danger');
          return;
        }

        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Uploading…';

        try {
          const result = await config.submit(validRows);
          const inserted = result && result.inserted !== undefined ? result.inserted : validRows.length;
          const failed = (result && result.failed) || [];

          if (failed.length > 0) {
            window.showNotification(`${inserted} uploaded, ${failed.length} rejected — see details`, 'danger');
            if (preview) {
              let html = '<div style="border:1px solid #FCA5A5; border-radius:8px; padding:0.75rem; background:#FEF2F2; font-size:0.8rem; margin-top:0.5rem;">';
              html += `<div style="font-weight:700; color:#B91C1C;">${failed.length} record${failed.length === 1 ? '' : 's'} rejected by the server</div>`;
              html += '<ul style="margin:0.35rem 0 0 1.1rem; padding:0; max-height:140px; overflow-y:auto;">';
              failed.slice(0, 25).forEach(f => {
                html += `<li style="color:#B91C1C;">${escapeHtml(f.identifier || 'Row ' + f.index)}: ${escapeHtml(f.error)}</li>`;
              });
              html += '</ul></div>';
              preview.innerHTML += html;
            }
          } else {
            window.showNotification(`${inserted} record${inserted === 1 ? '' : 's'} uploaded successfully`, 'success');
            reset();
            // Nothing left to review, so get the modal out of the way.
            const modal = el(config.modal);
            if (modal) modal.classList.remove('active');
          }

          if (config.onSuccess) config.onSuccess(result, validRows);
          if (failed.length === 0) validRows = [];
        } catch (error) {
          window.showNotification(error.message || 'Upload failed', 'danger');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      });
    }

    return { reset };
  };
})();
