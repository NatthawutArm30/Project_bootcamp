// js/customer.js — Client logic for Customer Web App

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

// Parse table number from URL (e.g. customer.html?table=5)
function getTableNumber() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('table')) {
    const raw = urlParams.get('table');
    const table = parseInt(raw, 10);
    if (!table || isNaN(table) || table <= 0) {
      return null; // Invalid format
    }
    return table;
  }
  return 1; // Default table 1
}

const currentTableNum = getTableNumber();
let isForbiddenTable = currentTableNum === null;

// App State
let shopInfo = { name: 'ร้านอาหารตามสั่ง', is_shop_open: true, accepts_dine_in: true };
let menuCategories = [];
let activeCategory = 'all';
let cart = [];
let tableSessionData = null; // { table_number, session, pending_orders }

// Active Modal State
let currentModalItem = null;
let modalQty = 1;
let selectedChoiceIds = new Set();

// Socket.IO
let socket = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  const tableDisplayEl = document.getElementById('tableNumDisplay');
  const cartTableEl = document.getElementById('cartTableNum');
  const tableBadgeEl = document.getElementById('tableBadge');

  if (isForbiddenTable) {
    if (tableDisplayEl) tableDisplayEl.textContent = 'ไม่ถูกต้อง';
    if (cartTableEl) cartTableEl.textContent = 'ไม่ถูกต้อง';
    if (tableBadgeEl) {
      tableBadgeEl.style.background = '#ffebe9';
      tableBadgeEl.style.color = '#a40e26';
      tableBadgeEl.style.borderColor = '#ff8182';
      tableBadgeEl.innerHTML = '<i data-lucide="triangle-alert"></i> โต๊ะไม่ถูกต้อง';
    }
  } else {
    if (tableDisplayEl) tableDisplayEl.textContent = currentTableNum;
    if (cartTableEl) cartTableEl.textContent = currentTableNum;
  }

  initSocket();
  loadAllData();
  refreshIcons();
});

function initSocket() {
  if (typeof io !== 'undefined' && currentTableNum) {
    socket = io();
    socket.on('connect', () => {
      console.log('Socket connected for table', currentTableNum);
    });

    socket.on('new_order', () => {
      fetchTableStatus();
    });

    socket.on('table_list_changed', () => {
      fetchTableStatus();
    });

    socket.on('shop_status_changed', () => {
      fetchShopInfo();
    });
  }
}

async function loadAllData() {
  if (isForbiddenTable) {
    renderForbiddenTableUI();
    return;
  }
  await Promise.all([fetchShopInfo(), fetchMenu(), fetchTableStatus()]);
}

// ===== API Requests =====

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

