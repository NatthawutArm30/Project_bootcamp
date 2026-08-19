let categoriesCache = [];

async function loadMenu() {
  try {
    const categories = await Api.getMenu();
    categoriesCache = categories;

    // เติม dropdown หมวดหมู่ใน modal เพิ่มเมนู
    document.getElementById('newItemCategory').innerHTML = categories
      .map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    const listEl = document.getElementById('menuList');
    if (categories.length === 0) {
      listEl.innerHTML = '<div class="empty-state">ยังไม่มีเมนู</div>';
      return;
    }

    listEl.innerHTML = categories.map(cat => `
      <p class="section-label">${cat.name}</p>
      <div class="card" style="margin-bottom:18px;padding:4px">
        ${cat.items.length === 0
          ? '<div class="empty-state" style="padding:16px">ยังไม่มีเมนูในหมวดนี้</div>'
          : cat.items.map((item, idx) => `
            <div class="menu-item-card ${!item.is_available ? 'unavailable' : ''}" style="${idx > 0 ? 'border-top:1px solid var(--border)' : ''}">
              <div class="info" onclick="location.href='edit-menu-item.html?id=${item.id}'" style="cursor:pointer">
                <p class="name">${item.name}</p>
                <p class="price">฿${item.base_price}${!item.is_available ? ' · หมดวันนี้' : ''}</p>
              </div>
              <label class="switch">
                <input type="checkbox" ${item.is_available ? 'checked' : ''} onchange="toggleItem(${item.id}, this.checked)">
                <span class="slider"></span>
              </label>
            </div>
          `).join('')}
      </div>
    `).join('');
  } catch (err) {
    showError(err);
  }
}

async function toggleItem(itemId, isAvailable) {
  try {
    await Api.updateMenuItem(itemId, { is_available: isAvailable });
    showToast(isAvailable ? 'เปิดขายแล้ว' : 'ปิดขายแล้ว (ของหมด)');
    loadMenu();
  } catch (err) {
    showError(err);
  }
}

document.getElementById('saveNewItemBtn').addEventListener('click', async () => {
  const name = document.getElementById('newItemName').value.trim();
  const price = parseFloat(document.getElementById('newItemPrice').value);
  const categoryId = document.getElementById('newItemCategory').value;

  if (!name || isNaN(price)) {
    showToast('กรุณากรอกชื่อและราคาให้ครบ');
    return;
  }

  try {
    await Api.createMenuItem({ category_id: parseInt(categoryId), name, base_price: price });
    document.getElementById('addModal').classList.remove('show');
    document.getElementById('newItemName').value = '';
    document.getElementById('newItemPrice').value = '';
    showToast('เพิ่มเมนูแล้ว');
    loadMenu();
  } catch (err) {
    showError(err);
  }
});

loadMenu();
renderBottomNav('menu');
