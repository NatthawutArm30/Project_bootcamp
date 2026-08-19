let currentShopStatus = { is_shop_open: true, accepts_dine_in: true };

// ===== โหลดสถานะร้าน =====
async function loadShopStatus() {
  try {
    const shop = await Api.getShop();
    currentShopStatus = shop;
    document.getElementById('shopName').textContent = shop.name;
    renderShopStatus(shop);
  } catch (err) {
    showError(err);
  }
}

function renderShopStatus(shop) {
  const badge = document.getElementById('shopStatusBadge');
  const text = document.getElementById('shopStatusText');
  const toggleBtn = document.getElementById('toggleShopBtn');
  const toggleText = document.getElementById('toggleShopText');

  if (shop.is_shop_open) {
    badge.className = 'status-badge open';
    text.textContent = 'ร้านเปิดอยู่';
    toggleText.textContent = 'ปิดร้าน / หยุดรับออเดอร์';
    toggleBtn.className = 'btn-danger';
    toggleBtn.style.background = '';
  } else {
    badge.className = 'status-badge closed';
    text.textContent = 'ร้านปิดอยู่';
    toggleText.textContent = 'เปิดร้าน / รับออเดอร์ต่อ';
    toggleBtn.className = 'btn-success';
    toggleBtn.style.background = '';
  }

  const dineInOn = !!shop.accepts_dine_in;
  document.getElementById('dineInToggle').checked = dineInOn;
  document.getElementById('dineInStatus').textContent = dineInOn ? '● รับอยู่' : '● ปิดรับ';
  document.getElementById('dineInStatus').className = 'channel-status ' + (dineInOn ? 'on' : 'off');
  document.getElementById('dineInCard').classList.toggle('channel-on', dineInOn);
  document.getElementById('dineInCard').classList.toggle('channel-off', !dineInOn);

  const takeawayOn = !!shop.accepts_dine_in_tk;
  document.getElementById('takeawayToggle').checked = takeawayOn;
  document.getElementById('takeawayStatus').textContent = takeawayOn ? '● รับอยู่' : '● ปิดรับ';
  document.getElementById('takeawayStatus').className = 'channel-status ' + (takeawayOn ? 'on' : 'off');
  document.getElementById('takeawayCard').classList.toggle('channel-on', takeawayOn);
  document.getElementById('takeawayCard').classList.toggle('channel-off', !takeawayOn);
}

// ===== ปุ่มปิด/เปิดร้าน พร้อม modal ยืนยัน =====
document.getElementById('toggleShopBtn').addEventListener('click', () => {
  const isClosing = currentShopStatus.is_shop_open;
  document.getElementById('modalTitle').textContent = isClosing ? 'ปิดร้านตอนนี้เลยไหม' : 'เปิดร้านรับออเดอร์ต่อ';
  document.getElementById('modalDesc').textContent = isClosing
    ? 'ร้านจะหยุดรับออเดอร์ใหม่ทันที ลูกค้าที่สแกน QR จะเห็นว่าร้านปิดอยู่'
    : 'ร้านจะกลับมารับออเดอร์ใหม่ได้ตามปกติ';
  document.getElementById('confirmModal').classList.add('show');
});

document.getElementById('modalCancel').addEventListener('click', () => {
  document.getElementById('confirmModal').classList.remove('show');
});

document.getElementById('modalConfirm').addEventListener('click', async () => {
  document.getElementById('confirmModal').classList.remove('show');
  try {
    const updated = await Api.updateShop({ is_shop_open: !currentShopStatus.is_shop_open });
    await loadShopStatus();
    showToast(currentShopStatus.is_shop_open ? 'เปิดร้านแล้ว' : 'ปิดร้านแล้ว');
  } catch (err) {
    showError(err);
  }
});

// ===== toggle รับ dine-in =====
document.getElementById('dineInToggle').addEventListener('change', async (e) => {
  try {
    await Api.updateShop({ accepts_dine_in: e.target.checked });
    await loadShopStatus();
  } catch (err) {
    showError(err);
    e.target.checked = !e.target.checked;
  }
});

// toggle รับ takeaway (สั่งกลับบ้าน)
document.getElementById('takeawayToggle').addEventListener('change', async (e) => {
  try {
    await Api.updateShop({ accepts_dine_in_tk: e.target.checked });
    await loadShopStatus();
  } catch (err) {
    showError(err);
    e.target.checked = !e.target.checked;
  }
});

// ===== โหลดโต๊ะที่เปิดอยู่ + ออเดอร์ใหม่ =====
async function loadTables() {
  try {
    const tables = await Api.getTables();
    const openTables = tables.filter(t => t.is_open);
    document.getElementById('tableCountLabel').textContent = `โต๊ะที่เปิดอยู่ตอนนี้ (${openTables.length})`;

    const listEl = document.getElementById('tableList');
    if (openTables.length === 0) {
      listEl.innerHTML = '<div class="empty-state">ยังไม่มีโต๊ะเปิดอยู่ตอนนี้</div>';
    } else {
      listEl.innerHTML = openTables.map(t => `
        <div class="table-card ${t.status === 'ready_to_close' ? 'ready' : ''}" onclick="location.href='table-detail.html?session=${t.session_id}'">
          <div class="table-number-box ${t.status === 'ready_to_close' ? 'ready' : 'ordering'}">${t.table_number}</div>
          <div class="table-info">
            <p class="name">โต๊ะ ${t.table_number}</p>
            <p class="status ${t.status === 'ready_to_close' ? 'ready' : 'ordering'}">
              ${t.status === 'ready_to_close' ? 'เสิร์ฟครบแล้ว' : 'กำลังสั่งเพิ่ม'}
            </p>
          </div>
          <div class="table-amount">฿${t.total_amount.toFixed(0)}</div>
        </div>
      `).join('');
    }
  } catch (err) {
    showError(err);
  }
}

async function loadNewOrders() {
  try {
    const orders = await Api.getNewOrders();
    const banner = document.getElementById('newOrderBanner');
    if (orders.length === 0) {
      banner.style.display = 'none';
      return;
    }
    banner.style.display = 'flex';
    const tableNumbers = [...new Set(orders.map(o => o.table_number))];
    document.getElementById('newOrderTitle').textContent = `ออเดอร์ใหม่ ${orders.length} รายการ`;
    document.getElementById('newOrderSubtitle').textContent =
      tableNumbers.length === 1 ? `โต๊ะ ${tableNumbers[0]}` : `โต๊ะ ${tableNumbers.join(', ')}`;
  } catch (err) {
    showError(err);
  }
}

function refreshAll() {
  loadShopStatus();
  loadTables();
  loadNewOrders();
}

// ===== Socket.IO: อัปเดตแบบ real-time =====
socket.on('new_order', (data) => {
  showToast(`ออเดอร์ใหม่จากโต๊ะ ${data.table_number}`);
  loadNewOrders();
  loadTables();
});
socket.on('table_list_changed', loadTables);
socket.on('shop_status_changed', loadShopStatus);

refreshAll();
renderBottomNav('home');
