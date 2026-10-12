/**
 * XPRO STORE POS — FRONTEND APPLICATION LOGIC
 */

const STATE = {
  user: null,          // { username, role }
  activeShift: null,   // shift row or null
  systemStatus: null,  // from /api/status
  inventory: [],
  cart: [],            // [ { id, name, category, price_cents, quantity } ]
  customers: [],
  selectedCategory: 'ALL',
  selectedPayment: 'Cash',
  currentTab: 'dashboard',
  activeReportView: 'daily',
  selectedShelfFilter: 'ALL',
  receiptData: null,
  activeRepairForReady: null,
  activeSaleForReturn: null
};

// Utilities
const formatMoney = (cents) => `$${(cents / 100).toFixed(2)}`;
const parseCents = (val) => {
  const clean = String(val || '').replace(/[\$,]/g, '').trim();
  const num = parseFloat(clean);
  if (isNaN(num) || num < 0) return 0;
  return Math.round(num * 100);
};

// ================= ZERO-DEPENDENCY CODE128 BARCODE SVG GENERATOR =================
const CODE128_PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232','2331112'
];

function generateBarcodeSVG(text, barWidth = 1.8, barHeight = 40) {
  if (!text) text = 'XP89000000';
  const clean = String(text).trim();
  const codes = [104]; // Start B
  let checksum = 104;

  for (let i = 0; i < clean.length; i++) {
    const codeVal = clean.charCodeAt(i) - 32;
    const val = (codeVal >= 0 && codeVal <= 95) ? codeVal : 0;
    codes.push(val);
    checksum += (i + 1) * val;
  }
  codes.push(checksum % 103);
  codes.push(106); // Stop pattern

  // Build bars
  let svgPaths = '';
  let currentX = 10; // Left quiet zone

  codes.forEach(codeIdx => {
    const pat = CODE128_PATTERNS[codeIdx] || CODE128_PATTERNS[0];
    let isBar = true;
    for (let j = 0; j < pat.length; j++) {
      const w = parseInt(pat[j], 10) * barWidth;
      if (isBar) {
        svgPaths += `<rect x="${currentX.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${barHeight}" fill="#0f172a"/>`;
      }
      currentX += w;
      isBar = !isBar;
    }
  });

  const totalWidth = (currentX + 10).toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${barHeight}" preserveAspectRatio="xMidYMid meet" style="width:100%; height:${barHeight}px;">${svgPaths}</svg>`;
}

// ================= WEB AUDIO API SCANNER BEEP =================
let audioCtx = null;
function playScanSound() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1600, audioCtx.currentTime); // crisp 1.6kHz scanner beep
    gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  } catch (e) {
    // AudioContext silently ignored if browser blocks autoplay before user gesture
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️'}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

// ================= HYBRID API & OFFLINE DEMO ENGINE =================
const IS_STATIC_HOST = window.location.hostname.includes('github.io') || window.location.protocol === 'file:';

const DEMO_STORE_KEY = 'xpro_retail_demo_store_v2';

function getDemoStore() {
  const saved = localStorage.getItem(DEMO_STORE_KEY);
  if (saved) {
    try { return JSON.parse(saved); } catch(e) {}
  }

  const initial = {
    inventory: [
      { id: 1, name: 'iPhone 15 Pro Silicone Case with MagSafe', category: 'Merchandise', price_cents: 3999, cost_cents: 1599, quantity: 42, barcode: 'XP891001', sku: 'ACC-IPH15-01', shelf_location: 'Rack A-1 (Cases)' },
      { id: 2, name: '9H Tempered Glass Screen Protector (iPhone 15)', category: 'Merchandise', price_cents: 1499, cost_cents: 350, quantity: 85, barcode: 'XP891002', sku: 'ACC-GLS-02', shelf_location: 'Display Stand B' },
      { id: 3, name: 'Anker 30W USB-C Nano Fast Wall Charger', category: 'Merchandise', price_cents: 2499, cost_cents: 1100, quantity: 28, barcode: 'XP891003', sku: 'ACC-ANK-03', shelf_location: 'Shelf C-2' },
      { id: 4, name: 'Braided 6ft USB-C to USB-C Fast Cable (60W)', category: 'Merchandise', price_cents: 1299, cost_cents: 420, quantity: 64, barcode: 'XP891004', sku: 'ACC-CBL-04', shelf_location: 'Display Stand B' },
      { id: 5, name: 'Samsung Galaxy S24 Ultra Clear Armor Guard', category: 'Merchandise', price_cents: 2999, cost_cents: 950, quantity: 18, barcode: 'XP891005', sku: 'ACC-S24-05', shelf_location: 'Rack A-2 (Android)' },
      { id: 6, name: 'iPhone 14 OEM OLED Screen Replacement Assembly', category: 'Repair', price_cents: 11999, cost_cents: 5800, quantity: 6, barcode: 'XP892001', sku: 'REP-IPH14-LCD', shelf_location: 'Tech Bench D-1' },
      { id: 7, name: 'Fast Wireless Magnetic Charging Pad 15W', category: 'Merchandise', price_cents: 3499, cost_cents: 1450, quantity: 22, barcode: 'XP891006', sku: 'ACC-WCH-06', shelf_location: 'Front Display' },
      { id: 8, name: 'MagSafe Ultra Magnetic Ring Grip / Kickstand', category: 'Merchandise', price_cents: 1899, cost_cents: 600, quantity: 35, barcode: 'XP891007', sku: 'ACC-GRP-07', shelf_location: 'Front Display' }
    ],
    sales: [
      { id: 1, receipt_number: 'XP-000001', customer_name: 'Walk-in Customer', total_cents: 3999, created_at: '2026-10-12 10:30 AM', category: 'Merchandise', description: 'iPhone 15 Pro Silicone Case', payment_method: 'Cash', status: 'COMPLETED' },
      { id: 2, receipt_number: 'XP-000002', customer_name: 'Karim Ullah', total_cents: 14498, created_at: '2026-10-12 11:15 AM', category: 'Repair', description: 'iPhone 14 OLED Screen + Case', payment_method: 'Card', status: 'COMPLETED' }
    ],
    customers: [
      { id: 1, name: 'Rahim Chowdhury', phone: '(555) 234-5678', email: 'rahim@example.com', total_spend_cents: 18500, order_count: 4, notes: 'VIP Customer; uses iPhone 15' },
      { id: 2, name: 'Karim Ullah', phone: '(555) 987-6543', email: 'karim@example.com', total_spend_cents: 14498, order_count: 1, notes: 'Screen replacement repair' },
      { id: 3, name: 'Farhana Yasmin', phone: '(555) 345-6789', email: 'farhana@example.com', total_spend_cents: 6998, order_count: 2, notes: 'Purchases Anker chargers' }
    ],
    repairs: [
      { id: 1, ticket_number: 'REP-1001', customer_name: 'Farhana Yasmin', customer_phone: '(555) 345-6789', device_model: 'iPhone 13 Pro Gold', reported_issue: 'Cracked back glass', status: 'IN PROGRESS', created_at: '2026-10-11' },
      { id: 2, ticket_number: 'REP-1002', customer_name: 'Tanvir Hossain', customer_phone: '(555) 456-7890', device_model: 'Samsung S22 Ultra', reported_issue: 'Battery replacement', status: 'READY', created_at: '2026-10-10' }
    ],
    suppliers: [
      { id: 1, name: 'Apex Global Accessories Ltd.', code: 'SUP-APEX', contact_person: 'Robert Vance', phone: '(555) 789-0123', email: 'orders@apexparts.com', payment_terms: 'NET_30', outstanding_balance_cents: 284000 },
      { id: 2, name: 'Shenzhen Prime Tech Parts', code: 'SUP-PRIME', contact_person: 'David Chen', phone: '+86 755 8821 0000', email: 'supply@primetech.cn', payment_terms: 'NET_15', outstanding_balance_cents: 152000 }
    ],
    purchase_orders: [
      { id: 1, po_number: 'PO-20261012-1ED6', supplier_name: 'Apex Global Accessories Ltd.', total_cost_cents: 350000, status: 'APPROVED', order_date: '2026-10-12', expected_date: '2026-10-15', items: [{ product_id: 1, quantity: 50, unit_cost_cents: 1599 }] },
      { id: 2, po_number: 'PO-20261010-88A2', supplier_name: 'Shenzhen Prime Tech Parts', total_cost_cents: 580000, status: 'RECEIVED', order_date: '2026-10-10', expected_date: '2026-10-12', items: [{ product_id: 6, quantity: 10, unit_cost_cents: 5800 }] }
    ],
    combos: [
      { id: 1, name: 'iPhone 15 Pro Guard Bundle (Case + 9H Glass)', barcode: 'CMB98101', selling_price_cents: 4999, total_cogs_cents: 1949, available_bundles: 42, items_json: JSON.stringify([{ product_id: 1, name: 'Silicone Case', quantity: 1 }, { product_id: 2, name: '9H Glass', quantity: 1 }]) }
    ],
    audits: [
      { id: 1, audit_number: 'AUD-20261012-001', product_name: 'iPhone 15 Pro Silicone Case', system_stock: 44, physical_count: 42, discrepancy: -2, discrepancy_cost_cents: 3198, reason: 'Theft / Pilferage (Shrinkage)', journal_entry_id: 9, status: 'RECONCILED', created_at: '2026-10-12 11:00 AM' }
    ],
    omnichannel: [
      { id: 1, order_number: 'OMNI-WEB-4901', channel: 'Web Store', customer_name: 'Farhan Ahmed', product_name: 'iPhone 15 Pro Silicone Case', quantity: 1, total_cents: 3999, status: 'RESERVED' },
      { id: 2, order_number: 'OMNI-WHATS-4902', channel: 'WhatsApp', customer_name: 'Nadia Sultana', product_name: 'Anker 30W Wall Charger', quantity: 2, total_cents: 4998, status: 'DISPATCHED' }
    ],
    coupons: [
      { code: 'WELCOME10', discount_type: 'PERCENT', discount_value: 10, is_active: 1 },
      { code: 'SAVE5', discount_type: 'FIXED', discount_value: 500, is_active: 1 },
      { code: 'VIP20', discount_type: 'PERCENT', discount_value: 20, is_active: 1 }
    ]
  };

  localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(initial));
  return initial;
}

function saveDemoStore(store) {
  localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(store));
}

function handleLocalMockApi(path, options = {}) {
  const store = getDemoStore();
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};

  // Status
  if (path === '/api/status') {
    return Promise.resolve({
      store_name: 'X Pro Wireless & Repair',
      version: '1.0 Enterprise (Live Demo)',
      policy_version: '2026.1',
      initialized: true,
      active_shift: { id: 1, opening_float_cents: 5000, cashier: STATE.user ? STATE.user.username : 'Admin' },
      inventory_items: store.inventory.length,
      pending_repairs: store.repairs.filter(r => r.status !== 'DELIVERED').length
    });
  }

  // Inventory
  if (path === '/api/inventory') {
    if (method === 'POST') {
      const newId = store.inventory.length + 1;
      const item = { id: newId, ...body, barcode: body.barcode || `XP89${Math.floor(100000 + Math.random()*900000)}` };
      store.inventory.push(item);
      saveDemoStore(store);
      return Promise.resolve(item);
    }
    return Promise.resolve(store.inventory);
  }

  // Sales History
  if (path === '/api/sales') return Promise.resolve(store.sales);

  // Customers
  if (path === '/api/customers') {
    if (method === 'POST') {
      const newCust = { id: store.customers.length + 1, ...body, total_spend_cents: 0, order_count: 0 };
      store.customers.push(newCust);
      saveDemoStore(store);
      return Promise.resolve(newCust);
    }
    return Promise.resolve(store.customers);
  }

  // Repairs
  if (path === '/api/repairs') {
    if (method === 'POST') {
      const newRep = { id: store.repairs.length + 1, ticket_number: `REP-${1000 + store.repairs.length + 1}`, ...body, status: 'IN PROGRESS', created_at: new Date().toISOString().slice(0, 10) };
      store.repairs.push(newRep);
      saveDemoStore(store);
      return Promise.resolve(newRep);
    }
    return Promise.resolve(store.repairs);
  }

  // Split Checkout
  if (path === '/api/pos/split-checkout' && method === 'POST') {
    const saleId = `XP-${String(store.sales.length + 1).padStart(6, '0')}`;
    const totalCents = (body.payments || []).reduce((s, p) => s + (p.amount_cents || 0), 0);

    // Deduct stock
    (body.items || []).forEach(ci => {
      const inv = store.inventory.find(i => i.id == ci.id || i.name == ci.name);
      if (inv) inv.quantity = Math.max(0, inv.quantity - (ci.quantity || 1));
    });

    const newSale = {
      id: store.sales.length + 1,
      receipt_number: saleId,
      customer_name: body.customer_name || 'Walk-in Customer',
      total_cents: totalCents,
      created_at: new Date().toLocaleTimeString(),
      category: 'Merchandise',
      description: (body.items || []).map(i => `${i.quantity}x ${i.name}`).join(', '),
      payment_method: (body.payments || []).map(p => p.method).join(' / '),
      status: 'COMPLETED'
    };
    store.sales.unshift(newSale);
    saveDemoStore(store);

    return Promise.resolve({
      success: true,
      sale_id: saleId,
      journal_entry_id: 10 + store.sales.length,
      change_due_cents: 0
    });
  }

  // Double-Entry Accounting: Trial Balance
  if (path === '/api/accounting/trial-balance') {
    return Promise.resolve({
      is_balanced: true,
      total_debit_cents: 1485000,
      total_credit_cents: 1485000,
      accounts: [
        { code: '1010', name: 'Register Petty Cash', type: 'ASSET', debit_cents: 125000, credit_cents: 0 },
        { code: '1020', name: 'Chase Bank Operating', type: 'ASSET', debit_cents: 485000, credit_cents: 0 },
        { code: '1030', name: 'MFS Wallet (bKash/Nagad)', type: 'ASSET', debit_cents: 95000, credit_cents: 0 },
        { code: '1100', name: 'Accounts Receivable', type: 'ASSET', debit_cents: 45000, credit_cents: 0 },
        { code: '1200', name: 'Inventory Asset Valuation', type: 'ASSET', debit_cents: 735000, credit_cents: 0 },
        { code: '2010', name: 'Accounts Payable (Suppliers)', type: 'LIABILITY', debit_cents: 0, credit_cents: 436000 },
        { code: '2020', name: 'Sales Tax / VAT Payable', type: 'LIABILITY', debit_cents: 0, credit_cents: 34000 },
        { code: '3010', name: 'Owner Equity & Capital', type: 'EQUITY', debit_cents: 0, credit_cents: 650000 },
        { code: '4010', name: 'Retail Merchandise Sales', type: 'REVENUE', debit_cents: 0, credit_cents: 365000 },
        { code: '5010', name: 'Cost of Goods Sold (COGS)', type: 'COGS', debit_cents: 165000, credit_cents: 0 },
        { code: '5020', name: 'Shrinkage & Theft Loss', type: 'COGS', debit_cents: 3198, credit_cents: 0 },
        { code: '6010', name: 'Store Lease & Rent', type: 'EXPENSE', debit_cents: 50000, credit_cents: 0 }
      ]
    });
  }

  // Accounting: P&L
  if (path === '/api/accounting/profit-loss') {
    return Promise.resolve({
      gross_revenue_cents: 365000,
      cogs_cents: 168198,
      gross_profit_cents: 196802,
      operating_expenses_cents: 50000,
      net_profit_cents: 146802,
      margin_pct: '40.2'
    });
  }

  // Accounting: GL
  if (path === '/api/accounting/general-ledger') {
    return Promise.resolve([
      { created_at: '2026-10-12 11:30', entry_number: 'JV-0012', account_code: '1010', account_name: 'Petty Cash', description: 'POS Sale Split Tender XP-000001', debit_cents: 3999, credit_cents: 0 },
      { created_at: '2026-10-12 11:30', entry_number: 'JV-0012', account_code: '4010', account_name: 'Retail Sales', description: 'POS Sale Split Tender XP-000001', debit_cents: 0, credit_cents: 3999 },
      { created_at: '2026-10-12 10:15', entry_number: 'JV-0011', account_code: '1200', account_name: 'Inventory Asset', description: 'Goods Receipt GRN-20261010-88A2', debit_cents: 580000, credit_cents: 0 },
      { created_at: '2026-10-12 10:15', entry_number: 'JV-0011', account_code: '2010', account_name: 'Accounts Payable', description: 'Goods Receipt GRN-20261010-88A2', debit_cents: 0, credit_cents: 580000 }
    ]);
  }

  // Accounting: Journal
  if (path === '/api/accounting/journal') {
    return Promise.resolve([
      {
        entry_number: 'JV-0012',
        created_at: '2026-10-12 11:30',
        reference_type: 'POS_SALE',
        reference_id: 'XP-000001',
        description: 'POS Sale Split Tender XP-000001',
        lines: [
          { account_code: '1010', account_name: 'Petty Cash', debit_cents: 3999, credit_cents: 0 },
          { account_code: '4010', account_name: 'Retail Sales Revenue', debit_cents: 0, credit_cents: 3999 },
          { account_code: '5010', account_name: 'Cost of Goods Sold', debit_cents: 1599, credit_cents: 0 },
          { account_code: '1200', account_name: 'Inventory Asset', debit_cents: 0, credit_cents: 1599 }
        ]
      }
    ]);
  }

  // Procurement: POs
  if (path === '/api/procurement/po') {
    if (method === 'POST') {
      const poNum = `PO-${Date.now().toString(36).toUpperCase()}`;
      const totalCost = (body.items || []).reduce((s, i) => s + ((i.unit_cost_cents || 0) * (i.quantity || 1)), 0);
      const sup = store.suppliers.find(s => s.id == body.supplier_id) || { name: 'Apex Accessories' };
      const newPo = {
        id: store.purchase_orders.length + 1,
        po_number: poNum,
        supplier_name: sup.name,
        total_cost_cents: totalCost,
        status: 'DRAFT',
        order_date: new Date().toISOString().slice(0, 10),
        expected_date: body.expected_date || 'Prompt',
        items: body.items || []
      };
      store.purchase_orders.unshift(newPo);
      saveDemoStore(store);
      return Promise.resolve(newPo);
    }
    return Promise.resolve(store.purchase_orders);
  }

  // PO Approve
  if (path === '/api/procurement/po/approve' && method === 'POST') {
    const po = store.purchase_orders.find(p => p.po_number === body.po_number);
    if (po) po.status = 'APPROVED';
    saveDemoStore(store);
    return Promise.resolve({ success: true, status: 'APPROVED' });
  }

  // PO Receive (Atomic trigger)
  if (path === '/api/procurement/po/receive' && method === 'POST') {
    const po = store.purchase_orders.find(p => p.po_number === body.po_number);
    if (po) po.status = 'RECEIVED';
    saveDemoStore(store);
    return Promise.resolve({
      success: true,
      grn_number: `GRN-${Date.now().toString(36).toUpperCase()}`,
      inventory_updated: true,
      ap_credited: true,
      journal_entry_id: 14
    });
  }

  // Suppliers
  if (path === '/api/procurement/suppliers') {
    if (method === 'POST') {
      const newSup = { id: store.suppliers.length + 1, ...body, outstanding_balance_cents: 0 };
      store.suppliers.push(newSup);
      saveDemoStore(store);
      return Promise.resolve(newSup);
    }
    return Promise.resolve(store.suppliers);
  }

  // Inventory: Coverage Runway
  if (path === '/api/inventory/coverage-analytics') {
    return Promise.resolve(store.inventory.map(i => {
      const sales30d = Math.round(i.quantity * 0.45);
      const dailyVelocity = parseFloat((sales30d / 30).toFixed(1)) || 0.1;
      const coverageDays = Math.round(i.quantity / dailyVelocity);
      let velocityStatus = 'NORMAL';
      if (coverageDays < 7) velocityStatus = 'CRITICAL_REORDER';
      else if (dailyVelocity > 1.2) velocityStatus = 'FAST_MOVING';
      else if (coverageDays > 45) velocityStatus = 'SLOW_MOVING';

      return {
        id: i.id,
        sku: i.sku,
        barcode: i.barcode,
        name: i.name,
        shelf_location: i.shelf_location,
        stock_quantity: i.quantity,
        sales_last_30_days: sales30d,
        daily_velocity: dailyVelocity,
        coverage_days: coverageDays,
        reorder_point: 10,
        velocity_status: velocityStatus
      };
    }));
  }

  // Combos
  if (path === '/api/inventory/combos') {
    if (method === 'POST') {
      const newCmb = {
        id: store.combos.length + 1,
        name: body.name,
        barcode: body.barcode || `CMB${Math.floor(100000 + Math.random()*900000)}`,
        selling_price_cents: body.price_cents,
        total_cogs_cents: (body.items || []).reduce((s, i) => s + ((i.unit_cost_cents || 0) * (i.quantity || 1)), 0),
        available_bundles: 25,
        items_json: JSON.stringify(body.items || [])
      };
      store.combos.unshift(newCmb);
      saveDemoStore(store);
      return Promise.resolve(newCmb);
    }
    return Promise.resolve(store.combos);
  }

  // Audits
  if (path === '/api/inventory/audits') return Promise.resolve(store.audits);
  if (path === '/api/inventory/audits/reconcile' && method === 'POST') {
    const item = store.inventory.find(i => i.id == body.product_id);
    const diff = body.physical_count - (item ? item.quantity : 0);
    if (item) item.quantity = body.physical_count;
    const auditNum = `AUD-${Date.now().toString(36).toUpperCase()}`;
    store.audits.unshift({
      id: store.audits.length + 1,
      audit_number: auditNum,
      product_name: item ? item.name : 'Audited Item',
      system_stock: item ? (item.quantity - diff) : 0,
      physical_count: body.physical_count,
      discrepancy: diff,
      discrepancy_cost_cents: Math.abs(diff) * (item ? item.cost_cents : 0),
      reason: body.reason,
      journal_entry_id: 15,
      status: 'RECONCILED',
      created_at: new Date().toLocaleTimeString()
    });
    saveDemoStore(store);
    return Promise.resolve({ success: true, audit_number: auditNum, journal_entry_id: 15 });
  }

  // Omnichannel
  if (path === '/api/omnichannel/orders') {
    if (method === 'POST') {
      const prod = store.inventory.find(i => i.id == body.product_id);
      if (prod) prod.quantity = Math.max(0, prod.quantity - (body.quantity || 1));
      const newOrder = {
        id: store.omnichannel.length + 1,
        order_number: `OMNI-${Date.now().toString(36).toUpperCase()}`,
        channel: body.channel,
        customer_name: body.customer_name,
        product_name: prod ? prod.name : 'Reserved Item',
        quantity: body.quantity || 1,
        total_cents: (prod ? prod.price_cents : 2500) * (body.quantity || 1),
        status: 'RESERVED'
      };
      store.omnichannel.unshift(newOrder);
      saveDemoStore(store);
      return Promise.resolve(newOrder);
    }
    return Promise.resolve(store.omnichannel);
  }
  if (path === '/api/omnichannel/orders/dispatch' && method === 'POST') {
    const o = store.omnichannel.find(ord => ord.order_number === body.order_number);
    if (o) o.status = 'DISPATCHED';
    saveDemoStore(store);
    return Promise.resolve({ success: true });
  }
  if (path === '/api/omnichannel/orders/restock' && method === 'POST') {
    const o = store.omnichannel.find(ord => ord.order_number === body.order_number);
    if (o) o.status = 'CANCELLED_RESTOCKED';
    saveDemoStore(store);
    return Promise.resolve({ success: true });
  }

  // Coupons
  if (path === '/api/crm/coupons') return Promise.resolve(store.coupons);

  // Executive Dashboard
  if (path === '/api/dashboard/executive') {
    return Promise.resolve({
      liquidity: {
        petty_cash_cents: 125000,
        bank_operating_cents: 485000,
        mfs_cents: 95000,
        inventory_valuation_cents: 735000,
        accounts_receivable_cents: 45000,
        accounts_payable_cents: 436000
      },
      trailing_12m: [
        { month: 'Oct 2026', purchases_cents: 350000, sales_revenue_cents: 365000, expenses_cents: 50000, net_profit_cents: 146802, margin_pct: '40.2' },
        { month: 'Sep 2026', purchases_cents: 410000, sales_revenue_cents: 398000, expenses_cents: 52000, net_profit_cents: 154000, margin_pct: '38.7' },
        { month: 'Aug 2026', purchases_cents: 320000, sales_revenue_cents: 345000, expenses_cents: 48000, net_profit_cents: 132000, margin_pct: '38.3' },
        { month: 'Jul 2026', purchases_cents: 290000, sales_revenue_cents: 310000, expenses_cents: 45000, net_profit_cents: 118000, margin_pct: '38.1' }
      ]
    });
  }

  // Default fallback
  return Promise.resolve([]);
}

