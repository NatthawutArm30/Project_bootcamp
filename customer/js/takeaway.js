// customer/js/takeaway.js — Takeaway Ordering Logic
const API_BASE = '/api';

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function refreshIcons() {
  if (window.lucide) lucide.createIcons();
}

let shopInfo = { name: 'ร้านอาหารตามสั่ง', is_shop_open: true, accepts_dine_in_tk: true };
let menuCategories = [];
let activeCategory = 'all';
let cart = [];

let currentModalItem = null;
let modalQty = 1;
let selectedChoiceIds = new Set();

let socket = null;

document.addEventListener('DOMContentLoaded', () => {
  initSocket();
  loadAllData();
  refreshIcons();
});

function initSocket() {
  if (typeof io !== 'undefined') {
    socket = io();
    socket.on('shop_status_changed', fetchShopInfo);
    socket.on('order_status_changed', searchTakeawayStatus);
  }
}

async function loadAllData() {
  await Promise.all([fetchShopInfo(), fetchMenu()]);
}

async function fetchShopInfo() {
  try {
    const res = await fetch(`${API_BASE}/shop`);
    if (!res.ok) throw new Error('Failed to fetch shop info');
    shopInfo = await res.json();
    renderShopStatus();
  } catch (err) {
    console.error('Error loading shop info:', err);
  }
}

async function fetchMenu() {
  try {
    const res = await fetch(`${API_BASE}/menu`);
    if (!res.ok) throw new Error('Failed to fetch menu');
    menuCategories = await res.json();
    renderCategoryChips();
    renderMenu();
  } catch (err) {
    console.error('Error loading menu:', err);
  }
}

function renderShopStatus() {
  document.getElementById('shopName').textContent = shopInfo.name || 'ร้านอาหารตามสั่ง';
  const badge = document.getElementById('shopStatusBadge');
  const text = document.getElementById('shopStatusText');
  const banner = document.getElementById('closedBanner');

  const isOpen = shopInfo.is_shop_open && shopInfo.accepts_dine_in_tk;

  if (isOpen) {
    badge.className = 'shop-status-tag open';
    text.textContent = 'เปิดรับกลับบ้าน';
    banner.style.display = 'none';
  } else {
    badge.className = 'shop-status-tag closed';
    text.textContent = 'ปิดรับ';
    banner.style.display = 'flex';
  }
}

function renderCategoryChips() {
  const container = document.getElementById('categoryChipsNav');
  let html = `<button class="chip ${activeCategory === 'all' ? 'active' : ''}" onclick="selectCategory('all')">ทั้งหมด</button>`;
  menuCategories.forEach((cat) => {
    html += `<button class="chip ${activeCategory === cat.id ? 'active' : ''}" onclick="selectCategory(${cat.id})">${cat.name}</button>`;
  });
  container.innerHTML = html;
}

function selectCategory(catId) {
  activeCategory = catId;
  renderCategoryChips();
  renderMenu();
}

