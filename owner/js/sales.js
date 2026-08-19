let salesMode = 'day'; // 'day' | 'month' | 'range'

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const THAI_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatDateLabel(dateStr) {
  if (dateStr === todayStr()) return 'วันนี้';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `วันที่ ${d} ${THAI_MONTHS_SHORT[m - 1]} ${y + 543}`;
}

function formatMonthLabel(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return `เดือน${THAI_MONTHS_FULL[m - 1]} ${y + 543}`;
}

function formatRangeLabel(startStr, endStr) {
  const short = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return `${d} ${THAI_MONTHS_SHORT[m - 1]} ${y + 543}`;
  };
  return `${short(startStr)} - ${short(endStr)}`;
}

function formatFullDateCaption(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${THAI_MONTHS_FULL[m - 1]} ${y + 543}`;
}

function formatFullMonthCaption(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return `${THAI_MONTHS_FULL[m - 1]} ${y + 543}`;
}

function refreshDateCaptions() {
  const dateVal = document.getElementById('dateInput').value;
  document.getElementById('dateInputLabel').textContent = dateVal ? formatFullDateCaption(dateVal) : '';
  const monthVal = document.getElementById('monthInput').value;
  document.getElementById('monthInputLabel').textContent = monthVal ? formatFullMonthCaption(monthVal) : '';
  const startVal = document.getElementById('startInput').value;
  document.getElementById('startInputLabel').textContent = startVal ? formatFullDateCaption(startVal) : '';
  const endVal = document.getElementById('endInput').value;
  document.getElementById('endInputLabel').textContent = endVal ? formatFullDateCaption(endVal) : '';
}

function setSalesMode(mode) {
  salesMode = mode;
  document.getElementById('modeDayBtn').classList.toggle('active', mode === 'day');
  document.getElementById('modeMonthBtn').classList.toggle('active', mode === 'month');
  document.getElementById('modeRangeBtn').classList.toggle('active', mode === 'range');
  document.getElementById('dateInputWrap').style.display = mode === 'day' ? 'block' : 'none';
  document.getElementById('monthInputWrap').style.display = mode === 'month' ? 'block' : 'none';
  document.getElementById('startInputWrap').style.display = mode === 'range' ? 'block' : 'none';
  document.getElementById('endInputWrap').style.display = mode === 'range' ? 'block' : 'none';
  loadSales();
}

function goToToday() {
  document.getElementById('dateInput').value = todayStr();
  document.getElementById('monthInput').value = currentMonthStr();
  setSalesMode('day');
}

async function loadSales() {
  try {
    const params = {};
    let periodLabel;
    let topItemsLabel;

    if (salesMode === 'day') {
      const date = document.getElementById('dateInput').value || todayStr();
      params.date = date;
      periodLabel = formatDateLabel(date);
      topItemsLabel = `ขายดี${formatDateLabel(date)}`;
    } else if (salesMode === 'month') {
      const month = document.getElementById('monthInput').value || currentMonthStr();
      params.month = month;
      periodLabel = formatMonthLabel(month);
      topItemsLabel = `ขายดี${formatMonthLabel(month)}`;
    } else {
      let start = document.getElementById('startInput').value || todayStr();
      let end = document.getElementById('endInput').value || todayStr();
      if (end < start) [start, end] = [end, start];
      params.start = start;
      params.end = end;
      periodLabel = formatRangeLabel(start, end);
      topItemsLabel = `ขายดีช่วง${formatRangeLabel(start, end)}`;
    }

    refreshDateCaptions();
    const data = await Api.getSales(params);

    document.getElementById('periodLabel').textContent = `ยอดขายรวม${periodLabel}`;
    document.getElementById('topItemsLabel').textContent = topItemsLabel;
    document.getElementById('totalAmount').textContent = `฿${data.total_amount.toFixed(0)}`;
    document.getElementById('billCount').textContent = `${data.bill_count} บิล`;

    const listEl = document.getElementById('topItems');
    if (data.top_items.length === 0) {
      listEl.innerHTML = '<div class="empty-state">ยังไม่มีข้อมูลขายในช่วงนี้</div>';
      return;
    }

    listEl.innerHTML = data.top_items.map((item, idx) => `
      <div class="card top-item-card">
        <div class="top-item-rank">${idx + 1}</div>
        <p style="font-size:14px;flex:1;margin:0">${item.name}</p>
        <p style="font-size:13px;color:var(--text-secondary);margin:0">ขาย ${item.qty} รายการ</p>
      </div>
    `).join('');
  } catch (err) {
    showError(err);
  }
}

function daysAgoStr(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

document.getElementById('dateInput').value = todayStr();
document.getElementById('monthInput').value = currentMonthStr();
document.getElementById('startInput').value = daysAgoStr(6);
document.getElementById('endInput').value = todayStr();
document.getElementById('dateInput').addEventListener('change', loadSales);
document.getElementById('monthInput').addEventListener('change', loadSales);
document.getElementById('startInput').addEventListener('change', loadSales);
document.getElementById('endInput').addEventListener('change', loadSales);

loadSales();
renderBottomNav('sales');