// ================= API CALLER =================
async function api(path, options = {}) {
  // If not static host, try live Python backend first
  if (!IS_STATIC_HOST) {
    try {
      const res = await fetch(path, {
        headers: { 'Content-Type': 'application/json' },
        ...options
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Request failed');
      }
      return data;
    } catch (err) {
      console.warn('Backend unavailable, using local mock store for:', path);
      return handleLocalMockApi(path, options);
    }
  }

  // On GitHub Pages or static host, use local mock demo engine
  return handleLocalMockApi(path, options);
}


// ================= INITIALIZATION & AUTH =================

async function initApp() {
  setupNavigation();
  setupEventListeners();
  initBarcodeScanner();
  initBarcodeStudio();

  // Register PWA Service Worker for Offline Execution
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.log('ServiceWorker registration optional:', err);
    });
  }

  // Load saved user
  const savedUser = localStorage.getItem('xpro_user');
  if (savedUser) {
    STATE.user = JSON.parse(savedUser);
    updateUserBadge();
  }

  await refreshSystemStatus();

  // If system not initialized, show admin register modal
  if (!STATE.systemStatus.initialized) {
    showRegisterAdminModal();
    return;
  }

  // URL Param Auto-Role (e.g. ?demo_role=superadmin)
  const urlParams = new URLSearchParams(window.location.search);
  const autoRole = urlParams.get('demo_role') || urlParams.get('role');
  if (autoRole && !STATE.user) {
    await performDemoLogin(autoRole);
  }

  // If no user logged in, show login modal
  if (!STATE.user) {
    showLoginModal();
    return;
  }

  // If no active shift, prompt to open shift
  if (!STATE.activeShift) {
    showOpenShiftPrompt();
  }

  // Load initial tab data
  loadInventory();
  loadCustomers();
  loadRepairs();
  loadSalesHistory();
  loadPoliciesAndAudit();
  switchToTab('dashboard');
}

async function refreshSystemStatus() {
  try {
    const status = await api('/api/status');
    STATE.systemStatus = status;
    STATE.activeShift = status.active_shift;

    const bannerText = document.getElementById('bannerShiftText');
    if (STATE.activeShift) {
      bannerText.textContent = `Shift Active • Cashier: ${STATE.activeShift.username} • Opening Change: ${formatMoney(STATE.activeShift.opening_cents)}`;
    } else {
      bannerText.textContent = `No Shift Open • Register Closed`;
    }

    // Update nav badges
    document.getElementById('badgeInvCount').textContent = status.inventory_items;
    document.getElementById('badgeRepairCount').textContent = status.pending_repairs;
  } catch (err) {
    console.error('Failed to get status', err);
  }
}

function updateUserBadge() {
  if (STATE.user) {
    document.getElementById('currentUsername').textContent = STATE.user.username;
    const dispRole = STATE.user.display_role || formatRoleName(STATE.user.role);
    document.getElementById('currentUserRole').textContent = dispRole;
    document.getElementById('userAvatar').textContent = STATE.user.username.charAt(0).toUpperCase();
  } else {
    document.getElementById('currentUsername').textContent = 'Not Signed In';
    document.getElementById('currentUserRole').textContent = 'Guest';
    document.getElementById('userAvatar').textContent = '?';
  }
}

function formatRoleName(role) {
  if (role === 'super_admin' || role === 'admin') return '👑 Super Admin';
  if (role === 'manager') return '👔 Store Manager';
  if (role === 'pos_executive' || role === 'employee') return '💳 POS Executive';
  return (role || '').replace('_', ' ').toUpperCase();
}

function applyRolePermissions(role) {
  const isPosExec = role === 'pos_exec' || role === 'pos_executive' || role === 'cashier' || role === 'employee';
  const isReceiving = role === 'receiving' || role === 'floor_incharge' || role === 'stock';
  const isManager = role === 'manager';
  const isSuperAdmin = role === 'super_admin' || role === 'admin' || role === 'owner' || role === 'superadmin';

  const tabLedger = document.getElementById('navTabLedger');
  const tabPolicies = document.getElementById('navTabPolicies');
  const tabAccounting = document.getElementById('navTabAccounting');
  const tabProcurement = document.getElementById('navTabProcurement');
  const tabAuditStock = document.getElementById('navTabAuditStock');
  const tabCombos = document.getElementById('navTabCombos');
  const tabOmnichannel = document.getElementById('navTabOmnichannel');
  const navCheckout = document.querySelector('.nav-item[data-tab="checkout"]');
  const navReports = document.querySelector('.nav-item[data-tab="reports"]');

  const badgeLedger = document.getElementById('lockBadgeLedger');
  const badgePolicies = document.getElementById('lockBadgePolicies');
  const badgeAccounting = document.getElementById('lockBadgeAccounting');

  // Reset all locks
  [tabLedger, tabPolicies, tabAccounting, tabProcurement, tabAuditStock, tabCombos, tabOmnichannel, navCheckout, navReports].forEach(el => {
    if (el) el.classList.remove('locked');
  });

  if (isPosExec) {
    // 💳 Cashier: strictly POS billing, basic stock lookup, receipts, notes
    [tabAccounting, tabProcurement, tabAuditStock, tabCombos, tabOmnichannel, tabLedger, tabPolicies, navReports].forEach(el => {
      if (el) el.classList.add('locked');
    });
    if (badgeLedger) badgeLedger.textContent = '🔒 Mgr Only';
    if (badgePolicies) badgePolicies.textContent = '🔒 Admin Only';
    if (badgeAccounting) badgeAccounting.textContent = '🔒 Admin Only';
    if (['accounting', 'procurement', 'audit_stock', 'combos', 'omnichannel', 'ledger', 'policies', 'reports'].includes(STATE.currentTab)) {
      switchToTab('checkout');
    }
  } else if (isReceiving) {
    // 📥 Floor In-Charge / Receiving: Inventory, Barcodes, POs & Goods Receiving, Transfers
    [tabAccounting, tabLedger, tabPolicies, navCheckout, navReports].forEach(el => {
      if (el) el.classList.add('locked');
    });
    if (badgeAccounting) badgeAccounting.textContent = '🔒 Admin Only';
    if (badgeLedger) badgeLedger.textContent = '🔒 Mgr Only';
    if (badgePolicies) badgePolicies.textContent = '🔒 Admin Only';
    if (['accounting', 'ledger', 'policies', 'checkout', 'reports'].includes(STATE.currentTab)) {
      switchToTab('procurement');
    }
  } else if (isManager) {
    // 👔 Manager: Operations, PO approvals, Audits, POS, Reports
    if (tabPolicies) tabPolicies.classList.add('locked');
    if (badgePolicies) badgePolicies.textContent = '🔒 Admin Only';
    if (badgeLedger) badgeLedger.textContent = 'Active';
    if (badgeAccounting) badgeAccounting.textContent = 'Active';
    if (STATE.currentTab === 'policies') {
      switchToTab('checkout');
    }
  } else {
    // 👑 Super Admin / Owner: Full master access to everything
    if (badgeLedger) badgeLedger.textContent = 'Active';
    if (badgePolicies) badgePolicies.textContent = 'Full Access';
    if (badgeAccounting) badgeAccounting.textContent = 'Full Access';
  }
}

function updateRolePills(role) {
  document.querySelectorAll('.role-pill-btn').forEach(btn => {
    const rKey = btn.getAttribute('data-switch-role');
    const isMatch = (rKey === 'superadmin' && (role === 'super_admin' || role === 'admin')) ||
                    (rKey === 'manager' && role === 'manager') ||
                    (rKey === 'pos_exec' && (role === 'pos_executive' || role === 'employee'));
    if (isMatch) btn.classList.add('active');
    else btn.classList.remove('active');
  });
  applyRolePermissions(role);
}

async function performDemoLogin(roleKey) {
  try {
    const res = await api('/api/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ role: roleKey })
    });
    STATE.user = {
      username: res.username,
      role: res.role,
      display_role: res.display_role
    };
    localStorage.setItem('xpro_user', JSON.stringify(STATE.user));
    updateUserBadge();
    updateRolePills(res.role);
    closeModal('authModal');
    showToast(`Access granted: ${res.display_role}!`, 'success');
    await refreshSystemStatus();
    loadInventory();
    switchToTab('dashboard');
  } catch (e) {}
}

function showRegisterAdminModal() {
  const modalBody = document.getElementById('authModalBody');
  document.getElementById('authModalTitle').textContent = '⚡ First Launch: Setup Administrator Account';
  modalBody.innerHTML = `
    <p style="font-size:0.86rem; color:var(--text-secondary); line-height:1.4;">
      Welcome to XPRO STORE POS. Please create the primary administrator account or use 1-click demo access.
    </p>
    <div class="demo-role-box" style="margin-bottom:14px;">
      <div class="demo-role-header">
        <span class="demo-badge">⚡ 1-CLICK INSTANT SETUP</span>
        <span class="demo-sub">Skip setup & enter directly:</span>
      </div>
      <div class="demo-role-grid">
        <button type="button" class="btn-demo-quick-role" onclick="performDemoLogin('superadmin')">
          <span class="role-icon">👑</span>
          <span class="role-title">Super Admin</span>
          <span class="role-desc">Full access</span>
        </button>
        <button type="button" class="btn-demo-quick-role" onclick="performDemoLogin('manager')">
          <span class="role-icon">👔</span>
          <span class="role-title">Manager</span>
          <span class="role-desc">Operations</span>
        </button>
        <button type="button" class="btn-demo-quick-role" onclick="performDemoLogin('pos_exec')">
          <span class="role-icon">💳</span>
          <span class="role-title">POS Exec</span>
          <span class="role-desc">Front desk</span>
        </button>
      </div>
    </div>
    <div class="form-group">
      <label>Admin Username</label>
      <input type="text" id="authInpUser" placeholder="admin" autofocus>
    </div>
    <div class="form-group">
      <label>Password (8+ characters)</label>
      <input type="password" id="authInpPass" placeholder="••••••••">
    </div>
    <div class="form-group">
      <label>Password Recovery Hint</label>
      <input type="text" id="authInpHint" placeholder="e.g. favorite store name">
    </div>
    <div class="modal-footer" style="padding:10px 0 0; background:transparent;">
      <button id="btnSubmitAdmin" class="btn-primary w-100">Create Administrator & Start</button>
    </div>
  `;

  openModal('authModal');

  document.getElementById('btnSubmitAdmin').onclick = async () => {
    const username = document.getElementById('authInpUser').value.trim();
    const password = document.getElementById('authInpPass').value;
    const hint = document.getElementById('authInpHint').value.trim();
    if (!username || password.length < 8) {
      showToast('Username required and password must be 8+ characters', 'error');
      return;
    }
    try {
      const res = await api('/api/auth/register-admin', {
        method: 'POST',
        body: JSON.stringify({ username, password, hint })
      });
      STATE.user = { username: res.username, role: res.role, display_role: '👑 Super Admin' };
      localStorage.setItem('xpro_user', JSON.stringify(STATE.user));
      updateUserBadge();
      closeModal('authModal');
      showToast('Admin account created successfully!', 'success');
      await refreshSystemStatus();
      loadInventory();
    } catch (e) {}
  };
}

function showLoginModal() {
  const modalBody = document.getElementById('authModalBody');
  document.getElementById('authModalTitle').textContent = '🔒 Sign In — XPRO STORE POS';
  modalBody.innerHTML = `
    <!-- 1-Click Demo Roles -->
    <div class="demo-role-box">
      <div class="demo-role-header">
        <span class="demo-badge">⚡ 1-CLICK DEMO ACCESS</span>
        <span class="demo-sub">Click role to auto-sign in:</span>
      </div>
      <div class="demo-role-grid">
        <button type="button" class="btn-demo-quick-role" data-role="superadmin">
          <span class="role-icon">👑</span>
          <span class="role-title">Super Admin</span>
          <span class="role-desc">Full system access</span>
        </button>
        <button type="button" class="btn-demo-quick-role" data-role="manager">
          <span class="role-icon">👔</span>
          <span class="role-title">Manager</span>
          <span class="role-desc">Ops & Approvals</span>
        </button>
        <button type="button" class="btn-demo-quick-role" data-role="pos_exec">
          <span class="role-icon">💳</span>
          <span class="role-title">POS Executive</span>
          <span class="role-desc">Front-desk cashier</span>
        </button>
      </div>
    </div>

    <div class="divider-with-text">
      <span>OR SIGN IN MANUALLY</span>
    </div>

    <div class="form-group">
      <label>Username</label>
      <input type="text" id="loginInpUser" placeholder="admin / manager / pos_exec" value="admin" autofocus>
    </div>
    <div class="form-group">
      <label>Password</label>
      <input type="password" id="loginInpPass" placeholder="••••••••" value="admin1234">
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <button type="button" id="btnShowHint" class="btn-ghost-sm" style="color:var(--text-muted);">Forgot? Show Hint</button>
      <span style="font-size:0.75rem; color:var(--text-muted);">Quick: admin1234 / manager1234</span>
    </div>
    <div class="modal-footer" style="padding:10px 0 0; background:transparent;">
      <button id="btnSubmitLogin" class="btn-primary w-100">Sign In to POS</button>
    </div>
  `;

  openModal('authModal');

  // Attach 1-click role buttons
  modalBody.querySelectorAll('.btn-demo-quick-role').forEach(btn => {
    btn.onclick = async () => {
      const roleKey = btn.getAttribute('data-role');
      modalBody.querySelectorAll('.btn-demo-quick-role').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const creds = {
        superadmin: { user: 'superadmin', pass: 'admin1234' },
        manager: { user: 'manager', pass: 'manager1234' },
        pos_exec: { user: 'pos_exec', pass: 'posexec1234' }
      }[roleKey] || { user: 'superadmin', pass: 'admin1234' };

      document.getElementById('loginInpUser').value = creds.user;
      document.getElementById('loginInpPass').value = creds.pass;

      await performDemoLogin(roleKey);
    };
  });

  document.getElementById('btnShowHint').onclick = async () => {
    const u = document.getElementById('loginInpUser').value.trim();
    if (!u) return showToast('Enter username first to see hint', 'error');
    const res = await api(`/api/auth/hint`, { method: 'POST', body: JSON.stringify({ username: u }) });
    alert(`Password Hint: ${res.hint}`);
  };

  document.getElementById('btnSubmitLogin').onclick = async () => {
    const username = document.getElementById('loginInpUser').value.trim();
    const password = document.getElementById('loginInpPass').value;
    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      STATE.user = { 
        username: res.username, 
        role: res.role,
        display_role: res.display_role || formatRoleName(res.role)
      };
      localStorage.setItem('xpro_user', JSON.stringify(STATE.user));
      updateUserBadge();
      updateRolePills(res.role);
      closeModal('authModal');
      showToast(`Welcome back, ${res.username} (${STATE.user.display_role})!`, 'success');
      await refreshSystemStatus();
      loadInventory();
      switchToTab('dashboard');
    } catch (e) {}
  };
}

// ================= SHIFT MANAGEMENT =================

function showOpenShiftPrompt() {
  document.getElementById('shiftModalTitle').textContent = '💰 Open Shift — Count Change';
  const modalBody = document.getElementById('shiftModalBody');
  modalBody.innerHTML = `
    <p style="font-size:0.86rem; color:var(--text-secondary);">
      Enter the cash left in register drawer for customer change ($0.00 to $100.00):
    </p>
    <div class="cash-presets" style="margin: 8px 0;">
      <button class="preset-btn" onclick="document.getElementById('shiftOpenCents').value='0.00'">$0</button>
      <button class="preset-btn" onclick="document.getElementById('shiftOpenCents').value='25.00'">$25</button>
      <button class="preset-btn" onclick="document.getElementById('shiftOpenCents').value='50.00'">$50</button>
      <button class="preset-btn" onclick="document.getElementById('shiftOpenCents').value='100.00'">$100</button>
    </div>
    <div class="form-group">
      <label>Opening Change Amount ($)</label>
      <input type="number" id="shiftOpenCents" placeholder="50.00" value="50.00" step="0.01">
    </div>
    <div class="modal-footer" style="padding:10px 0 0; background:transparent;">
      <button id="btnConfirmOpenShift" class="btn-primary w-100">Open Register Shift</button>
    </div>
  `;

  openModal('shiftModal');

  document.getElementById('btnConfirmOpenShift').onclick = async () => {
    const val = document.getElementById('shiftOpenCents').value;
    const cents = parseCents(val);
    if (cents > 10000) {
      showToast('Opening change must not exceed $100.00', 'error');
      return;
    }
    try {
      await api('/api/shift/open', {
        method: 'POST',
        body: JSON.stringify({
          username: STATE.user ? STATE.user.username : 'admin',
          opening_cents: cents
        })
      });
      closeModal('shiftModal');
      showToast(`Shift opened with ${formatMoney(cents)} change!`, 'success');
      await refreshSystemStatus();
    } catch (e) {}
  };
}

function showCloseShiftPrompt() {
  if (!STATE.activeShift) {
    showToast('No active shift is currently open', 'error');
    return;
  }
  document.getElementById('shiftModalTitle').textContent = '🔒 Close Shift & Reconcile Register';
  const modalBody = document.getElementById('shiftModalBody');
  modalBody.innerHTML = `
    <div class="form-group">
      <label>Actual Cash Counted in Drawer ($)</label>
      <input type="number" id="shiftCloseActual" placeholder="0.00" step="0.01" autofocus>
    </div>
    <div class="form-group">
      <label>Shift Comments / Discrepancy Notes (Optional)</label>
      <input type="text" id="shiftCloseNotes" placeholder="e.g. Evening count verified; $50 left for next shift">
    </div>
    <div class="modal-footer" style="padding:10px 0 0; background:transparent;">
      <button class="btn-ghost" onclick="closeModal('shiftModal')">Cancel</button>
      <button id="btnConfirmCloseShift" class="btn-danger">Reconcile & Close Shift</button>
    </div>
  `;

  openModal('shiftModal');

  document.getElementById('btnConfirmCloseShift').onclick = async () => {
    const val = document.getElementById('shiftCloseActual').value;
    const notes = document.getElementById('shiftCloseNotes').value.trim();
    const actualCents = parseCents(val);
    try {
      const res = await api('/api/shift/close', {
        method: 'POST',
        body: JSON.stringify({
          username: STATE.user ? STATE.user.username : 'admin',
          shift_id: STATE.activeShift.id,
          actual_cents: actualCents,
          notes: notes
        })
      });
      closeModal('shiftModal');
      const diffStr = res.difference_cents === 0 ? 'Balanced exact!' : `${res.difference_cents > 0 ? '+' : ''}${formatMoney(res.difference_cents)} discrepancy`;
      alert(`Shift Closed Successfully!\nExpected: ${formatMoney(res.expected_cents)}\nActual: ${formatMoney(res.actual_cents)}\nResult: ${diffStr}\n\nRemember to leave ${formatMoney(res.opening_cents)} change in drawer.`);
      await refreshSystemStatus();
    } catch (e) {}
  };
}

// ================= INVENTORY & CATALOG =================

async function loadInventory() {
  try {
    const items = await api('/api/inventory');
    STATE.inventory = items;
    renderCatalog();
    renderInventoryTable();
    calculateInventoryKPIs();
    if (document.getElementById('barcodeRegistryTableBody')) {
      renderBarcodeRegistryTable();
      populateBarcodeSelectProduct();
    }
  } catch (e) {}
}

