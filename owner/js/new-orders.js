let currentFilter = 'all';
let allOrders = [];

async function loadNewOrders() {
  try {
    allOrders = await Api.getNewOrders();
    renderOrders();
  } catch (err) {
    showError(err);
  }
}

function setOrderFilter(filter) {
  currentFilter = filter;
  ['filterAllBtn', 'filterDineInBtn', 'filterTakeawayBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.style.background = 'transparent';
  });

  const activeBtn = document.getElementById(
    filter === 'all' ? 'filterAllBtn' : (filter === 'dine_in' ? 'filterDineInBtn' : 'filterTakeawayBtn')
  );
  if (activeBtn) {
    activeBtn.style.background = 'var(--surface)';
    activeBtn.style.fontWeight = '600';
  }

  renderOrders();
}

function renderOrders() {
  const filtered = allOrders.filter(o => {
    if (currentFilter === 'all') return true;
    return o.order_type === currentFilter;
  });

  document.getElementById('pageTitle').textContent = `รายการออเดอร์ (${filtered.length})`;

  const listEl = document.getElementById('orderList');
  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-state">ไม่มีออเดอร์ในขณะนี้</div>';
    return;
  }

  listEl.innerHTML = filtered.map(order => {
    const isTakeaway = order.order_type === 'takeaway';
    const isWaiting = order.order_status === 'wait for order';

    const statusBadgeHtml = isWaiting
      ? `<span class="status-badge" style="background:#fffbeb;color:#d97706;padding:4px 8px;font-size:12px"><i data-lucide="clock"></i> รอรับออเดอร์</span>`
      : `<span class="status-badge" style="background:#eff6ff;color:#2563eb;padding:4px 8px;font-size:12px"><i data-lucide="chef-hat"></i> กำลังปรุง</span>`;

    const typeBadgeHtml = isTakeaway
      ? `<span style="background:#fef2f2;color:#dc2626;padding:3px 8px;border-radius:12px;font-size:12px;font-weight:600"><i data-lucide="shopping-bag"></i> สั่งกลับบ้าน</span>`
      : `<span style="background:#f0fdf4;color:#16a34a;padding:3px 8px;border-radius:12px;font-size:12px;font-weight:600"><i data-lucide="utensils"></i> โต๊ะ ${order.table_number || '-'}</span>`;

    const actionBtnHtml = isWaiting
      ? `<button class="btn-primary" style="background:var(--accent)" onclick="updateStatus('${order.order_id}', 'cooking')"><i data-lucide="chef-hat"></i> รับออเดอร์ (เริ่มปรุง)</button>`
      : `<button class="btn-primary" style="background:var(--success)" onclick="updateStatus('${order.order_id}', 'served')"><i data-lucide="check-circle"></i> ทำเสร็จแล้ว (${isTakeaway ? 'รับสินค้า' : 'เสิร์ฟ'})</button>`;

    return `
      <div class="card" style="margin-bottom:14px;border:1px solid var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:8px">
            ${typeBadgeHtml}
            ${statusBadgeHtml}
          </div>
          <p style="font-size:12px;color:var(--text-muted);margin:0">${timeAgo(order.created_at)}</p>
        </div>

        ${isTakeaway && (order.customer_name || order.customer_phone) ? `
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;background:var(--surface-muted);padding:6px 10px;border-radius:8px">
            <i data-lucide="user"></i> ลูกค้า: <strong>${escapeHtml(order.customer_name) || 'ไม่ระบุชื่อ'}</strong> | <i data-lucide="phone"></i> <strong>${escapeHtml(order.customer_phone) || 'ไม่ระบุเบอร์'}</strong>
          </div>
        ` : ''}

        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
          ${order.items.map(it => `
            <div style="display:flex;justify-content:space-between;font-size:14px">
              <span><strong>${escapeHtml(it.name)}</strong> x ${it.quantity}
                ${Object.keys(it.selected_options).length > 0
                  ? `<br><small style="color:var(--text-secondary)">(${escapeHtml(Object.values(it.selected_options).join(', '))})</small>` : ''}
                ${it.custom_note ? `<br><small style="color:var(--primary-dark);font-style:italic"><i data-lucide="sticky-note"></i> ${escapeHtml(it.custom_note)}</small>` : ''}
              </span>
              <span style="font-weight:600">${it.final_price} ฿</span>
            </div>
          `).join('')}
        </div>

        ${actionBtnHtml}
      </div>
    `;
  }).join('');

  refreshIcons();
}

async function updateStatus(orderId, nextStatus) {
  try {
    await Api.updateOrderStatus(orderId, nextStatus);
    showToast(nextStatus === 'cooking' ? 'รับออเดอร์เรียบร้อยแล้ว' : 'ทำเสร็จเรียบร้อยแล้ว');
    loadNewOrders();
  } catch (err) {
    showError(err);
  }
}

socket.on('new_order', loadNewOrders);
socket.on('order_status_changed', loadNewOrders);
socket.on('table_list_changed', loadNewOrders);

loadNewOrders();
