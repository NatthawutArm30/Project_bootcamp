async function loadTables() {
  try {
    const tables = await Api.getTables();
    const openTables = tables.filter(t => t.is_open);

    const listEl = document.getElementById('tableList');
    if (openTables.length === 0) {
      listEl.innerHTML = '<div class="empty-state">ไม่มีโต๊ะเปิดอยู่ตอนนี้</div>';
      return;
    }

    listEl.innerHTML = openTables.map(t => `
      <div class="table-card ${t.status === 'ready_to_close' ? 'ready' : ''}" onclick="location.href='table-detail.html?session=${t.session_id}'" style="padding:16px">
        <div class="table-number-box ${t.status === 'ready_to_close' ? 'ready' : 'ordering'}" style="width:52px;height:52px;font-size:20px">${t.table_number}</div>
        <div class="table-info">
          <p class="name" style="font-size:16px">โต๊ะ ${t.table_number}</p>
          <p class="status ${t.status === 'ready_to_close' ? 'ready' : 'ordering'}">
            ${t.status === 'ready_to_close' ? 'เสิร์ฟครบแล้ว พร้อมปิดบิล' : 'กำลังสั่งเพิ่ม'}
          </p>
        </div>
        <div class="table-amount" style="font-size:18px">฿${t.total_amount.toFixed(0)}</div>
      </div>
    `).join('');
  } catch (err) {
    showError(err);
  }
}

socket.on('table_list_changed', loadTables);
loadTables();
renderBottomNav('bill');