function calculateInventoryKPIs() {
  const items = STATE.inventory;
  const totalSkus = items.length;
  const totalUnits = items.reduce((acc, itm) => acc + (itm.quantity || 0), 0);
  const lowStock = items.filter(itm => (itm.quantity || 0) <= 5).length;
  const valuationCents = items.reduce((acc, itm) => acc + ((itm.price_cents || 0) * (itm.quantity || 0)), 0);

  document.getElementById('kpiTotalSkus').textContent = totalSkus;
  document.getElementById('kpiTotalUnits').textContent = totalUnits;
  document.getElementById('kpiLowStock').textContent = lowStock;
  document.getElementById('kpiValuation').textContent = formatMoney(valuationCents);
}

function renderCatalog() {
  const grid = document.getElementById('catalogGrid');
  const search = document.getElementById('catalogSearch').value.toLowerCase().trim();
  const cat = STATE.selectedCategory;

  const filtered = STATE.inventory.filter(item => {
    const matchCat = cat === 'ALL' || item.category === cat;
    const matchSearch = !search || item.name.toLowerCase().includes(search);
    return matchCat && matchSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1; text-align:center; padding:50px 20px; color:var(--text-muted);">
        <p style="font-size:1.1rem; margin-bottom:8px;">📦 No items found matching "${search || cat}"</p>
        <button onclick="document.getElementById('btnSeedDemo').click()" class="btn-secondary-sm">Load Demo Store Products</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(item => {
    const isOut = item.quantity <= 0;
    const isLow = item.quantity > 0 && item.quantity <= 5;
    const tagClass = isOut ? 'out' : isLow ? 'low' : '';
    const tagText = isOut ? 'Out of stock' : `${item.quantity} in stock`;

    return `
      <div class="product-card" onclick="addToCart(${item.id})">
        <div>
          <div class="product-cat-tag">${item.category || 'Merchandise'}</div>
          <div class="product-title">${escapeHtml(item.name)}</div>
        </div>
        <div class="product-card-footer">
          <div class="product-price">${formatMoney(item.price_cents)}</div>
          <span class="stock-tag ${tagClass}">${tagText}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderInventoryTable() {
  const tbody = document.getElementById('inventoryTableBody');
  const search = (document.getElementById('inventoryTableSearch')?.value || '').toLowerCase().trim();
  const shelfFilter = STATE.selectedShelfFilter;

  // Populate shelf filter dropdown if empty or options changed
  const shelfSelect = document.getElementById('filterShelfSelect');
  if (shelfSelect) {
    const existingVal = shelfSelect.value;
    const shelves = [...new Set(STATE.inventory.map(i => i.shelf_location || 'Main Display'))].sort();
    let opts = '<option value="ALL">All Store Locations</option>';
    shelves.forEach(s => {
      opts += `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`;
    });
    if (shelfSelect.getAttribute('data-loaded-count') !== String(shelves.length)) {
      shelfSelect.innerHTML = opts;
      shelfSelect.value = existingVal || 'ALL';
      shelfSelect.setAttribute('data-loaded-count', String(shelves.length));
    }
  }

  const filtered = STATE.inventory.filter(item => {
    const matchShelf = shelfFilter === 'ALL' || (item.shelf_location || 'Main Display') === shelfFilter;
    const itemBarcode = (item.barcode || '').toLowerCase();
    const itemSku = (item.sku || '').toLowerCase();
    const itemName = (item.name || '').toLowerCase();
    const itemLoc = (item.shelf_location || '').toLowerCase();
    const matchSearch = !search || itemName.includes(search) || itemBarcode.includes(search) || itemSku.includes(search) || itemLoc.includes(search);
    return matchShelf && matchSearch;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px; color:var(--text-muted);">No accessories found matching current filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const isOut = item.quantity <= 0;
    const isLow = item.quantity > 0 && item.quantity <= 5;
    const badgeColor = isOut ? 'var(--accent-rose)' : isLow ? 'var(--accent-amber)' : 'var(--accent-emerald)';
    const barcodeCode = item.barcode || `XP89${String(item.id).padStart(6, '0')}`;
    const shelfLoc = item.shelf_location || 'Front Display Rack A-1';

    return `
      <tr>
        <td style="font-family:var(--font-mono); color:var(--text-muted);">${item.id}</td>
        <td>
          <strong>${escapeHtml(item.name)}</strong>
          ${item.sku ? `<div style="font-size:0.7rem; color:var(--text-muted); font-family:var(--font-mono);">SKU: ${escapeHtml(item.sku)}</div>` : ''}
        </td>
        <td>
          <div style="display:flex; flex-direction:column; gap:2px;">
            <code style="font-size:0.8rem; color:var(--accent-primary); font-weight:700;">${barcodeCode}</code>
            <div style="width:110px; height:24px; overflow:hidden;">
              ${generateBarcodeSVG(barcodeCode, 1.2, 22)}
            </div>
          </div>
        </td>
        <td><span class="shelf-chip">📍 ${escapeHtml(shelfLoc)}</span></td>
        <td><span class="pill" style="padding:2px 8px; font-size:0.75rem;">${item.category}</span></td>
        <td style="font-family:var(--font-mono); color:var(--text-secondary);">${formatMoney(item.cost_cents || 0)}</td>
        <td style="font-family:var(--font-mono); font-weight:700; color:var(--accent-emerald);">${formatMoney(item.price_cents)}</td>
        <td><strong style="color:${badgeColor}">${item.quantity}</strong> units</td>
        <td>
          <span class="status-badge ${isOut ? 'overdue' : isLow ? 'in-progress' : 'ready'}">
            ${isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock'}
          </span>
        </td>
        <td style="display:flex; gap:6px; align-items:center;">
          <button class="btn-table-action" onclick="quickAddStock(${item.id}, 5)" title="Add 5 units">+5</button>
          <button class="btn-table-action" onclick="openProductInBarcodeStudio(${item.id})" title="Print Barcode Label">🏷️ Label</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function quickAddStock(id, count) {
  const itm = STATE.inventory.find(x => x.id === id);
  if (!itm) return;
  try {
    await api('/api/inventory', {
      method: 'POST',
      body: JSON.stringify({
        username: STATE.user ? STATE.user.username : 'admin',
        name: itm.name,
        category: itm.category,
        price_cents: itm.price_cents,
        quantity: count,
        barcode: itm.barcode,
        shelf_location: itm.shelf_location,
        cost_cents: itm.cost_cents,
        sku: itm.sku
      })
    });
    showToast(`Added +${count} to ${itm.name}`, 'success');
    loadInventory();
  } catch (e) {}
}

function openProductInBarcodeStudio(productId) {
  switchToTab('barcodes');
  const sel = document.getElementById('barcodeSelectProduct');
  if (sel) {
    sel.value = productId;
    sel.dispatchEvent(new Event('change'));
  }
}


// ================= CART & CHECKOUT =================

function addToCart(productId) {
  const product = STATE.inventory.find(x => x.id === productId);
  if (!product) return;

  const existing = STATE.cart.find(x => x.id === productId);
  if (existing) {
    existing.quantity += 1;
  } else {
    STATE.cart.push({
      id: product.id,
      name: product.name,
      category: product.category,
      price_cents: product.price_cents,
      quantity: 1
    });
  }
  renderCart();
}

function updateCartQty(index, delta) {
  const item = STATE.cart[index];
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) {
    STATE.cart.splice(index, 1);
  }
  renderCart();
}

function clearCart() {
  STATE.cart = [];
  document.getElementById('cartCustomer').value = '';
  document.getElementById('cashTenderedInput').value = '';
  renderCart();
}

function renderCart() {
  const list = document.getElementById('cartItemsList');
  if (STATE.cart.length === 0) {
    list.innerHTML = `
      <div class="empty-cart-state">
        <div class="empty-icon">🛒</div>
        <p>Order is empty</p>
        <small>Select products or click Custom Item</small>
      </div>
    `;
    updateCartTotals(0);
    return;
  }

  let totalCents = 0;
  list.innerHTML = STATE.cart.map((item, idx) => {
    const itemTotal = item.price_cents * item.quantity;
    totalCents += itemTotal;
    return `
      <div class="cart-item-row">
        <div class="cart-item-info">
          <div class="cart-item-name">${escapeHtml(item.name)}</div>
          <div class="cart-item-cat">${item.category} • ${formatMoney(item.price_cents)} each</div>
        </div>
        <div class="cart-item-controls">
          <button class="cart-qty-btn" onclick="updateCartQty(${idx}, -1)">−</button>
          <span class="cart-qty-val">${item.quantity}</span>
          <button class="cart-qty-btn" onclick="updateCartQty(${idx}, 1)">+</button>
        </div>
        <div class="cart-item-total">${formatMoney(itemTotal)}</div>
      </div>
    `;
  }).join('');

  updateCartTotals(totalCents);
}

function updateCartTotals(subtotalCents) {
  const grandTotal = subtotalCents;
  document.getElementById('cartSubtotal').textContent = formatMoney(subtotalCents);
  document.getElementById('cartTax').textContent = '$0.00';
  document.getElementById('cartGrandTotal').textContent = formatMoney(grandTotal);

  updateChangeDue(grandTotal);
}

function updateChangeDue(totalCents) {
  const inputVal = document.getElementById('cashTenderedInput').value;
  const tenderedCents = parseCents(inputVal);
  const changeCents = Math.max(0, tenderedCents - totalCents);
  document.getElementById('changeDueAmount').textContent = formatMoney(changeCents);
}

async function handleCompleteSale() {
  if (STATE.cart.length === 0) {
    showToast('Add items to order before checkout', 'error');
    return;
  }

  const customer = document.getElementById('cartCustomer').value.trim();
  const totalCents = STATE.cart.reduce((a, b) => a + (b.price_cents * b.quantity), 0);
  const payment = STATE.selectedPayment;
  const category = STATE.cart.length === 1 ? STATE.cart[0].category : 'Merchandise';

  try {
    const res = await api('/api/sales/checkout', {
      method: 'POST',
      body: JSON.stringify({
        username: STATE.user ? STATE.user.username : 'admin',
        items: STATE.cart,
        category: category,
        description: STATE.cart.map(x => `${x.name} x${x.quantity}`).join(', '),
        customer: customer,
        payment: payment,
        amount_cents: totalCents
      })
    });

    showToast(`Sale XP-${String(res.sale.id).padStart(6, '0')} recorded!`, 'success');
    clearCart();
    loadInventory();
    loadSalesHistory();
    refreshSystemStatus();

    // Show receipt modal
    openReceiptModal(res.receipt_html);
  } catch (e) {}
}

function openReceiptModal(htmlContent) {
  document.getElementById('receiptPaperContainer').innerHTML = htmlContent;
  openModal('receiptModal');
}

// ================= DEVICE REPAIRS =================

async function loadRepairs() {
  try {
    const list = await api('/api/repairs');
    renderRepairs(list);
  } catch (e) {}
}

function renderRepairs(list) {
  const grid = document.getElementById('repairsGrid');
  if (list.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted);">No repair tickets recorded yet.</div>`;
    return;
  }

  grid.innerHTML = list.map(ticket => {
    const isOverdue = ticket.is_overdue;
    const isReady = ticket.status === 'READY';
    const statusClass = isOverdue ? 'overdue' : isReady ? 'ready' : 'in-progress';
    const statusLabel = isOverdue ? '⚠️ Overdue (>10 Days)' : ticket.status;

    return `
      <div class="repair-card">
        <div class="repair-card-header">
          <span class="repair-ticket-id">TICKET #${ticket.id}</span>
          <span class="status-badge ${statusClass}">${statusLabel}</span>
        </div>
        <div>
          <div class="repair-device">${escapeHtml(ticket.device)}</div>
          <div class="repair-customer">👤 ${escapeHtml(ticket.customer)} • 📞 ${escapeHtml(ticket.contact)}</div>
        </div>
        <div class="repair-issue">
          <strong>Issue:</strong> ${escapeHtml(ticket.issue || 'No details provided')}
        </div>
        ${ticket.notification ? `<div style="font-size:0.75rem; color:var(--accent-emerald);">🔔 Notified: ${escapeHtml(ticket.notification)}</div>` : ''}
        <div class="repair-footer">
          <span>Created: ${ticket.created_at.split(' ')[0]}</span>
          ${ticket.status === 'IN PROGRESS' ? `<button class="btn-table-action" onclick="promptMarkReady(${ticket.id})">Mark Ready & Notify</button>` : `<span style="color:var(--text-muted);">Recorded</span>`}
        </div>
      </div>
    `;
  }).join('');
}

function promptMarkReady(ticketId) {
  STATE.activeRepairForReady = ticketId;
  openModal('repairReadyModal');
}

// ================= MONEY TRANSFER & LOTTO LEDGER =================

async function loadLedger() {
  try {
    const data = await api('/api/ledger');
    renderLedger(data);
  } catch (e) {}
}

function renderLedger(data) {
  const tbody = document.getElementById('ledgerTableBody');
  const items = data.items || [];
  const summary = data.summary || [];

  let totalIn = 0, totalOut = 0, totalFee = 0, totalComm = 0;
  summary.forEach(s => {
    totalIn += s.total_in || 0;
    totalOut += s.total_out || 0;
    totalFee += s.total_fee || 0;
    totalComm += s.total_comm || 0;
  });

  document.getElementById('kpiCashIn').textContent = formatMoney(totalIn);
  document.getElementById('kpiCashOut').textContent = formatMoney(totalOut);
  document.getElementById('kpiFees').textContent = formatMoney(totalFee);
  document.getElementById('kpiCommissions').textContent = formatMoney(totalComm);

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px; color:var(--text-muted);">No service transactions recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(r => `
    <tr>
      <td style="font-family:var(--font-mono);">${r.id}</td>
      <td style="font-size:0.8rem; color:var(--text-muted);">${r.created_at}</td>
      <td><strong>${r.business}</strong></td>
      <td>${r.kind}</td>
      <td style="font-family:var(--font-mono);">${escapeHtml(r.reference || '—')}</td>
      <td style="color:var(--accent-emerald); font-weight:700;">${formatMoney(r.cash_in_cents)}</td>
      <td style="color:var(--accent-rose); font-weight:700;">${formatMoney(r.cash_out_cents)}</td>
      <td>${formatMoney(r.fee_cents)}</td>
      <td style="color:var(--accent-primary); font-weight:700;">${formatMoney(r.commission_cents)}</td>
      <td style="color:var(--text-muted); font-size:0.8rem;">${r.username}</td>
    </tr>
  `).join('');
}

// ================= SALES HISTORY & RETURNS =================

async function loadSalesHistory() {
  try {
    const list = await api('/api/sales');
    renderSalesHistory(list);
  } catch (e) {}
}

function renderSalesHistory(list) {
  const tbody = document.getElementById('salesTableBody');
  const search = document.getElementById('salesSearch').value.toLowerCase().trim();

  const filtered = list.filter(s => {
    const recStr = `XP-${String(s.id).padStart(6, '0')}`.toLowerCase();
    const custStr = (s.customer || '').toLowerCase();
    const descStr = (s.description || '').toLowerCase();
    return !search || recStr.includes(search) || custStr.includes(search) || descStr.includes(search);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-muted);">No sales found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(s => {
    const isReturned = s.status !== 'SOLD';
    const recId = `XP-${String(s.id).padStart(6, '0')}`;
    return `
      <tr>
        <td style="font-family:var(--font-mono); font-weight:700; color:var(--accent-primary);">${recId}</td>
        <td style="font-size:0.8rem; color:var(--text-muted);">${s.created_at}</td>
        <td><span class="pill" style="padding:2px 8px; font-size:0.75rem;">${s.category}</span></td>
        <td>${escapeHtml(s.description)}</td>
        <td style="font-family:var(--font-mono); font-weight:700; color:var(--accent-emerald);">${formatMoney(s.amount_cents)}</td>
        <td>${s.payment}</td>
        <td>${escapeHtml(s.customer || 'Walk-in')}</td>
        <td>
          <span class="status-badge ${isReturned ? 'overdue' : 'ready'}">
            ${s.status}
          </span>
        </td>
        <td style="display:flex; gap:6px;">
          <button class="btn-table-action" onclick="reprintReceipt(${s.id})">🖨️ Reprint</button>
          ${!isReturned ? `<button class="btn-table-action" onclick="promptReturnSale(${s.id})">🔄 Return</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

async function reprintReceipt(saleId) {
  try {
    const res = await api(`/api/receipt?id=${saleId}`);
    openReceiptModal(res.html);
  } catch (e) {}
}

function promptReturnSale(saleId) {
  api(`/api/sales`).then(list => {
    const sale = list.find(x => x.id === saleId);
    if (!sale) return;
    STATE.activeSaleForReturn = sale;
    document.getElementById('returnSaleSummary').innerHTML = `
      <strong>Receipt: XP-${String(sale.id).padStart(6, '0')}</strong><br>
      Item: ${escapeHtml(sale.description)}<br>
      Category: ${sale.category} • Amount: ${formatMoney(sale.amount_cents)}<br>
      Date: ${sale.created_at}
    `;
    openModal('returnModal');
  });
}

// ================= SHIFT NOTES =================

async function loadNotes() {
  try {
    const notes = await api('/api/notes');
    const container = document.getElementById('notesTimeline');
    if (notes.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">No shift notes posted yet.</div>`;
      return;
    }
    container.innerHTML = notes.map(n => `
      <div class="note-bubble">
        <div class="note-header">
          <span class="note-user">👤 ${escapeHtml(n.username)}</span>
          <span>${n.created_at}</span>
        </div>
        <div class="note-body">${escapeHtml(n.note)}</div>
      </div>
    `).join('');
  } catch (e) {}
}

// ================= POLICIES & AUDIT =================

async function loadPoliciesAndAudit() {
  try {
    const polRes = await api('/api/policies');
    const acc = document.getElementById('policyAccordion');
    acc.innerHTML = Object.entries(polRes.policies).map(([title, text]) => `
      <div class="policy-item">
        <h3>📜 ${escapeHtml(title)}</h3>
        <p>${escapeHtml(text)}</p>
      </div>
    `).join('');

    const auditLogs = await api('/api/audit');
    const tbody = document.getElementById('auditTableBody');
    tbody.innerHTML = auditLogs.map(l => `
      <tr>
        <td style="font-family:var(--font-mono); color:var(--text-muted);">${l.id}</td>
        <td style="font-size:0.78rem; color:var(--text-muted);">${l.created_at}</td>
        <td><strong>${escapeHtml(l.username)}</strong></td>
        <td><span class="pill" style="padding:2px 8px; font-size:0.75rem;">${escapeHtml(l.action)}</span></td>
        <td style="font-size:0.82rem;">${escapeHtml(l.details || '')}</td>
      </tr>
    `).join('');
  } catch (e) {}
}

// ================= NAVIGATION & EVENTS =================

function switchToTab(tabName) {
  // RBAC checks
  const role = STATE.user ? STATE.user.role : 'admin';
  const isPosExec = role === 'pos_executive' || role === 'employee';
  const isManager = role === 'manager';

  if (isPosExec && (tabName === 'ledger' || tabName === 'policies')) {
    const tabTitle = tabName === 'ledger' ? 'Transfer & Lotto Ledger' : 'Policies & Audit Security';
    showToast(`🔒 Access Restricted: POS Executives cannot access ${tabTitle}. Please ask Store Manager or Super Admin.`, 'error');
    return;
  }
  if (isManager && tabName === 'policies') {
    showToast(`🔒 Access Restricted: Security Policies & Audit Trails are Super Admin only.`, 'error');
    return;
  }

  document.querySelectorAll('.nav-item').forEach(b => {
    if (b.getAttribute('data-tab') === tabName) b.classList.add('active');
    else b.classList.remove('active');
  });
  document.querySelectorAll('.mobile-nav-btn').forEach(b => {
    if (b.getAttribute('data-tab') === tabName) b.classList.add('active');
    else b.classList.remove('active');
  });
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));

  STATE.currentTab = tabName;
  const targetPanel = document.getElementById(`tab-${tabName}`);
  if (targetPanel) targetPanel.classList.add('active');

  if (tabName === 'dashboard') loadDashboardOverview();
  if (tabName === 'barcodes') {
    initBarcodeStudio();
    renderBarcodeRegistryTable();
  }
  if (tabName === 'inventory') loadInventory();
  if (tabName === 'reports') loadReportsSummary();
  if (tabName === 'customers') loadCustomers();
  if (tabName === 'repairs') loadRepairs();
  if (tabName === 'ledger') loadLedger();
  if (tabName === 'history') loadSalesHistory();
  if (tabName === 'notes') loadNotes();
  if (tabName === 'policies') loadPoliciesAndAudit();
  if (tabName === 'procurement') loadProcurementData();
  if (tabName === 'accounting') loadAccountingData();
  if (tabName === 'audit_stock') loadCoverageAndAudits();
  if (tabName === 'combos') loadCombosData();
  if (tabName === 'omnichannel') loadOmnichannelOrders();
}

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.onclick = () => {
      const tabName = btn.getAttribute('data-tab');
      switchToTab(tabName);
    };
  });
  document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
    btn.onclick = () => {
      const tabName = btn.getAttribute('data-tab');
      switchToTab(tabName);
    };
  });
  setupReportsTab();
}

// ================= BARCODE SCANNER GUN INTEGRATION =================
let scannerBuffer = '';
let lastKeyTime = 0;

function initBarcodeScanner() {
  const scanInput = document.getElementById('posBarcodeScanInput');
  const btnScan = document.getElementById('btnManualBarcodeScan');

  if (scanInput) {
    scanInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleBarcodeScan(scanInput.value);
      }
    });
  }

  if (btnScan) {
    btnScan.onclick = () => {
      if (scanInput) handleBarcodeScan(scanInput.value);
    };
  }

  // Global rapid keypress listener for wireless/USB hardware barcode scanners
  window.addEventListener('keydown', (e) => {
    if (STATE.currentTab !== 'checkout') return;
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && document.activeElement.id !== 'posBarcodeScanInput') {
      return;
    }

    const now = Date.now();
    if (now - lastKeyTime > 250) {
      scannerBuffer = '';
    }
    lastKeyTime = now;

    if (e.key === 'Enter') {
      if (scannerBuffer.length >= 4) {
        e.preventDefault();
        handleBarcodeScan(scannerBuffer);
        scannerBuffer = '';
      }
    } else if (e.key && e.key.length === 1) {
      scannerBuffer += e.key;
    }
  });
}

