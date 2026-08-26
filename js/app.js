// Helper to show/hide loading spinners in tables
window.setTableLoading = (tableId, isLoading) => {
    const table = document.getElementById(tableId);
    if (!table) return;
    const tbody = table.querySelector('tbody');
    if (isLoading) {
        tbody.innerHTML = `
            <tr>
                <td colspan="100%" class="text-center py-8">
                    <div class="loading-spinner" style="margin: 0 auto;"></div>
                    <p class="text-sm text-grey mt-2">Fetching data...</p>
                </td>
            </tr>
        `;
    }
};

// Helper to serialize form to object
window.serializeForm = (form) => {
    const formData = new FormData(form);
    const obj = {};
    formData.forEach((value, key) => {
        if (obj[key]) {
            if (!Array.isArray(obj[key])) obj[key] = [obj[key]];
            obj[key].push(value);
        } else {
            obj[key] = value;
        }
    });
    return obj;
};


/**
 * Reference data the admin maintains (boards, classes, subjects). Every picker
 * in the app reads from here so the admin management screens are the single
 * source of truth — nothing is hardcoded in the pages.
 *
 * Each list is fetched once per page load and shared between callers.
 */
window.referenceData = (() => {
    const cache = {};

    const load = (key, endpoint) => {
        if (!cache[key]) {
            cache[key] = window.api.request(endpoint).then(rows => (Array.isArray(rows) ? rows : []));
            // Don't cache a rejection — a later caller should be able to retry.
            cache[key].catch(() => { delete cache[key]; });
        }
        return cache[key];
    };

    return {
        boards: () => load('boards', '/auth/boards'),
        classes: () => load('classes', '/auth/classes'),
        subjects: () => load('subjects', '/auth/subjects'),
        clear: () => Object.keys(cache).forEach(k => delete cache[k])
    };
})();

/**
 * Replace a <select>'s options with admin-managed values.
 *
 * Keeps the page's own "Select…" placeholder, preserves whatever was already
 * selected, and keeps a stale value as an option so editing an old record does
 * not silently reassign it. On failure the existing options are left alone so
 * the form still works.
 */
const fillSelects = (selects, rows, valueOf, labelOf) => {
    selects.forEach(select => {
        const previous = select.value;
        const placeholder = select.querySelector('option[value=""]');

        select.innerHTML = '';
        if (placeholder) select.appendChild(placeholder);

        rows.forEach(row => {
            const option = document.createElement('option');
            option.value = valueOf(row);
            option.textContent = labelOf(row);
            select.appendChild(option);
        });

        if (previous && !rows.some(row => String(valueOf(row)) === String(previous))) {
            const stale = document.createElement('option');
            stale.value = previous;
            stale.textContent = previous;
            select.appendChild(stale);
        }
        if (previous) select.value = previous;
    });
};

const populateSelects = async (selector, listFn, valueOf, labelOf, label) => {
    const selects = Array.from(document.querySelectorAll(selector));
    if (selects.length === 0) return [];
    try {
        const rows = await listFn();
        if (rows.length === 0) return [];
        fillSelects(selects, rows, valueOf, labelOf);
        return rows;
    } catch (error) {
        console.error(`Could not load ${label}; leaving the existing options in place:`, error);
        return [];
    }
};

window.populateBoardSelects = (selector = 'select[name="board"]') =>
    populateSelects(selector, window.referenceData.boards, b => b.name, b => b.name, 'boards');

/** Class <select>s store the numeric level, matching students.class_level. */
window.populateClassSelects = (selector = 'select[name="studentClass"]') =>
    populateSelects(selector, window.referenceData.classes,
        c => c.level, c => c.name || `Class ${c.level}`, 'classes');

/**
 * Select a value that may no longer be configured — an existing record can hold
 * a class, board or subject an admin has since removed. Assigning a missing
 * value to a <select> silently yields "", which would wipe the field on save,
 * so keep it as an option instead.
 */
window.setSelectValue = (select, value) => {
    if (!select) return;
    const wanted = value === null || value === undefined ? '' : String(value);
    if (wanted === '') { select.value = ''; return; }

    const exists = Array.from(select.options).some(option => option.value === wanted);
    if (!exists) {
        const stale = document.createElement('option');
        stale.value = wanted;
        stale.textContent = wanted;
        select.appendChild(stale);
    }
    select.value = wanted;
};

/** Subject <select>s filter by subject name, which is what results carry. */
window.populateSubjectSelects = (selector = 'select[name="subject"]') =>
    populateSelects(selector, window.referenceData.subjects, s => s.name, s => s.name, 'subjects');

