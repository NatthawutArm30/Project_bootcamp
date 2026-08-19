const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./db');

const PORT = 3001;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
// Serve static frontend files from parent directory (Project/)
app.use(express.static(path.join(__dirname, '..')));

// Route Shortcuts
app.get('/', (req, res) => res.redirect('/owner/index.html'));
app.get('/owner', (req, res) => res.redirect('/owner/index.html'));
app.get('/customer', (req, res) => {
  const queryStr = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  res.redirect('/customer/welcome.html' + queryStr);
});
app.get('/takeaway', (req, res) => res.redirect('/customer/takeaway.html'));

// ===================================================================
// 1. SHOP API
// ===================================================================

app.get('/api/shop', async (req, res) => {
  try {
    const shop = await db.queryOne('SELECT shop_name, is_shop_open, accepts_dine_in, accepts_dine_in_tk FROM shop WHERE shop_id = 1');
    if (!shop) {
      return res.json({ name: 'ร้านอาหารตามสั่ง คุณป้า', is_shop_open: true, accepts_dine_in: true, accepts_dine_in_tk: true });
    }
    res.json({
      name: shop.shop_name,
      is_shop_open: Boolean(shop.is_shop_open),
      accepts_dine_in: Boolean(shop.accepts_dine_in),
      accepts_dine_in_tk: Boolean(shop.accepts_dine_in_tk),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/shop', async (req, res) => {
  try {
    const shop = await db.queryOne('SELECT * FROM shop WHERE shop_id = 1');
    const defaultShop = shop || { shop_name: 'ร้านอาหารตามสั่ง คุณป้า', is_shop_open: 1, accepts_dine_in: 1, accepts_dine_in_tk: 1 };

    const isOpen = typeof req.body.is_shop_open === 'boolean' ? (req.body.is_shop_open ? 1 : 0) : defaultShop.is_shop_open;
    const acceptsDineIn = typeof req.body.accepts_dine_in === 'boolean' ? (req.body.accepts_dine_in ? 1 : 0) : defaultShop.accepts_dine_in;
    const acceptsTk = typeof req.body.accepts_dine_in_tk === 'boolean' ? (req.body.accepts_dine_in_tk ? 1 : 0) : defaultShop.accepts_dine_in_tk;

    await db.execute(
      'UPDATE shop SET is_shop_open = ?, accepts_dine_in = ?, accepts_dine_in_tk = ? WHERE shop_id = 1',
      [isOpen, acceptsDineIn, acceptsTk]
    );

    io.emit('shop_status_changed');

    res.json({
      name: defaultShop.shop_name,
      is_shop_open: Boolean(isOpen),
      accepts_dine_in: Boolean(acceptsDineIn),
      accepts_dine_in_tk: Boolean(acceptsTk),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================================================================
// 2. TABLES MANAGEMENT API
// ===================================================================

// Active tables list with open sessions
app.get('/api/tables', async (req, res) => {
  try {
    const openSessions = await db.query(`
      SELECT ts.session_id, t.table_number, ts.session_status, ts.opened_at
      FROM table_sessions ts
      JOIN table_ t ON ts.table_id = t.table_id
      WHERE ts.session_status = 'available'
      ORDER BY t.table_number ASC
    `);

    const tables = await Promise.all(openSessions.map(async s => {
      // Only count orders the kitchen has confirmed — matches the totals shown
      // on the table-detail / customer bill views (wait for order stays unbilled).
      const totalRes = await db.queryOne(`
        SELECT COALESCE(SUM(oi.final_price), 0) as total
        FROM orders o
        JOIN order_items oi ON o.order_id = oi.order_id
        WHERE o.session_id = ? AND o.order_status IN ('cooking', 'served')
      `, [s.session_id]);

      const orderTotal = totalRes ? Number(totalRes.total) : 0;

      const statusCounts = await db.queryOne(`
        SELECT
          COUNT(*) as total_orders,
          SUM(CASE WHEN order_status = 'served' THEN 1 ELSE 0 END) as served_count
        FROM orders WHERE session_id = ?
      `, [s.session_id]);

      const isReadyToClose = statusCounts && Number(statusCounts.total_orders) > 0
        && Number(statusCounts.total_orders) === Number(statusCounts.served_count);

      return {
        session_id: String(s.session_id),
        table_number: s.table_number,
        is_open: true,
        status: isReadyToClose ? 'ready_to_close' : 'ordering',
        total_amount: orderTotal,
      };
    }));

    res.json(tables);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All tables defined in shop (for owner table management)
app.get('/api/tables/all', async (req, res) => {
  try {
    const allTables = await db.query('SELECT table_id, table_number FROM table_ ORDER BY table_number ASC');
    const tablesWithStatus = await Promise.all(allTables.map(async t => {
      const activeSession = await db.queryOne(
        "SELECT session_id FROM table_sessions WHERE table_id = ? AND session_status = 'available'",
        [t.table_id]
      );
      return {
        table_id: t.table_id,
        table_number: t.table_number,
        has_active_session: Boolean(activeSession),
        session_id: activeSession ? activeSession.session_id : null,
      };
    }));
    res.json(tablesWithStatus);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new table
app.post('/api/tables', async (req, res) => {
  try {
    const tableNum = parseInt(req.body.table_number, 10);
    if (!tableNum || isNaN(tableNum) || tableNum <= 0) {
      return res.status(400).json({ error: 'หมายเลขโต๊ะไม่ถูกต้อง' });
    }

    const existing = await db.queryOne('SELECT table_id FROM table_ WHERE table_number = ?', [tableNum]);
    if (existing) {
      return res.status(400).json({ error: `โต๊ะหมายเลข ${tableNum} มีอยู่แล้วในระบบ` });
    }

    const result = await db.execute('INSERT INTO table_ (shop_id, table_number) VALUES (1, ?)', [tableNum]);
    io.emit('table_list_changed');
    res.json({ ok: true, table_id: result.insertId, table_number: tableNum });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete table
app.delete('/api/tables/:id', async (req, res) => {
  try {
    const tableId = parseInt(req.params.id, 10);

    const activeSession = await db.queryOne(
      "SELECT session_id FROM table_sessions WHERE table_id = ? AND session_status = 'available'",
      [tableId]
    );
    if (activeSession) {
      return res.status(400).json({ error: 'ไม่สามารถลบโต๊ะนี้ได้ เนื่องจากมีลูกค้ากำลังใช้งานอยู่' });
    }

    await db.execute('DELETE FROM table_ WHERE table_id = ?', [tableId]);
    io.emit('table_list_changed');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================================================================
// 3. MENU & OPTIONS API
// ===================================================================

app.get('/api/menu', async (req, res) => {
  try {
    const categories = await db.query('SELECT category_id as id, categories_name as name FROM menu_categories ORDER BY category_id ASC');

    for (const cat of categories) {
      const items = await db.query('SELECT item_id as id, item_name as name, base_price, is_available FROM menu_items WHERE category_id = ?', [cat.id]);

      for (const item of items) {
        item.is_available = Boolean(item.is_available);
        const options = await db.query('SELECT options_id as id, option_name as name, is_required FROM menu_items_options WHERE item_id = ?', [item.id]);

        for (const opt of options) {
          opt.is_required = Boolean(opt.is_required);
          const choices = await db.query('SELECT choices_id as id, choices_name as name, price_delta, is_available FROM menu_items_options_choices WHERE options_id = ?', [opt.id]);
          choices.forEach(c => { c.is_available = Boolean(c.is_available); });
          opt.choices = choices;
        }

        item.options = options;
      }

      cat.items = items;
    }

    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/menu/items', async (req, res) => {
  try {
    const { category_id, name, base_price } = req.body;
    if (!name || typeof base_price !== 'number') {
      return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน' });
    }

    const result = await db.execute(
      'INSERT INTO menu_items (category_id, item_name, base_price, is_available) VALUES (?, ?, ?, 1)',
      [category_id, name, base_price]
    );

    res.json({ id: result.insertId, name, base_price, is_available: true, options: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/menu/items/:id', async (req, res) => {
  try {
    const itemId = parseInt(req.params.id, 10);
    const item = await db.queryOne('SELECT * FROM menu_items WHERE item_id = ?', [itemId]);
    if (!item) return res.status(404).json({ error: 'ไม่พบเมนูนี้' });

    const name = typeof req.body.name === 'string' ? req.body.name : item.item_name;
    const price = typeof req.body.base_price === 'number' ? req.body.base_price : item.base_price;
    const isAvail = typeof req.body.is_available === 'boolean' ? (req.body.is_available ? 1 : 0) : item.is_available;

    await db.execute(
      'UPDATE menu_items SET item_name = ?, base_price = ?, is_available = ? WHERE item_id = ?',
      [name, price, isAvail, itemId]
    );

    res.json({ id: itemId, name, base_price: price, is_available: Boolean(isAvail) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/menu/items/:itemId/options', async (req, res) => {
  try {
    const itemId = parseInt(req.params.itemId, 10);
    const { name, is_required, choices } = req.body;

    const optResult = await db.execute(
      'INSERT INTO menu_items_options (item_id, option_name, is_required) VALUES (?, ?, ?)',
      [itemId, name, is_required ? 1 : 0]
    );

    const optionId = optResult.insertId;
    const createdChoices = [];

    if (Array.isArray(choices)) {
      for (const c of choices) {
        const cRes = await db.execute(
          'INSERT INTO menu_items_options_choices (options_id, choices_name, price_delta, is_available) VALUES (?, ?, ?, 1)',
          [optionId, c.name, c.price_delta || 0]
        );
        createdChoices.push({ id: cRes.insertId, name: c.name, price_delta: c.price_delta || 0, is_available: true });
      }
    }

    res.json({ id: optionId, name, is_required: Boolean(is_required), choices: createdChoices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/menu/choices/:id', async (req, res) => {
  try {
    const choiceId = parseInt(req.params.id, 10);
    const choice = await db.queryOne('SELECT * FROM menu_items_options_choices WHERE choices_id = ?', [choiceId]);
    if (!choice) return res.status(404).json({ error: 'ไม่พบตัวเลือกนี้' });

    const isAvail = typeof req.body.is_available === 'boolean' ? (req.body.is_available ? 1 : 0) : choice.is_available;
    await db.execute('UPDATE menu_items_options_choices SET is_available = ? WHERE choices_id = ?', [isAvail, choiceId]);

    res.json({ id: choiceId, is_available: Boolean(isAvail) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================================================================
// 4. ORDERS & STATUS API (DINE-IN & TAKEAWAY)
// ===================================================================

// GET New/Active Orders for Owner
app.get('/api/orders/new', async (req, res) => {
  try {
    const activeOrders = await db.query(`
      SELECT o.order_id, o.session_id, o.order_type, o.customer_name, o.customer_phone, o.order_status, o.created_at, t.table_number
      FROM orders o
      LEFT JOIN table_sessions ts ON o.session_id = ts.session_id
      LEFT JOIN table_ t ON ts.table_id = t.table_id
      WHERE o.order_status IN ('wait for order', 'cooking')
      ORDER BY o.order_id ASC
    `);

    const formatted = await Promise.all(activeOrders.map(async o => {
      const items = await db.query(`
        SELECT oi.item_id, mi.item_name as name, oi.quantity, oi.selected_options, oi.custom_note, mi.base_price as unit_price, oi.final_price
        FROM order_items oi
        LEFT JOIN menu_items mi ON oi.item_id = mi.item_id
        WHERE oi.order_id = ?
      `, [o.order_id]);

      return {
        order_id: `O${o.order_id}`,
        raw_id: o.order_id,
        order_type: o.order_type || 'dine_in',
        table_number: o.table_number || null,
        customer_name: o.customer_name || null,
        customer_phone: o.customer_phone || null,
        order_status: o.order_status,
        created_at: o.created_at,
        items: items.map(it => ({
          name: it.name || 'รายการอาหาร',
          quantity: it.quantity,
          selected_options: it.selected_options ? (typeof it.selected_options === 'string' ? JSON.parse(it.selected_options) : it.selected_options) : {},
          custom_note: it.custom_note || '',
          unit_price: Math.round(it.final_price / it.quantity),
          final_price: it.final_price,
        })),
      };
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST Create Order (From Customer: Dine-in or Takeaway)
app.post('/api/orders', async (req, res) => {
  try {
    const { table_number, items, order_type, customer_name, customer_phone } = req.body;
    const isTakeaway = order_type === 'takeaway';

    const shop = await db.queryOne('SELECT is_shop_open, accepts_dine_in, accepts_dine_in_tk FROM shop WHERE shop_id = 1');
    if (shop && !shop.is_shop_open) {
      return res.status(400).json({ error: 'ขณะนี้ร้านปิดให้บริการสั่งอาหาร' });
    }

    if (shop && isTakeaway && !shop.accepts_dine_in_tk) {
      return res.status(400).json({ error: 'ร้านปิดรับออเดอร์กลับบ้านชั่วคราว' });
    }
    if (shop && !isTakeaway && !shop.accepts_dine_in) {
      return res.status(400).json({ error: 'ร้านปิดรับออเดอร์ทานที่ร้านชั่วคราว' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'ไม่มีรายการอาหารในคำสั่งซื้อ' });
    }

    let sessionId = null;

    if (!isTakeaway) {
      const tableNum = parseInt(table_number, 10);
      const tableObj = await db.queryOne('SELECT table_id FROM table_ WHERE table_number = ?', [tableNum]);
      if (!tableObj) {
        return res.status(400).json({ error: `ไม่พบโต๊ะหมายเลข ${table_number}` });
      }

      let activeSession = await db.queryOne("SELECT session_id FROM table_sessions WHERE table_id = ? AND session_status = 'available'", [tableObj.table_id]);
      if (!activeSession) {
        const sRes = await db.execute("INSERT INTO table_sessions (table_id, session_status) VALUES (?, 'available')", [tableObj.table_id]);
        sessionId = sRes.insertId;
      } else {
        sessionId = activeSession.session_id;
      }
    }

    const orderRes = await db.execute(`
      INSERT INTO orders (session_id, order_type, customer_name, customer_phone, order_status)
      VALUES (?, ?, ?, ?, 'wait for order')
    `, [sessionId, isTakeaway ? 'takeaway' : 'dine_in', customer_name || null, customer_phone || null]);

    const orderId = orderRes.insertId;
    const processedItems = [];

    for (const rawItem of items) {
      const itemDef = await db.queryOne('SELECT item_id, item_name, base_price, is_available FROM menu_items WHERE item_id = ?', [rawItem.item_id]);
      if (!itemDef || !itemDef.is_available) {
        return res.status(400).json({ error: `เมนู ${rawItem.name || 'ที่เลือก'} ไม่พร้อมขาย` });
      }

      const qty = Math.max(1, parseInt(rawItem.quantity, 10) || 1);
      let unitPrice = itemDef.base_price;
      const selectedOptionsMap = {};

      if (Array.isArray(rawItem.selected_choices)) {
        for (const choiceId of rawItem.selected_choices) {
          const choiceDef = await db.queryOne(`
            SELECT c.choices_name, c.price_delta, c.is_available, o.option_name
            FROM menu_items_options_choices c
            JOIN menu_items_options o ON c.options_id = o.options_id
            WHERE c.choices_id = ? AND o.item_id = ?
          `, [choiceId, itemDef.item_id]);

          if (choiceDef && choiceDef.is_available) {
            unitPrice += choiceDef.price_delta;
            if (selectedOptionsMap[choiceDef.option_name]) {
              selectedOptionsMap[choiceDef.option_name] += `, ${choiceDef.choices_name}`;
            } else {
              selectedOptionsMap[choiceDef.option_name] = choiceDef.choices_name;
            }
          }
        }
      }

      const finalPrice = unitPrice * qty;
      const optJsonStr = JSON.stringify(selectedOptionsMap);

      await db.execute(`
        INSERT INTO order_items (order_id, item_id, quantity, selected_options, custom_note, final_price)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [orderId, itemDef.item_id, qty, optJsonStr, (rawItem.custom_note || '').trim(), finalPrice]);

      processedItems.push({
        item_id: itemDef.item_id,
        name: itemDef.item_name,
        quantity: qty,
        selected_options: selectedOptionsMap,
        custom_note: rawItem.custom_note || '',
        unit_price: unitPrice,
        final_price: finalPrice,
      });
    }

    io.emit('new_order', { order_id: `O${orderId}`, table_number, order_type: isTakeaway ? 'takeaway' : 'dine_in' });

    res.json({ ok: true, order_id: `O${orderId}`, raw_id: orderId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Order Status
app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const rawId = parseInt(req.params.id.replace(/\D/g, ''), 10);
    const newStatus = req.body.status;

    if (!['wait for order', 'cooking', 'served'].includes(newStatus)) {
      return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
    }

    const result = await db.execute('UPDATE orders SET order_status = ? WHERE order_id = ?', [newStatus, rawId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'ไม่พบออเดอร์นี้' });
    }

    io.emit('order_status_changed', { order_id: `O${rawId}`, status: newStatus });
    io.emit('table_list_changed');
    res.json({ ok: true, order_id: `O${rawId}`, status: newStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Backward Compatibility endpoint for receiving order
app.patch('/api/orders/:id/receive', async (req, res) => {
  try {
    const rawId = parseInt(req.params.id.replace(/\D/g, ''), 10);
    await db.execute("UPDATE orders SET order_status = 'cooking' WHERE order_id = ?", [rawId]);
    io.emit('order_status_changed', { order_id: `O${rawId}`, status: 'cooking' });
    io.emit('table_list_changed');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Takeaway Order Query for Customer
app.get('/api/orders/takeaway/status', async (req, res) => {
  try {
    const phone = req.query.phone;
    const orderIdStr = req.query.order_id;

    let query = "SELECT order_id, customer_name, customer_phone, order_status, created_at FROM orders WHERE order_type = 'takeaway'";
    const params = [];

    if (orderIdStr) {
      const rawId = parseInt(orderIdStr.replace(/\D/g, ''), 10);
      query += " AND order_id = ?";
      params.push(rawId);
    } else if (phone) {
      query += " AND customer_phone = ?";
      params.push(phone);
    } else {
      return res.status(400).json({ error: 'กรุณาระบุหมายเลขโทรศัพท์หรือรหัสออเดอร์' });
    }

    query += " ORDER BY order_id DESC LIMIT 5";
    const orders = await db.query(query, params);

    const result = await Promise.all(orders.map(async o => {
      const items = await db.query(`
        SELECT mi.item_name as name, oi.quantity, oi.selected_options, oi.custom_note, oi.final_price
        FROM order_items oi
        JOIN menu_items mi ON oi.item_id = mi.item_id
        WHERE oi.order_id = ?
      `, [o.order_id]);

      return {
        order_id: `O${o.order_id}`,
        customer_name: o.customer_name,
        customer_phone: o.customer_phone,
        order_status: o.order_status,
        created_at: o.created_at,
        items: items.map(it => ({
          ...it,
          selected_options: it.selected_options ? (typeof it.selected_options === 'string' ? JSON.parse(it.selected_options) : it.selected_options) : {}
        })),
        total_amount: items.reduce((sum, i) => sum + Number(i.final_price), 0)
      };
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================================================================
// 5. SESSIONS & CLOSE BILL API
// ===================================================================

app.get('/api/sessions/table/:tableNumber', async (req, res) => {
  try {
    const tableNum = parseInt(req.params.tableNumber, 10);
    if (!tableNum || isNaN(tableNum) || tableNum <= 0) {
      return res.status(403).json({ error: 'หมายเลขโต๊ะไม่ถูกต้อง (Forbidden)', is_valid_table: false });
    }

    const tableObj = await db.queryOne('SELECT table_id FROM table_ WHERE table_number = ?', [tableNum]);

    if (!tableObj) {
      return res.status(403).json({ error: 'ไม่พบโต๊ะหมายเลขนี้ในระบบ (Forbidden)', is_valid_table: false });
    }

    const activeSession = await db.queryOne(
      "SELECT session_id, opened_at FROM table_sessions WHERE table_id = ? AND session_status = 'available'",
      [tableObj.table_id]
    );

    if (!activeSession) {
      return res.json({ table_number: tableNum, session: null, pending_orders: [] });
    }

    const orders = await db.query('SELECT order_id, order_status, created_at FROM orders WHERE session_id = ? ORDER BY order_id ASC', [activeSession.session_id]);

    const pendingOrders = [];
    const rounds = [];
    let runningTotal = 0;
    let roundCounter = 1;

    for (const o of orders) {
      const items = await db.query(`
        SELECT mi.item_name as name, oi.quantity, oi.selected_options, oi.custom_note, oi.final_price
        FROM order_items oi
        JOIN menu_items mi ON oi.item_id = mi.item_id
        WHERE oi.order_id = ?
      `, [o.order_id]);

      const formattedItems = items.map(it => ({
        name: it.name,
        quantity: it.quantity,
        selected_options: it.selected_options ? (typeof it.selected_options === 'string' ? JSON.parse(it.selected_options) : it.selected_options) : {},
        custom_note: it.custom_note || '',
        unit_price: Math.round(Number(it.final_price) / it.quantity),
        final_price: Number(it.final_price),
      }));

      const orderSum = items.reduce((sum, i) => sum + Number(i.final_price), 0);

      if (o.order_status === 'wait for order') {
        pendingOrders.push({
          order_id: `O${o.order_id}`,
          table_number: tableNum,
          created_at: o.created_at,
          items: formattedItems,
        });
      } else {
        runningTotal += orderSum;
        rounds.push({
          round: roundCounter++,
          order_id: `O${o.order_id}`,
          status: o.order_status,
          items: formattedItems,
        });
      }
    }

    res.json({
      table_number: tableNum,
      session: {
        session_id: String(activeSession.session_id),
        table_number: tableNum,
        is_open: true,
        status: 'ordering',
        rounds,
        total_amount: runningTotal,
      },
      pending_orders: pendingOrders,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sessions/session/:id', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const session = await db.queryOne(`
      SELECT ts.session_id, t.table_number, ts.session_status, ts.opened_at
      FROM table_sessions ts
      JOIN table_ t ON ts.table_id = t.table_id
      WHERE ts.session_id = ?
    `, [sessionId]);

    if (!session) return res.status(404).json({ error: 'ไม่พบโต๊ะนี้' });

    const pendingOrders = await db.query(
      "SELECT order_id, created_at FROM orders WHERE session_id = ? AND order_status = 'wait for order' ORDER BY order_id ASC",
      [sessionId]
    );

    const pending = await Promise.all(pendingOrders.map(async o => {
      const items = await db.query(`
        SELECT mi.item_name as name, oi.quantity, oi.selected_options, oi.custom_note, oi.final_price
        FROM order_items oi
        JOIN menu_items mi ON oi.item_id = mi.item_id
        WHERE oi.order_id = ?
      `, [o.order_id]);

      return {
        order_id: `O${o.order_id}`,
        created_at: o.created_at,
        items: items.map(i => ({
          name: i.name,
          quantity: i.quantity,
          selected_options: i.selected_options ? (typeof i.selected_options === 'string' ? JSON.parse(i.selected_options) : i.selected_options) : {},
          custom_note: i.custom_note || '',
          final_price: Number(i.final_price),
        })),
      };
    }));

    const orders = await db.query(
      "SELECT order_id, order_status FROM orders WHERE session_id = ? AND order_status IN ('cooking', 'served') ORDER BY order_id ASC",
      [sessionId]
    );

    let totalAmount = 0;
    const rounds = await Promise.all(orders.map(async (o, idx) => {
      const items = await db.query(`
        SELECT mi.item_name as name, oi.quantity, oi.selected_options, oi.custom_note, oi.final_price
        FROM order_items oi
        JOIN menu_items mi ON oi.item_id = mi.item_id
        WHERE oi.order_id = ?
      `, [o.order_id]);

      const sum = items.reduce((s, i) => s + Number(i.final_price), 0);
      totalAmount += sum;

      return {
        round: idx + 1,
        items: items.map(i => ({
          name: i.name,
          quantity: i.quantity,
          selected_options: i.selected_options ? (typeof i.selected_options === 'string' ? JSON.parse(i.selected_options) : i.selected_options) : {},
          custom_note: i.custom_note || '',
          unit_price: Math.round(Number(i.final_price) / i.quantity),
          final_price: Number(i.final_price),
        }))
      };
    }));

    res.json({
      session_id: String(session.session_id),
      table_number: session.table_number,
      is_open: session.session_status === 'available',
      status: 'ordering',
      rounds,
      pending_orders: pending,
      total_amount: totalAmount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sessions/session/:id/close', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);

    const pending = await db.queryOne(
      "SELECT COUNT(*) as count FROM orders WHERE session_id = ? AND order_status = 'wait for order'",
      [sessionId]
    );
    if (pending && Number(pending.count) > 0) {
      return res.status(400).json({ error: 'มีออเดอร์ที่ยังไม่ได้รับเข้าครัว กรุณารับออเดอร์ทั้งหมดก่อนปิดบิล' });
    }

    await db.execute("UPDATE table_sessions SET session_status = 'not available', closed_at = CURRENT_TIMESTAMP WHERE session_id = ?", [sessionId]);

    io.emit('table_list_changed');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================================================================
// 6. SALES API
// ===================================================================

// Builds a `DATE(col) ...` condition for a given period:
//   ?month=YYYY-MM   -> that whole calendar month
//   ?date=YYYY-MM-DD -> that single day
//   (neither)        -> today (server/DB local date)
function buildDateCondition(col, query) {
  if (query.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month)) {
    const [y, m] = query.month.split('-').map(Number);
    const start = `${query.month}-01`;
    const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    return { sql: `DATE(${col}) >= ? AND DATE(${col}) < ?`, params: [start, end] };
  }
  if (query.start && query.end && /^\d{4}-\d{2}-\d{2}$/.test(query.start) && /^\d{4}-\d{2}-\d{2}$/.test(query.end)) {
    return { sql: `DATE(${col}) >= ? AND DATE(${col}) <= ?`, params: [query.start, query.end] };
  }
  if (query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date)) {
    return { sql: `DATE(${col}) = ?`, params: [query.date] };
  }
  return { sql: `DATE(${col}) = CURDATE()`, params: [] };
}

app.get('/api/sales', async (req, res) => {
  try {
    // Sales are recognized on the day/month a dine-in bill was closed or a
    // takeaway order was served — not when the order was first placed.
    const billCond = buildDateCondition('closed_at', req.query);
    const billRes = await db.queryOne(
      `SELECT COUNT(*) as count FROM table_sessions WHERE session_status = 'not available' AND ${billCond.sql}`,
      billCond.params
    );
    const dineInBillCount = billRes ? Number(billRes.count) : 0;

    const tkBillCond = buildDateCondition('created_at', req.query);
    const tkBillRes = await db.queryOne(
      `SELECT COUNT(*) as count FROM orders WHERE order_type = 'takeaway' AND order_status = 'served' AND ${tkBillCond.sql}`,
      tkBillCond.params
    );
    const tkBillCount = tkBillRes ? Number(tkBillRes.count) : 0;

    const totalBillCount = dineInBillCount + tkBillCount;

    const dineInTotalCond = buildDateCondition('ts.closed_at', req.query);
    const dineInTotalRes = await db.queryOne(`
      SELECT COALESCE(SUM(oi.final_price), 0) as total
      FROM table_sessions ts
      JOIN orders o ON ts.session_id = o.session_id
      JOIN order_items oi ON o.order_id = oi.order_id
      WHERE ts.session_status = 'not available' AND ${dineInTotalCond.sql}
    `, dineInTotalCond.params);
    const dineInTotal = dineInTotalRes ? Number(dineInTotalRes.total) : 0;

    const tkTotalCond = buildDateCondition('o.created_at', req.query);
    const tkTotalRes = await db.queryOne(`
      SELECT COALESCE(SUM(oi.final_price), 0) as total
      FROM orders o
      JOIN order_items oi ON o.order_id = oi.order_id
      WHERE o.order_type = 'takeaway' AND o.order_status = 'served' AND ${tkTotalCond.sql}
    `, tkTotalCond.params);
    const tkTotal = tkTotalRes ? Number(tkTotalRes.total) : 0;

    const totalAmount = dineInTotal + tkTotal;

    const topItemsCond1 = buildDateCondition('ts.closed_at', req.query);
    const topItemsCond2 = buildDateCondition('o.created_at', req.query);
    const topItems = await db.query(`
      SELECT mi.item_name as name, CAST(SUM(oi.quantity) AS SIGNED) as qty
      FROM order_items oi
      JOIN menu_items mi ON oi.item_id = mi.item_id
      JOIN orders o ON oi.order_id = o.order_id
      LEFT JOIN table_sessions ts ON o.session_id = ts.session_id
      WHERE (ts.session_status = 'not available' AND ${topItemsCond1.sql})
         OR (o.order_type = 'takeaway' AND o.order_status = 'served' AND ${topItemsCond2.sql})
      GROUP BY oi.item_id, mi.item_name
      ORDER BY qty DESC
      LIMIT 5
    `, [...topItemsCond1.params, ...topItemsCond2.params]);

    res.json({
      total_amount: totalAmount,
      bill_count: totalBillCount,
      top_items: topItems.map(i => ({ name: i.name, qty: Number(i.qty) })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================================================================
// SOCKET.IO
// ===================================================================

io.on('connection', (socket) => {
  socket.on('join_shop', () => {
    socket.join('shop');
  });
});

// ===================================================================
// 7. ADMIN / GARBAGE CLEANUP TEST API
// ===================================================================

app.post('/api/admin/clean-old-records', async (req, res) => {
  try {
    const days = req.body && req.body.days !== undefined ? parseInt(req.body.days, 10) : 7;
    const force = req.body && req.body.force === true;
    const result = await db.cleanOldRecords(days, force);
    res.json({
      ok: true,
      ...result,
      message: force
        ? `ลบประวัติออเดอร์และเซสชันที่ปิดแล้วทั้งหมดเรียบร้อยแล้ว (เซสชัน: ${result.cleaned_sessions}, ออเดอร์กลับบ้าน: ${result.cleaned_takeaways})`
        : `ลบข้อมูลเก่ากว่า ${days} วันเรียบร้อยแล้ว (เซสชัน: ${result.cleaned_sessions}, ออเดอร์กลับบ้าน: ${result.cleaned_takeaways})`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/seed-test-old-data', async (req, res) => {
  try {
    const result = await db.seedTestOldData();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