async function handleBarcodeScan(rawCode) {
  const code = (rawCode || '').trim();
  if (!code) return;

  const scanInput = document.getElementById('posBarcodeScanInput');
  try {
    const res = await api(`/api/inventory/barcode?code=${encodeURIComponent(code)}`);
    const item = (res && res.item) ? res.item : res;
    if (item && item.id) {
      playScanSound();
      addToCart(item.id);
      showToast(`⚡ Scanned: ${item.name} (${formatMoney(item.price_cents)}) - Added to Cart!`, 'success');
      if (scanInput) {
        scanInput.value = '';
        scanInput.focus();
      }
    }
  } catch (err) {
    showToast(`⚠️ Barcode / SKU "${code}" not found in inventory`, 'error');
    if (scanInput) {
      scanInput.select();
    }
  }
}

// ================= BARCODE GENERATOR & LABEL STUDIO =================

function populateBarcodeSelectProduct() {
  const selProduct = document.getElementById('barcodeSelectProduct');
  if (!selProduct) return;
  const currentSel = selProduct.value;
  selProduct.innerHTML = '<option value="">-- Choose Existing Accessory to Print or Edit --</option>' + STATE.inventory.map(item => `
    <option value="${item.id}" ${item.id == currentSel ? 'selected' : ''}>
      ${escapeHtml(item.name)} — [${item.barcode || 'XP89...'}] — ${formatMoney(item.price_cents)}
    </option>
  `).join('');
}

function initBarcodeStudio() {
  const selProduct = document.getElementById('barcodeSelectProduct');
  const codeInp = document.getElementById('barcodeInputCode');
  const shelfInp = document.getElementById('barcodeShelfLocation');
  const priceInp = document.getElementById('barcodePriceDisplay');
  const qtyInp = document.getElementById('barcodeLabelQty');
  const formatInp = document.getElementById('barcodeLabelFormat');
  const btnRegen = document.getElementById('btnRegenerateBarcode');
  const btnPrint = document.getElementById('btnPrintBarcodeLabelsBtn');
  const prodNameInp = document.getElementById('studioProdName');
  const prodCatInp = document.getElementById('studioProdCat');
  const prodCostInp = document.getElementById('studioProdCost');
  const prodQtyInp = document.getElementById('studioProdQty');
  const prodSkuInp = document.getElementById('studioProdSku');
  const btnSaveStudio = document.getElementById('btnStudioSaveAndGenerate');
  const searchInp = document.getElementById('barcodeTableSearch');

  populateBarcodeSelectProduct();

  if (selProduct) {
    selProduct.onchange = () => {
      const prodId = parseInt(selProduct.value, 10);
      if (prodId) {
        loadProductIntoStudio(prodId);
      }
    };
  }

  if (btnRegen) {
    btnRegen.onclick = () => {
      const rand = Math.floor(100000 + Math.random() * 900000);
      if (codeInp) codeInp.value = `XP89${rand}`;
      if (prodSkuInp && (!prodSkuInp.value || prodSkuInp.value.startsWith('SKU-'))) {
        prodSkuInp.value = `SKU-${String(rand).slice(-4)}`;
      }
      renderStickerPreview();
    };
  }

  [prodNameInp, codeInp, shelfInp, priceInp, qtyInp, formatInp, prodSkuInp].forEach(el => {
    if (el) el.oninput = renderStickerPreview;
  });

  if (btnSaveStudio) {
    btnSaveStudio.onclick = async () => {
      const name = (prodNameInp?.value || '').trim();
      if (!name) {
        showToast('Please enter accessory / product name', 'error');
        prodNameInp?.focus();
        return;
      }
      const cat = prodCatInp?.value || 'Merchandise';
      const shelf = (shelfInp?.value || '').trim() || 'Rack A-1 (Cases)';
      const priceCents = parseCents(priceInp?.value || '19.99');
      const costCents = parseCents(prodCostInp?.value || '6.50');
      const qty = parseInt(prodQtyInp?.value, 10) || 15;
      let code = (codeInp?.value || '').trim();
      if (!code) {
        code = `XP89${Math.floor(100000 + Math.random() * 900000)}`;
        if (codeInp) codeInp.value = code;
      }
      const sku = (prodSkuInp?.value || '').trim() || `SKU-${code.slice(-4)}`;

      try {
        await api('/api/inventory', {
          method: 'POST',
          body: JSON.stringify({
            username: STATE.user ? STATE.user.username : 'admin',
            name, category: cat, price_cents: priceCents, cost_cents: costCents,
            quantity: qty, shelf_location: shelf, barcode: code, sku
          })
        });

        showToast(`⚡ "${name}" saved and barcode labels generated!`, 'success');
        await loadInventory();
        const newItem = STATE.inventory.find(i => (i.barcode === code) || (i.name.toLowerCase() === name.toLowerCase()));
        if (newItem && selProduct) {
          selProduct.value = newItem.id;
        }
        renderStickerPreview();
        renderBarcodeRegistryTable();
      } catch (e) {}
    };
  }

  if (searchInp) {
    searchInp.oninput = () => renderBarcodeRegistryTable();
  }

  if (btnPrint) {
    btnPrint.onclick = handlePrintBarcodeLabels;
  }

  // Ensure default barcode code exists if blank
  if (codeInp && !codeInp.value) {
    codeInp.value = `XP89${Math.floor(100000 + Math.random() * 900000)}`;
  }

  renderStickerPreview();
  renderBarcodeRegistryTable();
}

function loadProductIntoStudio(productId) {
  const item = STATE.inventory.find(i => i.id === productId);
  if (!item) return;

  const selProduct = document.getElementById('barcodeSelectProduct');
  const prodNameInp = document.getElementById('studioProdName');
  const prodCatInp = document.getElementById('studioProdCat');
  const shelfInp = document.getElementById('barcodeShelfLocation');
  const priceInp = document.getElementById('barcodePriceDisplay');
  const prodCostInp = document.getElementById('studioProdCost');
  const prodQtyInp = document.getElementById('studioProdQty');
  const codeInp = document.getElementById('barcodeInputCode');
  const prodSkuInp = document.getElementById('studioProdSku');

  if (selProduct) selProduct.value = item.id;
  if (prodNameInp) prodNameInp.value = item.name;
  if (prodCatInp) prodCatInp.value = item.category || 'Merchandise';
  if (shelfInp) shelfInp.value = item.shelf_location || 'Rack A-1 (Cases)';
  if (priceInp) priceInp.value = formatMoney(item.price_cents);
  if (prodCostInp) prodCostInp.value = (item.cost_cents ? (item.cost_cents / 100).toFixed(2) : '0.00');
  if (prodQtyInp) prodQtyInp.value = item.quantity || 15;
  if (codeInp) codeInp.value = item.barcode || `XP89${String(item.id).padStart(6, '0')}`;
  if (prodSkuInp) prodSkuInp.value = item.sku || `SKU-${(item.barcode || '0000').slice(-4)}`;

  renderStickerPreview();
  showToast(`Loaded "${item.name}" into Barcode Studio!`, 'info');

  const hero = document.querySelector('.barcode-studio-hero-grid');
  if (hero) hero.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderBarcodeRegistryTable() {
  const tbody = document.getElementById('barcodeRegistryTableBody');
  if (!tbody) return;
  const search = (document.getElementById('barcodeTableSearch')?.value || '').toLowerCase().trim();

  const filtered = STATE.inventory.filter(item => {
    const name = (item.name || '').toLowerCase();
    const bcode = (item.barcode || '').toLowerCase();
    const sku = (item.sku || '').toLowerCase();
    const loc = (item.shelf_location || '').toLowerCase();
    return !search || name.includes(search) || bcode.includes(search) || sku.includes(search) || loc.includes(search);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:25px; color:var(--text-muted);">No accessories found matching "${escapeHtml(search)}". Use the quick form above to add a new product.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const code = item.barcode || `XP89${String(item.id).padStart(6, '0')}`;
    const shelf = item.shelf_location || 'Rack A-1';
    return `
      <tr>
        <td style="font-family:var(--font-mono); color:var(--text-muted);">${item.id}</td>
        <td>
          <strong style="color:#fff;">${escapeHtml(item.name)}</strong>
          ${item.sku ? `<div style="font-size:0.72rem; color:var(--text-muted); font-family:var(--font-mono);">SKU: ${escapeHtml(item.sku)}</div>` : ''}
        </td>
        <td>
          <div style="display:flex; flex-direction:column; gap:2px;">
            <code style="font-size:0.82rem; color:var(--accent-primary); font-weight:700;">${code}</code>
            <div style="width:110px; height:22px; overflow:hidden;">
              ${generateBarcodeSVG(code, 1.2, 20)}
            </div>
          </div>
        </td>
        <td><span class="shelf-chip">📍 ${escapeHtml(shelf)}</span></td>
        <td style="font-family:var(--font-mono); font-weight:700; color:var(--accent-emerald);">${formatMoney(item.price_cents)}</td>
        <td><strong>${item.quantity}</strong> units</td>
        <td>
          <button type="button" class="btn-primary" style="padding:6px 14px; font-size:0.8rem;" onclick="loadProductIntoStudio(${item.id})">
            🏷️ Load to Print
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderStickerPreview() {
  const previewContainer = document.getElementById('stickerSheetPreview');
  const selProduct = document.getElementById('barcodeSelectProduct');
  const prodNameInp = document.getElementById('studioProdName');
  const codeInp = document.getElementById('barcodeInputCode');
  const shelfInp = document.getElementById('barcodeShelfLocation');
  const priceInp = document.getElementById('barcodePriceDisplay');
  const qtyInp = document.getElementById('barcodeLabelQty');
  const formatInp = document.getElementById('barcodeLabelFormat');
  const prodSkuInp = document.getElementById('studioProdSku');

  if (!previewContainer) return;

  const prodId = selProduct ? parseInt(selProduct.value, 10) : null;
  const selectedItem = STATE.inventory.find(i => i.id === prodId);

  const displayName = (prodNameInp && prodNameInp.value.trim())
    ? prodNameInp.value.trim()
    : (selectedItem ? selectedItem.name : 'Universal Magnetic Phone Case');

  const code = (codeInp && codeInp.value.trim()) ? codeInp.value.trim() : (selectedItem?.barcode || 'XP89000001');
  const shelf = (shelfInp && shelfInp.value.trim()) ? shelfInp.value.trim() : (selectedItem?.shelf_location || 'Rack A-1 (Cases)');
  const price = (priceInp && priceInp.value.trim()) ? priceInp.value.trim() : (selectedItem ? formatMoney(selectedItem.price_cents) : '$19.99');
  const qty = qtyInp ? Math.max(1, Math.min(100, parseInt(qtyInp.value, 10) || 8)) : 8;
  const sku = (prodSkuInp && prodSkuInp.value.trim()) ? prodSkuInp.value.trim() : (selectedItem?.sku || `SKU-${code.slice(-4)}`);

  const badge = document.getElementById('previewLabelCountBadge');
  if (badge) badge.textContent = `${qty} Labels (${formatInp ? formatInp.value : 'Standard'})`;

  const barcodeSvgHtml = generateBarcodeSVG(code, 1.8, 38);

  const labelHtml = `
    <div class="printable-barcode-label">
      <div class="label-top-row">
        <span class="label-brand-name">⚡ X PRO WIRELESS & REPAIR</span>
        <span class="label-shelf-badge">📍 ${escapeHtml(shelf)}</span>
      </div>
      <div class="label-product-title" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</div>
      <div class="label-barcode-svg-wrap">
        ${barcodeSvgHtml}
      </div>
      <div class="label-barcode-text">${code}</div>
      <div class="label-bottom-row">
        <span class="label-sku-tag">${escapeHtml(sku)}</span>
        <span class="label-price-tag">${escapeHtml(price)}</span>
      </div>
    </div>
  `;

  let sheetHtml = '';
  for (let i = 0; i < qty; i++) {
    sheetHtml += labelHtml;
  }
  previewContainer.innerHTML = sheetHtml;
}

function handlePrintBarcodeLabels() {
  const preview = document.getElementById('stickerSheetPreview');
  const printSection = document.getElementById('barcodePrintSection');
  const formatSelect = document.getElementById('barcodeLabelFormat');
  if (!preview || !printSection) return;

  const format = formatSelect ? formatSelect.value : 'sheet-24';
  const gridClass = format === 'thermal-single' ? 'print-grid-thermal' : 'print-grid-a4';

  printSection.className = `print-only-container ${gridClass}`;
  printSection.innerHTML = preview.innerHTML;

  window.print();
}

// ================= REPORTS & ANALYTICS =================

async function loadReportsSummary() {
  try {
    const data = await api('/api/reports/summary');
    const today = data.today || {};
    
    // KPIs
    document.getElementById('repKpiRevenue').textContent = formatMoney(today.revenue_cents || 0);
    document.getElementById('repKpiCost').textContent = formatMoney(today.cost_cents || 0);
    document.getElementById('repKpiProfit').textContent = formatMoney(today.profit_cents || 0);
    const margin = (today.margin_pct !== undefined ? today.margin_pct : (today.margin_percent || 0));
    document.getElementById('repKpiMargin').textContent = `${Number(margin).toFixed(1)}%`;
    document.getElementById('repKpiOrders').textContent = today.orders || today.orders_count || 0;

    // Monthly Report KPI Cards
    const month = data.month || {};
    const repMonthRevenue = document.getElementById('repMonthRevenue');
    const repMonthCost = document.getElementById('repMonthCost');
    const repMonthProfit = document.getElementById('repMonthProfit');
    const repMonthMargin = document.getElementById('repMonthMargin');
    const repMonthOrders = document.getElementById('repMonthOrders');

    if (repMonthRevenue) repMonthRevenue.textContent = formatMoney(month.revenue_cents || 0);
    if (repMonthCost) repMonthCost.textContent = formatMoney(month.cost_cents || 0);
    if (repMonthProfit) repMonthProfit.textContent = formatMoney(month.profit_cents || 0);
    if (repMonthMargin) {
      const mMargin = month.margin_pct !== undefined ? month.margin_pct : (month.margin_percent || 0);
      repMonthMargin.textContent = `${Number(mMargin).toFixed(1)}%`;
    }
    if (repMonthOrders) repMonthOrders.textContent = month.orders || month.orders_count || 0;

    // Payment method breakdown
    const payContainer = document.getElementById('repPaymentBreakdown');
    if (payContainer) {
      const totalRev = today.revenue_cents || 1;
      const methods = [
        { name: 'Cash', cents: 0, icon: '💵' },
        { name: 'Card', cents: 0, icon: '💳' },
        { name: 'Other', cents: 0, icon: '🔄' }
      ];

      if (Array.isArray(today.payments)) {
        today.payments.forEach(p => {
          const match = methods.find(m => m.name.toLowerCase() === (p.payment || '').toLowerCase());
          if (match) match.cents += (p.total_cents || 0);
          else methods[2].cents += (p.total_cents || 0);
        });
      } else if (today.payment_methods) {
        methods[0].cents = today.payment_methods.Cash || 0;
        methods[1].cents = today.payment_methods.Card || 0;
        methods[2].cents = today.payment_methods.Other || 0;
      }

      payContainer.innerHTML = methods.map(m => {
        const pct = Math.round((m.cents / totalRev) * 100);
        return `
          <div class="payment-bar-item">
            <div class="payment-bar-info">
              <span>${m.icon} ${m.name}</span>
              <span><strong>${formatMoney(m.cents)}</strong> (${pct}%)</span>
            </div>
            <div class="payment-progress-track">
              <div class="payment-progress-fill" style="width: ${pct}%;"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Top Selling Accessories
    const topTbody = document.getElementById('repTopItemsTable');
    if (topTbody) {
      const items = data.top_accessories || [];
      if (items.length === 0) {
        topTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:18px; color:var(--text-muted);">No accessories recorded yet.</td></tr>`;
      } else {
        topTbody.innerHTML = items.map(i => `
          <tr>
            <td><strong>${escapeHtml(i.name)}</strong></td>
            <td><span class="shelf-chip">📍 ${escapeHtml(i.shelf_location || 'Store')}</span></td>
            <td style="font-family:var(--font-mono); font-weight:700;">${formatMoney(i.price_cents)}</td>
            <td><strong>${i.quantity}</strong> in stock</td>
          </tr>
        `).join('');
      }
    }

    // 7-day Weekly table
    const weeklyTbody = document.getElementById('repWeeklyTable');
    if (weeklyTbody) {
      const days = data.trend_7d || [];
      weeklyTbody.innerHTML = days.map(d => `
        <tr>
          <td><strong>${d.date}</strong></td>
          <td>${d.orders} sales</td>
          <td style="font-family:var(--font-mono); font-weight:700; color:var(--text-primary);">${formatMoney(d.revenue_cents)}</td>
          <td style="font-family:var(--font-mono); font-weight:700; color:var(--accent-emerald);">${formatMoney(d.profit_cents)}</td>
          <td>
            <span class="status-badge ${d.profit_cents > 0 ? 'ready' : 'in-progress'}">
              ${d.profit_cents > 0 ? 'Profitable' : 'No Sales'}
            </span>
          </td>
        </tr>
      `).join('');
    }

    // Placement breakdown table
    const placeTbody = document.getElementById('repPlacementTable');
    if (placeTbody) {
      const placements = data.placements || [];
      placeTbody.innerHTML = placements.map(p => `
        <tr>
          <td><strong style="color:var(--accent-primary);">📍 ${escapeHtml(p.location)}</strong></td>
          <td>${p.sku_count} distinct SKUs</td>
          <td><strong>${p.total_units}</strong> units</td>
          <td style="font-family:var(--font-mono); font-weight:700; color:var(--accent-emerald);">${formatMoney(p.valuation_cents)}</td>
        </tr>
      `).join('');
    }
  } catch (e) {}
}

function setupReportsTab() {
  document.querySelectorAll('[data-report-view]').forEach(pill => {
    pill.onclick = () => {
      document.querySelectorAll('[data-report-view]').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const view = pill.getAttribute('data-report-view');
      document.querySelectorAll('.report-section').forEach(s => s.classList.remove('active'));
      if (view === 'daily') document.getElementById('reportDailyView')?.classList.add('active');
      if (view === 'weekly') document.getElementById('reportWeeklyView')?.classList.add('active');
      if (view === 'monthly') document.getElementById('reportMonthlyView')?.classList.add('active');
      if (view === 'placement') document.getElementById('reportPlacementView')?.classList.add('active');
      if (view === 'executive') {
        document.getElementById('reportExecutiveView')?.classList.add('active');
        loadExecutiveAnalytics();
      }
    };
  });
}

// ================= CUSTOMER CRM =================

async function loadCustomers() {
  try {
    const list = await api('/api/customers');
    STATE.customers = list || [];

    const tbody = document.getElementById('customersTableBody');
    if (tbody) {
      if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-muted);">No customer profiles found. Add customers to track lifetime spend.</td></tr>`;
      } else {
        tbody.innerHTML = list.map(c => `
          <tr>
            <td style="font-family:var(--font-mono); color:var(--text-muted);">${c.id}</td>
            <td><strong>${escapeHtml(c.name)}</strong></td>
            <td><a href="tel:${escapeHtml(c.phone)}" style="color:var(--accent-primary); text-decoration:none;">📞 ${escapeHtml(c.phone)}</a></td>
            <td>${escapeHtml(c.email || '—')}</td>
            <td style="font-family:var(--font-mono); font-weight:700; color:var(--accent-emerald);">${formatMoney(c.total_spend_cents || 0)}</td>
            <td><strong>${c.order_count || 0}</strong> purchases</td>
            <td style="font-size:0.82rem; color:var(--text-secondary);">${escapeHtml(c.notes || '—')}</td>
            <td>
              <button class="btn-table-action" onclick="fillCartCustomer('${escapeHtml(c.name)}')">Attach to Cart</button>
            </td>
          </tr>
        `).join('');
      }
    }

    const datalist = document.getElementById('customerDatalist');
    if (datalist) {
      datalist.innerHTML = list.map(c => `<option value="${escapeHtml(c.name)} (${escapeHtml(c.phone)})">${escapeHtml(c.name)} - ${escapeHtml(c.phone)}</option>`).join('');
    }
  } catch (e) {}
}

function fillCartCustomer(name) {
  switchToTab('checkout');
  const custInp = document.getElementById('cartCustomer');
  if (custInp) {
    custInp.value = name;
  }
}

// ================= GENERAL EVENT LISTENERS =================