/**
 * Checkbox groups. `valueOf` decides what gets submitted — school records store
 * class and subject *names*, while student registration needs real subject ids
 * for the student_subjects foreign key.
 */
const populateCheckboxes = async (containerId, listFn, fieldName, valueOf, labelOf, label, buildLabel, defaultChecked = false) => {
    const container = document.getElementById(containerId);
    if (!container) return [];

    let rows;
    try {
        rows = await listFn();
    } catch (error) {
        console.error(`Could not load ${label}; leaving the existing options in place:`, error);
        return [];
    }
    if (rows.length === 0) return [];

    // Re-check whatever was ticked before, so a refresh doesn't lose a selection.
    const previous = Array.from(container.querySelectorAll(`input[name="${fieldName}"]:checked`))
        .map(input => input.value);

    const hadSelection = previous.length > 0;
    container.innerHTML = '';
    rows.forEach(row => {
        const value = String(valueOf(row));
        const checked = hadSelection ? previous.includes(value) : defaultChecked;
        container.appendChild(buildLabel(value, labelOf(row), fieldName, checked, defaultChecked));
    });
    return rows;
};

const plainCheckbox = (value, text, fieldName, checked, defaultChecked) => {
    const label = document.createElement('label');
    label.style.cssText = 'cursor:pointer; display:flex; align-items:center; gap:4px; font-weight:normal;';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = fieldName;
    input.value = value;
    input.checked = checked;
    // form.reset() falls back to defaultChecked, which is how the Add School
    // modal starts with everything ticked.
    input.defaultChecked = Boolean(defaultChecked);
    label.appendChild(input);
    label.appendChild(document.createTextNode(' ' + text));
    return label;
};

/** School records store class names ("Class 6"), not levels. */
window.populateClassCheckboxes = (containerId, fieldName = 'classes', defaultChecked = false) =>
    populateCheckboxes(containerId, window.referenceData.classes, fieldName,
        c => c.name || `Class ${c.level}`, c => c.name || `Class ${c.level}`, 'classes', plainCheckbox, defaultChecked);

/** School records store subject names. */
window.populateSubjectCheckboxes = (containerId, fieldName = 'subjects', defaultChecked = false) =>
    populateCheckboxes(containerId, window.referenceData.subjects, fieldName,
        s => s.name, s => s.name, 'subjects', plainCheckbox, defaultChecked);

/**
 * Tick the values an existing record holds. The counterpart to setSelectValue:
 * a school saved with a class or subject an admin has since removed has no
 * checkbox to tick, and saving would silently drop it, so add one.
 */
window.setCheckboxGroup = (container, fieldName, values) => {
    if (!container) return;
    const selected = (Array.isArray(values) ? values : String(values || '').split(','))
        .map(v => String(v).trim()).filter(Boolean);

    window.clearStaleCheckboxes(container);

    const boxes = Array.from(container.querySelectorAll(`input[name="${fieldName}"]`));
    boxes.forEach(box => { box.checked = selected.includes(box.value); });

    selected
        .filter(value => !boxes.some(box => box.value === value))
        .forEach(value => {
            const label = plainCheckbox(value, value, fieldName, true, false);
            label.dataset.stale = 'true';
            label.title = 'No longer configured \u2014 kept so saving preserves it';
            container.appendChild(label);
        });
};

/** Drop the retired values a previous record added, so the next one starts clean. */
window.clearStaleCheckboxes = (container) => {
    if (!container) return;
    container.querySelectorAll('label[data-stale]').forEach(label => label.remove());
};

// Helper for logout
window.handleLogout = () => {
    window.api.clearAuth();
    window.location.href = 'index.html';
};

// Helper for notifications
window.showNotification = (message, type = 'success') => {
    const container = document.getElementById('notification-container') || createNotificationContainer();
    const notification = document.createElement('div');
    notification.className = `glass-card p-4 mb-2 animate-slide-in flex items-center justify-between border-l-4 ${type === 'success' ? 'border-success' : 'border-danger'}`;
    notification.style.width = '300px';
    notification.style.background = 'white';
    notification.innerHTML = `
        <span class="text-sm font-medium">${message}</span>
        <button onclick="this.parentElement.remove()" class="text-grey hover:text-dark" style="background:none; border:none; font-size:1.2rem; cursor:pointer;">&times;</button>
    `;
    container.appendChild(notification);
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(20px)';
            notification.style.transition = 'all 0.5s ease';
            setTimeout(() => notification.remove(), 500);
        }
    }, 4000);
};

function createNotificationContainer() {
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.style.position = 'fixed';
    container.style.top = '20px';
    container.style.right = '20px';
    container.style.zIndex = '10000';
    document.body.appendChild(container);
    return container;
}

