// owner/js/tables.js — Table management logic for owner

async function loadTables() {
  try {
    const tables = await Api.getAllTables();
    renderTables(tables);
  } catch (err) {
    showError(err);
  }
}

function renderTables(tables) {
  const container = document.getElementById('tablesGrid');

  if (tables.length === 0) {
    container.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">ยังไม่มีโต๊ะอาหารในระบบ</div>`;
    return;
  }

  container.innerHTML = tables.map(t => {
    const isActive = t.has_active_session;
    const customerUrl = `${window.location.origin}/customer/welcome.html?table=${t.table_number}`;
    const dotColor = isActive ? '#d97706' : '#16a34a';

    return `
      <div class="card" style="display:flex;flex-direction:column;align-items:center;padding:14px;position:relative;border:1px solid var(--border)">
        <div style="font-size:22px;font-weight:700;color:var(--text-primary);margin-bottom:4px">
          โต๊ะ ${t.table_number}
        </div>

        <div style="font-size:12px;margin-bottom:12px;padding:2px 8px;border-radius:10px;display:inline-flex;align-items:center;gap:5px;${isActive ? 'background:#fef3c7;color:#d97706;' : 'background:#f0fdf4;color:#16a34a;'}">
          <span style="width:7px;height:7px;border-radius:50%;background:${dotColor};display:inline-block"></span>
          ${isActive ? 'มีลูกค้า' : 'โต๊ะว่าง'}
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;width:100%">
          <button style="font-size:12px;padding:6px;width:100%;display:flex;align-items:center;justify-content:center;gap:5px" onclick="openCustomerQR('${customerUrl}', ${t.table_number})"><i data-lucide="link"></i> ลิงก์โต๊ะ ${t.table_number}</button>
          <button style="font-size:12px;padding:6px;width:100%;color:var(--error);border-color:#fecaca;background:#fef2f2;display:flex;align-items:center;justify-content:center;gap:5px" onclick="confirmDeleteTable(${t.table_id}, ${t.table_number})"><i data-lucide="trash-2"></i> ลบโต๊ะ</button>
        </div>
      </div>
    `;
  }).join('');

  refreshIcons();
}

async function addNewTable() {
  const input = document.getElementById('newTableNumInput');
  const num = parseInt(input.value, 10);
  if (!num || num <= 0) {
    showToast('กรุณาระบุเลขโต๊ะที่ถูกต้อง');
    return;
  }

  try {
    await Api.createTable(num);
    showToast(`เพิ่มโต๊ะ ${num} เรียบร้อยแล้ว`);
    input.value = '';
    loadTables();
  } catch (err) {
    showError(err);
  }
}

async function confirmDeleteTable(tableId, tableNum) {
  if (!confirm(`คุณต้องการลบ "โต๊ะ ${tableNum}" หรือไม่?`)) return;

  try {
    await Api.deleteTable(tableId);
    showToast(`ลบโต๊ะ ${tableNum} เรียบร้อยแล้ว`);
    loadTables();
  } catch (err) {
    showError(err);
  }
}

function openCustomerQR(url, tableNum) {
  window.open(url, '_blank');
}

// ===== Garbage Cleanup Testing Handlers =====

async function testSeedOldData() {
  try {
    const res = await Api.seedTestOldData();
    showToast(`สร้างข้อมูลทดสอบสำเร็จ (เซสชัน: ${res.seeded_sessions}, ออเดอร์กลับบ้าน: ${res.seeded_takeaway})`);
  } catch (err) {
    showError(err);
  }
}

async function testRunCleanup(days = 7) {
  try {
    const res = await Api.cleanOldRecords(days, false);
    showToast(res.message);
    loadTables();
  } catch (err) {
    showError(err);
  }
}

async function testForceCleanAll() {
  if (!confirm('คุณต้องการลบประวัติออเดอร์และเซสชันที่ปิดบิลแล้วทั้งหมดทันทีหรือไม่?')) return;
  try {
    const res = await Api.cleanOldRecords(7, true);
    showToast(res.message);
    loadTables();
  } catch (err) {
    showError(err);
  }
}

socket.on('table_list_changed', loadTables);

loadTables();