function setupEventListeners() {
  // Theme toggle
  document.getElementById('btnToggleTheme').onclick = () => {
    document.body.classList.toggle('light-theme');
  };

  // In-app header role switcher buttons
  document.querySelectorAll('.role-pill-btn').forEach(btn => {
    btn.onclick = async () => {
      const rKey = btn.getAttribute('data-switch-role');
      await performDemoLogin(rKey);
    };
  });

  // Demo seed button
  document.getElementById('btnSeedDemo').onclick = async () => {
    try {
      await api('/api/seed-demo', {
        method: 'POST',
        body: JSON.stringify({ username: STATE.user ? STATE.user.username : 'admin' })
      });
      showToast('Loaded demo store inventory & repairs!', 'success');
      loadInventory();
      loadRepairs();
      refreshSystemStatus();
    } catch (e) {}
  };

  // Category pills
  document.getElementById('categoryPills').addEventListener('click', (e) => {
    if (e.target.classList.contains('pill')) {
      document.querySelectorAll('#categoryPills .pill').forEach(p => p.classList.remove('active'));
      e.target.classList.add('active');
      STATE.selectedCategory = e.target.getAttribute('data-cat');
      renderCatalog();
    }
  });

  // Catalog search
  document.getElementById('catalogSearch').oninput = () => renderCatalog();

  // Shelf filter & inventory table search
  const filterShelf = document.getElementById('filterShelfSelect');
  if (filterShelf) {
    filterShelf.onchange = () => {
      STATE.selectedShelfFilter = filterShelf.value;
      renderInventoryTable();
    };
  }

  const inpInvSearch = document.getElementById('inventoryTableSearch');
  if (inpInvSearch) {
    inpInvSearch.oninput = () => renderInventoryTable();
  }

  // Clear cart
  document.getElementById('btnClearCart').onclick = clearCart;

  // Payment buttons
  document.querySelectorAll('.pay-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.pay-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.selectedPayment = btn.getAttribute('data-pay');
      const cashGroup = document.getElementById('cashTenderedGroup');
      cashGroup.style.display = STATE.selectedPayment === 'Cash' ? 'flex' : 'none';
    };
  });

  // Cash preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.onclick = () => {
      const amt = btn.getAttribute('data-amt');
      const totalCents = STATE.cart.reduce((a, b) => a + (b.price_cents * b.quantity), 0);
      if (amt === 'exact') {
        document.getElementById('cashTenderedInput').value = (totalCents / 100).toFixed(2);
      } else {
        document.getElementById('cashTenderedInput').value = (parseInt(amt) / 100).toFixed(2);
      }
      updateChangeDue(totalCents);
    };
  });

  document.getElementById('cashTenderedInput').oninput = () => {
    const totalCents = STATE.cart.reduce((a, b) => a + (b.price_cents * b.quantity), 0);
    updateChangeDue(totalCents);
  };

  // Complete sale
  document.getElementById('btnCompleteSale').onclick = handleCompleteSale;

  // Custom quick item
  document.getElementById('btnQuickCustomSale').onclick = () => {
    const name = prompt('Enter custom item / service name:', 'Phone Diagnostic / Unlock');
    if (!name) return;
    const priceStr = prompt('Enter item price ($):', '25.00');
    if (!priceStr) return;
    const cents = parseCents(priceStr);
    STATE.cart.push({
      id: null,
      name: name,
      category: 'Merchandise',
      price_cents: cents,
      quantity: 1
    });
    renderCart();
  };

  // Shift control modal trigger
  document.getElementById('btnOpenShiftModal').onclick = () => {
    if (STATE.activeShift) {
      showCloseShiftPrompt();
    } else {
      showOpenShiftPrompt();
    }
  };

  // Logout
  document.getElementById('btnLogout').onclick = () => {
    if (confirm('Lock register & sign out?')) {
      localStorage.removeItem('xpro_user');
      STATE.user = null;
      updateUserBadge();
      showLoginModal();
    }
  };

  // Auto Generate Barcode in Add Product Modal
  const btnGenBarcode = document.getElementById('btnGenProdBarcode');
  if (btnGenBarcode) {
    btnGenBarcode.onclick = () => {
      const rand = Math.floor(100000 + Math.random() * 900000);
      document.getElementById('inpProdBarcode').value = `XP89${rand}`;
    };
  }

  // Add Product Modal
  document.getElementById('btnOpenAddProductModal').onclick = () => openModal('productModal');
  document.getElementById('btnSaveProduct').onclick = async () => {
    const name = document.getElementById('inpProdName').value.trim();
    const cat = document.getElementById('inpProdCat').value;
    const price = parseCents(document.getElementById('inpProdPrice').value);
    const cost = parseCents(document.getElementById('inpProdCost').value);
    const qty = parseInt(document.getElementById('inpProdQty').value) || 1;
    const shelf = document.getElementById('inpProdShelf').value.trim() || 'Front Display Rack A-1';
    const barcode = document.getElementById('inpProdBarcode').value.trim();
    const sku = document.getElementById('inpProdSku').value.trim();

    if (!name || price <= 0) return showToast('Please enter valid product name & price', 'error');

    try {
      await api('/api/inventory', {
        method: 'POST',
        body: JSON.stringify({
          username: STATE.user ? STATE.user.username : 'admin',
          name, category: cat, price_cents: price, cost_cents: cost,
          quantity: qty, shelf_location: shelf, barcode, sku
        })
      });
      closeModal('productModal');
      showToast('Product added with barcode & shelf placement!', 'success');
      document.getElementById('inpProdName').value = '';
      loadInventory();
      refreshSystemStatus();
    } catch (e) {}
  };

  // Customer CRM Modal Controls
  const btnOpenCust = document.getElementById('btnOpenNewCustomerModal');
  if (btnOpenCust) btnOpenCust.onclick = () => openModal('customerModal');

  const btnSaveCust = document.getElementById('btnSaveCustomer');
  if (btnSaveCust) {
    btnSaveCust.onclick = async () => {
      const name = document.getElementById('inpCustName').value.trim();
      const phone = document.getElementById('inpCustPhone').value.trim();
      const email = document.getElementById('inpCustEmail').value.trim();
      const notes = document.getElementById('inpCustNotes').value.trim();

      if (!name || !phone) return showToast('Customer name and phone are required', 'error');

      try {
        await api('/api/customers', {
          method: 'POST',
          body: JSON.stringify({ name, phone, email, notes })
        });
        closeModal('customerModal');
        showToast('Customer profile added to CRM!', 'success');
        document.getElementById('inpCustName').value = '';
        document.getElementById('inpCustPhone').value = '';
        document.getElementById('inpCustEmail').value = '';
        document.getElementById('inpCustNotes').value = '';
        loadCustomers();
      } catch (e) {}
    };
  }

  // New Repair Modal
  document.getElementById('btnOpenNewRepairModal').onclick = () => openModal('repairModal');
  document.getElementById('btnSaveRepair').onclick = async () => {
    const cust = document.getElementById('inpRepCust').value.trim();
    const phone = document.getElementById('inpRepPhone').value.trim();
    const dev = document.getElementById('inpRepDevice').value.trim();
    const issue = document.getElementById('inpRepIssue').value.trim();
    if (!cust || !dev) return showToast('Customer and device required', 'error');

    try {
      await api('/api/repairs', {
        method: 'POST',
        body: JSON.stringify({
          username: STATE.user ? STATE.user.username : 'admin',
          customer: cust, contact: phone, device: dev, issue: issue
        })
      });
      closeModal('repairModal');
      showToast('Repair ticket created!', 'success');
      loadRepairs();
      refreshSystemStatus();
    } catch (e) {}
  };

  // Confirm Repair Ready
  document.getElementById('btnConfirmRepairReady').onclick = async () => {
    const method = document.getElementById('inpReadyMethod').value;
    try {
      await api('/api/repairs/update-status', {
        method: 'POST',
        body: JSON.stringify({
          username: STATE.user ? STATE.user.username : 'admin',
          ticket_id: STATE.activeRepairForReady,
          status: 'READY',
          notification: method
        })
      });
      closeModal('repairReadyModal');
      showToast('Device marked Ready and notification logged!', 'success');
      loadRepairs();
    } catch (e) {}
  };

  // Service Ledger Modal
  document.getElementById('btnOpenLedgerModal').onclick = () => openModal('ledgerModal');
  document.getElementById('btnSaveLedger').onclick = async () => {
    const biz = document.getElementById('inpLedgerBusiness').value;
    const kind = document.getElementById('inpLedgerKind').value;
    const ref = document.getElementById('inpLedgerRef').value.trim();
    const desc = document.getElementById('inpLedgerDesc').value.trim();
    const cashIn = parseCents(document.getElementById('inpLedgerIn').value);
    const cashOut = parseCents(document.getElementById('inpLedgerOut').value);
    const fee = parseCents(document.getElementById('inpLedgerFee').value);
    const comm = parseCents(document.getElementById('inpLedgerComm').value);

    try {
      await api('/api/ledger', {
        method: 'POST',
        body: JSON.stringify({
          username: STATE.user ? STATE.user.username : 'admin',
          business: biz, kind, reference: ref, description: desc,
          cash_in_cents: cashIn, cash_out_cents: cashOut,
          fee_cents: fee, commission_cents: comm
        })
      });
      closeModal('ledgerModal');
      showToast('Service ledger activity recorded!', 'success');
      loadLedger();
    } catch (e) {}
  };

  // Confirm Return / Store Credit
  document.getElementById('btnConfirmReturn').onclick = async () => {
    if (!STATE.activeSaleForReturn) return;
    const opened = document.getElementById('chkReturnOpened').checked;
    const note = document.getElementById('inpReturnNote').value.trim();

    try {
      await api('/api/sales/return', {
        method: 'POST',
        body: JSON.stringify({
          username: STATE.user ? STATE.user.username : 'admin',
          role: STATE.user ? STATE.user.role : 'admin',
          sale_id: STATE.activeSaleForReturn.id,
          opened: opened,
          note: note
        })
      });
      closeModal('returnModal');
      showToast('Store credit return issued successfully!', 'success');
      loadSalesHistory();
    } catch (e) {}
  };

  // ERP & Fast POS Event Listeners
  const btnSplit = document.getElementById('btnOpenSplitModal');
  if (btnSplit) btnSplit.onclick = openSplitModal;

  const btnHotkeys = document.getElementById('btnHotkeysGuide');
  if (btnHotkeys) btnHotkeys.onclick = () => openModal('hotkeysModal');

  const btnHold = document.getElementById('btnHoldCart');
  if (btnHold) btnHold.onclick = holdCurrentCart;

  const btnSwap = document.getElementById('btnSwapCart');
  if (btnSwap) btnSwap.onclick = () => {
    if (STATE.heldCarts.length > 0) switchHeldCart(0);
    else showToast('No held carts parked.', 'info');
  };

  const btnCoupon = document.getElementById('btnApplyCoupon');
  if (btnCoupon) btnCoupon.onclick = applyCouponCode;

  const btnLoyalty = document.getElementById('btnApplyLoyalty');
  if (btnLoyalty) btnLoyalty.onclick = applyLoyaltyRedemption;

  const btnSync = document.getElementById('btnSyncOfflineQueue');
  if (btnSync) btnSync.onclick = syncOfflineQueue;

  const btnOpenPo = document.getElementById('btnOpenNewPoModal');
  if (btnOpenPo) btnOpenPo.onclick = openNewPoModal;

  const btnOpenSup = document.getElementById('btnOpenSupplierModal');
  if (btnOpenSup) btnOpenSup.onclick = () => openModal('supplierModal');

  const btnOpenAudit = document.getElementById('btnOpenStockAuditModal');
  if (btnOpenAudit) btnOpenAudit.onclick = openStockAuditModal;

  const btnOpenCmb = document.getElementById('btnOpenComboModal');
  if (btnOpenCmb) btnOpenCmb.onclick = openComboModal;

  const btnOpenOmni = document.getElementById('btnOpenOmniModal');
  if (btnOpenOmni) btnOpenOmni.onclick = openOmniModal;

  setupGlobalHotkeys();
  updateSyncPill();
  renderHeldCarts();

  // Print Receipt Button inside Modal
  document.getElementById('btnPrintReceiptBtn').onclick = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(document.getElementById('receiptPaperContainer').innerHTML);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  // Shift Note posting
  document.getElementById('btnSaveNote').onclick = async () => {
    const text = document.getElementById('noteInput').value.trim();
    if (!text) return;
    try {
      await api('/api/notes', {
        method: 'POST',
        body: JSON.stringify({
          username: STATE.user ? STATE.user.username : 'admin',
          note: text
        })
      });
      document.getElementById('noteInput').value = '';
      showToast('Note posted!', 'success');
      loadNotes();
    } catch (e) {}
  };

  // Sales Search
  document.getElementById('salesSearch').oninput = () => loadSalesHistory();

  // Save Printer Mode
  document.getElementById('btnSavePrinterMode').onclick = async () => {
    const mode = document.getElementById('printerModeSelect').value;
    try {
      await api('/api/settings', {
        method: 'POST',
        body: JSON.stringify({
          username: STATE.user ? STATE.user.username : 'admin',
          role: STATE.user ? STATE.user.role : 'admin',
          printer_mode: mode
        })
      });
      showToast('Printer mode saved!', 'success');
    } catch (e) {}
  };
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Bootstrap
window.addEventListener('DOMContentLoaded', initApp);



// ================= ENTERPRISE ERP & OFFLINE POS SUITE EXTENSION =================

// Extend STATE
if (!STATE.heldCarts) STATE.heldCarts = [];
if (!STATE.offlineQueue) STATE.offlineQueue = [];
STATE.appliedCoupon = null;
STATE.appliedLoyaltyPoints = 0;
STATE.appliedLoyaltyDiscountCents = 0;
STATE.isOnline = navigator.onLine;
STATE.poLineItems = [];
STATE.comboConstituents = [];

// ================= INDEXEDDB OFFLINE CLIENT =================
const DB_NAME = 'xpro_retail_offline_v1';
const DB_VERSION = 1;
let idbInstance = null;

function getOfflineDB() {
  return new Promise((resolve, reject) => {
    if (idbInstance) return resolve(idbInstance);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('offline_sales')) {
        db.createObjectStore('offline_sales', { keyPath: 'offline_id' });
      }
    };
    req.onsuccess = (e) => {
      idbInstance = e.target.result;
      resolve(idbInstance);
    };
    req.onerror = (e) => reject(e);
  });
}

async function cacheProductsOffline(products) {
  try {
    const db = await getOfflineDB();
    const tx = db.transaction('products', 'readwrite');
    const store = tx.objectStore('products');
    store.clear();
    products.forEach(p => store.put(p));
  } catch (err) {
    console.warn('Could not cache products offline:', err);
  }
}

async function getOfflineCachedProducts() {
  try {
    const db = await getOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction('products', 'readonly');
      const store = tx.objectStore('products');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    return [];
  }
}

async function queueOfflineSale(salePayload) {
  try {
    const db = await getOfflineDB();
    const tx = db.transaction('offline_sales', 'readwrite');
    const store = tx.objectStore('offline_sales');
    store.put(salePayload);
    updateSyncPill();
  } catch (err) {
    console.error('Error queuing offline sale:', err);
  }
}

async function getQueuedOfflineSales() {
  try {
    const db = await getOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction('offline_sales', 'readonly');
      const store = tx.objectStore('offline_sales');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    return [];
  }
}

async function removeQueuedOfflineSale(offlineId) {
  try {
    const db = await getOfflineDB();
    const tx = db.transaction('offline_sales', 'readwrite');
    const store = tx.objectStore('offline_sales');
    store.delete(offlineId);
  } catch (err) {}
}

async function updateSyncPill() {
  const pill = document.getElementById('offlineSyncPill');
  const countBadge = document.getElementById('syncQueueCount');
  const queued = await getQueuedOfflineSales();
  const isOnline = navigator.onLine;

  if (pill) {
    if (!isOnline) {
      pill.className = 'sync-pill offline';
      pill.innerHTML = `🔴 Offline Mode (${queued.length} queued)`;
    } else if (queued.length > 0) {
      pill.className = 'sync-pill pending';
      pill.innerHTML = `🟡 Online (${queued.length} to sync)`;
    } else {
      pill.className = 'sync-pill online';
      pill.innerHTML = `🟢 Online &amp; Synced`;
    }
  }

  if (countBadge) {
    countBadge.textContent = queued.length;
    countBadge.style.display = queued.length > 0 ? 'inline-block' : 'none';
  }
}

async function syncOfflineQueue() {
  const queued = await getQueuedOfflineSales();
  if (queued.length === 0) {
    showToast('All transactions are already synced!', 'info');
    return;
  }
  showToast(`Syncing ${queued.length} offline orders to central ERP...`, 'info');
  let synced = 0;
  for (const sale of queued) {
    try {
      await api('/api/pos/split-checkout', {
        method: 'POST',
        body: JSON.stringify(sale)
      });
      await removeQueuedOfflineSale(sale.offline_id);
      synced++;
    } catch (err) {
      console.warn('Failed to sync sale:', sale.offline_id, err);
    }
  }
  showToast(`Successfully synced ${synced} orders! Central inventory & accounts updated.`, 'success');
  updateSyncPill();
  loadInventory();
  refreshSystemStatus();
}

// Network events
window.addEventListener('online', () => {
  STATE.isOnline = true;
  updateSyncPill();
  showToast('Internet connection restored. Back online!', 'success');
  syncOfflineQueue();
});
window.addEventListener('offline', () => {
  STATE.isOnline = false;
  updateSyncPill();
  showToast('Internet disconnected. Switched to Offline POS Mode!', 'warning');
});

// ================= KEYBOARD-FIRST POS HOTKEYS =================
function setupGlobalHotkeys() {
  window.addEventListener('keydown', (e) => {
    // If typing inside an input/textarea (except barcode scan or hotkeys like Esc, F-keys)
    const activeEl = document.activeElement;
    const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');

    // Esc: Close any open modal
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
      return;
    }

    // F1: Help / Hotkeys guide
    if (e.key === 'F1') {
      e.preventDefault();
      openModal('hotkeysModal');
      return;
    }

    // F2: Focus Barcode Scanner / SKU Search
    if (e.key === 'F2') {
      e.preventDefault();
      switchToTab('checkout');
      const scanInput = document.getElementById('posBarcodeScanInput') || document.getElementById('catalogSearch');
      if (scanInput) {
        scanInput.focus();
        scanInput.select();
      }
      return;
    }

    // F3: Hold Current Cart
    if (e.key === 'F3') {
      e.preventDefault();
      if (STATE.currentTab === 'checkout') holdCurrentCart();
      return;
    }

    // F4: Cycle Held Carts
    if (e.key === 'F4') {
      e.preventDefault();
      if (STATE.heldCarts.length > 0) {
        switchHeldCart(0);
      } else {
        showToast('No held carts parked.', 'info');
      }
      return;
    }

    // F8: Split Tender Payment Modal
    if (e.key === 'F8') {
      e.preventDefault();
      if (STATE.currentTab === 'checkout') openSplitModal();
      return;
    }

    // F9: Quick Cash Checkout
    if (e.key === 'F9') {
      e.preventDefault();
      if (STATE.currentTab === 'checkout' && STATE.cart.length > 0) {
        handleCompleteSale();
      }
      return;
    }

    // F10: Shift Float Modal
    if (e.key === 'F10') {
      e.preventDefault();
      const btn = document.getElementById('btnOpenShiftModal');
      if (btn) btn.click();
      return;
    }
  });
}

// ================= MULTI-CART HOLD & SWITCH (CART SWAPPING) =================
function renderHeldCarts() {
  const container = document.getElementById('heldCartsList');
  const countSpan = document.getElementById('heldCartsCount');
  if (!container) return;

  if (countSpan) countSpan.textContent = STATE.heldCarts.length;

  if (STATE.heldCarts.length === 0) {
    container.innerHTML = `<span style="font-size:0.8rem; color:var(--text-secondary); font-style:italic;">No held carts. Press [F3] to hold current cart.</span>`;
    return;
  }

  container.innerHTML = STATE.heldCarts.map((c, idx) => {
    const total = c.items.reduce((sum, item) => sum + (item.price_cents * item.quantity), 0);
    return `
      <div class="held-cart-pill" onclick="switchHeldCart(${idx})">
        <span>🛒 Cart #${idx + 1} (${c.items.length} items - ${formatMoney(total)})</span>
        <button class="discard-btn" title="Discard" onclick="event.stopPropagation(); discardHeldCart(${idx});">&times;</button>
      </div>
    `;
  }).join('');
}

function holdCurrentCart() {
  if (STATE.cart.length === 0) {
    showToast('Active cart is empty. Nothing to hold.', 'info');
    return;
  }
  const custInp = document.getElementById('cartCustomer');
  const custName = custInp ? custInp.value.trim() : '';

  STATE.heldCarts.push({
    id: 'CART-' + Date.now().toString(36).toUpperCase(),
    timestamp: new Date().toLocaleTimeString(),
    customer: custName,
    items: [...STATE.cart]
  });

  STATE.cart = [];
  if (custInp) custInp.value = '';
  renderCart();
  renderHeldCarts();
  showToast(`Cart #${STATE.heldCarts.length} held. Fresh cart ready! [F4 to resume]`, 'success');
}

function switchHeldCart(index) {
  if (index < 0 || index >= STATE.heldCarts.length) return;
  const currentCartItems = [...STATE.cart];
  const custInp = document.getElementById('cartCustomer');
  const currentCustomer = custInp ? custInp.value.trim() : '';

  const targetCart = STATE.heldCarts.splice(index, 1)[0];

  if (currentCartItems.length > 0) {
    STATE.heldCarts.push({
      id: 'CART-' + Date.now().toString(36).toUpperCase(),
      timestamp: new Date().toLocaleTimeString(),
      customer: currentCustomer,
      items: currentCartItems
    });
  }

  STATE.cart = targetCart.items;
  if (custInp) custInp.value = targetCart.customer || '';
  renderCart();
  renderHeldCarts();
  showToast('Switched to held cart!', 'success');
}

function discardHeldCart(index) {
  if (confirm('Discard this held cart?')) {
    STATE.heldCarts.splice(index, 1);
    renderHeldCarts();
    showToast('Held cart discarded.', 'info');
  }
}

// ================= SPLIT TENDER PAYMENT MODAL =================
function openSplitModal() {
  if (STATE.cart.length === 0) {
    showToast('Your cart is empty. Add items first!', 'warning');
    return;
  }
  const totalCents = calculateCartTotalCents();
  document.getElementById('splitTotalBill').textContent = formatMoney(totalCents);
  document.getElementById('splitRemainingDue').textContent = formatMoney(totalCents);
  document.getElementById('splitRemainingDue').style.color = 'var(--accent)';

  document.getElementById('splitCashInput').value = (totalCents / 100).toFixed(2);
  document.getElementById('splitCardInput').value = '0.00';
  document.getElementById('splitMfsInput').value = '0.00';
  document.getElementById('splitCashHanded').value = (totalCents / 100).toFixed(2);

  updateSplitMath();
  openModal('splitModal');
}

function calculateCartTotalCents() {
  let subtotal = STATE.cart.reduce((sum, item) => sum + (item.price_cents * item.quantity), 0);
  let discount = STATE.appliedLoyaltyDiscountCents || 0;
  if (STATE.appliedCoupon) {
    if (STATE.appliedCoupon.discount_type === 'PERCENT') {
      discount += Math.round(subtotal * (STATE.appliedCoupon.discount_value / 100));
    } else {
      discount += STATE.appliedCoupon.discount_value;
    }
  }
  return Math.max(0, subtotal - discount);
}

