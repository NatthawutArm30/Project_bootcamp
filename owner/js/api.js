// ===== ตั้งค่า backend =====
// ใช้ path แบบ relative เพราะตอนนี้เว็บนี้ถูกเสิร์ฟจาก server เดียวกันกับ API แล้ว
// (ถ้าจะแยกรัน backend คนละที่กับเว็บ ให้เปลี่ยนกลับเป็น URL เต็ม เช่น 'http://localhost:4000/api')
const API_BASE = '/api';
const SOCKET_URL = '/';

// ===== Socket.IO — เชื่อมต่อครั้งเดียว ใช้ร่วมกันทุกหน้า =====
const socket = io(SOCKET_URL);
socket.on('connect', () => {
  socket.emit('join_shop');
});

// ===== API helper =====
async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `เกิดข้อผิดพลาด (${res.status})`);
  }
  return data;
}

const Api = {
  getShop: () => api('/shop'),
  updateShop: (body) => api('/shop', { method: 'PATCH', body: JSON.stringify(body) }),

  getTables: () => api('/tables'),
  getSession: (id) => api(`/sessions/session/${id}`),
  closeSession: (id) => api(`/sessions/session/${id}/close`, { method: 'POST' }),

  getNewOrders: () => api('/orders/new'),
  receiveOrder: (id) => api(`/orders/${id}/receive`, { method: 'PATCH' }),
  updateOrderStatus: (id, status) => api(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  getAllTables: () => api('/tables/all'),
  createTable: (tableNumber) => api('/tables', { method: 'POST', body: JSON.stringify({ table_number: tableNumber }) }),
  deleteTable: (id) => api(`/tables/${id}`, { method: 'DELETE' }),

  getMenu: () => api('/menu'),
  createMenuItem: (body) => api('/menu/items', { method: 'POST', body: JSON.stringify(body) }),
  updateMenuItem: (id, body) => api(`/menu/items/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  addMenuOption: (itemId, body) => api(`/menu/items/${itemId}/options`, { method: 'POST', body: JSON.stringify(body) }),
  toggleChoice: (choiceId, isAvailable) => api(`/menu/choices/${choiceId}`, { method: 'PATCH', body: JSON.stringify({ is_available: isAvailable }) }),

  getSales: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api(`/sales${qs ? `?${qs}` : ''}`);
  },

  cleanOldRecords: (days = 7, force = false) => api('/admin/clean-old-records', { method: 'POST', body: JSON.stringify({ days, force }) }),
  seedTestOldData: () => api('/admin/seed-test-old-data', { method: 'POST' }),
};

// ===== ป้องกัน XSS: escape ข้อความก่อนแทรกด้วย innerHTML =====
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ===== Toast แจ้งเตือนเล็กๆ มุมบน =====
function showToast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// ===== แสดงข้อผิดพลาดแบบอ่านง่าย =====
function showError(err) {
  console.error(err);
  showToast(err.message || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
}

// ===== เรียก Lucide ให้วาดไอคอนใหม่หลังจากแทรก HTML แบบไดนามิก =====
function refreshIcons() {
  if (window.lucide) lucide.createIcons();
}

// ===== Render bottom nav ให้ตรงกับหน้าปัจจุบัน =====
function renderBottomNav(activePage) {
  const nav = document.createElement('div');
  nav.className = 'bottom-nav';
  const items = [
    { page: 'home', href: 'index.html', icon: 'house', label: 'หน้าหลัก' },
    { page: 'bill', href: 'close-bill.html', icon: 'receipt', label: 'ปิดบิล' },
    { page: 'menu', href: 'menu.html', icon: 'chef-hat', label: 'เมนู' },
    { page: 'sales', href: 'sales.html', icon: 'bar-chart-3', label: 'ยอดขาย' },
  ];
  nav.innerHTML = items.map(item => `
    <a href="${item.href}" class="${item.page === activePage ? 'active' : ''}">
      <span class="icon"><i data-lucide="${item.icon}"></i></span>
      <span>${item.label}</span>
    </a>
  `).join('');
  document.body.appendChild(nav);
  refreshIcons();
}

// ===== เวลาแบบ "N นาทีที่แล้ว" =====
function timeAgo(isoString) {
  const diffMs = Date.now() - new Date(isoString + 'Z').getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'เพิ่งเข้ามา';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} ชม. ที่แล้ว`;
}

document.addEventListener('DOMContentLoaded', refreshIcons);