function renderMenu() {
  const container = document.getElementById('menuContainer');
  let html = '';

  const categoriesToDisplay = activeCategory === 'all' 
    ? menuCategories 
    : menuCategories.filter(c => c.id === activeCategory);

  if (categoriesToDisplay.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon"><i data-lucide="utensils"></i></div><p>ไม่มีรายการอาหารในหมวดนี้</p></div>`;
    refreshIcons();
    return;
  }

  categoriesToDisplay.forEach((cat) => {
    if (!cat.items || cat.items.length === 0) return;

    html += `
      <div class="category-group">
        <h2 class="category-title">${cat.name}</h2>
        <div class="menu-grid">
    `;

    cat.items.forEach((item) => {
      const isAvail = item.is_available && shopInfo.is_shop_open && shopInfo.accepts_dine_in_tk;
      const hasOptions = item.options && item.options.length > 0;

      html += `
        <div class="menu-card ${!isAvail ? 'unavailable' : ''}">
          <div class="menu-info">
            <div class="menu-name">${item.name}</div>
            <div class="menu-price">${item.base_price} ฿</div>
            ${hasOptions ? `<div class="options-preview">มีตัวเลือกเพิ่มเติม</div>` : ''}
          </div>
          <button class="add-btn" ${!isAvail ? 'disabled' : ''} onclick="openOptionModal(${item.id})">
            ${isAvail ? (hasOptions ? '+ เลือก' : '+ เพิ่ม') : 'หมด'}
          </button>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  refreshIcons();
}

function openOptionModal(itemId) {
  let foundItem = null;
  for (const cat of menuCategories) {
    const it = cat.items.find(i => i.id === itemId);
    if (it) { foundItem = it; break; }
  }

  if (!foundItem) return;

  currentModalItem = foundItem;
  modalQty = 1;
  selectedChoiceIds.clear();

  if (foundItem.options) {
    foundItem.options.forEach(opt => {
      if (opt.is_required && opt.choices && opt.choices.length > 0) {
        const availableChoice = opt.choices.find(c => c.is_available) || opt.choices[0];
        if (availableChoice) selectedChoiceIds.add(availableChoice.id);
      }
    });
  }

  document.getElementById('modalItemTitle').textContent = foundItem.name;
  document.getElementById('modalItemPrice').textContent = `${foundItem.base_price} ฿`;
  document.getElementById('modalCustomNote').value = '';
  document.getElementById('modalQtyDisplay').textContent = modalQty;

  renderModalOptions();
  updateModalSubtotal();

  document.getElementById('optionModal').classList.add('active');
}

function closeOptionModal() {
  document.getElementById('optionModal').classList.remove('active');
}

function renderModalOptions() {
  const container = document.getElementById('optionGroupsContainer');
  if (!currentModalItem || !currentModalItem.options || currentModalItem.options.length === 0) {
    container.innerHTML = '';
    return;
  }

  let html = '';
  currentModalItem.options.forEach((opt) => {
    html += `
      <div class="option-group">
        <div class="option-group-name">
          ${opt.name}
          ${opt.is_required ? `<span class="req-badge">จำเป็น</span>` : ''}
        </div>
        <div class="choice-list">
    `;

    opt.choices.forEach((choice) => {
      const isChecked = selectedChoiceIds.has(choice.id);
      const isAvail = choice.is_available;
      const inputType = opt.is_required ? 'radio' : 'checkbox';
      const inputName = `opt_${opt.id}`;

      html += `
        <label class="choice-label ${!isAvail ? 'disabled' : ''}">
          <span class="choice-name">
            <input type="${inputType}" name="${inputName}" value="${choice.id}" ${isChecked ? 'checked' : ''} ${!isAvail ? 'disabled' : ''} onchange="toggleChoiceSelection(${opt.id}, ${choice.id}, ${opt.is_required})">
            ${choice.name}
          </span>
          <span class="choice-delta">${choice.price_delta > 0 ? `+${choice.price_delta} ฿` : ''}</span>
        </label>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function toggleChoiceSelection(optionId, choiceId, isRequired) {
  const option = currentModalItem.options.find(o => o.id === optionId);
  if (!option) return;

  if (isRequired) {
    option.choices.forEach(c => selectedChoiceIds.delete(c.id));
    selectedChoiceIds.add(choiceId);
  } else {
    if (selectedChoiceIds.has(choiceId)) {
      selectedChoiceIds.delete(choiceId);
    } else {
      selectedChoiceIds.add(choiceId);
    }
  }

  updateModalSubtotal();
}

function changeModalQty(delta) {
  modalQty = Math.max(1, modalQty + delta);
  document.getElementById('modalQtyDisplay').textContent = modalQty;
  updateModalSubtotal();
}

function updateModalSubtotal() {
  if (!currentModalItem) return;

  let unitPrice = currentModalItem.base_price;
  if (currentModalItem.options) {
    currentModalItem.options.forEach(opt => {
      opt.choices.forEach(choice => {
        if (selectedChoiceIds.has(choice.id)) {
          unitPrice += (choice.price_delta || 0);
        }
      });
    });
  }

  const subtotal = unitPrice * modalQty;
  document.getElementById('modalSubtotalDisplay').textContent = `${subtotal} ฿`;
}

function confirmAddToCart() {
  if (!currentModalItem) return;

  const nameInput = document.getElementById('custNameInput').value.trim();
  const phoneInput = document.getElementById('custPhoneInput').value.trim();

  if (!nameInput || !phoneInput) {
    showToast('กรุณาระบุชื่อและเบอร์โทรศัพท์ก่อนสั่งซื้อ');
    document.getElementById('custNameInput').focus();
    return;
  }

  if (currentModalItem.options) {
    for (const opt of currentModalItem.options) {
      if (opt.is_required) {
        const hasChoice = opt.choices.some(c => selectedChoiceIds.has(c.id));
        if (!hasChoice) {
          showToast(`กรุณาเลือก${opt.name}`);
          return;
        }
      }
    }
  }

  let unitPrice = currentModalItem.base_price;
  const choiceIdsArray = Array.from(selectedChoiceIds);
  const choiceNamesArray = [];

  if (currentModalItem.options) {
    currentModalItem.options.forEach(opt => {
      opt.choices.forEach(choice => {
        if (selectedChoiceIds.has(choice.id)) {
          unitPrice += (choice.price_delta || 0);
          choiceNamesArray.push(choice.name);
        }
      });
    });
  }

  const customNote = document.getElementById('modalCustomNote').value.trim();
  const cartId = `c_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

  cart.push({
    cart_id: cartId,
    item_id: currentModalItem.id,
    item_name: currentModalItem.name,
    base_price: currentModalItem.base_price,
    quantity: modalQty,
    selected_choices: choiceIdsArray,
    selected_choice_names: choiceNamesArray,
    custom_note: customNote,
    unit_price: unitPrice,
    final_price: unitPrice * modalQty,
  });

  closeOptionModal();
  updateCartFloatingBar();
  showToast(`เพิ่ม ${currentModalItem.name} ลงตะกร้าแล้ว`);
}

function updateCartFloatingBar() {
  const bar = document.getElementById('cartFloatingBar');
  const countBadge = document.getElementById('cartCountBadge');
  const totalDisplay = document.getElementById('cartTotalDisplay');

  const totalCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const totalPrice = cart.reduce((sum, i) => sum + i.final_price, 0);

  if (totalCount > 0) {
    countBadge.textContent = totalCount;
    totalDisplay.textContent = `${totalPrice} ฿`;
    bar.style.display = 'flex';
  } else {
    bar.style.display = 'none';
  }
}

function openCartModal() {
  const name = document.getElementById('custNameInput').value.trim();
  const phone = document.getElementById('custPhoneInput').value.trim();
  document.getElementById('cartCustSummary').textContent = `ผู้สั่ง: ${name} (${phone})`;
  renderCart();
  document.getElementById('cartModal').classList.add('active');
}

function closeCartModal() {
  document.getElementById('cartModal').classList.remove('active');
}

function renderCart() {
  const container = document.getElementById('cartItemsContainer');
  const totalSummary = document.getElementById('cartTotalSummary');
  const submitBtn = document.getElementById('submitOrderBtn');

  if (cart.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon"><i data-lucide="shopping-bag"></i></div><p>ยังไม่มีรายการในตะกร้า</p></div>`;
    totalSummary.textContent = '0 ฿';
    submitBtn.disabled = true;
    refreshIcons();
    return;
  }

  submitBtn.disabled = false;
  let html = '';
  let grandTotal = 0;

  cart.forEach((item) => {
    grandTotal += item.final_price;
    const optsText = item.selected_choice_names.length > 0 ? item.selected_choice_names.join(', ') : '';

    html += `
      <div class="cart-item-row">
        <div class="cart-item-main">
          <div>
            <div class="cart-item-title">${item.item_name}</div>
            ${optsText ? `<div class="cart-item-opts">${optsText}</div>` : ''}
            ${item.custom_note ? `<div class="cart-item-note"><i data-lucide="sticky-note"></i> ${escapeHtml(item.custom_note)}</div>` : ''}
          </div>
          <div class="cart-item-subtotal">${item.final_price} ฿</div>
        </div>

        <div class="cart-item-actions">
          <button class="remove-item-btn" onclick="removeCartItem('${item.cart_id}')">ลบออก</button>
          <div class="stepper-box">
            <button class="stepper-btn" onclick="changeCartItemQty('${item.cart_id}', -1)">-</button>
            <span class="stepper-val">${item.quantity}</span>
            <button class="stepper-btn" onclick="changeCartItemQty('${item.cart_id}', 1)">+</button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  totalSummary.textContent = `${grandTotal} ฿`;
  refreshIcons();
}

function changeCartItemQty(cartId, delta) {
  const item = cart.find(i => i.cart_id === cartId);
  if (!item) return;

  item.quantity += delta;
  if (item.quantity <= 0) {
    removeCartItem(cartId);
  } else {
    item.final_price = item.unit_price * item.quantity;
    renderCart();
    updateCartFloatingBar();
  }
}

function removeCartItem(cartId) {
  cart = cart.filter(i => i.cart_id !== cartId);
  renderCart();
  updateCartFloatingBar();
  if (cart.length === 0) closeCartModal();
}

async function submitTakeawayOrder() {
  if (cart.length === 0) return;

  const nameInput = document.getElementById('custNameInput').value.trim();
  const phoneInput = document.getElementById('custPhoneInput').value.trim();

  if (!nameInput || !phoneInput) {
    alert('กรุณาระบุชื่อและเบอร์โทรศัพท์ก่อนกดสั่งซื้อ');
    return;
  }

  const submitBtn = document.getElementById('submitOrderBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'กำลังส่งออเดอร์กลับบ้าน...';

  try {
    const payload = {
      order_type: 'takeaway',
      customer_name: nameInput,
      customer_phone: phoneInput,
      items: cart.map(i => ({
        item_id: i.item_id,
        quantity: i.quantity,
        selected_choices: i.selected_choices,
        custom_note: i.custom_note
      }))
    };

    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'ส่งคำสั่งซื้อไม่สำเร็จ');

    document.getElementById('searchPhoneInput').value = phoneInput;
    cart = [];
    updateCartFloatingBar();
    closeCartModal();

    await searchTakeawayStatus();
    switchView('status');
    showToast('ส่งออเดอร์กลับบ้านเรียบร้อยแล้ว!');

  } catch (err) {
    alert(err.message || 'เกิดข้อผิดพลาดในการส่งออเดอร์');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i data-lucide="send"></i> ยืนยันส่งออเดอร์กลับบ้าน';
    refreshIcons();
  }
}

async function searchTakeawayStatus() {
  const phone = document.getElementById('searchPhoneInput').value.trim();
  const container = document.getElementById('takeawayStatusContainer');

  if (!phone) {
    container.innerHTML = `<div class="empty-state"><p>กรุณาระบุเบอร์โทรศัพท์เพื่อค้นหาออเดอร์</p></div>`;
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/orders/takeaway/status?phone=${encodeURIComponent(phone)}`);
    const orders = await res.json();

    if (!res.ok || orders.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon"><i data-lucide="search"></i></div><p>ไม่พบออเดอร์สำหรับเบอร์ ${escapeHtml(phone)}</p></div>`;
      refreshIcons();
      return;
    }

    let html = '';
    orders.forEach(o => {
      const isWaiting = o.order_status === 'wait for order';
      const isCooking = o.order_status === 'cooking';
      const isServed = o.order_status === 'served';

      let statusBadge = `<span class="status-tag-pending"><i data-lucide="clock"></i> รอร้านรับออเดอร์</span>`;
      if (isCooking) statusBadge = `<span class="status-tag-received" style="background:#eff6ff;color:#2563eb"><i data-lucide="chef-hat"></i> ร้านกำลังปรุงอาหาร</span>`;
      if (isServed) statusBadge = `<span class="status-tag-received"><i data-lucide="check-circle"></i> พร้อมรับอาหารแล้ว!</span>`;

      html += `
        <div class="status-card" style="margin-top:12px;">
          <div class="round-header">
            <span>รหัสออเดอร์ ${o.order_id}</span>
            ${statusBadge}
          </div>
      `;

      o.items.forEach(it => {
        const optText = it.selected_options ? Object.values(it.selected_options).join(', ') : '';
        html += `
          <div class="ordered-item-line">
            <div>
              <strong>${it.name}</strong> x ${it.quantity}
              ${optText ? `<br><small class="cart-item-opts">${optText}</small>` : ''}
              ${it.custom_note ? `<br><small class="cart-item-note"><i data-lucide="sticky-note"></i> ${escapeHtml(it.custom_note)}</small>` : ''}
            </div>
            <span>${it.final_price} ฿</span>
          </div>
        `;
      });

      html += `
          <div style="margin-top:10px;padding-top:8px;border-top:1px dashed var(--border);display:flex;justify-space-between;font-weight:700;">
            <span>ยอดรวมบิล</span>
            <span style="color:var(--primary-dark)">${o.total_amount} ฿</span>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    refreshIcons();
  } catch (err) {
    console.error(err);
  }
}

function switchView(viewName) {
  const menuView = document.getElementById('menuView');
  const statusView = document.getElementById('statusView');
  const categoryNav = document.getElementById('categoryChipsNav');
  const tabMenuBtn = document.getElementById('tabMenuBtn');
  const tabStatusBtn = document.getElementById('tabStatusBtn');

  if (viewName === 'menu') {
    menuView.style.display = 'block';
    categoryNav.style.display = 'flex';
    statusView.style.display = 'none';
    tabMenuBtn.classList.add('active');
    tabStatusBtn.classList.remove('active');
  } else {
    menuView.style.display = 'none';
    categoryNav.style.display = 'none';
    statusView.style.display = 'block';
    tabMenuBtn.classList.remove('active');
    tabStatusBtn.classList.add('active');
  }
}

function handleModalOverlayClick(event, modalId) {
  if (event.target.id === modalId) {
    if (modalId === 'optionModal') closeOptionModal();
    if (modalId === 'cartModal') closeCartModal();
  }
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}
