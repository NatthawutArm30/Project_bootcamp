// server/db.js — MySQL Database driver using mysql2
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'resterant',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Retention for the automatic daily cleanup — keeps sales history around for
// reporting (e.g. the owner's month-by-month sales view) instead of the old
// 7-day default, which was silently deleting last month's data every night.
const AUTO_CLEANUP_RETENTION_DAYS = 3 * 365;

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

async function execute(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

async function cleanOldRecords(daysThreshold = 7, forceCleanClosed = false) {
  try {
    let cleanedSessions = 0;
    let cleanedTakeaways = 0;

    if (forceCleanClosed) {
      // 1. Delete order_items of closed sessions
      await pool.query(`
        DELETE oi FROM order_items oi
        JOIN orders o ON oi.order_id = o.order_id
        JOIN table_sessions ts ON o.session_id = ts.session_id
        WHERE ts.session_status = 'not available'
      `);
      // 2. Delete orders of closed sessions
      await pool.query(`
        DELETE o FROM orders o
        JOIN table_sessions ts ON o.session_id = ts.session_id
        WHERE ts.session_status = 'not available'
      `);
      // 3. Delete closed table sessions
      const [sRes] = await pool.query(
        "DELETE FROM table_sessions WHERE session_status = 'not available'"
      );
      cleanedSessions = sRes ? sRes.affectedRows : 0;

      // 4. Delete order_items of completed takeaway orders
      await pool.query(`
        DELETE oi FROM order_items oi
        JOIN orders o ON oi.order_id = o.order_id
        WHERE o.order_type = 'takeaway' AND o.order_status = 'served'
      `);
      // 5. Delete completed takeaway orders
      const [tkRes] = await pool.query(
        "DELETE FROM orders WHERE order_type = 'takeaway' AND order_status = 'served'"
      );
      cleanedTakeaways = tkRes ? tkRes.affectedRows : 0;
    } else {
      const days = parseInt(daysThreshold, 10) || 7;

      // 1. Delete order_items of closed sessions older than N days
      await pool.query(`
        DELETE oi FROM order_items oi
        JOIN orders o ON oi.order_id = o.order_id
        JOIN table_sessions ts ON o.session_id = ts.session_id
        WHERE ts.session_status = 'not available' AND ts.closed_at IS NOT NULL AND ts.closed_at < NOW() - INTERVAL ? DAY
      `, [days]);

      // 2. Delete orders of closed sessions older than N days
      await pool.query(`
        DELETE o FROM orders o
        JOIN table_sessions ts ON o.session_id = ts.session_id
        WHERE ts.session_status = 'not available' AND ts.closed_at IS NOT NULL AND ts.closed_at < NOW() - INTERVAL ? DAY
      `, [days]);

      // 3. Delete closed table sessions older than N days
      const [sRes] = await pool.query(`
        DELETE FROM table_sessions
        WHERE session_status = 'not available' AND closed_at IS NOT NULL AND closed_at < NOW() - INTERVAL ? DAY
      `, [days]);
      cleanedSessions = sRes ? sRes.affectedRows : 0;

      // 4. Delete order_items of completed takeaway orders older than N days
      await pool.query(`
        DELETE oi FROM order_items oi
        JOIN orders o ON oi.order_id = o.order_id
        WHERE o.order_type = 'takeaway' AND o.order_status = 'served' AND o.created_at < NOW() - INTERVAL ? DAY
      `, [days]);

      // 5. Delete completed takeaway orders older than N days
      const [tkRes] = await pool.query(`
        DELETE FROM orders
        WHERE order_type = 'takeaway' AND order_status = 'served' AND created_at < NOW() - INTERVAL ? DAY
      `, [days]);
      cleanedTakeaways = tkRes ? tkRes.affectedRows : 0;
    }

    if (cleanedSessions > 0 || cleanedTakeaways > 0) {
      console.log(`Cleaned old database records (Sessions: ${cleanedSessions}, Takeaway Orders: ${cleanedTakeaways}).`);
    }

    return { cleaned_sessions: cleanedSessions, cleaned_takeaways: cleanedTakeaways };
  } catch (err) {
    console.error('Error auto-cleaning old database records:', err.message);
    throw err;
  }
}

async function seedTestOldData() {
  try {
    // 1. Ensure table 1 exists
    let table = await queryOne('SELECT table_id FROM table_ WHERE table_number = 1');
    if (!table) {
      const tRes = await execute('INSERT INTO table_ (shop_id, table_number) VALUES (1, 1)');
      table = { table_id: tRes.insertId };
    }

    // 2. Create old closed table session (8 days ago)
    const sRes = await execute(`
      INSERT INTO table_sessions (table_id, session_status, opened_at, closed_at)
      VALUES (?, 'not available', NOW() - INTERVAL 8 DAY, NOW() - INTERVAL 8 DAY)
    `, [table.table_id]);
    const oldSessionId = sRes.insertId;

    // 3. Create old order for this session
    const oRes = await execute(`
      INSERT INTO orders (session_id, order_type, customer_name, order_status, created_at)
      VALUES (?, 'dine_in', 'ลูกค้าทดสอบข้อมูลเก่า (8 วัน)', 'served', NOW() - INTERVAL 8 DAY)
    `, [oldSessionId]);
    const oldOrderId = oRes.insertId;

    await execute(`
      INSERT INTO order_items (order_id, item_id, quantity, selected_options, custom_note, final_price)
      VALUES (?, 1, 1, '{"ระดับความเผ็ด":"เผ็ดปกติ"}', 'ทดสอบลบขยะ', 50)
    `, [oldOrderId]);

    // 4. Create old takeaway order (8 days ago)
    const tkRes = await execute(`
      INSERT INTO orders (session_id, order_type, customer_name, customer_phone, order_status, created_at)
      VALUES (NULL, 'takeaway', 'ลูกค้ากลับบ้านทดสอบ (8 วัน)', '0812345678', 'served', NOW() - INTERVAL 8 DAY)
    `, []);
    const oldTkOrderId = tkRes.insertId;

    await execute(`
      INSERT INTO order_items (order_id, item_id, quantity, selected_options, custom_note, final_price)
      VALUES (?, 2, 2, '{}', 'ทดสอบลบขยะกลับบ้าน', 90)
    `, [oldTkOrderId]);

    console.log('Seeded test old data older than 8 days successfully.');
    return { ok: true, seeded_sessions: 1, seeded_takeaway: 1, message: 'สร้างข้อมูลทดสอบย้อนหลัง 8 วันเรียบร้อยแล้ว' };
  } catch (err) {
    console.error('Error seeding test old data:', err.message);
    throw err;
  }
}

async function initDB() {
  try {
    const conn = await pool.getConnection();
    console.log('Connected to MySQL database "resterant" successfully.');
    conn.release();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shop (
        shop_id INT AUTO_INCREMENT PRIMARY KEY,
        shop_name VARCHAR(255) DEFAULT 'ร้านอาหารตามสั่ง คุณป้า',
        is_shop_open TINYINT(1) NOT NULL DEFAULT 1,
        accepts_dine_in TINYINT(1) NOT NULL DEFAULT 1,
        accepts_dine_in_tk TINYINT(1) NOT NULL DEFAULT 1
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS table_ (
        table_id INT AUTO_INCREMENT PRIMARY KEY,
        shop_id INT DEFAULT 1,
        table_number INT UNIQUE NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS table_sessions (
        session_id INT AUTO_INCREMENT PRIMARY KEY,
        table_id INT DEFAULT NULL,
        session_status ENUM('available','not available') DEFAULT 'available',
        opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        closed_at DATETIME DEFAULT NULL,
        CONSTRAINT fk_table_sessions_table_id FOREIGN KEY (table_id) REFERENCES table_ (table_id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS menu_categories (
        category_id INT AUTO_INCREMENT PRIMARY KEY,
        categories_name VARCHAR(255) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS menu_items (
        item_id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT,
        item_name VARCHAR(255) NOT NULL,
        base_price INT NOT NULL,
        is_available TINYINT(1) NOT NULL DEFAULT 1,
        FOREIGN KEY (category_id) REFERENCES menu_categories (category_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS menu_items_options (
        options_id INT AUTO_INCREMENT PRIMARY KEY,
        item_id INT,
        option_name VARCHAR(255) NOT NULL,
        is_required TINYINT(1) NOT NULL DEFAULT 1,
        FOREIGN KEY (item_id) REFERENCES menu_items (item_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS menu_items_options_choices (
        choices_id INT AUTO_INCREMENT PRIMARY KEY,
        options_id INT,
        choices_name VARCHAR(255) NOT NULL,
        price_delta INT NOT NULL DEFAULT 0,
        is_available TINYINT(1) NOT NULL DEFAULT 1,
        FOREIGN KEY (options_id) REFERENCES menu_items_options (options_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        order_id INT AUTO_INCREMENT PRIMARY KEY,
        session_id INT DEFAULT NULL,
        order_type ENUM('dine_in','takeaway') DEFAULT 'dine_in',
        customer_name VARCHAR(255) DEFAULT NULL,
        customer_phone VARCHAR(255) DEFAULT NULL,
        order_status ENUM('wait for order','cooking','served') DEFAULT 'wait for order',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES table_sessions (session_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        orderitem_id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        item_id INT DEFAULT NULL,
        quantity INT NOT NULL DEFAULT 1,
        selected_options TEXT DEFAULT NULL,
        custom_note TEXT DEFAULT NULL,
        final_price INT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders (order_id) ON DELETE CASCADE,
        FOREIGN KEY (item_id) REFERENCES menu_items (item_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Schema column expansions & AUTO_INCREMENT updates
    const alterQueries = [
      "ALTER TABLE `shop` MODIFY `shop_id` INT AUTO_INCREMENT;",
      "ALTER TABLE `shop` MODIFY `shop_name` VARCHAR(255) DEFAULT 'ร้านอาหารตามสั่ง คุณป้า';",
      "ALTER TABLE `table_` MODIFY `table_id` INT AUTO_INCREMENT;",
      "ALTER TABLE `table_sessions` MODIFY `session_id` INT AUTO_INCREMENT;",
      "ALTER TABLE `menu_categories` MODIFY `category_id` INT AUTO_INCREMENT;",
      "ALTER TABLE `menu_categories` MODIFY `categories_name` VARCHAR(255);",
      "ALTER TABLE `menu_items` MODIFY `item_id` INT AUTO_INCREMENT;",
      "ALTER TABLE `menu_items` MODIFY `item_name` VARCHAR(255);",
      "ALTER TABLE `menu_items_options` MODIFY `options_id` INT AUTO_INCREMENT;",
      "ALTER TABLE `menu_items_options` MODIFY `option_name` VARCHAR(255);",
      "ALTER TABLE `menu_items_options_choices` MODIFY `choices_id` INT AUTO_INCREMENT;",
      "ALTER TABLE `menu_items_options_choices` MODIFY `choices_name` VARCHAR(255);",
      "ALTER TABLE `orders` MODIFY `order_id` INT AUTO_INCREMENT;",
      "ALTER TABLE `order_items` MODIFY `orderitem_id` INT AUTO_INCREMENT;",
      "ALTER TABLE `order_items` MODIFY `selected_options` TEXT DEFAULT NULL;",
      "ALTER TABLE `orders` ADD COLUMN `order_type` ENUM('dine_in','takeaway') DEFAULT 'dine_in';",
      "ALTER TABLE `orders` ADD COLUMN `customer_name` VARCHAR(255) DEFAULT NULL;",
      "ALTER TABLE `orders` ADD COLUMN `customer_phone` VARCHAR(255) DEFAULT NULL;"
    ];

    for (const q of alterQueries) {
      try {
        await pool.query(q);
      } catch (err) {
        // Ignore if column already exists or updated
      }
    }

    // Fix shop name truncation if it was truncated previously
    await pool.query("UPDATE shop SET shop_name = 'ร้านอาหารตามสั่ง คุณป้า' WHERE shop_id = 1 AND (shop_name LIKE 'ร้านอาหารตามสั่ง%' OR shop_name IS NULL);");

    // Deleting a table used to CASCADE-delete every session/order/order_item
    // ever recorded for it (wiping sales history). Re-point the FK to
    // ON DELETE SET NULL so deleting a table just orphans old sessions
    // instead of destroying their history.
    try {
      const [fkRows] = await pool.query(`
        SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'table_sessions'
          AND COLUMN_NAME = 'table_id' AND REFERENCED_TABLE_NAME = 'table_'
      `);
      for (const row of fkRows) {
        await pool.query(`ALTER TABLE table_sessions DROP FOREIGN KEY \`${row.CONSTRAINT_NAME}\``);
      }
      await pool.query(`
        ALTER TABLE table_sessions
        ADD CONSTRAINT fk_table_sessions_table_id
        FOREIGN KEY (table_id) REFERENCES table_ (table_id) ON DELETE SET NULL
      `);
    } catch (err) {
      // Already migrated (constraint name fk_table_sessions_table_id exists) — ignore
    }

    await seedDefaultData();
    await cleanOldRecords(AUTO_CLEANUP_RETENTION_DAYS);

    // Schedule daily cleanup of records older than the retention period (every 24 hours)
    setInterval(() => cleanOldRecords(AUTO_CLEANUP_RETENTION_DAYS), 24 * 60 * 60 * 1000);
  } catch (err) {
    console.error('Error connecting or initializing MySQL database:', err.message);
  }
}

async function seedDefaultData() {
  try {
    const [shops] = await pool.query('SELECT COUNT(*) as count FROM shop');
    if (shops[0].count === 0) {
      await pool.query(`
        INSERT INTO shop (shop_name, is_shop_open, accepts_dine_in, accepts_dine_in_tk)
        VALUES ('ร้านอาหารตามสั่ง คุณป้า', 1, 1, 1)
      `);
    }

    // Clean up duplicate table numbers if any existed previously
    try {
      await pool.query(`
        DELETE t1 FROM table_ t1
        INNER JOIN table_ t2 
        WHERE t1.table_id > t2.table_id AND t1.table_number = t2.table_number
      `);
      await pool.query('ALTER TABLE table_ ADD UNIQUE INDEX idx_table_number (table_number)');
    } catch (err) {
      // Ignore if index already exists
    }

    // Default to 6 tables (tables 1 to 6)
    for (let t = 1; t <= 6; t++) {
      await pool.query('INSERT IGNORE INTO table_ (shop_id, table_number) VALUES (1, ?)', [t]);
    }

    const [cats] = await pool.query('SELECT COUNT(*) as count FROM menu_categories');
    if (cats[0].count === 0) {
      await pool.query("INSERT IGNORE INTO menu_categories (category_id, categories_name) VALUES (1, 'อาหารจานเดียว'), (2, 'ของทานเล่น'), (3, 'เครื่องดื่ม')");

      await pool.query("INSERT IGNORE INTO menu_items (item_id, category_id, item_name, base_price, is_available) VALUES (1, 1, 'ผัดกะเพราหมูสับ', 50, 1)");
      await pool.query("INSERT IGNORE INTO menu_items (item_id, category_id, item_name, base_price, is_available) VALUES (2, 1, 'ข้าวผัดหมู', 45, 1)");
      await pool.query("INSERT IGNORE INTO menu_items (item_id, category_id, item_name, base_price, is_available) VALUES (3, 1, 'ผัดซีอิ๊ว', 45, 0)");
      await pool.query("INSERT IGNORE INTO menu_items (item_id, category_id, item_name, base_price, is_available) VALUES (4, 2, 'ปีกไก่ทอด', 60, 1)");
      await pool.query("INSERT IGNORE INTO menu_items (item_id, category_id, item_name, base_price, is_available) VALUES (5, 2, 'เกี๊ยวกรอบ', 40, 1)");
      await pool.query("INSERT IGNORE INTO menu_items (item_id, category_id, item_name, base_price, is_available) VALUES (6, 3, 'ชาเย็น', 25, 1)");
      await pool.query("INSERT IGNORE INTO menu_items (item_id, category_id, item_name, base_price, is_available) VALUES (7, 3, 'น้ำเปล่า', 10, 1)");

      await pool.query("INSERT IGNORE INTO menu_items_options (options_id, item_id, option_name, is_required) VALUES (1, 1, 'ระดับความเผ็ด', 1)");
      await pool.query("INSERT IGNORE INTO menu_items_options_choices (choices_id, options_id, choices_name, price_delta, is_available) VALUES (1, 1, 'เผ็ดน้อย', 0, 1)");
      await pool.query("INSERT IGNORE INTO menu_items_options_choices (choices_id, options_id, choices_name, price_delta, is_available) VALUES (2, 1, 'เผ็ดปกติ', 0, 1)");
      await pool.query("INSERT IGNORE INTO menu_items_options_choices (choices_id, options_id, choices_name, price_delta, is_available) VALUES (3, 1, 'เผ็ดมาก', 0, 1)");

      await pool.query("INSERT IGNORE INTO menu_items_options (options_id, item_id, option_name, is_required) VALUES (2, 1, 'เพิ่มไข่ดาว', 0)");
      await pool.query("INSERT IGNORE INTO menu_items_options_choices (choices_id, options_id, choices_name, price_delta, is_available) VALUES (4, 2, 'ไข่ดาว', 10, 1)");

      await pool.query("INSERT IGNORE INTO menu_items_options (options_id, item_id, option_name, is_required) VALUES (3, 6, 'ความหวาน', 1)");
      await pool.query("INSERT IGNORE INTO menu_items_options_choices (choices_id, options_id, choices_name, price_delta, is_available) VALUES (5, 3, 'หวานน้อย', 0, 1)");
      await pool.query("INSERT IGNORE INTO menu_items_options_choices (choices_id, options_id, choices_name, price_delta, is_available) VALUES (6, 3, 'หวานปกติ', 0, 1)");
    }
  } catch (err) {
    console.error('Seed data info:', err.message);
  }
}

initDB();

module.exports = {
  pool,
  query,
  queryOne,
  execute,
  cleanOldRecords,
  seedTestOldData,
};