// Support System Helpers
window.setupSupport = (options = {}) => {
    const role = options.role || 'Guest';
    const showFab = options.showFab !== false;

    // 1. Inject Support Modal HTML into body if not already present
    if (!document.getElementById('supportModalOverlay')) {
        const modalHtml = `
            <div class="support-modal-overlay" id="supportModalOverlay">
                <div class="support-modal-card">
                    <div class="support-modal-header">
                        <h3>Contact Support</h3>
                        <button class="support-modal-close" id="closeSupportModalBtn">&times;</button>
                    </div>
                    <form class="support-form" id="supportForm">
                        <div class="form-group">
                            <label>Your Name *</label>
                            <input type="text" name="name" id="supportName" placeholder="e.g. John Doe" required>
                        </div>
                        <div class="form-group">
                            <label>Your Email *</label>
                            <input type="email" name="email" id="supportEmail" placeholder="name@domain.com" required>
                        </div>
                        <div class="form-group">
                            <label>Your Role</label>
                            <select name="role" id="supportRole" required>
                                <option value="Student">Student</option>
                                <option value="School">School Admin / Teacher</option>
                                <option value="Guest">Guest / Other</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Subject *</label>
                            <input type="text" name="subject" id="supportSubject" placeholder="How can we help you?" required>
                        </div>
                        <div class="form-group">
                            <label>Message *</label>
                            <textarea name="message" id="supportMessage" rows="4" placeholder="Describe your issue or query..." required></textarea>
                        </div>
                        <button type="submit" class="support-submit-btn" id="supportSubmitBtn">Send Message</button>
                    </form>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Close button listener
        document.getElementById('closeSupportModalBtn').addEventListener('click', () => {
            window.closeSupportModal();
        });

        // Overlay click listener
        document.getElementById('supportModalOverlay').addEventListener('click', (e) => {
            if (e.target === document.getElementById('supportModalOverlay')) {
                window.closeSupportModal();
            }
        });

        // Form submit listener
        document.getElementById('supportForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const submitBtn = document.getElementById('supportSubmitBtn');
            const originalText = submitBtn.textContent;
            
            const payload = {
                name: document.getElementById('supportName').value.trim(),
                email: document.getElementById('supportEmail').value.trim(),
                role: document.getElementById('supportRole').value,
                subject: document.getElementById('supportSubject').value.trim(),
                message: document.getElementById('supportMessage').value.trim()
            };

            try {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Sending...';

                // Call window.api.contactSupport
                if (window.api && typeof window.api.contactSupport === 'function') {
                    const response = await window.api.contactSupport(payload);
                    if (window.showNotification) {
                        window.showNotification(response.message || 'Support request sent!', 'success');
                    } else {
                        alert(response.message || 'Support request sent successfully.');
                    }
                    window.closeSupportModal();
                    this.reset();
                } else {
                    throw new Error('API client is not ready. Please try again later.');
                }
            } catch (err) {
                if (window.showNotification) {
                    window.showNotification(err.message || 'Failed to send support request', 'danger');
                } else {
                    alert(err.message || 'Failed to send support request. Please try again.');
                }
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    }

    // Prefill the role
    const roleSelect = document.getElementById('supportRole');
    if (roleSelect) {
        if (role.toLowerCase() === 'student') {
            roleSelect.value = 'Student';
        } else if (role.toLowerCase() === 'school') {
            roleSelect.value = 'School';
        } else {
            roleSelect.value = 'Guest';
        }
    }

    // 2. Inject FAB if required and not already present
    if (showFab && !document.getElementById('supportFab')) {
        const fabHtml = `
            <div class="support-fab" id="supportFab" title="Need help? Contact support.">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', fabHtml);
        document.getElementById('supportFab').addEventListener('click', () => {
            window.openSupportModal();
        });
    }
};

window.openSupportModal = () => {
    const overlay = document.getElementById('supportModalOverlay');
    if (overlay) {
        overlay.classList.add('active');
        // If custom cursors exist, update hover bindings
        document.querySelectorAll('.support-modal-card a, .support-modal-card button, .support-modal-card input, .support-modal-card select, .support-modal-card textarea').forEach(el => {
            el.addEventListener('mouseenter', () => {
                const ring = document.getElementById('cursorRing');
                if (ring) ring.classList.add('active');
            });
            el.addEventListener('mouseleave', () => {
                const ring = document.getElementById('cursorRing');
                if (ring) ring.classList.remove('active');
            });
        });
    }
};

window.closeSupportModal = () => {
    const overlay = document.getElementById('supportModalOverlay');
    if (overlay) overlay.classList.remove('active');
};
