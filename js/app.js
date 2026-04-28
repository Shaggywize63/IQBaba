// Shared Mock Data for demo purposes if needed
const mockData = {
  subjects: [
    { id: 1, name: 'Mathematics', code: 'MATH' },
    { id: 2, name: 'Science', code: 'SCI' },
    { id: 3, name: 'English', code: 'ENG' },
    { id: 4, name: 'Social Studies', code: 'SOC' },
    { id: 5, name: 'Computer Science', code: 'COMP' }
  ],
  schools: [
    'Delhi Public School',
    'National Public School',
    'Kendriya Vidyalaya',
    'Ryan International',
    'Ahlcon International'
  ]
};

window.mockData = mockData;

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