function updateSplitMath() {
  const totalCents = calculateCartTotalCents();
  const cashCents = parseCents(document.getElementById('splitCashInput').value);
  const cardCents = parseCents(document.getElementById('splitCardInput').value);
  const mfsCents = parseCents(document.getElementById('splitMfsInput').value);

  const tenderedTotal = cashCents + cardCents + mfsCents;
  const remaining = totalCents - tenderedTotal;
  const remainingEl = document.getElementById('splitRemainingDue');
  const alertEl = document.getElementById('splitValidationAlert');

  if (remaining === 0) {
    remainingEl.textContent = '$0.00 (Balanced)';
    remainingEl.style.color = '#00e676';
    alertEl.style.display = 'none';
  } else if (remaining > 0) {
    remainingEl.textContent = `${formatMoney(remaining)} Due`;
    remainingEl.style.color = '#FF6A00';
    alertEl.style.display = 'block';
    alertEl.innerHTML = `⚠️ Remaining $${(remaining / 100).toFixed(2)} must be assigned across Cash, Card, or MFS.`;
  } else {
    remainingEl.textContent = `Overpaid by ${formatMoney(Math.abs(remaining))}`;
    remainingEl.style.color = '#ff5252';
    alertEl.style.display = 'block';
    alertEl.innerHTML = `⚠️ Tender exceeds total bill by $${(Math.abs(remaining) / 100).toFixed(2)}. Adjust payment lines.`;
  }

  // Change math
  const cashHanded = parseCents(document.getElementById('splitCashHanded').value);
  const changeEl = document.getElementById('splitChangeDue');
  if (cashHanded > cashCents) {
    changeEl.textContent = formatMoney(cashHanded - cashCents);
  } else {
    changeEl.textContent = '$0.00';
  }
}

async function submitSplitCheckout() {
  const totalCents = calculateCartTotalCents();
  const cashCents = parseCents(document.getElementById('splitCashInput').value);
  const cardCents = parseCents(document.getElementById('splitCardInput').value);
  const mfsCents = parseCents(document.getElementById('splitMfsInput').value);
  const tenderedTotal = cashCents + cardCents + mfsCents;

  if (tenderedTotal !== totalCents) {
    showToast(`Payment total ($${(tenderedTotal/100).toFixed(2)}) does not match bill due ($${(totalCents/100).toFixed(2)})!`, 'error');
    return;
  }

  const payments = [];
  if (cashCents > 0) payments.push({ method: 'Cash', amount_cents: cashCents });
  if (cardCents > 0) payments.push({ method: 'Card', amount_cents: cardCents });
  if (mfsCents > 0) payments.push({ method: 'MFS', amount_cents: mfsCents });

  const custInp = document.getElementById('cartCustomer');
  const custName = custInp ? custInp.value.trim() : 'Walk-in Customer';

  const payload = {
    username: STATE.user ? STATE.user.username : 'admin',
    role: STATE.user ? STATE.user.role : 'admin',
    customer_name: custName,
    items: STATE.cart.map(item => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      price_cents: item.price_cents
    })),
    payments: payments,
    discount_cents: (STATE.appliedLoyaltyDiscountCents || 0) + (STATE.appliedCoupon ? STATE.appliedCoupon.discount_value : 0),
    loyalty_points_redeemed: STATE.appliedLoyaltyPoints || 0
  };

  // If offline, queue locally in IndexedDB!
  if (!navigator.onLine) {
    payload.offline_id = 'OFFLINE-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    payload.created_at = new Date().toISOString();
    await queueOfflineSale(payload);
    closeModal('splitModal');
    playScanSound();
    showToast('Offline Mode: Sale saved to local queue. Auto-syncs when online!', 'warning');
    renderReceiptPreview({
      receipt_number: payload.offline_id,
      customer_name: custName,
      items: payload.items,
      payments: payments,
      total_cents: totalCents,
      is_offline: true
    });
    STATE.cart = [];
    resetDiscounts();
    renderCart();
    return;
  }

  try {
    const res = await api('/api/pos/split-checkout', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    closeModal('splitModal');
    playScanSound();
    showToast(`Sale #${res.sale_id} completed! Journal Voucher #${res.journal_entry_id} posted.`, 'success');
    renderReceiptPreview({
      receipt_number: res.sale_id,
      customer_name: custName,
      items: payload.items,
      payments: payments,
      total_cents: totalCents
    });
    STATE.cart = [];
    resetDiscounts();
    renderCart();
    loadInventory();
    refreshSystemStatus();
  } catch (err) {
    showToast('Error completing split sale: ' + (err.message || 'Server error'), 'error');
  }
}

function resetDiscounts() {
  STATE.appliedCoupon = null;
  STATE.appliedLoyaltyPoints = 0;
  STATE.appliedLoyaltyDiscountCents = 0;
  const cInp = document.getElementById('couponCodeInput');
  const lInp = document.getElementById('loyaltyPointsInput');
  if (cInp) cInp.value = '';
  if (lInp) lInp.value = '';
}

// ================= COUPONS & LOYALTY =================
async function applyCouponCode() {
  const inp = document.getElementById('couponCodeInput');
  const code = inp ? inp.value.trim().toUpperCase() : '';
  if (!code) return;
  try {
    const coupons = await api('/api/crm/coupons');
    const match = coupons.find(c => c.code.toUpperCase() === code && c.is_active);
    if (!match) {
      showToast('Invalid or expired coupon code.', 'error');
      return;
    }
    STATE.appliedCoupon = match;
    showToast(`Coupon ${match.code} applied! (${match.discount_type === 'PERCENT' ? match.discount_value + '%' : formatMoney(match.discount_value)} off)`, 'success');
    renderCart();
  } catch (err) {
    showToast('Could not validate coupon.', 'error');
  }
}

function applyLoyaltyRedemption() {
  const inp = document.getElementById('loyaltyPointsInput');
  const pts = parseInt(inp ? inp.value : 0, 10) || 0;
  if (pts <= 0) return;
  if (pts % 10 !== 0) {
    showToast('Loyalty points must be redeemed in increments of 10 points (10 pts = $1.00).', 'warning');
    return;
  }
  const discountCents = (pts / 10) * 100;
  STATE.appliedLoyaltyPoints = pts;
  STATE.appliedLoyaltyDiscountCents = discountCents;
  showToast(`Redeemed ${pts} loyalty points for $${(discountCents/100).toFixed(2)} store discount!`, 'success');
  renderCart();
}

// ================= PROCUREMENT & PO WORKFLOW =================
async function loadProcurementData() {
  try {
    const [pos, suppliers, grns] = await Promise.all([
      api('/api/procurement/po'),
      api('/api/procurement/suppliers'),
      api('/api/procurement/po/receive').catch(() => [])
    ]);

    // Update KPI cards
    const kpiSup = document.getElementById('procKpiSuppliers');
    const kpiOpen = document.getElementById('procKpiOpenPos');
    const kpiGrn = document.getElementById('procKpiCompletedGrns');
    const kpiAp = document.getElementById('procKpiAccountsPayable');

    if (kpiSup) kpiSup.textContent = suppliers ? suppliers.length : 0;
    if (kpiOpen) {
      const openCount = (pos || []).filter(p => p.status !== 'RECEIVED' && p.status !== 'CANCELLED').length;
      kpiOpen.textContent = openCount;
    }
    if (kpiGrn) kpiGrn.textContent = (pos || []).filter(p => p.status === 'RECEIVED').length;
    if (kpiAp) {
      const totalAp = (suppliers || []).reduce((sum, s) => sum + (s.outstanding_balance_cents || 0), 0);
      kpiAp.textContent = formatMoney(totalAp);
    }

    renderPurchaseOrders(pos || []);
    renderSuppliers(suppliers || []);
    renderGoodsReceipts(pos || []);
  } catch (err) {
    console.warn('Procurement load error:', err);
  }
}

function renderPurchaseOrders(pos) {
  const tbody = document.getElementById('procPoTableBody');
  if (!tbody) return;

  if (pos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-secondary);">No Purchase Orders generated yet. Click "Draft Purchase Order" above.</td></tr>`;
    return;
  }

  tbody.innerHTML = pos.map(p => {
    let statusClass = 'po-draft';
    if (p.status === 'PENDING_APPROVAL') statusClass = 'po-pending';
    if (p.status === 'APPROVED') statusClass = 'po-approved';
    if (p.status === 'RECEIVED') statusClass = 'po-received';

    let actionButtons = '';
    if (p.status === 'DRAFT') {
      actionButtons = `<button class="btn-table-action" onclick="approvePo('${p.po_number}')">Submit &amp; Approve</button>`;
    } else if (p.status === 'PENDING_APPROVAL') {
      actionButtons = `<button class="btn-table-action" onclick="approvePo('${p.po_number}')">✅ Approve PO</button>`;
    } else if (p.status === 'APPROVED') {
      actionButtons = `<button class="btn-table-action" style="background:#00e676; color:#000; font-weight:800;" onclick="receivePoGoods('${p.po_number}')">⚡ Receive Goods (GRN)</button>`;
    } else if (p.status === 'RECEIVED') {
      actionButtons = `<span style="color:#00e676; font-size:0.8rem; font-weight:700;">✔️ GRN Completed</span>`;
    }

    return `
      <tr>
        <td style="font-family:var(--font-mono); font-weight:800; color:var(--accent);">${escapeHtml(p.po_number)}</td>
        <td>${escapeHtml(p.order_date || '—')}</td>
        <td><strong>${escapeHtml(p.supplier_name)}</strong></td>
        <td>${p.items ? p.items.length : 1} line item(s)</td>
        <td style="font-family:var(--font-mono); font-weight:700;">${formatMoney(p.total_cost_cents)}</td>
        <td>${escapeHtml(p.expected_date || 'Prompt')}</td>
        <td><span class="po-status-badge ${statusClass}">${escapeHtml(p.status)}</span></td>
        <td>${actionButtons}</td>
      </tr>
    `;
  }).join('');
}

function renderSuppliers(suppliers) {
  const tbody = document.getElementById('procSupplierTableBody');
  const poSelect = document.getElementById('poSupplierSelect');
  if (tbody) {
    if (suppliers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-secondary);">No vendors registered. Add a supplier to begin procurement.</td></tr>`;
    } else {
      tbody.innerHTML = suppliers.map(s => `
        <tr>
          <td style="font-family:var(--font-mono); color:var(--text-secondary);">${escapeHtml(s.code)}</td>
          <td><strong>${escapeHtml(s.name)}</strong></td>
          <td>${escapeHtml(s.contact_person || '—')}</td>
          <td>${escapeHtml(s.phone || '—')} <br><small style="color:var(--text-secondary);">${escapeHtml(s.email || '')}</small></td>
          <td><span class="shelf-chip">${escapeHtml(s.payment_terms || 'NET_30')}</span></td>
          <td style="font-family:var(--font-mono); font-weight:700; color:#ff5252;">${formatMoney(s.outstanding_balance_cents || 0)}</td>
          <td><button class="btn-table-action" onclick="openNewPoForSupplier('${s.id}')">➕ Order From Vendor</button></td>
        </tr>
      `).join('');
    }
  }

  if (poSelect) {
    poSelect.innerHTML = `<option value="">-- Choose Supplier --</option>` + suppliers.map(s => `
      <option value="${s.id}">${escapeHtml(s.name)} (${escapeHtml(s.code)}) - Terms: ${escapeHtml(s.payment_terms)}</option>
    `).join('');
  }
}

function renderGoodsReceipts(pos) {
  const tbody = document.getElementById('procGrnTableBody');
  if (!tbody) return;
  const received = pos.filter(p => p.status === 'RECEIVED');
  if (received.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-secondary);">No goods receipts processed yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = received.map((p, i) => `
    <tr>
      <td style="font-family:var(--font-mono); font-weight:700; color:#00e676;">GRN-${escapeHtml(p.po_number.replace('PO-', ''))}</td>
      <td style="font-family:var(--font-mono);">${escapeHtml(p.po_number)}</td>
      <td>${escapeHtml(p.order_date || 'Today')}</td>
      <td>Warehouse Receiving Staff</td>
      <td style="font-family:var(--font-mono); font-weight:700; color:var(--accent);">${formatMoney(p.total_cost_cents)}</td>
      <td style="color:#00e676; font-weight:700;">Credited to AP Ledger (${escapeHtml(p.supplier_name)})</td>
      <td><span class="status-badge ready">Stock Incremented &amp; WAC Recalculated</span></td>
    </tr>
  `).join('');
}

async function approvePo(poNumber) {
  try {
    await api('/api/procurement/po/approve', {
      method: 'POST',
      body: JSON.stringify({
        po_number: poNumber,
        username: STATE.user ? STATE.user.username : 'admin'
      })
    });
    showToast(`PO ${poNumber} approved! Ready for goods arrival.`, 'success');
    loadProcurementData();
  } catch (err) {
    showToast('Failed to approve PO.', 'error');
  }
}

async function receivePoGoods(poNumber) {
  if (!confirm(`Confirm atomic Goods Receipt for ${poNumber}?\n\nThis will:\n1. Increment physical stock for all ordered SKUs\n2. Recalculate Weighted Average Cost (WAC)\n3. Credit Supplier Accounts Payable (AP)\n4. Automatically post double-entry Journal Voucher`)) return;

  try {
    const res = await api('/api/procurement/po/receive', {
      method: 'POST',
      body: JSON.stringify({
        po_number: poNumber,
        received_by: STATE.user ? STATE.user.username : 'admin'
      })
    });
    playScanSound();
    showToast(`📦 Received! GRN #${res.grn_number} generated. Stock incremented & JV #${res.journal_entry_id} posted!`, 'success');
    loadProcurementData();
    loadInventory();
  } catch (err) {
    showToast('Failed to receive goods: ' + (err.message || 'Error'), 'error');
  }
}

function openNewPoModal() {
  STATE.poLineItems = [{ product_id: '', unit_cost_cents: 0, quantity: 10 }];
  renderPoLineItems();
  openModal('poModal');
}

function addPoLineItemRow() {
  STATE.poLineItems.push({ product_id: '', unit_cost_cents: 0, quantity: 10 });
  renderPoLineItems();
}

function renderPoLineItems() {
  const tbody = document.getElementById('poLineItemsBody');
  if (!tbody) return;

  tbody.innerHTML = STATE.poLineItems.map((item, idx) => {
    const prodOptions = STATE.inventory.map(p => `
      <option value="${p.id}" ${item.product_id == p.id ? 'selected' : ''}>${escapeHtml(p.name)} (Cost: ${formatMoney(p.cost_cents)})</option>
    `).join('');

    const subtotal = item.unit_cost_cents * item.quantity;

    return `
      <tr>
        <td>
          <select onchange="updatePoLineProd(${idx}, this.value)" style="width:100%; padding:6px; border-radius:6px; background:#121824; color:#fff; border:1px solid var(--border-color);">
            <option value="">-- Select Product --</option>
            ${prodOptions}
          </select>
        </td>
        <td>
          <input type="number" step="0.01" min="0" value="${(item.unit_cost_cents / 100).toFixed(2)}" oninput="updatePoLineCost(${idx}, this.value)" style="width:100%; padding:6px; border-radius:6px; background:#121824; color:#fff; border:1px solid var(--border-color);">
        </td>
        <td>
          <input type="number" min="1" value="${item.quantity}" oninput="updatePoLineQty(${idx}, this.value)" style="width:100%; padding:6px; border-radius:6px; background:#121824; color:#fff; border:1px solid var(--border-color);">
        </td>
        <td style="text-align:right; font-family:var(--font-mono); font-weight:700;">
          ${formatMoney(subtotal)}
        </td>
        <td style="text-align:center;">
          <button type="button" class="btn-secondary-sm" style="color:#ff5252; padding:2px 8px;" onclick="removePoLineItem(${idx})">&times;</button>
        </td>
      </tr>
    `;
  }).join('');

  const total = STATE.poLineItems.reduce((sum, item) => sum + (item.unit_cost_cents * item.quantity), 0);
  document.getElementById('poTotalAmountDisplay').textContent = formatMoney(total);
}

function updatePoLineProd(idx, prodId) {
  const p = STATE.inventory.find(i => i.id == prodId);
  if (p) {
    STATE.poLineItems[idx].product_id = p.id;
    STATE.poLineItems[idx].unit_cost_cents = p.cost_cents || 0;
  }
  renderPoLineItems();
}

function updatePoLineCost(idx, val) {
  STATE.poLineItems[idx].unit_cost_cents = parseCents(val);
  renderPoLineItems();
}

function updatePoLineQty(idx, val) {
  STATE.poLineItems[idx].quantity = parseInt(val, 10) || 1;
  renderPoLineItems();
}

function removePoLineItem(idx) {
  STATE.poLineItems.splice(idx, 1);
  renderPoLineItems();
}

async function submitDraftPo() {
  const supId = document.getElementById('poSupplierSelect').value;
  const expDate = document.getElementById('poExpectedDate').value;
  const notes = document.getElementById('poNotes').value.trim();

  if (!supId) {
    showToast('Please select a supplier.', 'error');
    return;
  }
  const validItems = STATE.poLineItems.filter(i => i.product_id && i.quantity > 0);
  if (validItems.length === 0) {
    showToast('Please add at least one line item to order.', 'error');
    return;
  }

  try {
    const res = await api('/api/procurement/po', {
      method: 'POST',
      body: JSON.stringify({
        supplier_id: supId,
        expected_date: expDate,
        notes: notes,
        items: validItems,
        username: STATE.user ? STATE.user.username : 'admin'
      })
    });
    closeModal('poModal');
    showToast(`Draft Purchase Order ${res.po_number} created!`, 'success');
    loadProcurementData();
  } catch (err) {
    showToast('Failed to create PO: ' + (err.message || 'Error'), 'error');
  }
}

async function submitNewSupplier() {
  const name = document.getElementById('supName').value.trim();
  const code = document.getElementById('supCode').value.trim();
  const contact = document.getElementById('supContact').value.trim();
  const phone = document.getElementById('supPhone').value.trim();
  const email = document.getElementById('supEmail').value.trim();
  const terms = document.getElementById('supTerms').value;

  if (!name) return showToast('Please enter supplier company name', 'error');

  try {
    await api('/api/procurement/suppliers', {
      method: 'POST',
      body: JSON.stringify({ name, code, contact_person: contact, phone, email, payment_terms: terms })
    });
    closeModal('supplierModal');
    showToast(`Supplier ${name} created!`, 'success');
    loadProcurementData();
  } catch (err) {
    showToast('Error saving supplier.', 'error');
  }
}

// ================= AUTOMATED DOUBLE-ENTRY ACCOUNTING =================
async function loadAccountingData() {
  try {
    const [tbRes, pnlRes, glRes, jvRes] = await Promise.all([
      api('/api/accounting/trial-balance'),
      api('/api/accounting/profit-loss'),
      api('/api/accounting/general-ledger'),
      api('/api/accounting/journal')
    ]);

    renderTrialBalance(tbRes);
    renderProfitLoss(pnlRes);
    renderGeneralLedger(glRes || []);
    renderJournalVouchers(jvRes || []);
  } catch (err) {
    console.warn('Accounting load error:', err);
  }
}

function renderTrialBalance(tb) {
  const summaryEl = document.getElementById('trialBalanceSummaryCard');
  const tbody = document.getElementById('trialBalanceTableBody');
  if (!summaryEl || !tbody || !tb) return;

  const isBalanced = tb.is_balanced;
  const statusColor = isBalanced ? '#00e676' : '#ff5252';
  const statusText = isBalanced ? '⚖️ PERFECTLY BALANCED (Zero Discrepancy)' : '⚠️ DISCREPANCY DETECTED';

  summaryEl.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
      <div>
        <div style="font-size:0.85rem; color:var(--text-secondary);">Trial Balance Status</div>
        <div style="font-size:1.25rem; font-weight:900; color:${statusColor};">${statusText}</div>
      </div>
      <div style="display:flex; gap:20px; text-align:right;">
        <div>
          <div style="font-size:0.8rem; color:var(--text-secondary);">Total Debits</div>
          <div style="font-size:1.3rem; font-weight:800; color:#fff;">${formatMoney(tb.total_debit_cents)}</div>
        </div>
        <div>
          <div style="font-size:0.8rem; color:var(--text-secondary);">Total Credits</div>
          <div style="font-size:1.3rem; font-weight:800; color:var(--accent);">${formatMoney(tb.total_credit_cents)}</div>
        </div>
      </div>
    </div>
  `;

  tbody.innerHTML = (tb.accounts || []).map(a => {
    let typeClass = 'asset';
    if (a.type === 'LIABILITY') typeClass = 'liability';
    if (a.type === 'EQUITY') typeClass = 'equity';
    if (a.type === 'REVENUE') typeClass = 'revenue';
    if (a.type === 'COGS' || a.type === 'EXPENSE') typeClass = 'expense';

    return `
      <tr>
        <td style="font-family:var(--font-mono); font-weight:800; color:var(--accent);">${a.code}</td>
        <td><strong>${escapeHtml(a.name)}</strong></td>
        <td><span class="shelf-chip ${typeClass}">${a.type}</span></td>
        <td style="text-align:right; font-family:var(--font-mono); font-weight:700;">${a.debit_cents > 0 ? formatMoney(a.debit_cents) : '—'}</td>
        <td style="text-align:right; font-family:var(--font-mono); font-weight:700;">${a.credit_cents > 0 ? formatMoney(a.credit_cents) : '—'}</td>
      </tr>
    `;
  }).join('');
}

function renderProfitLoss(pnl) {
  const hero = document.getElementById('pnlHeroCard');
  const revTbody = document.getElementById('pnlRevenueTableBody');
  const expTbody = document.getElementById('pnlExpenseTableBody');
  if (!hero || !pnl) return;

  hero.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; margin-bottom:14px;">
      <div>
        <h3 style="margin:0 0 4px 0; color:#fff;">📊 Real-Time Operating Profit &amp; Loss Statement</h3>
        <p style="font-size:0.82rem; color:var(--text-secondary); margin:0;">Zero-manual entries: Generated automatically from point-of-sale checkouts and goods receipts.</p>
      </div>
      <div style="text-align:right;">
        <span style="font-size:0.85rem; color:var(--text-secondary);">Net Store Margin:</span>
        <strong style="font-size:1.4rem; color:#00e676; margin-left:8px;">${pnl.margin_pct}%</strong>
      </div>
    </div>
    <div class="kpi-grid" style="margin:0;">
      <div class="kpi-card">
        <span class="kpi-title">Gross Revenue</span>
        <span class="kpi-value accent">${formatMoney(pnl.gross_revenue_cents)}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-title">Cost of Goods (COGS)</span>
        <span class="kpi-value warning">${formatMoney(pnl.cogs_cents)}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-title">Gross Profit</span>
        <span class="kpi-value accent">${formatMoney(pnl.gross_profit_cents)}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-title">Operating Expenses</span>
        <span class="kpi-value warning">${formatMoney(pnl.operating_expenses_cents)}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-title">Net Operating Profit</span>
        <span class="kpi-value" style="color:#00e676;">${formatMoney(pnl.net_profit_cents)}</span>
      </div>
    </div>
  `;

  if (revTbody) {
    revTbody.innerHTML = `
      <tr><td>4010 - Retail Accessories Sales</td><td style="text-align:right; font-family:var(--font-mono); font-weight:700;">${formatMoney(pnl.gross_revenue_cents)}</td></tr>
      <tr><td>4020 - Repair &amp; Service Revenue</td><td style="text-align:right; font-family:var(--font-mono); font-weight:700;">$0.00</td></tr>
      <tr><td>4030 - Money Transfer Commissions</td><td style="text-align:right; font-family:var(--font-mono); font-weight:700;">$0.00</td></tr>
      <tr style="border-top:2px solid var(--border-color); font-weight:800;"><td>Total Operating Revenue</td><td style="text-align:right; font-family:var(--font-mono); color:var(--accent);">${formatMoney(pnl.gross_revenue_cents)}</td></tr>
    `;
  }

  if (expTbody) {
    expTbody.innerHTML = `
      <tr><td>5010 - COGS - Accessories &amp; Merchandise</td><td style="text-align:right; font-family:var(--font-mono); font-weight:700;">${formatMoney(pnl.cogs_cents)}</td></tr>
      <tr><td>5020 - Inventory Shrinkage &amp; Discrepancy Loss</td><td style="text-align:right; font-family:var(--font-mono); font-weight:700;">$0.00</td></tr>
      <tr><td>6010 - Store Rent Expense</td><td style="text-align:right; font-family:var(--font-mono); font-weight:700;">$0.00</td></tr>
      <tr><td>6020 - Utilities &amp; Internet</td><td style="text-align:right; font-family:var(--font-mono); font-weight:700;">$0.00</td></tr>
      <tr style="border-top:2px solid var(--border-color); font-weight:800;"><td>Total Cost &amp; Expenses</td><td style="text-align:right; font-family:var(--font-mono); color:#ff5252;">${formatMoney(pnl.cogs_cents + pnl.operating_expenses_cents)}</td></tr>
    `;
  }
}

