const params = new URLSearchParams(location.search);
const sessionId = params.get('session');

if (!sessionId) {
  location.href = 'close-bill.html';
}

let hasPendingOrders = false;

async function loadDetail() {
  try {
    const data = await Api.getSession(sessionId);
    document.getElementById('tableTitle').textContent = `โต๊ะ ${data.table_number}`;
    document.getElementById('sessionMeta').textContent = `${data.rounds.length} รอบสั่ง`;
    document.getElementById('totalAmount').textContent = `฿${data.total_amount.toFixed(0)}`;

    const pending = data.pending_orders || [];
    hasPendingOrders = pending.length > 0;

    const pendingCard = document.getElementById('pendingCard');
    if (hasPendingOrders) {
      pendingCard.style.display = 'block';
      pendingCard.innerHTML = `
        <div class="card" style="border:1px solid var(--warning);background:var(--warning-bg)">
          <p style="font-size:13px;font-weight:600;color:var(--warning);margin:0 0 8px;display:flex;align-items:center;gap:6px">
            <i data-lucide="clock"></i> มีออเดอร์ที่ยังไม่ได้รับเข้าครัว (${pending.length})
          </p>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${pending.map(ord => `
              <div style="display:flex;flex-direction:column;gap:4px;font-size:13px">
                ${ord.items.map(it => `
                  <div style="display:flex;justify-content:space-between">
                    <span>${escapeHtml(it.name)} x${it.quantity}</span>
                    <span>฿${it.final_price.toFixed(0)}</span>
                  </div>
                `).join('')}
              </div>
            `).join('')}
          </div>
          <p style="font-size:12px;color:var(--warning);margin:8px 0 0">กรุณาไปที่หน้า "รายการออเดอร์" เพื่อรับออเดอร์เหล่านี้ก่อนปิดบิล</p>
        </div>
      `;
    } else {
      pendingCard.style.display = 'none';
      pendingCard.innerHTML = '';
    }

    document.getElementById('roundsCard').innerHTML = data.rounds.map((round, idx) => `
      <p style="font-size:12px;color:var(--text-muted);margin:${idx === 0 ? '0' : '14px'} 0 8px">รอบที่ ${round.round}</p>
      <div style="display:flex;flex-direction:column;gap:8px;${idx < data.rounds.length - 1 ? 'padding-bottom:14px;border-bottom:1px solid var(--border)' : ''}">
        ${round.items.map(it => `
          <div style="display:flex;justify-content:space-between;font-size:14px">
            <span>${escapeHtml(it.name)} x${it.quantity}
              ${Object.keys(it.selected_options).length > 0
                ? `<span style="color:var(--text-muted)">(${escapeHtml(Object.values(it.selected_options).join(', '))})</span>` : ''}
            </span>
            <span>฿${it.final_price.toFixed(0)}</span>
          </div>
        `).join('')}
      </div>
    `).join('');

    refreshIcons();
  } catch (err) {
    showError(err);
  }
}

document.getElementById('closeBillBtn').addEventListener('click', async () => {
  if (hasPendingOrders) {
    showToast('มีออเดอร์ที่ยังไม่ได้รับเข้าครัว กรุณารับออเดอร์ก่อนปิดบิล');
    return;
  }
  if (!confirm('ยืนยันว่าได้รับเงินแล้ว และปิดบิลโต๊ะนี้?')) return;
  try {
    await Api.closeSession(sessionId);
    showToast('ปิดบิลแล้ว');
    setTimeout(() => location.href = 'close-bill.html', 800);
  } catch (err) {
    showError(err);
    loadDetail();
  }
});

loadDetail();