async function fetchTableStatus() {
  if (isForbiddenTable) {
    renderForbiddenTableUI();
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/sessions/table/${currentTableNum}`);
    if (res.status === 403 || res.status === 400) {
      isForbiddenTable = true;
      renderForbiddenTableUI();
      return;
    }
    if (!res.ok) throw new Error('Failed to fetch table status');
    tableSessionData = await res.json();
    renderTableStatus();
  } catch (err) {
    console.error('Error loading table status:', err);
  }
}

function renderForbiddenTableUI() {
  isForbiddenTable = true;

  const banner = document.getElementById('closedBanner');
  if (banner) {
    const urlParams = new URLSearchParams(window.location.search);
    const rawNum = urlParams.get('table') || currentTableNum || 'ไม่ถูกต้อง';
    banner.innerHTML = `
      <div style="text-align: center; width: 100%; padding: 24px 16px; background-color: #ffebe9; border: 2px solid #ff8182; border-radius: 12px; margin: 10px 0; color: #a40e26; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.15);">
        <div style="font-size: 2.8rem; margin-bottom: 8px;"><i data-lucide="ban"></i> 403 Forbidden</div>
        <h3 style="margin: 0 0 8px 0; font-size: 1.25rem; font-weight: bold;">ไม่พบหมายเลขโต๊ะนี้ในระบบ</h3>
        <p style="margin: 0; font-size: 0.95rem; color: #5c1d24; line-height: 1.5;">
          โต๊ะหมายเลข <strong>${escapeHtml(rawNum)}</strong> ไม่มีอยู่จริงในระบบของร้าน<br>
          กรุณาสแกน QR Code ประจำโต๊ะที่ทางร้านจัดไว้ใหม่อีกครั้ง
        </p>
      </div>
    `;
    banner.style.display = 'flex';
  }

  const tableBadgeEl = document.getElementById('tableBadge');
  if (tableBadgeEl) {
    tableBadgeEl.style.background = '#ffebe9';
    tableBadgeEl.style.color = '#a40e26';
    tableBadgeEl.style.borderColor = '#ff8182';
    tableBadgeEl.innerHTML = '<i data-lucide="triangle-alert"></i> โต๊ะไม่ถูกต้อง';
  }

  const floatingCart = document.getElementById('cartFloatingBar');
  if (floatingCart) floatingCart.style.display = 'none';

  // Disable add buttons
  const addBtns = document.querySelectorAll('.add-btn');
  addBtns.forEach(btn => {
    btn.disabled = true;
    btn.textContent = 'โต๊ะไม่ถูกต้อง';
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
  });

  const menuContainer = document.getElementById('menuContainer');
  if (menuContainer) {
    menuContainer.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: #888;">
        <div style="font-size: 3rem; margin-bottom: 12px;"><i data-lucide="ban"></i></div>
        <h3 style="margin-bottom: 8px; color: #d32f2f;">ไม่สามารถสั่งอาหารได้</h3>
        <p style="font-size: 0.95rem;">เนื่องจากหมายเลขโต๊ะไม่ถูกต้องหรือไม่มีอยู่จริงในระบบ</p>
      </div>
    `;
  }

  const statusContainer = document.getElementById('statusContainer');
  if (statusContainer) {
    statusContainer.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: #888;">
        <div style="font-size: 3rem; margin-bottom: 12px;"><i data-lucide="ban"></i></div>
        <h3 style="margin-bottom: 8px; color: #d32f2f;">ไม่พบรายการที่สั่ง</h3>
        <p style="font-size: 0.95rem;">โต๊ะนี้ไม่มีอยู่จริงในระบบของร้าน</p>
      </div>
    `;
  }

  refreshIcons();
}

// ===== Render UI =====

function renderShopStatus() {
  document.getElementById('shopName').textContent = shopInfo.name || 'ร้านอาหารตามสั่ง';

  const badge = document.getElementById('shopStatusBadge');
  const text = document.getElementById('shopStatusText');
  const banner = document.getElementById('closedBanner');

  const isOpen = shopInfo.is_shop_open && shopInfo.accepts_dine_in;

  if (isOpen) {
    badge.className = 'shop-status-tag open';
    text.textContent = 'เปิดรับออเดอร์';
    banner.style.display = 'none';
  } else {
    badge.className = 'shop-status-tag closed';
    text.textContent = 'ร้านปิด';
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
      const isAvail = item.is_available && shopInfo.is_shop_open && shopInfo.accepts_dine_in;
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

// ===== Customization Option Modal =====

function openOptionModal(itemId) {
  if (isForbiddenTable) {
    alert('ไม่สามารถเลือกรายการได้ เนื่องจากหมายเลขโต๊ะไม่ถูกต้องหรือไม่มีอยู่จริงในระบบ');
    return;
  }
  let foundItem = null;
  for (const cat of menuCategories) {
    const it = cat.items.find(i => i.id === itemId);
    if (it) { foundItem = it; break; }
  }

  if (!foundItem) return;

  currentModalItem = foundItem;
  modalQty = 1;
  selectedChoiceIds.clear();

  // Set defaults for required options
  if (foundItem.options) {
    foundItem.options.forEach(opt => {
      if (opt.is_required && opt.choices && opt.choices.length > 0) {
        // Select first available choice by default
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
    // Uncheck other choices in this option group
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

  // Validate required options
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

  // Calculate unit price & selected choice details
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

  // Create unique cart ID
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

// ===== Floating Cart Bar & Modal =====

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
  if (isForbiddenTable) {
    alert('ไม่สามารถเปิดตะกร้าได้ เนื่องจากหมายเลขโต๊ะไม่ถูกต้องหรือไม่มีอยู่จริงในระบบ');
    return;
  }
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
    container.innerHTML = `<div class="empty-state"><div class="empty-icon"><i data-lucide="shopping-cart"></i></div><p>ยังไม่มีรายการในตะกร้า</p></div>`;
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
  if (cart.length === 0) {
    closeCartModal();
  }
}

// ===== Submit Order =====

async function submitCustomerOrder() {
  if (isForbiddenTable) {
    alert('ไม่สามารถส่งคำสั่งซื้อได้ เนื่องจากหมายเลขโต๊ะไม่ถูกต้องหรือไม่มีอยู่จริงในระบบ');
    return;
  }
  if (cart.length === 0) return;

  const submitBtn = document.getElementById('submitOrderBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'กำลังส่งออเดอร์...';

  try {
    const payload = {
      table_number: currentTableNum,
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

    cart = [];
    updateCartFloatingBar();
    closeCartModal();

    await fetchTableStatus();
    switchView('status');
    showToast('ส่งออเดอร์ไปยังร้านเรียบร้อยแล้ว!');

  } catch (err) {
    alert(err.message || 'เกิดข้อผิดพลาดในการส่งออเดอร์');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i data-lucide="send"></i> ยืนยันส่งออเดอร์';
    refreshIcons();
  }
}

// ===== View Switcher & Table Status View =====

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

    fetchTableStatus();
  }
}

function renderTableStatus() {
  const container = document.getElementById('statusContainer');
  const orderCountBadge = document.getElementById('tabOrderCountBadge');

  if (!tableSessionData) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon"><i data-lucide="loader"></i></div><p>กำลังโหลดข้อมูล...</p></div>`;
    refreshIcons();
    return;
  }

  const { session, pending_orders } = tableSessionData;
  const hasPending = pending_orders && pending_orders.length > 0;
  const hasRounds = session && session.rounds && session.rounds.length > 0;

  const totalOrdersCount = (pending_orders ? pending_orders.length : 0) + (session && session.rounds ? session.rounds.length : 0);

  if (totalOrdersCount > 0) {
    orderCountBadge.textContent = totalOrdersCount;
    orderCountBadge.style.display = 'inline-block';
  } else {
    orderCountBadge.style.display = 'none';
  }

  if (!hasPending && !hasRounds) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i data-lucide="utensils"></i></div>
        <p>ยังไม่มีรายการอาหารที่สั่งในโต๊ะนี้</p>
        <button class="add-btn" style="margin-top: 12px;" onclick="switchView('menu')">ไปที่เมนูอาหาร</button>
      </div>
    `;
    refreshIcons();
    return;
  }

  let html = '';

  // 1. Running Bill Total Banner
  if (session) {
    html += `
      <div class="bill-summary-card">
        <div class="bill-total-row">
          <span><i data-lucide="banknote"></i> ยอดรวมโต๊ะนี้</span>
          <span>${session.total_amount || 0} ฿</span>
        </div>
      </div>
    `;
  }

  // 2. Pending Orders Section (กำลังรอร้านรับออเดอร์)
  if (hasPending) {
    pending_orders.forEach((ord) => {
      html += `
        <div class="status-card">
          <div class="round-header">
            <span>ออเดอร์ ${ord.order_id}</span>
            <span class="status-tag-pending"><i data-lucide="clock"></i> รอร้านรับออเดอร์</span>
          </div>
      `;

      ord.items.forEach((it) => {
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

      html += `</div>`;
    });
  }

  // 3. Confirmed Rounds Section (ร้านรับออเดอร์แล้ว)
  if (hasRounds) {
    session.rounds.forEach((rd) => {
      html += `
        <div class="status-card">
          <div class="round-header">
            <span>รอบที่ ${rd.round}</span>
            <span class="status-tag-received"><i data-lucide="check-circle"></i> ร้านรับออเดอร์แล้ว</span>
          </div>
      `;

      rd.items.forEach((it) => {
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

      html += `</div>`;
    });
  }

  container.innerHTML = html;
  refreshIcons();
}

// ===== Utility Helpers =====

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
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}