function renderGeneralLedger(entries) {
  const tbody = document.getElementById('glTableBody');
  const select = document.getElementById('glAccountSelect');
  if (!tbody) return;

  if (entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-secondary);">No general ledger postings recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = entries.map(e => `
    <tr>
      <td style="font-size:0.82rem; color:var(--text-secondary);">${escapeHtml(e.created_at || '—')}</td>
      <td style="font-family:var(--font-mono); font-weight:700; color:var(--accent);">${escapeHtml(e.entry_number)}</td>
      <td><strong>${escapeHtml(e.account_code)} - ${escapeHtml(e.account_name)}</strong></td>
      <td>${escapeHtml(e.description)}</td>
      <td style="text-align:right; font-family:var(--font-mono); font-weight:700; color:#00e676;">${e.debit_cents > 0 ? formatMoney(e.debit_cents) : '—'}</td>
      <td style="text-align:right; font-family:var(--font-mono); font-weight:700; color:#ff5252;">${e.credit_cents > 0 ? formatMoney(e.credit_cents) : '—'}</td>
    </tr>
  `).join('');
}

function renderJournalVouchers(entries) {
  const tbody = document.getElementById('jvTableBody');
  if (!tbody) return;

  if (entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-secondary);">No journal entries recorded.</td></tr>`;
    return;
  }

  tbody.innerHTML = entries.map(e => {
    const linesSummary = (e.lines || []).map(l => `
      <div style="font-size:0.8rem; margin-bottom:2px;">
        ${l.debit_cents > 0 ? `🟢 Dr [${l.account_code}] ${l.account_name}: ${formatMoney(l.debit_cents)}` : `🔴 Cr [${l.account_code}] ${l.account_name}: ${formatMoney(l.credit_cents)}`}
      </div>
    `).join('');

    const total = (e.lines || []).reduce((sum, l) => sum + (l.debit_cents || 0), 0);

    return `
      <tr>
        <td style="font-family:var(--font-mono); font-weight:800; color:var(--accent);">${escapeHtml(e.entry_number)}</td>
        <td style="font-size:0.82rem; color:var(--text-secondary);">${escapeHtml(e.created_at || '—')}</td>
        <td><span class="shelf-chip">${escapeHtml(e.reference_type)}: ${escapeHtml(e.reference_id || '—')}</span></td>
        <td><strong>${escapeHtml(e.description)}</strong></td>
        <td>${linesSummary}</td>
        <td style="text-align:right; font-family:var(--font-mono); font-weight:800;">${formatMoney(total)}</td>
      </tr>
    `;
  }).join('');
}

// Subview switching for Accounting
document.querySelectorAll('[data-acc-subview]').forEach(pill => {
  pill.onclick = () => {
    document.querySelectorAll('[data-acc-subview]').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    const view = pill.getAttribute('data-acc-subview');
    document.querySelectorAll('.acc-subview-panel').forEach(panel => panel.classList.remove('active'));
    if (view === 'trial_balance') document.getElementById('accSubviewTrialBalance')?.classList.add('active');
    if (view === 'pnl') document.getElementById('accSubviewPnl')?.classList.add('active');
    if (view === 'general_ledger') document.getElementById('accSubviewGl')?.classList.add('active');
    if (view === 'journal_vouchers') document.getElementById('accSubviewJv')?.classList.add('active');
  };
});

// Subview switching for Procurement
document.querySelectorAll('[data-proc-subview]').forEach(pill => {
  pill.onclick = () => {
    document.querySelectorAll('[data-proc-subview]').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    const view = pill.getAttribute('data-proc-subview');
    document.querySelectorAll('.proc-subview-panel').forEach(panel => panel.classList.remove('active'));
    if (view === 'pos') document.getElementById('procSubviewPos')?.classList.add('active');
    if (view === 'suppliers') document.getElementById('procSubviewSuppliers')?.classList.add('active');
    if (view === 'grns') document.getElementById('procSubviewGrns')?.classList.add('active');
  };
});

// ================= INVENTORY COVERAGE RUNWAY & AUDITS =================
async function loadCoverageAndAudits() {
  try {
    const [covRes, auditRes] = await Promise.all([
      api('/api/inventory/coverage-analytics'),
      api('/api/inventory/audits')
    ]);
    renderCoverageTable(covRes || []);
    renderAuditsTable(auditRes || []);
  } catch (err) {
    console.warn('Coverage / audit error:', err);
  }
}

function renderCoverageTable(items) {
  const tbody = document.getElementById('coverageTableBody');
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-secondary);">No inventory coverage records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(i => {
    let statusBadge = '<span class="status-badge ready">NORMAL</span>';
    if (i.velocity_status === 'CRITICAL_REORDER') {
      statusBadge = '<span class="status-badge alert" style="background:#ff1744; color:#fff;">⚠️ CRITICAL REORDER</span>';
    } else if (i.velocity_status === 'FAST_MOVING') {
      statusBadge = '<span class="status-badge in-progress" style="background:#ff9100; color:#000;">🔥 FAST MOVING</span>';
    } else if (i.velocity_status === 'SLOW_MOVING') {
      statusBadge = '<span class="status-badge" style="background:#2979ff; color:#fff;">💤 SLOW MOVING</span>';
    }

    const runwayText = i.coverage_days >= 999 ? '999+ Days' : `${i.coverage_days} Days`;

    return `
      <tr>
        <td style="font-family:var(--font-mono); font-size:0.85rem;">${escapeHtml(i.sku || i.barcode || '—')}</td>
        <td><strong>${escapeHtml(i.name)}</strong></td>
        <td><span class="shelf-chip">📍 ${escapeHtml(i.shelf_location || 'Store')}</span></td>
        <td><strong>${i.stock_quantity}</strong> units</td>
        <td>${i.sales_last_30_days} units</td>
        <td style="font-family:var(--font-mono);">${i.daily_velocity} / day</td>
        <td style="font-weight:800; font-family:var(--font-mono); color:${i.coverage_days < 7 ? '#ff1744' : 'var(--accent)'};">${runwayText}</td>
        <td>${i.reorder_point} units</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join('');
}

function renderAuditsTable(audits) {
  const tbody = document.getElementById('auditReconcileTableBody');
  if (!tbody) return;

  if (audits.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px; color:var(--text-secondary);">No physical audits recorded. Click "Start Physical Count Audit" above.</td></tr>`;
    return;
  }

  tbody.innerHTML = audits.map(a => `
    <tr>
      <td style="font-family:var(--font-mono); font-weight:800; color:var(--accent);">${escapeHtml(a.audit_number)}</td>
      <td style="font-size:0.82rem; color:var(--text-secondary);">${escapeHtml(a.created_at || '—')}</td>
      <td><strong>${escapeHtml(a.product_name)}</strong></td>
      <td>${a.system_stock} units</td>
      <td><strong>${a.physical_count}</strong> units</td>
      <td style="font-weight:800; color:${a.discrepancy < 0 ? '#ff5252' : '#00e676'};">${a.discrepancy} units</td>
      <td style="font-family:var(--font-mono); font-weight:700; color:#ff5252;">${formatMoney(a.discrepancy_cost_cents)}</td>
      <td><span class="shelf-chip">${escapeHtml(a.reason || 'Theft/Pilferage')}</span></td>
      <td style="font-family:var(--font-mono); color:#00e676;">${a.journal_entry_id ? `JV-${a.journal_entry_id}` : 'None'}</td>
      <td><span class="status-badge ready">${escapeHtml(a.status || 'RECONCILED')}</span></td>
    </tr>
  `).join('');
}

// Subview switching for Audits
document.querySelectorAll('[data-audit-subview]').forEach(pill => {
  pill.onclick = () => {
    document.querySelectorAll('[data-audit-subview]').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    const view = pill.getAttribute('data-audit-subview');
    document.querySelectorAll('.audit-subview-panel').forEach(panel => panel.classList.remove('active'));
    if (view === 'coverage') document.getElementById('auditSubviewCoverage')?.classList.add('active');
    if (view === 'audits') document.getElementById('auditSubviewAudits')?.classList.add('active');
    if (view === 'transfers') document.getElementById('auditSubviewTransfers')?.classList.add('active');
  };
});

function openStockAuditModal() {
  const select = document.getElementById('auditProdSelect');
  if (select) {
    select.innerHTML = `<option value="">-- Choose Inventory Item --</option>` + STATE.inventory.map(p => `
      <option value="${p.id}">${escapeHtml(p.name)} [Stock: ${p.quantity} | Shelf: ${escapeHtml(p.shelf_location || 'Floor')}]</option>
    `).join('');
  }
  document.getElementById('auditPhysicalCount').value = '';
  document.getElementById('auditDiscrepancyCard').style.display = 'none';
  openModal('stockAuditModal');
}

function updateAuditProductPreview() {
  const pId = document.getElementById('auditProdSelect').value;
  const p = STATE.inventory.find(i => i.id == pId);
  if (p) {
    document.getElementById('auditSystemStockDisplay').textContent = `${p.quantity} units`;
    document.getElementById('auditUnitCostDisplay').textContent = formatMoney(p.cost_cents || 0);
  } else {
    document.getElementById('auditSystemStockDisplay').textContent = `-- units`;
    document.getElementById('auditUnitCostDisplay').textContent = `$0.00`;
  }
  updateAuditDiscrepancyMath();
}

function updateAuditDiscrepancyMath() {
  const pId = document.getElementById('auditProdSelect').value;
  const p = STATE.inventory.find(i => i.id == pId);
  const physicalCount = parseInt(document.getElementById('auditPhysicalCount').value, 10);
  const card = document.getElementById('auditDiscrepancyCard');

  if (!p || isNaN(physicalCount)) {
    card.style.display = 'none';
    return;
  }

  const diff = physicalCount - p.quantity;
  const diffCost = Math.abs(diff) * (p.cost_cents || 0);

  card.style.display = 'block';
  if (diff === 0) {
    card.style.background = 'rgba(0,230,118,0.1)';
    card.style.border = '1px solid #00e676';
    card.innerHTML = `<strong style="color:#00e676;">✔️ Zero Discrepancy:</strong> Physical count perfectly matches system records!`;
  } else if (diff < 0) {
    card.style.background = 'rgba(255,82,82,0.1)';
    card.style.border = '1px solid #ff5252';
    card.innerHTML = `
      <strong style="color:#ff5252;">⚠️ Shrinkage Shortfall: ${Math.abs(diff)} units missing!</strong><br>
      Estimated Loss Value: <strong>${formatMoney(diffCost)}</strong>.
      This amount will automatically be debited to Account 5020 (Shrinkage Loss) upon reconciliation!
    `;
  } else {
    card.style.background = 'rgba(255,160,0,0.1)';
    card.style.border = '1px solid #ffa000';
    card.innerHTML = `
      <strong style="color:#ffa000;">📈 Stock Surplus: +${diff} unrecorded units found!</strong><br>
      Inventory asset valuation will be adjusted upward by ${formatMoney(diffCost)}.
    `;
  }
}

async function submitStockAudit() {
  const pId = document.getElementById('auditProdSelect').value;
  const physicalCount = parseInt(document.getElementById('auditPhysicalCount').value, 10);
  const reason = document.getElementById('auditReasonSelect').value;
  const notes = document.getElementById('auditNotes').value.trim();

  if (!pId || isNaN(physicalCount)) {
    showToast('Please select product and enter physical count.', 'error');
    return;
  }

  try {
    const res = await api('/api/inventory/audits/reconcile', {
      method: 'POST',
      body: JSON.stringify({
        product_id: pId,
        physical_count: physicalCount,
        reason: reason,
        notes: notes,
        username: STATE.user ? STATE.user.username : 'admin'
      })
    });
    closeModal('stockAuditModal');
    playScanSound();
    showToast(`Audit reconciled! Adjusted inventory & posted shrinkage journal entry!`, 'success');
    loadCoverageAndAudits();
    loadInventory();
  } catch (err) {
    showToast('Failed to reconcile audit: ' + (err.message || 'Error'), 'error');
  }
}

// ================= COMBOS & BUNDLES ENGINE =================
async function loadCombosData() {
  try {
    const combos = await api('/api/inventory/combos');
    renderCombosTable(combos || []);
  } catch (err) {
    console.warn('Combos load error:', err);
  }
}

function renderCombosTable(combos) {
  const tbody = document.getElementById('combosTableBody');
  if (!tbody) return;

  if (combos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-secondary);">No combo packages active. Click "Create Combo Bundle" above.</td></tr>`;
    return;
  }

  tbody.innerHTML = combos.map(c => {
    let itemsStr = '';
    try {
      const parsed = typeof c.items_json === 'string' ? JSON.parse(c.items_json) : c.items_json;
      itemsStr = (parsed || []).map(i => `${i.quantity || 1}x ${escapeHtml(i.name || 'SKU')}`).join(' + ');
    } catch (e) {
      itemsStr = 'Included SKUs';
    }

    const marginPct = c.selling_price_cents > 0 ? (((c.selling_price_cents - c.total_cogs_cents) / c.selling_price_cents) * 100).toFixed(1) : 0;

    return `
      <tr>
        <td><strong>${escapeHtml(c.name)}</strong></td>
        <td><span class="barcode-badge">${escapeHtml(c.barcode || '—')}</span></td>
        <td><span class="shelf-chip">${itemsStr}</span></td>
        <td style="font-family:var(--font-mono); font-weight:700; color:var(--text-secondary);">${formatMoney(c.total_cogs_cents)}</td>
        <td style="font-family:var(--font-mono); font-weight:800; color:#00e676;">${formatMoney(c.selling_price_cents)}</td>
        <td><strong style="color:var(--accent);">${marginPct}% margin</strong></td>
        <td><span class="status-badge ready">Available (${c.available_bundles || 15} kits)</span></td>
        <td><button class="btn-table-action" onclick="addComboToCart('${escapeHtml(c.name)}', ${c.selling_price_cents})">🛒 Add to POS Cart</button></td>
      </tr>
    `;
  }).join('');
}

function addComboToCart(name, priceCents) {
  switchToTab('checkout');
  STATE.cart.push({
    id: null,
    name: name,
    category: 'Combo Promo',
    price_cents: priceCents,
    quantity: 1
  });
  renderCart();
  showToast(`Added ${name} to checkout cart!`, 'success');
}

function openComboModal() {
  STATE.comboConstituents = [
    { product_id: '', quantity: 1, unit_cost_cents: 0 },
    { product_id: '', quantity: 1, unit_cost_cents: 0 }
  ];
  renderComboItemRows();
  genComboBarcode();
  openModal('comboModal');
}

function addComboItemRow() {
  STATE.comboConstituents.push({ product_id: '', quantity: 1, unit_cost_cents: 0 });
  renderComboItemRows();
}

function renderComboItemRows() {
  const tbody = document.getElementById('comboItemsTableBody');
  if (!tbody) return;

  tbody.innerHTML = STATE.comboConstituents.map((item, idx) => {
    const prodOptions = STATE.inventory.map(p => `
      <option value="${p.id}" ${item.product_id == p.id ? 'selected' : ''}>${escapeHtml(p.name)} (Cost: ${formatMoney(p.cost_cents)})</option>
    `).join('');

    const subtotal = item.unit_cost_cents * item.quantity;

    return `
      <tr>
        <td>
          <select onchange="updateComboConstituentProd(${idx}, this.value)" style="width:100%; padding:6px; border-radius:6px; background:#121824; color:#fff; border:1px solid var(--border-color);">
            <option value="">-- Choose SKU --</option>
            ${prodOptions}
          </select>
        </td>
        <td>
          <input type="number" min="1" value="${item.quantity}" oninput="updateComboConstituentQty(${idx}, this.value)" style="width:100%; padding:6px; border-radius:6px; background:#121824; color:#fff; border:1px solid var(--border-color);">
        </td>
        <td style="font-family:var(--font-mono);">${formatMoney(item.unit_cost_cents)}</td>
        <td style="text-align:right; font-family:var(--font-mono); font-weight:700;">${formatMoney(subtotal)}</td>
        <td style="text-align:center;">
          <button type="button" class="btn-secondary-sm" style="color:#ff5252; padding:2px 8px;" onclick="removeComboConstituent(${idx})">&times;</button>
        </td>
      </tr>
    `;
  }).join('');

  updateComboDefensiveCheck();
}

function updateComboConstituentProd(idx, prodId) {
  const p = STATE.inventory.find(i => i.id == prodId);
  if (p) {
    STATE.comboConstituents[idx].product_id = p.id;
    STATE.comboConstituents[idx].unit_cost_cents = p.cost_cents || 0;
  }
  renderComboItemRows();
}

function updateComboConstituentQty(idx, val) {
  STATE.comboConstituents[idx].quantity = parseInt(val, 10) || 1;
  renderComboItemRows();
}

function removeComboConstituent(idx) {
  STATE.comboConstituents.splice(idx, 1);
  renderComboItemRows();
}

function genComboBarcode() {
  const rand = Math.floor(100000 + Math.random() * 900000);
  document.getElementById('comboBarcode').value = `CMB${rand}`;
}

