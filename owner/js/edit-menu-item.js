const params = new URLSearchParams(location.search);
const itemId = parseInt(params.get('id'));

if (!itemId) location.href = 'menu.html';

let currentItem = null;

async function loadItem() {
  try {
    const categories = await Api.getMenu();
    for (const cat of categories) {
      const found = cat.items.find(i => i.id === itemId);
      if (found) { currentItem = found; break; }
    }
    if (!currentItem) {
      showToast('ไม่พบเมนูนี้');
      return;
    }

    document.getElementById('itemName').value = currentItem.name;
    document.getElementById('itemPrice').value = currentItem.base_price;
    document.getElementById('itemAvailable').checked = currentItem.is_available;

    renderOptions();
  } catch (err) {
    showError(err);
  }
}

function renderOptions() {
  document.getElementById('optionCountLabel').textContent = `ตัวเลือกของเมนูนี้ (${currentItem.options.length})`;
  const listEl = document.getElementById('optionsList');

  if (currentItem.options.length === 0) {
    listEl.innerHTML = '<div class="empty-state">ยังไม่มีตัวเลือกเสริม</div>';
    return;
  }

  listEl.innerHTML = currentItem.options.map(opt => `
    <div class="card" style="margin-bottom:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <p style="font-size:14px;font-weight:500;margin:0">${opt.name}</p>
        <span style="font-size:12px;color:var(--text-muted)">${opt.is_required ? 'บังคับเลือก' : 'ไม่บังคับ'}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${opt.choices.map(c => `
          <div style="display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:13px;${!c.is_available ? 'color:var(--text-muted)' : ''}">${c.name} <span style="color:var(--text-muted)">+${c.price_delta}</span></span>
            <label class="switch" style="width:34px;height:19px">
              <input type="checkbox" ${c.is_available ? 'checked' : ''} onchange="toggleChoice(${c.id}, this.checked)">
              <span class="slider"></span>
            </label>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

async function toggleChoice(choiceId, isAvailable) {
  try {
    await Api.toggleChoice(choiceId, isAvailable);
    showToast(isAvailable ? 'เปิดขายตัวเลือกนี้แล้ว' : 'ปิดขายตัวเลือกนี้แล้ว');
    loadItem();
  } catch (err) {
    showError(err);
  }
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  const name = document.getElementById('itemName').value.trim();
  const price = parseFloat(document.getElementById('itemPrice').value);
  const isAvailable = document.getElementById('itemAvailable').checked;

  try {
    await Api.updateMenuItem(itemId, { name, base_price: price, is_available: isAvailable });
    showToast('บันทึกแล้ว');
  } catch (err) {
    showError(err);
  }
});

// ===== เพิ่มกลุ่มตัวเลือกใหม่ =====
function addChoiceRow() {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px';
  row.innerHTML = `
    <input type="text" placeholder="ชื่อ เช่น หมูกรอบ" class="choice-name" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px">
    <input type="number" placeholder="0" class="choice-price" style="width:60px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px">
    <button onclick="this.parentElement.remove()" style="padding:8px 10px;font-size:13px"><i data-lucide="x"></i></button>
  `;
  document.getElementById('choiceRows').appendChild(row);
  refreshIcons();
}
addChoiceRow();
addChoiceRow();

document.getElementById('saveOptionBtn').addEventListener('click', async () => {
  const name = document.getElementById('optGroupName').value.trim();
  const isRequired = document.getElementById('optRequired').checked;
  const rows = document.querySelectorAll('#choiceRows > div');
  const choices = Array.from(rows).map(row => ({
    name: row.querySelector('.choice-name').value.trim(),
    price_delta: parseFloat(row.querySelector('.choice-price').value) || 0,
  })).filter(c => c.name);

  if (!name || choices.length === 0) {
    showToast('กรุณากรอกชื่อกลุ่มและตัวเลือกย่อยอย่างน้อย 1 อัน');
    return;
  }

  try {
    await Api.addMenuOption(itemId, { name, is_required: isRequired, choices });
    document.getElementById('addOptionModal').classList.remove('show');
    document.getElementById('optGroupName').value = '';
    document.getElementById('choiceRows').innerHTML = '';
    addChoiceRow();
    addChoiceRow();
    showToast('เพิ่มกลุ่มตัวเลือกแล้ว');
    loadItem();
  } catch (err) {
    showError(err);
  }
});

loadItem();