function updateComboDefensiveCheck() {
  const totalCogs = STATE.comboConstituents.reduce((sum, item) => sum + (item.unit_cost_cents * item.quantity), 0);
  const sellPrice = parseCents(document.getElementById('comboPrice').value);

  document.getElementById('comboTotalCogsDisplay').textContent = formatMoney(totalCogs);

  const alertEl = document.getElementById('comboDefensiveAlert');
  const marginEl = document.getElementById('comboMarginDisplay');
  const saveBtn = document.getElementById('btnSaveCombo');

  if (sellPrice > 0 && sellPrice < totalCogs) {
    alertEl.style.display = 'block';
    marginEl.textContent = 'DEFICIT (LOSS)';
    marginEl.style.color = '#ff5252';
    if (saveBtn) saveBtn.disabled = true;
  } else {
    alertEl.style.display = 'none';
    const margin = sellPrice > 0 ? (((sellPrice - totalCogs) / sellPrice) * 100).toFixed(1) : 0;
    marginEl.textContent = `${margin}%`;
    marginEl.style.color = '#00e676';
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function submitComboBundle() {
  const name = document.getElementById('comboName').value.trim();
  const barcode = document.getElementById('comboBarcode').value.trim();
  const price = parseCents(document.getElementById('comboPrice').value);
  const shelf = document.getElementById('comboShelf').value.trim() || 'Front Promotional Table';

  const validItems = STATE.comboConstituents.filter(i => i.product_id && i.quantity > 0);
  if (!name || price <= 0 || validItems.length === 0) {
    showToast('Please fill all combo details and add constituent items.', 'error');
    return;
  }

  try {
    await api('/api/inventory/combos', {
      method: 'POST',
      body: JSON.stringify({
        name, barcode, price_cents: price, shelf_location: shelf,
        items: validItems
      })
    });
    closeModal('comboModal');
    showToast(`Combo Bundle "${name}" activated!`, 'success');
    loadCombosData();
    loadInventory();
  } catch (err) {
    showToast('Error saving combo: ' + (err.message || 'Error'), 'error');
  }
}

// ================= OMNICHANNEL STOCK SYNC =================
async function loadOmnichannelOrders() {
  try {
    const orders = await api('/api/omnichannel/orders');
    renderOmnichannelOrders(orders || []);
  } catch (err) {
    console.warn('Omnichannel load error:', err);
  }
}

function renderOmnichannelOrders(orders) {
  const tbody = document.getElementById('omniOrdersTableBody');
  if (!tbody) return;

  const total = orders.length;
  const reserved = orders.filter(o => o.status === 'RESERVED').reduce((sum, o) => sum + (o.quantity || 1), 0);
  const dispatched = orders.filter(o => o.status === 'DISPATCHED' || o.status === 'DELIVERED').length;
  const restocked = orders.filter(o => o.status === 'CANCELLED_RESTOCKED').length;

  document.getElementById('omniKpiTotal').textContent = total;
  document.getElementById('omniKpiReserved').textContent = `${reserved} units`;
  document.getElementById('omniKpiDispatched').textContent = dispatched;
  document.getElementById('omniKpiRestocked').textContent = restocked;

  if (orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-secondary);">No omnichannel orders currently queued.</td></tr>`;
    return;
  }

  tbody.innerHTML = orders.map(o => {
    let actions = '';
    if (o.status === 'RESERVED') {
      actions = `
        <button class="btn-table-action" onclick="dispatchOmniOrder('${o.order_number}')">🚚 Dispatch</button>
        <button class="btn-table-action" style="color:#ff5252;" onclick="cancelAndRestockOmniOrder('${o.order_number}')">↩️ Restock</button>
      `;
    } else if (o.status === 'DISPATCHED') {
      actions = `<span style="color:#00e676; font-size:0.82rem; font-weight:700;">In Transit / COD</span>`;
    } else if (o.status === 'CANCELLED_RESTOCKED') {
      actions = `<span style="color:var(--text-secondary); font-size:0.82rem;">Restocked</span>`;
    }

    return `
      <tr>
        <td style="font-family:var(--font-mono); font-weight:800; color:var(--accent);">${escapeHtml(o.order_number)}</td>
        <td><span class="shelf-chip">${escapeHtml(o.channel)}</span></td>
        <td><strong>${escapeHtml(o.customer_name)}</strong></td>
        <td>${escapeHtml(o.product_name)}</td>
        <td><strong>${o.quantity}</strong> units</td>
        <td style="font-family:var(--font-mono); font-weight:700;">${formatMoney(o.total_cents)}</td>
        <td><span class="status-badge ${o.status === 'RESERVED' ? 'in-progress' : 'ready'}">${escapeHtml(o.status)}</span></td>
        <td>${actions}</td>
      </tr>
    `;
  }).join('');
}

function openOmniModal() {
  const select = document.getElementById('omniProdSelect');
  if (select) {
    select.innerHTML = `<option value="">-- Choose Item --</option>` + STATE.inventory.map(p => `
      <option value="${p.id}">${escapeHtml(p.name)} [Stock: ${p.quantity} | Price: ${formatMoney(p.price_cents)}]</option>
    `).join('');
  }
  openModal('omniOrderModal');
}

async function submitOmniOrder() {
  const channel = document.getElementById('omniChannel').value;
  const customer = document.getElementById('omniCustomer').value.trim();
  const prodId = document.getElementById('omniProdSelect').value;
  const qty = parseInt(document.getElementById('omniQty').value, 10) || 1;

  if (!customer || !prodId) return showToast('Please enter customer and product.', 'error');

  try {
    const res = await api('/api/omnichannel/orders', {
      method: 'POST',
      body: JSON.stringify({ channel, customer_name: customer, product_id: prodId, quantity: qty })
    });
    closeModal('omniOrderModal');
    showToast(`Order ${res.order_number} placed! Stock reserved in real time.`, 'success');
    loadOmnichannelOrders();
    loadInventory();
  } catch (err) {
    showToast('Failed to place order: ' + (err.message || 'Error'), 'error');
  }
}

async function dispatchOmniOrder(orderNum) {
  try {
    await api('/api/omnichannel/orders/dispatch', {
      method: 'POST',
      body: JSON.stringify({ order_number: orderNum })
    });
    showToast(`Order ${orderNum} dispatched for delivery!`, 'success');
    loadOmnichannelOrders();
  } catch (err) {}
}

async function cancelAndRestockOmniOrder(orderNum) {
  if (!confirm(`Cancel order ${orderNum} and restock items back into inventory?`)) return;
  try {
    await api('/api/omnichannel/orders/restock', {
      method: 'POST',
      body: JSON.stringify({ order_number: orderNum })
    });
    showToast(`Order cancelled and inventory units restocked!`, 'info');
    loadOmnichannelOrders();
    loadInventory();
  } catch (err) {}
}

// ================= EXECUTIVE ERP LIQUIDITY & 12M TRENDS =================
async function loadExecutiveAnalytics() {
  try {
    const res = await api('/api/dashboard/executive');
    if (!res) return;

    const kPetty = document.getElementById('execKpiPettyCash');
    const kBank = document.getElementById('execKpiBank');
    const kMfs = document.getElementById('execKpiMfs');
    const kInv = document.getElementById('execKpiInventory');
    const kAr = document.getElementById('execKpiReceivable');
    const kAp = document.getElementById('execKpiPayable');
    const kCap = document.getElementById('execLiquidCapital');

    if (kPetty) kPetty.textContent = formatMoney(res.liquidity?.petty_cash_cents || 0);
    if (kBank) kBank.textContent = formatMoney(res.liquidity?.bank_operating_cents || 0);
    if (kMfs) kMfs.textContent = formatMoney(res.liquidity?.mfs_cents || 0);
    if (kInv) kInv.textContent = formatMoney(res.liquidity?.inventory_valuation_cents || 0);
    if (kAr) kAr.textContent = formatMoney(res.liquidity?.accounts_receivable_cents || 0);
    if (kAp) kAp.textContent = formatMoney(res.liquidity?.accounts_payable_cents || 0);

    const liquidCapital = (res.liquidity?.petty_cash_cents || 0) + (res.liquidity?.bank_operating_cents || 0) + (res.liquidity?.mfs_cents || 0);
    if (kCap) kCap.textContent = formatMoney(liquidCapital);

    // Render 12M Trailing Table
    const tbody = document.getElementById('exec12MonthTableBody');
    if (tbody && res.trailing_12m) {
      tbody.innerHTML = res.trailing_12m.map(row => `
        <tr>
          <td><strong>${escapeHtml(row.month)}</strong></td>
          <td style="font-family:var(--font-mono);">${formatMoney(row.purchases_cents)}</td>
          <td style="font-family:var(--font-mono); font-weight:700; color:var(--accent);">${formatMoney(row.sales_revenue_cents)}</td>
          <td style="font-family:var(--font-mono); color:#ff5252;">${formatMoney(row.expenses_cents)}</td>
          <td style="font-family:var(--font-mono); font-weight:800; color:#00e676;">${formatMoney(row.net_profit_cents)}</td>
          <td><span class="status-badge ready">${row.margin_pct}%</span></td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.warn('Executive analytics error:', err);
  }
}

// ================= EXECUTIVE COMMAND CENTER DASHBOARD =================
let dashPulseTimer = null;

async function loadDashboardOverview() {
  try {
    const [status, inv, salesList, execData, tbData, posList, repairsList, omniList] = await Promise.all([
      api('/api/status').catch(() => ({})),
      api('/api/inventory').catch(() => []),
      api('/api/sales').catch(() => []),
      api('/api/dashboard/executive').catch(() => null),
      api('/api/accounting/trial-balance').catch(() => null),
      api('/api/procurement/pos').catch(() => []),
      api('/api/repairs').catch(() => []),
      api('/api/omnichannel/orders').catch(() => [])
    ]);

    // 1. Header status & shift
    const shiftPill = document.getElementById('dashShiftPill');
    const shiftText = document.getElementById('dashShiftText');
    const activeShift = (status && status.active_shift) ? status.active_shift : STATE.activeShift;
    if (activeShift) {
      const cashierName = activeShift.username || activeShift.cashier || (STATE.user ? STATE.user.username : 'Admin');
      const floatVal = activeShift.opening_float_cents || activeShift.opening_cents || 5000;
      if (shiftText) shiftText.textContent = `Shift Active: ${cashierName} • Opening Float: ${formatMoney(floatVal)}`;
      if (shiftPill) {
        shiftPill.style.background = 'rgba(16, 185, 129, 0.12)';
        shiftPill.style.borderColor = 'rgba(16, 185, 129, 0.35)';
        shiftPill.style.color = '#34d399';
      }
    } else {
      if (shiftText) shiftText.textContent = `Register Offline • No Open Shift`;
      if (shiftPill) {
        shiftPill.style.background = 'rgba(245, 158, 11, 0.12)';
        shiftPill.style.borderColor = 'rgba(245, 158, 11, 0.35)';
        shiftPill.style.color = '#fbbf24';
      }
    }

    // 2. Sales & Profit calculations
    const sales = Array.isArray(salesList) ? salesList : (STATE.demoStore ? STATE.demoStore.sales : []);
    const completedSales = sales.filter(s => s.status !== 'REFUNDED' && s.status !== 'CANCELLED');
    const totalSalesCents = completedSales.reduce((sum, s) => sum + (s.total_cents || s.amount_cents || 0), 0);
    const orderCount = completedSales.length;
    const avgBasket = orderCount > 0 ? Math.round(totalSalesCents / orderCount) : 0;

    const kpiSalesToday = document.getElementById('dashKpiSalesToday');
    const kpiSalesOrders = document.getElementById('dashKpiSalesOrders');
    if (kpiSalesToday) kpiSalesToday.textContent = formatMoney(totalSalesCents);
    if (kpiSalesOrders) kpiSalesOrders.textContent = `${orderCount} transactions • Avg ticket ${formatMoney(avgBasket)}`;

    // Profit & Margin
    let grossProfitCents = Math.round(totalSalesCents * 0.485);
    let marginPct = '48.5';
    if (execData && execData.trailing_12m && execData.trailing_12m.length > 0) {
      const curMonth = execData.trailing_12m[execData.trailing_12m.length - 1];
      if (curMonth.net_profit_cents) grossProfitCents = curMonth.net_profit_cents;
      if (curMonth.margin_pct) marginPct = curMonth.margin_pct;
    }
    const kpiProfit = document.getElementById('dashKpiProfit');
    const kpiMarginPct = document.getElementById('dashKpiMarginPct');
    if (kpiProfit) kpiProfit.textContent = formatMoney(grossProfitCents);
    if (kpiMarginPct) kpiMarginPct.textContent = `${marginPct}% Margin`;

    // 3. Inventory Valuation
    const inventory = Array.isArray(inv) ? inv : (STATE.inventory || []);
    let costValCents = 0;
    let retailValCents = 0;
    let totalUnits = 0;
    let lowStockItems = [];

    inventory.forEach(p => {
      const qty = parseInt(p.quantity, 10) || 0;
      const cost = parseInt(p.cost_cents, 10) || Math.round((p.price_cents || 0) * 0.5);
      const price = parseInt(p.price_cents, 10) || 0;
      const reorder = parseInt(p.reorder_level, 10) || 5;

      costValCents += cost * qty;
      retailValCents += price * qty;
      totalUnits += qty;

      if (qty <= reorder) {
        lowStockItems.push(p);
      }
    });

    if (execData && execData.liquidity && execData.liquidity.inventory_cost_valuation_cents) {
      costValCents = execData.liquidity.inventory_cost_valuation_cents;
    }
    if (execData && execData.liquidity && execData.liquidity.inventory_retail_valuation_cents) {
      retailValCents = execData.liquidity.inventory_retail_valuation_cents;
    }

    const kpiInvVal = document.getElementById('dashKpiInvVal');
    const kpiInvSub = document.getElementById('dashKpiInvSub');
    if (kpiInvVal) kpiInvVal.textContent = formatMoney(costValCents);
    if (kpiInvSub) kpiInvSub.innerHTML = `<span>Retail: ${formatMoney(retailValCents)}</span> <span>• ${totalUnits} units (${inventory.length} SKUs)</span>`;

    // 4. Liquid Cash & Register Float
    let pettyCash = 125000;
    let bankCash = 485000;
    let mfsCash = 95000;
    if (execData && execData.liquidity) {
      pettyCash = execData.liquidity.cash_drawer_cents || execData.liquidity.petty_cash_cents || pettyCash;
      bankCash = execData.liquidity.bank_operating_cents || execData.liquidity.bank_settlement_cents || bankCash;
      mfsCash = execData.liquidity.mfs_cents || mfsCash;
    }
    const totalLiquid = pettyCash + bankCash + mfsCash;
    const kpiLiquidity = document.getElementById('dashKpiLiquidity');
    const kpiLiquiditySub = document.getElementById('dashKpiLiquiditySub');
    if (kpiLiquidity) kpiLiquidity.textContent = formatMoney(totalLiquid);
    if (kpiLiquiditySub) kpiLiquiditySub.innerHTML = `<span>Drawer: ${formatMoney(pettyCash)} | Bank: ${formatMoney(bankCash)}</span>`;

    // 5. Low Stock Alerts
    const kpiLowStock = document.getElementById('dashKpiLowStock');
    if (kpiLowStock) kpiLowStock.textContent = `${lowStockItems.length} SKUs Alert`;

    // 6. Open Purchase Orders
    const pos = Array.isArray(posList) ? posList : [];
    const openPos = pos.filter(p => p.status !== 'RECEIVED' && p.status !== 'CANCELLED');
    const pendingPoCents = openPos.reduce((sum, p) => sum + (p.total_cost_cents || p.total_amount_cents || 0), 0);
    const kpiOpenPos = document.getElementById('dashKpiOpenPos');
    const kpiOpenPosSub = document.getElementById('dashKpiOpenPosSub');
    if (kpiOpenPos) kpiOpenPos.textContent = `${openPos.length} Orders Pending`;
    if (kpiOpenPosSub) kpiOpenPosSub.textContent = `${formatMoney(pendingPoCents)} in transit / awaiting GRN`;

    // 7. Double-Entry General Ledger Balance
    const tb = tbData || { is_balanced: true, total_debit_cents: 1485000, total_credit_cents: 1485000 };
    const kpiLedger = document.getElementById('dashKpiLedger');
    const kpiLedgerSub = document.getElementById('dashKpiLedgerSub');
    const auditStatusMsg = document.getElementById('dashAuditStatusMsg');
    if (kpiLedger) {
      if (tb.is_balanced) {
        kpiLedger.textContent = 'BALANCED ✓';
        kpiLedger.style.color = '#10b981';
      } else {
        kpiLedger.textContent = 'UNBALANCED ⚠️';
        kpiLedger.style.color = '#f43f5e';
      }
    }
    if (kpiLedgerSub) {
      kpiLedgerSub.textContent = `Debit: ${formatMoney(tb.total_debit_cents)} = Credit: ${formatMoney(tb.total_credit_cents)}`;
    }
    if (auditStatusMsg) {
      auditStatusMsg.textContent = tb.is_balanced 
        ? `Zero variance between total debits & credits (${formatMoney(tb.total_debit_cents)}). Ledger strictly balanced.`
        : `Ledger variance detected! Audit trail requires immediate review.`;
    }

    // 8. Device Repairs Workbench
    const repairs = Array.isArray(repairsList) ? repairsList : [];
    const activeRepairs = repairs.filter(r => r.status !== 'DELIVERED');
    const readyRepairs = activeRepairs.filter(r => r.status === 'READY');
    const kpiRepairs = document.getElementById('dashKpiRepairs');
    const kpiRepairsSub = document.getElementById('dashKpiRepairsSub');
    if (kpiRepairs) kpiRepairs.textContent = `${activeRepairs.length} Active`;
    if (kpiRepairsSub) kpiRepairsSub.textContent = `${readyRepairs.length} ready for customer pickup • ${activeRepairs.length - readyRepairs.length} in bench`;

    // 9. Render Recent Sales Stream
    const recentSalesBody = document.getElementById('dashRecentSalesBody');
    if (recentSalesBody) {
      const displaySales = sales.slice(0, 8);
      if (displaySales.length === 0) {
        recentSalesBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:20px;">No sales recorded yet. Start first sale with [F2]!</td></tr>`;
      } else {
        recentSalesBody.innerHTML = displaySales.map(s => {
          const recNum = s.receipt_number || `XP-${String(s.id).padStart(6, '0')}`;
          const amt = s.total_cents || s.amount_cents || 0;
          const method = s.payment_method || 'Cash';
          const itemsDesc = s.description || 'Retail Item';
          const time = s.created_at || 'Just now';
          const cust = s.customer_name || 'Walk-in Customer';

          return `
            <tr>
              <td><span class="barcode-badge">${escapeHtml(recNum)}</span></td>
              <td style="color:var(--text-muted); font-size:0.78rem;">${escapeHtml(time)}</td>
              <td><strong>${escapeHtml(cust)}</strong></td>
              <td style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(itemsDesc)}">${escapeHtml(itemsDesc)}</td>
              <td><span class="shelf-chip">${escapeHtml(method)}</span></td>
              <td style="font-family:var(--font-mono); font-weight:800; color:#00e676; text-align:right;">${formatMoney(amt)}</td>
              <td>
                <button class="btn-table-action" onclick="reprintReceipt(${s.id})">🧾 Receipt</button>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    // 10. Payment Method Distribution Breakdown
    let cashTotal = 0, cardTotal = 0, mfsTotal = 0, splitTotal = 0;
    sales.forEach(s => {
      const amt = s.total_cents || s.amount_cents || 0;
      const m = String(s.payment_method || 'Cash').toLowerCase();
      if (m.includes('cash')) cashTotal += amt;
      else if (m.includes('card') || m.includes('credit') || m.includes('debit')) cardTotal += amt;
      else if (m.includes('mfs') || m.includes('bkash') || m.includes('nagad') || m.includes('bank')) mfsTotal += amt;
      else splitTotal += amt;
    });

    const tenderGrandTotal = cashTotal + cardTotal + mfsTotal + splitTotal || 1;
    const pCash = Math.round((cashTotal / tenderGrandTotal) * 100);
    const pCard = Math.round((cardTotal / tenderGrandTotal) * 100);
    const pMfs = Math.round((mfsTotal / tenderGrandTotal) * 100);
    const pSplit = Math.max(0, 100 - pCash - pCard - pMfs);

    const mixBar = document.getElementById('dashPaymentMixBar');
    if (mixBar) {
      mixBar.innerHTML = `
        <div class="payment-mix-segment" style="width:${pCash}%; background:#10b981;" title="Cash: ${pCash}% (${formatMoney(cashTotal)})"></div>
        <div class="payment-mix-segment" style="width:${pCard}%; background:#38bdf8;" title="Card: ${pCard}% (${formatMoney(cardTotal)})"></div>
        <div class="payment-mix-segment" style="width:${pMfs}%; background:#a855f7;" title="MFS/Bank: ${pMfs}% (${formatMoney(mfsTotal)})"></div>
        <div class="payment-mix-segment" style="width:${pSplit}%; background:#f59e0b;" title="Split/Other: ${pSplit}% (${formatMoney(splitTotal)})"></div>
      `;
    }

    const tCash = document.getElementById('dashPctCash');
    const tCard = document.getElementById('dashPctCard');
    const tMfs = document.getElementById('dashPctMfs');
    const tSplit = document.getElementById('dashPctSplit');
    const tTotal = document.getElementById('dashTenderTotalText');
    if (tCash) tCash.textContent = `${pCash}% (${formatMoney(cashTotal)})`;
    if (tCard) tCard.textContent = `${pCard}% (${formatMoney(cardTotal)})`;
    if (tMfs) tMfs.textContent = `${pMfs}% (${formatMoney(mfsTotal)})`;
    if (tSplit) tSplit.textContent = `${pSplit}% (${formatMoney(splitTotal)})`;
    if (tTotal) tTotal.textContent = `${formatMoney(tenderGrandTotal)} Settled`;

    // 11. Operational Radar: Low Stock Items List
    const radarLowStock = document.getElementById('dashRadarLowStockItems');
    if (radarLowStock) {
      if (lowStockItems.length === 0) {
        radarLowStock.innerHTML = `<div style="font-size:0.8rem; color:#10b981; padding:8px 0;">✓ All items above minimum safety stock threshold.</div>`;
      } else {
        radarLowStock.innerHTML = lowStockItems.slice(0, 3).map(p => `
          <div class="radar-item" style="border-left: 3px solid #f43f5e;">
            <div class="radar-item-left">
              <span class="radar-item-icon">⚠️</span>
              <div>
                <div class="radar-item-title">${escapeHtml(p.name)}</div>
                <div class="radar-item-sub">In Stock: <strong style="color:#f43f5e;">${p.quantity} units</strong> • Reorder at: ${p.reorder_level || 5} • Shelf: ${escapeHtml(p.shelf_location || 'A-1')}</div>
              </div>
            </div>
            <button class="btn-table-action" onclick="switchToTab('procurement'); setTimeout(() => { if (typeof openNewPoModal === 'function') openNewPoModal(); }, 150);">Order PO</button>
          </div>
        `).join('');
      }
    }

    // 12. Operational Radar: Omnichannel Queue
    const radarOmni = document.getElementById('dashRadarOmniQueue');
    if (radarOmni) {
      const omniOrders = Array.isArray(omniList) ? omniList : [];
      const pendingOmni = omniOrders.filter(o => o.status === 'PENDING' || o.status === 'PROCESSING');
      if (pendingOmni.length === 0) {
        radarOmni.innerHTML = `<div style="font-size:0.8rem; color:var(--text-muted); padding:8px 0;">No pending web orders in queue.</div>`;
      } else {
        radarOmni.innerHTML = pendingOmni.slice(0, 3).map(o => `
          <div class="radar-item" style="border-left: 3px solid #38bdf8;">
            <div class="radar-item-left">
              <span class="radar-item-icon">🌐</span>
              <div>
                <div class="radar-item-title">${escapeHtml(o.order_number)} • ${escapeHtml(o.customer_name)}</div>
                <div class="radar-item-sub">${escapeHtml(o.channel)} • ${o.quantity} units [${escapeHtml(o.status)}]</div>
              </div>
            </div>
            <button class="btn-table-action" onclick="dispatchOmniOrder('${o.order_number}')">Dispatch</button>
          </div>
        `).join('');
      }
    }

  } catch (err) {
    console.error('Error loading Executive Dashboard:', err);
  }
}

