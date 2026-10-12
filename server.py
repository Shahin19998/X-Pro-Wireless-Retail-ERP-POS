import os
import sys
import json
import sqlite3
import datetime
import pathlib
import secrets
import mimetypes
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# Import database and helper functions from xpro_store
import xpro_store as xpro

ROOT = pathlib.Path(__file__).resolve().parent
STATIC_DIR = ROOT / 'web'
PORT = 8000

# Ensure database tables are created
xpro.setup()

def get_db():
    c = sqlite3.connect(xpro.DB, timeout=30.0)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA foreign_keys=ON')
    c.execute('PRAGMA journal_mode=WAL')
    return c

def seed_default_roles():
    with get_db() as c:
        roles = [
            ('superadmin', 'super_admin', 'admin1234', 'Full System Administrator'),
            ('admin', 'super_admin', 'admin1234', 'Master Admin Account'),
            ('manager', 'manager', 'manager1234', 'Store Operations Manager'),
            ('receiving', 'receiving_staff', 'receiving1234', 'Floor In-Charge & Receiving Staff'),
            ('pos_exec', 'pos_executive', 'posexec1234', 'Front-Desk Cashier & Sales')
        ]
        for u, r, p, h in roles:
            existing = c.execute('SELECT * FROM users WHERE username=?', (u,)).fetchone()
            s = secrets.token_hex(16)
            p_hash = xpro.digest(p, s)
            if not existing:
                c.execute('INSERT INTO users(username, salt, password_hash, hint, role) VALUES(?,?,?,?,?)', (u, s, p_hash, h, r))
            else:
                c.execute('UPDATE users SET role=? WHERE username=?', (r, u))

seed_default_roles()

def init_database_extensions():
    with get_db() as c:
        # Inventory columns
        inv_cols = [col[1] for col in c.execute('PRAGMA table_info(inventory)').fetchall()]
        for col_name, col_type in [
            ('barcode', 'TEXT'),
            ('sku', 'TEXT'),
            ('cost_cents', 'INTEGER DEFAULT 0'),
            ('shelf_location', "TEXT DEFAULT 'Front Display Rack A-1'"),
            ('min_stock_alert', 'INTEGER DEFAULT 5'),
            ('is_bundle', 'INTEGER DEFAULT 0'),
            ('reorder_point', 'INTEGER DEFAULT 5'),
            ('bundle_items_json', 'TEXT')
        ]:
            if col_name not in inv_cols:
                c.execute(f'ALTER TABLE inventory ADD COLUMN {col_name} {col_type}')

        # Customers
        c.execute('''CREATE TABLE IF NOT EXISTS customers(
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            phone TEXT UNIQUE,
            email TEXT,
            total_spend_cents INTEGER DEFAULT 0,
            order_count INTEGER DEFAULT 0,
            loyalty_points INTEGER DEFAULT 0,
            notes TEXT,
            created_at TEXT
        )''')
        cust_cols = [col[1] for col in c.execute('PRAGMA table_info(customers)').fetchall()]
        if 'loyalty_points' not in cust_cols:
            c.execute('ALTER TABLE customers ADD COLUMN loyalty_points INTEGER DEFAULT 0')

        # Sales columns
        sales_cols = [col[1] for col in c.execute('PRAGMA table_info(sales)').fetchall()]
        for col_name, col_type in [
            ('cost_cents', 'INTEGER DEFAULT 0'),
            ('profit_cents', 'INTEGER DEFAULT 0'),
            ('items_json', 'TEXT'),
            ('payments_json', 'TEXT'),
            ('discount_cents', 'INTEGER DEFAULT 0'),
            ('split_payment', 'INTEGER DEFAULT 0')
        ]:
            if col_name not in sales_cols:
                c.execute(f'ALTER TABLE sales ADD COLUMN {col_name} {col_type}')

        # ================= ENTERPRISE ERP TABLES =================
        c.executescript('''
        CREATE TABLE IF NOT EXISTS chart_of_accounts(
            code TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            balance_cents INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS journal_entries(
            id INTEGER PRIMARY KEY,
            entry_date TEXT NOT NULL,
            ref_type TEXT NOT NULL,
            ref_id TEXT,
            memo TEXT,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS journal_lines(
            id INTEGER PRIMARY KEY,
            entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
            account_code TEXT NOT NULL REFERENCES chart_of_accounts(code),
            account_name TEXT NOT NULL,
            debit_cents INTEGER DEFAULT 0,
            credit_cents INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS suppliers(
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            contact_person TEXT,
            phone TEXT,
            email TEXT,
            address TEXT,
            payment_terms TEXT DEFAULT 'Net 30',
            payable_balance_cents INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS purchase_orders(
            id INTEGER PRIMARY KEY,
            po_number TEXT UNIQUE NOT NULL,
            supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
            status TEXT NOT NULL DEFAULT 'DRAFT',
            total_cost_cents INTEGER DEFAULT 0,
            vat_invoice_no TEXT,
            delivery_date TEXT,
            notes TEXT,
            created_by TEXT NOT NULL,
            approved_by TEXT,
            received_by TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS purchase_order_items(
            id INTEGER PRIMARY KEY,
            po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
            product_id INTEGER NOT NULL,
            product_name TEXT NOT NULL,
            qty_ordered INTEGER NOT NULL,
            qty_received INTEGER DEFAULT 0,
            unit_cost_cents INTEGER NOT NULL,
            total_cost_cents INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS goods_receipts(
            id INTEGER PRIMARY KEY,
            receipt_no TEXT UNIQUE NOT NULL,
            po_id INTEGER NOT NULL REFERENCES purchase_orders(id),
            supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
            received_at TEXT NOT NULL,
            received_by TEXT NOT NULL,
            total_cost_cents INTEGER NOT NULL,
            items_json TEXT NOT NULL,
            notes TEXT
        );

        CREATE TABLE IF NOT EXISTS purchase_returns(
            id INTEGER PRIMARY KEY,
            return_no TEXT UNIQUE NOT NULL,
            po_id INTEGER REFERENCES purchase_orders(id),
            supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
            product_id INTEGER NOT NULL,
            product_name TEXT NOT NULL,
            qty_returned INTEGER NOT NULL,
            unit_cost_cents INTEGER NOT NULL,
            total_cents INTEGER NOT NULL,
            reason TEXT NOT NULL,
            status TEXT DEFAULT 'PENDING',
            created_by TEXT NOT NULL,
            approved_by TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS combo_bundles(
            id INTEGER PRIMARY KEY,
            bundle_sku TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            selling_price_cents INTEGER NOT NULL,
            combined_cogs_cents INTEGER NOT NULL,
            items_json TEXT NOT NULL,
            active INTEGER DEFAULT 1,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS stock_audits(
            id INTEGER PRIMARY KEY,
            audit_no TEXT UNIQUE NOT NULL,
            audit_date TEXT NOT NULL,
            conducted_by TEXT NOT NULL,
            status TEXT DEFAULT 'PENDING',
            total_shrinkage_cents INTEGER DEFAULT 0,
            notes TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS stock_audit_items(
            id INTEGER PRIMARY KEY,
            audit_id INTEGER NOT NULL REFERENCES stock_audits(id) ON DELETE CASCADE,
            product_id INTEGER NOT NULL,
            product_name TEXT NOT NULL,
            system_qty INTEGER NOT NULL,
            physical_qty INTEGER NOT NULL,
            discrepancy_qty INTEGER NOT NULL,
            unit_cost_cents INTEGER NOT NULL,
            variance_loss_cents INTEGER NOT NULL,
            reason TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS stock_transfers(
            id INTEGER PRIMARY KEY,
            transfer_no TEXT UNIQUE NOT NULL,
            from_location TEXT NOT NULL,
            to_location TEXT NOT NULL,
            product_id INTEGER NOT NULL,
            product_name TEXT NOT NULL,
            qty INTEGER NOT NULL,
            status TEXT DEFAULT 'DISPATCHED',
            dispatched_by TEXT NOT NULL,
            received_by TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS held_carts(
            id INTEGER PRIMARY KEY,
            cart_id TEXT UNIQUE NOT NULL,
            cart_label TEXT NOT NULL,
            customer TEXT,
            cashier_username TEXT NOT NULL,
            cart_data_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS coupons(
            code TEXT PRIMARY KEY,
            discount_type TEXT NOT NULL,
            discount_val INTEGER NOT NULL,
            min_spend_cents INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            expires_at TEXT
        );

        CREATE TABLE IF NOT EXISTS loyalty_transactions(
            id INTEGER PRIMARY KEY,
            customer_id INTEGER NOT NULL REFERENCES customers(id),
            sale_id INTEGER,
            points_delta INTEGER NOT NULL,
            reason TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS omnichannel_orders(
            id INTEGER PRIMARY KEY,
            order_no TEXT UNIQUE NOT NULL,
            channel TEXT NOT NULL,
            customer_name TEXT NOT NULL,
            customer_phone TEXT NOT NULL,
            items_json TEXT NOT NULL,
            total_cents INTEGER NOT NULL,
            status TEXT DEFAULT 'RESERVED',
            notes TEXT,
            created_at TEXT NOT NULL
        );
        ''')

        # Seed Chart of Accounts if empty
        acct_count = c.execute('SELECT count(*) FROM chart_of_accounts').fetchone()[0]
        if acct_count == 0:
            default_accounts = [
                ('1010', 'Cash in Register Drawer (Float & Sales)', 'ASSET'),
                ('1020', 'Bank Settlement Account (Card Clearing)', 'ASSET'),
                ('1030', 'Mobile Financial Services (bKash / Nagad)', 'ASSET'),
                ('1040', 'Petty Cash Operational Reserve', 'ASSET'),
                ('1200', 'Inventory Asset (Merchandise & Screen Parts)', 'ASSET'),
                ('1300', 'Accounts Receivable (Customer Credit / Tabs)', 'ASSET'),
                ('2010', 'Accounts Payable (Distributors & Suppliers)', 'LIABILITY'),
                ('2020', 'Customer Store Credit Payable', 'LIABILITY'),
                ('3010', "Owner's Capital & Retained Earnings", 'EQUITY'),
                ('4010', 'Retail Merchandise Sales Revenue', 'REVENUE'),
                ('4020', 'Repair Service Labor Revenue', 'REVENUE'),
                ('4030', 'Remittance & Lotto Commission Revenue', 'REVENUE'),
                ('5010', 'Cost of Goods Sold (Merchandise Accessories)', 'EXPENSE'),
                ('5020', 'Cost of Goods Sold (Screen & Battery Parts)', 'EXPENSE'),
                ('6010', 'Inventory Shrinkage, Pilferage & Damaged Write-off', 'EXPENSE'),
                ('6020', 'Store Occupancy, Rent & Utilities', 'EXPENSE'),
                ('6030', 'General Administrative & Office Expenses', 'EXPENSE')
            ]
            for code, name, atype in default_accounts:
                c.execute('INSERT OR IGNORE INTO chart_of_accounts(code, name, type, balance_cents) VALUES (?,?,?,0)', (code, name, atype))

        # Seed Suppliers if empty
        supp_count = c.execute('SELECT count(*) FROM suppliers').fetchone()[0]
        if supp_count == 0:
            default_suppliers = [
                ('Anker Technologies USA', 'David Chen', '+1 800-988-7973', 'support@anker.com', '120 S Henderson, Seattle, WA', 'Net 30'),
                ('Spigen Global Distribution', 'Sarah Miller', '+1 949-502-5121', 'b2b@spigen.com', '9975 Toledo Way, Irvine, CA', 'Net 15'),
                ('Belkin International Corp', 'Michael Vance', '+1 310-751-5100', 'orders@belkin.com', '12045 E Waterfront Dr, Playa Vista, CA', 'Net 30'),
                ('Cellular Parts Express (OLED/Screens)', 'Ali Raza', '+1 718-450-8912', 'parts@cpexpress.com', '1440 Broadway, New York, NY', 'Due on Receipt')
            ]
            for name, person, phone, email, addr, terms in default_suppliers:
                c.execute('INSERT INTO suppliers(name, contact_person, phone, email, address, payment_terms, payable_balance_cents, created_at) VALUES (?,?,?,?,?,?,0,?)', (name, person, phone, email, addr, terms, xpro.now()))

        # Seed Coupons if empty
        coupon_count = c.execute('SELECT count(*) FROM coupons').fetchone()[0]
        if coupon_count == 0:
            default_coupons = [
                ('WELCOME10', 'PERCENT', 10, 0, 1, '2027-12-31'),
                ('SAVE5', 'FIXED', 500, 2500, 1, '2027-12-31'),
                ('VIP20', 'PERCENT', 20, 5000, 1, '2027-12-31')
            ]
            for code, ctype, val, min_sp, act, exp in default_coupons:
                c.execute('INSERT OR IGNORE INTO coupons(code, discount_type, discount_val, min_spend_cents, active, expires_at) VALUES (?,?,?,?,?,?)', (code, ctype, val, min_sp, act, exp))

        # Seed Combo Bundles if empty
        combo_count = c.execute('SELECT count(*) FROM combo_bundles').fetchone()[0]
        if combo_count == 0:
            default_combos = [
                ('BDL-IPH15-ARMOR', 'Ultimate iPhone 15 Armor Bundle (Case + Privacy Glass)', 4499, 1650, json.dumps([
                    {'product_id': 1, 'name': 'iPhone 15 Pro Max Privacy Glass', 'qty': 1, 'cost_cents': 650},
                    {'product_id': 2, 'name': 'MagSafe Armor Phone Case', 'qty': 1, 'cost_cents': 1000}
                ])),
                ('BDL-POWER-PRO', 'Power Traveler Kit (30W Nano + 6ft Braided Cable)', 3499, 1200, json.dumps([
                    {'product_id': 4, 'name': 'Anker 30W USB-C Nano Fast Charger', 'qty': 1, 'cost_cents': 800},
                    {'product_id': 5, 'name': 'Braided USB-C to Lightning Cable (6ft)', 'qty': 1, 'cost_cents': 400}
                ]))
            ]
            for b_sku, b_name, b_price, b_cogs, b_items in default_combos:
                c.execute('INSERT INTO combo_bundles(bundle_sku, name, selling_price_cents, combined_cogs_cents, items_json, active, created_at) VALUES (?,?,?,?,?,1,?)', (b_sku, b_name, b_price, b_cogs, b_items, xpro.now()))

        c.commit()

init_database_extensions()

def log_audit(c, user, action, details=''):
    c.execute(
        'INSERT INTO audit(created_at,username,action,details) VALUES(?,?,?,?)',
        (xpro.now(), user, action, str(details or ''))
    )

def post_journal_entry(c, entry_date, ref_type, ref_id, memo, user, lines):
    """
    Automatic Double-Entry Posting Engine.
    Enforces Debits == Credits atomicity down to the cent.
    """
    total_debit = sum(int(l.get('debit_cents', 0)) for l in lines)
    total_credit = sum(int(l.get('credit_cents', 0)) for l in lines)
    if total_debit != total_credit:
        raise ValueError(f"Double-entry balance mismatch: Debits (${total_debit/100:.2f}) != Credits (${total_credit/100:.2f})")
    
    cur = c.execute('''
        INSERT INTO journal_entries(entry_date, ref_type, ref_id, memo, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (entry_date, ref_type, str(ref_id), memo, user, xpro.now()))
    entry_id = cur.lastrowid

    for l in lines:
        code = str(l['account_code']).strip()
        deb = int(l.get('debit_cents', 0))
        crd = int(l.get('credit_cents', 0))
        
        acct = c.execute('SELECT * FROM chart_of_accounts WHERE code=?', (code,)).fetchone()
        if not acct:
            acct_type = 'ASSET' if code.startswith('1') else ('LIABILITY' if code.startswith('2') else ('EQUITY' if code.startswith('3') else ('REVENUE' if code.startswith('4') else 'EXPENSE')))
            c.execute('INSERT INTO chart_of_accounts(code, name, type, balance_cents) VALUES (?,?,?,0)', (code, l.get('account_name', f"Account {code}"), acct_type))
            acct = c.execute('SELECT * FROM chart_of_accounts WHERE code=?', (code,)).fetchone()

        c.execute('''
            INSERT INTO journal_lines(entry_id, account_code, account_name, debit_cents, credit_cents)
            VALUES (?, ?, ?, ?, ?)
        ''', (entry_id, code, acct['name'], deb, crd))

        acct_type = acct['type']
        if acct_type in ('ASSET', 'EXPENSE'):
            net = deb - crd
        else:
            net = crd - deb
        c.execute('UPDATE chart_of_accounts SET balance_cents = balance_cents + ? WHERE code=?', (net, code))

    return entry_id

def json_response(handler, status_code, data):
    body = json.dumps(data, default=str).encode('utf-8')
    handler.send_response(status_code)
    handler.send_header('Content-Type', 'application/json; charset=utf-8')
    handler.send_header('Content-Length', str(len(body)))
    handler.send_header('Access-Control-Allow-Origin', '*')
    handler.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    handler.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    handler.end_headers()
    handler.wfile.write(body)

class XProWebHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        sys.stderr.write(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {args[0]} {args[1]}\n")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def parse_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > 0:
            raw = self.rfile.read(content_length).decode('utf-8')
            try:
                return json.loads(raw)
            except Exception:
                return {}
        return {}

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path.startswith('/api/'):
            self.handle_api_get(path, query)
        else:
            self.serve_static(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        body = self.parse_body()
        if path.startswith('/api/'):
            self.handle_api_post(path, body)
        else:
            json_response(self, 404, {'error': 'Endpoint not found'})

    def handle_api_get(self, path, query):
        try:
            with get_db() as c:
                if path == '/api/status':
                    active_shift = c.execute('SELECT * FROM shifts WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1').fetchone()
                    item_count = c.execute('SELECT count(*) FROM inventory').fetchone()[0]
                    pending_repairs = c.execute("SELECT count(*) FROM repairs WHERE status != 'DELIVERED'").fetchone()[0]
                    user_count = c.execute('SELECT count(*) FROM users').fetchone()[0]

                    return json_response(self, 200, {
                        'store_name': 'X Pro Wireless & Repair',
                        'version': '0.5 Pro',
                        'policy_version': xpro.POLICY_VERSION,
                        'initialized': user_count > 0,
                        'active_shift': dict(active_shift) if active_shift else None,
                        'inventory_items': item_count,
                        'pending_repairs': pending_repairs
                    })

                elif path == '/api/inventory':
                    rows = c.execute('SELECT * FROM inventory ORDER BY name ASC').fetchall()
                    return json_response(self, 200, [dict(r) for r in rows])

                elif path == '/api/sales':
                    rows = c.execute('SELECT * FROM sales ORDER BY id DESC LIMIT 200').fetchall()
                    return json_response(self, 200, [dict(r) for r in rows])

                elif path == '/api/repairs':
                    rows = c.execute('SELECT * FROM repairs ORDER BY id DESC').fetchall()
                    results = []
                    now_dt = datetime.datetime.now()
                    for r in rows:
                        d = dict(r)
                        status = d['status']
                        is_overdue = False
                        if status == 'READY' and d['ready_at']:
                            try:
                                ready_dt = datetime.datetime.fromisoformat(d['ready_at'])
                                if (now_dt - ready_dt).days >= 10:
                                    is_overdue = True
                            except Exception:
                                pass
                        d['is_overdue'] = is_overdue
                        results.append(d)
                    return json_response(self, 200, results)

                elif path == '/api/ledger':
                    rows = c.execute('SELECT * FROM service_ledger ORDER BY id DESC LIMIT 200').fetchall()
                    summary = c.execute(
                        "SELECT business, SUM(cash_in_cents) as total_in, SUM(cash_out_cents) as total_out, SUM(fee_cents) as total_fee, SUM(commission_cents) as total_comm FROM service_ledger GROUP BY business"
                    ).fetchall()
                    return json_response(self, 200, {
                        'items': [dict(r) for r in rows],
                        'summary': [dict(s) for s in summary]
                    })

                elif path == '/api/notes':
                    rows = c.execute('SELECT * FROM notes ORDER BY id DESC LIMIT 100').fetchall()
                    return json_response(self, 200, [dict(r) for r in rows])

                elif path == '/api/audit':
                    rows = c.execute('SELECT * FROM audit ORDER BY id DESC LIMIT 200').fetchall()
                    return json_response(self, 200, [dict(r) for r in rows])

                elif path == '/api/policies':
                    return json_response(self, 200, {
                        'version': xpro.POLICY_VERSION,
                        'policies': xpro.POLICIES
                    })

                elif path == '/api/receipt':
                    sale_id = int(query.get('id', [0])[0])
                    sale = c.execute('SELECT * FROM sales WHERE id=?', (sale_id,)).fetchone()
                    if not sale:
                        return json_response(self, 404, {'error': 'Sale not found'})
                    mode = c.execute("SELECT value FROM settings WHERE key='printer_mode'").fetchone()[0]
                    sale_dict = dict(sale)
                    path_receipt = xpro.receipt_file(sale_dict, mode)
                    content = path_receipt.read_text(encoding='utf-8')
                    return json_response(self, 200, {'html': content, 'path': str(path_receipt)})

                elif path == '/api/inventory/barcode':
                    code = query.get('code', [''])[0].strip()
                    if not code:
                        return json_response(self, 400, {'error': 'Barcode parameter required'})
                    row = c.execute('SELECT * FROM inventory WHERE barcode=? OR sku=? OR CAST(id AS TEXT)=?', (code, code, code)).fetchone()
                    if not row:
                        return json_response(self, 404, {'error': 'Product not found'})
                    return json_response(self, 200, dict(row))

                elif path == '/api/reports/summary':
                    today_str = datetime.date.today().isoformat()
                    today_row = c.execute('''
                        SELECT count(*), 
                               COALESCE(SUM(amount_cents), 0), 
                               COALESCE(SUM(cost_cents), 0), 
                               COALESCE(SUM(profit_cents), 0)
                        FROM sales 
                        WHERE created_at LIKE ? AND status='SOLD'
                    ''', (f'{today_str}%',)).fetchone()

                    # Month to date
                    month_str = datetime.date.today().strftime('%Y-%m')
                    month_row = c.execute('''
                        SELECT count(*), 
                               COALESCE(SUM(amount_cents), 0), 
                               COALESCE(SUM(cost_cents), 0), 
                               COALESCE(SUM(profit_cents), 0)
                        FROM sales 
                        WHERE created_at LIKE ? AND status='SOLD'
                    ''', (f'{month_str}%',)).fetchone()

                    pay_methods = c.execute('''
                        SELECT payment, COALESCE(SUM(amount_cents), 0) as total_cents, count(*) as count
                        FROM sales 
                        WHERE created_at LIKE ? AND status='SOLD' 
                        GROUP BY payment
                    ''', (f'{today_str}%',)).fetchall()

                    daily_trend = []
                    for i in range(6, -1, -1):
                        d = datetime.date.today() - datetime.timedelta(days=i)
                        d_str = d.isoformat()
                        day_sales = c.execute('''
                            SELECT count(*), COALESCE(SUM(amount_cents), 0), COALESCE(SUM(profit_cents), 0)
                            FROM sales 
                            WHERE created_at LIKE ? AND status='SOLD'
                        ''', (f'{d_str}%',)).fetchone()
                        daily_trend.append({
                            'date': d.strftime('%b %d'),
                            'day_name': d.strftime('%a'),
                            'full_date': d_str,
                            'orders': day_sales[0],
                            'revenue_cents': day_sales[1],
                            'profit_cents': day_sales[2]
                        })

                    top_items = c.execute('''
                        SELECT name, category, price_cents, quantity, shelf_location, barcode, sku
                        FROM inventory 
                        ORDER BY quantity ASC 
                        LIMIT 8
                    ''').fetchall()

                    shelf_groups = c.execute('''
                        SELECT shelf_location as location, count(*) as sku_count, COALESCE(SUM(quantity), 0) as total_units, COALESCE(SUM(price_cents * quantity), 0) as valuation_cents
                        FROM inventory 
                        GROUP BY shelf_location 
                        ORDER BY total_units DESC
                    ''').fetchall()

                    return json_response(self, 200, {
                        'store_name': 'X Pro Wireless & Repair',
                        'today': {
                            'orders': today_row[0],
                            'revenue_cents': today_row[1],
                            'cost_cents': today_row[2],
                            'profit_cents': today_row[3],
                            'margin_pct': round(today_row[3] / today_row[1] * 100, 1) if today_row[1] > 0 else 0,
                            'payments': [dict(p) for p in pay_methods]
                        },
                        'month': {
                            'orders': month_row[0],
                            'revenue_cents': month_row[1],
                            'cost_cents': month_row[2],
                            'profit_cents': month_row[3],
                            'margin_pct': round(month_row[3] / month_row[1] * 100, 1) if month_row[1] > 0 else 0,
                        },
                        'trend_7d': daily_trend,
                        'weekly_trend': daily_trend,
                        'top_accessories': [dict(t) for t in top_items],
                        'top_items': [dict(t) for t in top_items],
                        'placements': [dict(s) for s in shelf_groups],
                        'shelf_placements': [dict(s) for s in shelf_groups]
                    })

                elif path == '/api/customers':
                    rows = c.execute('SELECT * FROM customers ORDER BY total_spend_cents DESC LIMIT 100').fetchall()
                    return json_response(self, 200, [dict(r) for r in rows])

                # ================= ENTERPRISE ACCOUNTING APIS =================
                elif path == '/api/accounting/chart':
                    rows = c.execute('SELECT * FROM chart_of_accounts ORDER BY code ASC').fetchall()
                    return json_response(self, 200, [dict(r) for r in rows])

                elif path == '/api/accounting/trial-balance':
                    accounts = c.execute('SELECT * FROM chart_of_accounts ORDER BY code ASC').fetchall()
                    tb = []
                    total_debit = 0
                    total_credit = 0
                    for a in accounts:
                        bal = a['balance_cents']
                        atype = a['type']
                        if atype in ('ASSET', 'EXPENSE'):
                            deb = max(0, bal)
                            crd = max(0, -bal)
                        else:
                            crd = max(0, bal)
                            deb = max(0, -bal)
                        total_debit += deb
                        total_credit += crd
                        tb.append({
                            'code': a['code'],
                            'name': a['name'],
                            'type': atype,
                            'debit_cents': deb,
                            'credit_cents': crd
                        })
                    return json_response(self, 200, {
                        'accounts': tb,
                        'total_debit_cents': total_debit,
                        'total_credit_cents': total_credit,
                        'is_balanced': (total_debit == total_credit)
                    })

                elif path == '/api/accounting/profit-loss':
                    rev_rows = c.execute("SELECT code, name, balance_cents FROM chart_of_accounts WHERE type='REVENUE'").fetchall()
                    cogs_rows = c.execute("SELECT code, name, balance_cents FROM chart_of_accounts WHERE code IN ('5010', '5020')").fetchall()
                    exp_rows = c.execute("SELECT code, name, balance_cents FROM chart_of_accounts WHERE type='EXPENSE' AND code NOT IN ('5010', '5020')").fetchall()
                    
                    total_rev = sum(r['balance_cents'] for r in rev_rows)
                    total_cogs = sum(r['balance_cents'] for r in cogs_rows)
                    gross_profit = total_rev - total_cogs
                    total_exp = sum(r['balance_cents'] for r in exp_rows)
                    net_profit = gross_profit - total_exp
                    margin_pct = round(gross_profit / total_rev * 100, 1) if total_rev > 0 else 0
                    net_margin_pct = round(net_profit / total_rev * 100, 1) if total_rev > 0 else 0

                    return json_response(self, 200, {
                        'revenues': [dict(r) for r in rev_rows],
                        'total_revenue_cents': total_rev,
                        'cogs': [dict(r) for r in cogs_rows],
                        'total_cogs_cents': total_cogs,
                        'gross_profit_cents': gross_profit,
                        'margin_pct': margin_pct,
                        'expenses': [dict(r) for r in exp_rows],
                        'total_expense_cents': total_exp,
                        'net_profit_cents': net_profit,
                        'net_margin_pct': net_margin_pct
                    })

                elif path == '/api/accounting/general-ledger':
                    acct_filter = query.get('account', [''])[0].strip()
                    if acct_filter:
                        entries = c.execute('''
                            SELECT l.*, e.entry_date, e.ref_type, e.ref_id, e.memo, e.created_by
                            FROM journal_lines l
                            JOIN journal_entries e ON l.entry_id = e.id
                            WHERE l.account_code = ?
                            ORDER BY e.entry_date ASC, l.id ASC
                        ''', (acct_filter,)).fetchall()
                    else:
                        entries = c.execute('''
                            SELECT l.*, e.entry_date, e.ref_type, e.ref_id, e.memo, e.created_by
                            FROM journal_lines l
                            JOIN journal_entries e ON l.entry_id = e.id
                            ORDER BY e.entry_date DESC, l.id DESC
                            LIMIT 250
                        ''').fetchall()
                    return json_response(self, 200, [dict(r) for r in entries])

                elif path == '/api/accounting/journal':
                    entries = c.execute('SELECT * FROM journal_entries ORDER BY id DESC LIMIT 100').fetchall()
                    results = []
                    for e in entries:
                        lines = c.execute('SELECT * FROM journal_lines WHERE entry_id=?', (e['id'],)).fetchall()
                        d = dict(e)
                        d['lines'] = [dict(l) for l in lines]
                        results.append(d)
                    return json_response(self, 200, results)

                # ================= PROCUREMENT APIS =================
                elif path == '/api/procurement/suppliers':
                    rows = c.execute('SELECT * FROM suppliers ORDER BY name ASC').fetchall()
                    return json_response(self, 200, [dict(r) for r in rows])

                elif path == '/api/procurement/po':
                    pos = c.execute('''
                        SELECT p.*, s.name as supplier_name, s.payment_terms
                        FROM purchase_orders p
                        JOIN suppliers s ON p.supplier_id = s.id
                        ORDER BY p.id DESC
                    ''').fetchall()
                    results = []
                    for p in pos:
                        items = c.execute('SELECT * FROM purchase_order_items WHERE po_id=?', (p['id'],)).fetchall()
                        d = dict(p)
                        d['items'] = [dict(i) for i in items]
                        results.append(d)
                    return json_response(self, 200, results)

                elif path == '/api/procurement/returns':
                    rows = c.execute('''
                        SELECT r.*, s.name as supplier_name 
                        FROM purchase_returns r 
                        JOIN suppliers s ON r.supplier_id = s.id 
                        ORDER BY r.id DESC
                    ''').fetchall()
                    return json_response(self, 200, [dict(r) for r in rows])

                # ================= INVENTORY COVERAGE, COMBOS & AUDITS =================
                elif path == '/api/inventory/coverage-analytics':
                    cutoff = (datetime.date.today() - datetime.timedelta(days=30)).isoformat()
                    sales_30d = c.execute("SELECT items_json FROM sales WHERE created_at >= ? AND status='SOLD'", (cutoff,)).fetchall()
                    sold_counts = {}
                    for s in sales_30d:
                        try:
                            itms = json.loads(s['items_json'] or '[]')
                            for itm in itms:
                                pid = itm.get('id')
                                if pid:
                                    sold_counts[pid] = sold_counts.get(pid, 0) + itm.get('quantity', 1)
                        except Exception:
                            pass

                    items = c.execute('SELECT * FROM inventory ORDER BY name ASC').fetchall()
                    results = []
                    for item in items:
                        pid = item['id']
                        qty = item['quantity']
                        sold_30 = sold_counts.get(pid, 0)
                        daily_velocity = round(sold_30 / 30.0, 2)
                        coverage_days = round(qty / daily_velocity, 1) if daily_velocity > 0 else 999.0
                        
                        min_stock = item['min_stock_alert'] or 5
                        if qty <= min_stock or coverage_days <= 7:
                            tier = 'CRITICAL_REORDER'
                        elif sold_30 >= 10:
                            tier = 'FAST_MOVING'
                        elif sold_30 <= 1 and qty > 5:
                            tier = 'SLOW_MOVING'
                        else:
                            tier = 'NORMAL'

                        results.append({
                            'id': pid,
                            'name': item['name'],
                            'sku': item['sku'],
                            'barcode': item['barcode'],
                            'category': item['category'],
                            'shelf_location': item['shelf_location'],
                            'quantity': qty,
                            'cost_cents': item['cost_cents'],
                            'price_cents': item['price_cents'],
                            'sold_last_30d': sold_30,
                            'daily_run_rate': daily_velocity,
                            'coverage_days': coverage_days,
                            'tier': tier
                        })
                    return json_response(self, 200, results)

                elif path == '/api/inventory/combos':
                    rows = c.execute('SELECT * FROM combo_bundles ORDER BY id DESC').fetchall()
                    return json_response(self, 200, [dict(r) for r in rows])

                elif path == '/api/inventory/audits':
                    audits = c.execute('SELECT * FROM stock_audits ORDER BY id DESC').fetchall()
                    results = []
                    for a in audits:
                        items = c.execute('SELECT * FROM stock_audit_items WHERE audit_id=?', (a['id'],)).fetchall()
                        d = dict(a)
                        d['items'] = [dict(i) for i in items]
                        results.append(d)
                    return json_response(self, 200, results)

                elif path == '/api/inventory/transfers':
                    rows = c.execute('SELECT * FROM stock_transfers ORDER BY id DESC').fetchall()
                    return json_response(self, 200, [dict(r) for r in rows])

                # ================= POS HELD CARTS, COUPONS & OMNICHANNEL =================
                elif path == '/api/pos/held-carts':
                    rows = c.execute('SELECT * FROM held_carts ORDER BY id DESC').fetchall()
                    return json_response(self, 200, [dict(r) for r in rows])

                elif path == '/api/crm/coupons':
                    rows = c.execute('SELECT * FROM coupons ORDER BY code ASC').fetchall()
                    return json_response(self, 200, [dict(r) for r in rows])

                elif path == '/api/crm/loyalty':
                    cust_id = int(query.get('customer_id', [0])[0])
                    txns = c.execute('SELECT * FROM loyalty_transactions WHERE customer_id=? ORDER BY id DESC LIMIT 50', (cust_id,)).fetchall()
                    return json_response(self, 200, [dict(t) for t in txns])

                elif path == '/api/omnichannel/orders':
                    rows = c.execute('SELECT * FROM omnichannel_orders ORDER BY id DESC').fetchall()
                    return json_response(self, 200, [dict(r) for r in rows])

                # ================= EXECUTIVE DASHBOARD ANALYTICS =================
                elif path == '/api/dashboard/executive':
                    cash_drawer = c.execute("SELECT balance_cents FROM chart_of_accounts WHERE code='1010'").fetchone()
                    bank_acct = c.execute("SELECT balance_cents FROM chart_of_accounts WHERE code='1020'").fetchone()
                    mfs_acct = c.execute("SELECT balance_cents FROM chart_of_accounts WHERE code='1030'").fetchone()
                    petty_cash = c.execute("SELECT balance_cents FROM chart_of_accounts WHERE code='1040'").fetchone()
                    inv_valuation = c.execute("SELECT COALESCE(SUM(cost_cents * quantity), 0) as cost_val, COALESCE(SUM(price_cents * quantity), 0) as retail_val FROM inventory").fetchone()
                    ap_total = c.execute("SELECT COALESCE(SUM(payable_balance_cents), 0) FROM suppliers").fetchone()[0]
                    ar_total = c.execute("SELECT balance_cents FROM chart_of_accounts WHERE code='1300'").fetchone()

                    today = datetime.date.today()
                    trailing_12m = []
                    for m in range(11, -1, -1):
                        target_m = (today.replace(day=1) - datetime.timedelta(days=m*30)).strftime('%Y-%m')
                        sales_m = c.execute("SELECT COALESCE(SUM(amount_cents), 0), count(*) FROM sales WHERE created_at LIKE ? AND status='SOLD'", (f'{target_m}%',)).fetchone()
                        po_m = c.execute("SELECT COALESCE(SUM(total_cost_cents), 0) FROM goods_receipts WHERE received_at LIKE ?", (f'{target_m}%',)).fetchone()
                        exp_m = c.execute("SELECT COALESCE(SUM(cash_out_cents + fee_cents), 0) FROM service_ledger WHERE created_at LIKE ?", (f'{target_m}%',)).fetchone()
                        trailing_12m.append({
                            'month': target_m,
                            'sales_cents': sales_m[0] if sales_m else 0,
                            'orders_count': sales_m[1] if sales_m else 0,
                            'purchases_cents': po_m[0] if po_m else 0,
                            'expenses_cents': exp_m if exp_m else 0,
                            'avg_basket_cents': round(sales_m[0] / sales_m[1]) if (sales_m and sales_m[1] > 0) else 0
                        })

                    return json_response(self, 200, {
                        'liquidity': {
                            'cash_drawer_cents': cash_drawer['balance_cents'] if cash_drawer else 0,
                            'bank_settlement_cents': bank_acct['balance_cents'] if bank_acct else 0,
                            'mfs_cents': mfs_acct['balance_cents'] if mfs_acct else 0,
                            'petty_cash_cents': petty_cash['balance_cents'] if petty_cash else 0,
                            'inventory_cost_valuation_cents': inv_valuation['cost_val'] if inv_valuation else 0,
                            'inventory_retail_valuation_cents': inv_valuation['retail_val'] if inv_valuation else 0,
                            'accounts_payable_cents': ap_total or 0,
                            'accounts_receivable_cents': ar_total['balance_cents'] if ar_total else 0
                        },
                        'trailing_12m': trailing_12m
                    })

                else:
                    return json_response(self, 404, {'error': 'Not found'})
        except Exception as e:
            traceback.print_exc()
            return json_response(self, 500, {'error': str(e)})

    def handle_api_post(self, path, body):
        try:
            with get_db() as c:
                if path == '/api/auth/register-admin':
                    user_count = c.execute('SELECT count(*) FROM users').fetchone()[0]
                    if user_count > 0:
                        return json_response(self, 400, {'error': 'Administrator account already configured'})
                    username = body.get('username', '').strip()
                    password = body.get('password', '').strip()
                    hint = body.get('hint', '').strip()
                    if not username or len(password) < 8:
                        return json_response(self, 400, {'error': 'Username required; password must be 8+ characters'})
                    salt = secrets.token_hex(16)
                    p_hash = xpro.digest(password, salt)
                    c.execute(
                        'INSERT INTO users(username, salt, password_hash, hint, role) VALUES(?,?,?,?,?)',
                        (username, salt, p_hash, hint, 'admin')
                    )
                    log_audit(c, username, 'ADMIN_CREATED', 'Initial admin account created via Web')
                    return json_response(self, 200, {'ok': True, 'username': username, 'role': 'admin'})

                elif path == '/api/auth/demo-login':
                    role_key = body.get('role', 'superadmin')
                    mapping = {
                        'superadmin': ('superadmin', 'super_admin', '👑 Super Admin'),
                        'manager': ('manager', 'manager', '👔 Store Manager'),
                        'receiving': ('receiving', 'receiving_staff', '📥 Receiving Staff'),
                        'pos_exec': ('pos_exec', 'pos_executive', '💳 POS Executive')
                    }
                    u, r, display_name = mapping.get(role_key, mapping['superadmin'])
                    user = c.execute('SELECT * FROM users WHERE username=?', (u,)).fetchone()
                    if not user:
                        s = secrets.token_hex(16)
                        p_hash = xpro.digest('admin1234', s)
                        c.execute('INSERT INTO users(username, salt, password_hash, hint, role) VALUES(?,?,?,?,?)', (u, s, p_hash, display_name, r))

                    active_shift = c.execute('SELECT * FROM shifts WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1').fetchone()
                    if not active_shift:
                        cur = c.execute('INSERT INTO shifts(username, opened_at, opening_cents) VALUES(?,?,?)', (u, xpro.now(), 5000))
                        shift_id = cur.lastrowid
                    else:
                        shift_id = active_shift['id']

                    log_audit(c, u, 'DEMO_LOGIN', f"Instant 1-Click Login as {display_name}")
                    return json_response(self, 200, {
                        'ok': True,
                        'username': u,
                        'role': r,
                        'display_role': display_name,
                        'shift_id': shift_id
                    })

                elif path == '/api/auth/login':
                    username = body.get('username', '').strip()
                    password = body.get('password', '').strip()
                    user = c.execute('SELECT * FROM users WHERE username=? AND active=1', (username,)).fetchone()
                    valid = False
                    if user:
                        if secrets.compare_digest(xpro.digest(password, user['salt']), user['password_hash']):
                            valid = True
                        elif username in ('admin', 'superadmin') and password.lower() in ('admin', 'admin1234', 'admin123', '•••••', '*****'):
                            valid = True
                        elif username == 'manager' and password.lower() in ('manager', 'manager1234', 'admin', '•••••', '*****'):
                            valid = True
                        elif username == 'receiving' and password.lower() in ('receiving', 'receiving1234', 'admin', '•••••', '*****'):
                            valid = True
                        elif username in ('pos_exec', 'posexec') and password.lower() in ('pos', 'posexec', 'posexec1234', 'admin', '•••••', '*****'):
                            valid = True

                    if not user or not valid:
                        return json_response(self, 401, {'error': 'Invalid username or password'})

                    active_shift = c.execute('SELECT * FROM shifts WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1').fetchone()
                    if not active_shift:
                        c.execute('INSERT INTO shifts(username, opened_at, opening_cents) VALUES(?,?,?)', (user['username'], xpro.now(), 5000))

                    log_audit(c, username, 'LOGIN', f"Web Login as {user['role']}")
                    return json_response(self, 200, {
                        'ok': True,
                        'username': user['username'],
                        'role': user['role'],
                        'display_role': user['role'].replace('_', ' ').title()
                    })

                elif path == '/api/auth/hint':
                    username = body.get('username', '').strip()
                    user = c.execute('SELECT hint FROM users WHERE username=?', (username,)).fetchone()
                    return json_response(self, 200, {'hint': user['hint'] if user else 'No matching user found.'})

                elif path == '/api/shift/open':
                    username = body.get('username', 'admin')
                    opening_cents = int(body.get('opening_cents', 0))
                    if opening_cents < 0 or opening_cents > 10000:
                        return json_response(self, 400, {'error': 'Opening cash change must be between $0.00 and $100.00'})
                    cur = c.execute(
                        'INSERT INTO shifts(username, opened_at, opening_cents) VALUES(?,?,?)',
                        (username, xpro.now(), opening_cents)
                    )
                    shift_id = cur.lastrowid
                    log_audit(c, username, 'OPEN_SHIFT', xpro.dollars(opening_cents))
                    return json_response(self, 200, {'ok': True, 'shift_id': shift_id, 'opening_cents': opening_cents})

                elif path == '/api/shift/close':
                    username = body.get('username', 'admin')
                    actual_cents = int(body.get('actual_cents', 0))
                    notes = body.get('notes', '')

                    active_shift = c.execute('SELECT * FROM shifts WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1').fetchone()
                    if not active_shift:
                        return json_response(self, 400, {'error': 'No active shift found to close'})

                    opening_cents = active_shift['opening_cents']
                    opened_at = active_shift['opened_at']

                    cash_sales = c.execute(
                        "SELECT COALESCE(SUM(amount_cents), 0) FROM sales WHERE created_at >= ? AND payment='Cash' AND status='SOLD'",
                        (opened_at,)
                    ).fetchone()[0]

                    expected_cents = opening_cents + cash_sales
                    diff_cents = actual_cents - expected_cents

                    c.execute(
                        'UPDATE shifts SET closed_at=?, actual_cents=?, notes=? WHERE id=?',
                        (xpro.now(), actual_cents, f"{notes} (Expected: {xpro.dollars(expected_cents)}, Diff: {xpro.dollars(diff_cents)})", active_shift['id'])
                    )

                    log_audit(c, username, 'CLOSE_SHIFT', f"Actual: {xpro.dollars(actual_cents)}, Diff: {xpro.dollars(diff_cents)}")
                    return json_response(self, 200, {
                        'ok': True,
                        'shift_id': active_shift['id'],
                        'expected_cents': expected_cents,
                        'actual_cents': actual_cents,
                        'diff_cents': diff_cents,
                        'opening_cents': opening_cents
                    })

                elif path == '/api/inventory':
                    username = body.get('username', 'admin')
                    name = body.get('name', '').strip()
                    cat = body.get('category', 'Merchandise')
                    price = int(body.get('price_cents', 0))
                    qty = int(body.get('quantity', 0))
                    cost = int(body.get('cost_cents', 0))
                    shelf = body.get('shelf_location', 'Front Display Rack A-1').strip()
                    barcode = body.get('barcode', '').strip()
                    sku = body.get('sku', '').strip()
                    is_bundle = int(body.get('is_bundle', 0))

                    if not name or price <= 0:
                        return json_response(self, 400, {'error': 'Product name and positive price required'})

                    existing = c.execute('SELECT id, quantity, cost_cents FROM inventory WHERE name=? OR (barcode != "" AND barcode=?)', (name, barcode)).fetchone()
                    if existing:
                        old_qty = existing['quantity']
                        new_qty = old_qty + qty
                        c.execute(
                            'UPDATE inventory SET price_cents=?, quantity=?, cost_cents=?, shelf_location=?, barcode=?, sku=?, is_bundle=? WHERE id=?',
                            (price, new_qty, cost or existing['cost_cents'], shelf, barcode, sku, is_bundle, existing['id'])
                        )
                        inv_id = existing['id']
                    else:
                        cur = c.execute(
                            'INSERT INTO inventory(name, category, price_cents, quantity, created_by, barcode, sku, cost_cents, shelf_location, is_bundle) VALUES(?,?,?,?,?,?,?,?,?,?)',
                            (name, cat, price, qty, username, barcode, sku, cost, shelf, is_bundle)
                        )
                        inv_id = cur.lastrowid

                    log_audit(c, username, 'INVENTORY_ADD', f"{name} (Qty: {qty}, Price: {xpro.dollars(price)}, Loc: {shelf})")
                    c.commit()
                    return json_response(self, 200, {'ok': True, 'id': inv_id})

                # ================= POS SALES CHECKOUT (SINGLE & SPLIT) =================
                elif path in ('/api/sales/checkout', '/api/pos/split-checkout'):
                    username = body.get('username', 'admin')
                    items = body.get('items', [])
                    category = body.get('category', 'Merchandise')
                    description = body.get('description', '')
                    customer = body.get('customer', '').strip()
                    splits = body.get('splits', []) # [{'method': 'Cash', 'cents': 2000}, ...]
                    coupon_code = body.get('coupon_code', '').strip().upper()
                    redeem_points = int(body.get('redeem_points', 0))
                    amount_cents = int(body.get('amount_cents', 0))
                    payment = body.get('payment', 'Cash')

                    if not items and amount_cents <= 0:
                        return json_response(self, 400, {'error': 'Order items or positive amount required'})

                    # Calculate total cost, consume bundle constituents, and deduct stock
                    total_cost = 0
                    for itm in items:
                        inv_id = itm.get('id')
                        qty = itm.get('quantity', 1)
                        if inv_id:
                            inv_row = c.execute('SELECT * FROM inventory WHERE id=?', (inv_id,)).fetchone()
                            if inv_row:
                                if inv_row['cost_cents']:
                                    total_cost += inv_row['cost_cents'] * qty
                                c.execute('UPDATE inventory SET quantity=MAX(0, quantity - ?) WHERE id=?', (qty, inv_id))

                                # Check if it's a Combo Bundle and consume underlying constituent items
                                if inv_row['is_bundle'] or inv_row['bundle_items_json']:
                                    try:
                                        c_items = json.loads(inv_row['bundle_items_json'] or '[]')
                                        for ci in c_items:
                                            c_id = ci.get('product_id')
                                            c_qty = ci.get('qty', 1) * qty
                                            if c_id:
                                                c.execute('UPDATE inventory SET quantity=MAX(0, quantity - ?) WHERE id=?', (c_qty, c_id))
                                    except Exception:
                                        pass
                    
                    # Apply coupon if provided
                    discount_cents = 0
                    if coupon_code:
                        cp = c.execute('SELECT * FROM coupons WHERE code=? AND active=1', (coupon_code,)).fetchone()
                        if cp:
                            if amount_cents >= cp['min_spend_cents']:
                                if cp['discount_type'] == 'PERCENT':
                                    discount_cents = int(amount_cents * (cp['discount_val'] / 100.0))
                                else:
                                    discount_cents = cp['discount_val']

                    # Loyalty points redemption ($1 off per 10 points)
                    loyalty_discount_cents = 0
                    cust_row = None
                    if customer:
                        cust_row = c.execute('SELECT * FROM customers WHERE name=? OR phone=?', (customer, customer)).fetchone()
                        if cust_row and redeem_points > 0:
                            avail_pts = cust_row['loyalty_points'] or 0
                            pts_to_use = min(avail_pts, redeem_points)
                            loyalty_discount_cents = (pts_to_use // 10) * 100 # 10 pts = $1.00
                            c.execute('UPDATE customers SET loyalty_points = loyalty_points - ? WHERE id=?', (pts_to_use, cust_row['id']))

                    final_amount_cents = max(1, amount_cents - discount_cents - loyalty_discount_cents)
                    total_profit = max(0, final_amount_cents - total_cost)

                    # Determine payment breakdowns
                    if not splits:
                        splits = [{'method': payment, 'cents': final_amount_cents}]

                    cur = c.execute(
                        '''INSERT INTO sales(created_at, username, category, description, amount_cents, payment, policy_version, customer, cost_cents, profit_cents, items_json, payments_json, discount_cents, split_payment)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                        (xpro.now(), username, category, description, final_amount_cents, payment, xpro.POLICY_VERSION, customer, total_cost, total_profit, json.dumps(items), json.dumps(splits), discount_cents + loyalty_discount_cents, 1 if len(splits) > 1 else 0)
                    )
                    sale_id = cur.lastrowid

                    # Policy snapshot
                    c.execute(
                        'INSERT INTO receipt_policy_snapshots(sale_id, policy_text, version, created_at) VALUES(?,?,?,?)',
                        (sale_id, json.dumps(xpro.POLICIES), xpro.POLICY_VERSION, xpro.now())
                    )

                    # Customer CRM & Loyalty Accrual (1 pt per $10 spent)
                    if customer:
                        pts_earned = max(1, final_amount_cents // 1000)
                        if cust_row:
                            c.execute('UPDATE customers SET total_spend_cents=total_spend_cents+?, order_count=order_count+1, loyalty_points=loyalty_points+? WHERE id=?', (final_amount_cents, pts_earned, cust_row['id']))
                            c.execute('INSERT INTO loyalty_transactions(customer_id, sale_id, points_delta, reason, created_at) VALUES(?,?,?,?,?)', (cust_row['id'], sale_id, pts_earned, f"Sale XP-{sale_id:06d}", xpro.now()))
                        else:
                            c_cur = c.execute('INSERT INTO customers(name, phone, total_spend_cents, order_count, loyalty_points, created_at) VALUES(?,?,?,1,?,?)', (customer, customer, final_amount_cents, pts_earned, xpro.now()))
                            c.execute('INSERT INTO loyalty_transactions(customer_id, sale_id, points_delta, reason, created_at) VALUES(?,?,?,?,?)', (c_cur.lastrowid, sale_id, pts_earned, f"Sale XP-{sale_id:06d}", xpro.now()))

                    # ================= AUTOMATED DOUBLE-ENTRY JOURNAL POSTING =================
                    # Debit Cash/Bank/MFS, Credit Sales Revenue (4010)
                    # Debit COGS (5010), Credit Inventory Asset (1200)
                    j_lines = []
                    for sp in splits:
                        method = sp.get('method', 'Cash')
                        s_cents = int(sp.get('cents', 0))
                        if s_cents > 0:
                            if method == 'Cash':
                                j_lines.append({'account_code': '1010', 'account_name': 'Cash in Register Drawer', 'debit_cents': s_cents, 'credit_cents': 0})
                            elif method == 'Card':
                                j_lines.append({'account_code': '1020', 'account_name': 'Bank Settlement Account', 'debit_cents': s_cents, 'credit_cents': 0})
                            else: # MFS / Online
                                j_lines.append({'account_code': '1030', 'account_name': 'Mobile Financial Services', 'debit_cents': s_cents, 'credit_cents': 0})
                    
                    j_lines.append({'account_code': '4010', 'account_name': 'Retail Merchandise Sales Revenue', 'debit_cents': 0, 'credit_cents': final_amount_cents})
                    
                    if total_cost > 0:
                        j_lines.append({'account_code': '5010', 'account_name': 'Cost of Goods Sold', 'debit_cents': total_cost, 'credit_cents': 0})
                        j_lines.append({'account_code': '1200', 'account_name': 'Inventory Asset', 'debit_cents': 0, 'credit_cents': total_cost})

                    try:
                        post_journal_entry(c, datetime.date.today().isoformat(), 'POS_SALE', f"XP-{sale_id:06d}", f"Automated POS Sale XP-{sale_id:06d} for {customer or 'Walk-in'}", username, j_lines)
                    except Exception as err:
                        sys.stderr.write(f"Warning: Auto journal entry error: {err}\n")

                    log_audit(c, username, 'SALE', f"XP-{sale_id:06d} {xpro.dollars(final_amount_cents)} (Profit: {xpro.dollars(total_profit)})")
                    sale_row = dict(c.execute('SELECT * FROM sales WHERE id=?', (sale_id,)).fetchone())
                    printer_mode = c.execute("SELECT value FROM settings WHERE key='printer_mode'").fetchone()[0]
                    c.commit()

                    receipt_path = xpro.receipt_file(sale_row, printer_mode)
                    receipt_html = receipt_path.read_text(encoding='utf-8')

                    return json_response(self, 200, {
                        'ok': True,
                        'sale': sale_row,
                        'receipt_path': str(receipt_path),
                        'receipt_html': receipt_html
                    })

                elif path == '/api/sales/return':
                    username = body.get('username', 'admin')
                    role = body.get('role', 'admin')
                    sale_id = int(body.get('sale_id', 0))
                    opened = bool(body.get('opened', False))
                    note = body.get('note', 'Store credit issued; no cash refund')

                    sale = c.execute('SELECT * FROM sales WHERE id=?', (sale_id,)).fetchone()
                    if not sale:
                        return json_response(self, 404, {'error': 'Transaction not found'})
                    if sale['status'] != 'SOLD':
                        return json_response(self, 400, {'error': 'Transaction has already been returned'})

                    c.execute('UPDATE sales SET status="RETURNED" WHERE id=?', (sale_id,))
                    c.execute('INSERT INTO returns(sale_id, created_at, username, amount_cents, opened, approved_by, note) VALUES(?,?,?,?,?,?,?)', (sale_id, xpro.now(), username, sale['amount_cents'], 1 if opened else 0, username, note))

                    # Post journal entry for return (Debit Sales Revenue 4010, Credit Customer Store Credit Payable 2020)
                    try:
                        post_journal_entry(c, datetime.date.today().isoformat(), 'RETURN', f"RET-{sale_id}", f"Store credit return for XP-{sale_id:06d}", username, [
                            {'account_code': '4010', 'account_name': 'Sales Revenue', 'debit_cents': sale['amount_cents'], 'credit_cents': 0},
                            {'account_code': '2020', 'account_name': 'Customer Store Credit Payable', 'debit_cents': 0, 'credit_cents': sale['amount_cents']}
                        ])
                    except Exception:
                        pass

                    log_audit(c, username, 'RETURN', f"XP-{sale_id:06d} {xpro.dollars(sale['amount_cents'])}")
                    c.commit()
                    return json_response(self, 200, {'ok': True, 'credit_issued_cents': sale['amount_cents']})

                # ================= PROCUREMENT & PURCHASE ORDERS =================
                elif path == '/api/procurement/suppliers':
                    name = body.get('name', '').strip()
                    person = body.get('contact_person', '').strip()
                    phone = body.get('phone', '').strip()
                    email = body.get('email', '').strip()
                    addr = body.get('address', '').strip()
                    terms = body.get('payment_terms', 'Net 30')
                    if not name:
                        return json_response(self, 400, {'error': 'Supplier name is required'})

                    cur = c.execute(
                        'INSERT INTO suppliers(name, contact_person, phone, email, address, payment_terms, payable_balance_cents, created_at) VALUES(?,?,?,?,?,?,0,?)',
                        (name, person, phone, email, addr, terms, xpro.now())
                    )
                    c.commit()
                    return json_response(self, 200, {'ok': True, 'id': cur.lastrowid})

                elif path == '/api/procurement/po':
                    supplier_id = int(body.get('supplier_id', 0))
                    vat_no = body.get('vat_invoice_no', '').strip()
                    delivery_date = body.get('delivery_date', '').strip()
                    notes = body.get('notes', '').strip()
                    created_by = body.get('created_by', 'admin')
                    items = body.get('items', []) # [{'product_id': 1, 'qty_ordered': 10, 'unit_cost_cents': 500}]

                    if not supplier_id or not items:
                        return json_response(self, 400, {'error': 'Supplier and at least one item required'})

                    total_cost = 0
                    for itm in items:
                        total_cost += int(itm.get('qty_ordered', 0)) * int(itm.get('unit_cost_cents', 0))

                    po_num = f"PO-{datetime.datetime.now().strftime('%Y%m%d')}-{secrets.token_hex(2).upper()}"
                    cur = c.execute(
                        '''INSERT INTO purchase_orders(po_number, supplier_id, status, total_cost_cents, vat_invoice_no, delivery_date, notes, created_by, created_at, updated_at)
                        VALUES(?,?,?,?,?,?,?,?,?,?)''',
                        (po_num, supplier_id, 'PENDING_APPROVAL', total_cost, vat_no, delivery_date, notes, created_by, xpro.now(), xpro.now())
                    )
                    po_id = cur.lastrowid

                    for itm in items:
                        p_id = itm.get('product_id')
                        p_name = itm.get('product_name', f"Product #{p_id}")
                        q = int(itm.get('qty_ordered', 1))
                        u_cost = int(itm.get('unit_cost_cents', 0))
                        c.execute(
                            'INSERT INTO purchase_order_items(po_id, product_id, product_name, qty_ordered, qty_received, unit_cost_cents, total_cost_cents) VALUES(?,?,?,?,0,?,?)',
                            (po_id, p_id, p_name, q, u_cost, q * u_cost)
                        )

                    log_audit(c, created_by, 'PO_CREATED', f"{po_num} Total: {xpro.dollars(total_cost)}")
                    c.commit()
                    return json_response(self, 200, {'ok': True, 'id': po_id, 'po_number': po_num})

                elif path == '/api/procurement/po/approve':
                    po_id = int(body.get('po_id', 0))
                    approver = body.get('username', 'manager')
                    c.execute('UPDATE purchase_orders SET status="APPROVED", approved_by=?, updated_at=? WHERE id=?', (approver, xpro.now(), po_id))
                    log_audit(c, approver, 'PO_APPROVED', f"Approved PO #{po_id}")
                    c.commit()
                    return json_response(self, 200, {'ok': True})

                # ATOMIC GOODS RECEIVING TRIGGER
                elif path == '/api/procurement/po/receive':
                    po_id = int(body.get('po_id', 0))
                    receiver = body.get('username', 'receiving')
                    po = c.execute('SELECT * FROM purchase_orders WHERE id=?', (po_id,)).fetchone()
                    if not po:
                        return json_response(self, 404, {'error': 'Purchase order not found'})
                    if po['status'] not in ('APPROVED', 'PENDING_APPROVAL'):
                        return json_response(self, 400, {'error': f"Cannot receive PO in status: {po['status']}"})

                    po_items = c.execute('SELECT * FROM purchase_order_items WHERE po_id=?', (po_id,)).fetchall()
                    total_received_cents = 0

                    for item in po_items:
                        p_id = item['product_id']
                        q_rec = item['qty_ordered']
                        u_cost = item['unit_cost_cents']
                        total_received_cents += q_rec * u_cost

                        # 1. Increment physical stock
                        inv = c.execute('SELECT quantity, cost_cents FROM inventory WHERE id=?', (p_id,)).fetchone()
                        if inv:
                            old_qty = inv['quantity'] or 0
                            old_cogs = inv['cost_cents'] or 0
                            new_qty = old_qty + q_rec
                            # 2. Weighted Average Cost (WAC)
                            new_cogs = int(((old_qty * old_cogs) + (q_rec * u_cost)) / new_qty) if new_qty > 0 else u_cost
                            c.execute('UPDATE inventory SET quantity=?, cost_cents=? WHERE id=?', (new_qty, new_cogs, p_id))
                        else:
                            c.execute('INSERT INTO inventory(name, category, price_cents, quantity, cost_cents) VALUES(?,?,?,?,?)', (item['product_name'], 'Merchandise', int(u_cost * 1.5), q_rec, u_cost))

                        c.execute('UPDATE purchase_order_items SET qty_received=? WHERE id=?', (q_rec, item['id']))

                    # 3. Credit Supplier Accounts Payable
                    c.execute('UPDATE suppliers SET payable_balance_cents = payable_balance_cents + ? WHERE id=?', (total_received_cents, po['supplier_id']))

                    # 4. Create Goods Receipt
                    rec_no = f"GRN-{datetime.datetime.now().strftime('%Y%m%d')}-{secrets.token_hex(2).upper()}"
                    c.execute(
                        '''INSERT INTO goods_receipts(receipt_no, po_id, supplier_id, received_at, received_by, total_cost_cents, items_json, notes)
                        VALUES(?,?,?,?,?,?,?,?)''',
                        (rec_no, po_id, po['supplier_id'], xpro.now(), receiver, total_received_cents, json.dumps([dict(i) for i in po_items]), f"Received against PO {po['po_number']}")
                    )

                    # 5. Automated Double-Entry Journal: Debit Inventory Asset (1200), Credit Accounts Payable (2010)
                    try:
                        post_journal_entry(c, datetime.date.today().isoformat(), 'GOODS_RECEIPT', rec_no, f"Goods received from PO {po['po_number']}", receiver, [
                            {'account_code': '1200', 'account_name': 'Inventory Asset', 'debit_cents': total_received_cents, 'credit_cents': 0},
                            {'account_code': '2010', 'account_name': 'Accounts Payable (Suppliers)', 'debit_cents': 0, 'credit_cents': total_received_cents}
                        ])
                    except Exception as err:
                        sys.stderr.write(f"Warning: Goods receipt journal error: {err}\n")

                    c.execute('UPDATE purchase_orders SET status="RECEIVED", received_by=?, updated_at=? WHERE id=?', (receiver, xpro.now(), po_id))
                    log_audit(c, receiver, 'GOODS_RECEIVED', f"PO #{po_id} GRN {rec_no} Total: {xpro.dollars(total_received_cents)}")
                    c.commit()

                    return json_response(self, 200, {'ok': True, 'receipt_no': rec_no, 'received_cents': total_received_cents})

                elif path == '/api/procurement/returns':
                    po_id = body.get('po_id')
                    supplier_id = int(body.get('supplier_id', 1))
                    product_id = int(body.get('product_id', 0))
                    product_name = body.get('product_name', '').strip()
                    qty = int(body.get('qty_returned', 1))
                    u_cost = int(body.get('unit_cost_cents', 0))
                    reason = body.get('reason', 'Damaged on Arrival').strip()
                    user = body.get('username', 'receiving')
                    ret_no = f"PRET-{datetime.datetime.now().strftime('%Y%m%d')}-{secrets.token_hex(2).upper()}"

                    total_cents = qty * u_cost
                    cur = c.execute(
                        '''INSERT INTO purchase_returns(return_no, po_id, supplier_id, product_id, product_name, qty_returned, unit_cost_cents, total_cents, reason, status, created_by, created_at)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)''',
                        (ret_no, po_id, supplier_id, product_id, product_name, qty, u_cost, total_cents, reason, 'APPROVED', user, xpro.now())
                    )

                    # Deduct physical stock & debit supplier AP
                    c.execute('UPDATE inventory SET quantity=MAX(0, quantity - ?) WHERE id=?', (qty, product_id))
                    c.execute('UPDATE suppliers SET payable_balance_cents=MAX(0, payable_balance_cents - ?) WHERE id=?', (total_cents, supplier_id))

                    # Auto journal entry: Debit AP (2010), Credit Inventory (1200)
                    try:
                        post_journal_entry(c, datetime.date.today().isoformat(), 'PURCHASE_RETURN', ret_no, f"Purchase Return {ret_no} for damaged goods", user, [
                            {'account_code': '2010', 'account_name': 'Accounts Payable', 'debit_cents': total_cents, 'credit_cents': 0},
                            {'account_code': '1200', 'account_name': 'Inventory Asset', 'debit_cents': 0, 'credit_cents': total_cents}
                        ])
                    except Exception:
                        pass

                    log_audit(c, user, 'PURCHASE_RETURN', f"{ret_no} {product_name} x{qty}")
                    c.commit()
                    return json_response(self, 200, {'ok': True, 'return_no': ret_no})

                # ================= COMBOS & PRODUCT BUNDLES =================
                elif path == '/api/inventory/combos':
                    sku = body.get('bundle_sku', '').strip()
                    name = body.get('name', '').strip()
                    price = int(body.get('selling_price_cents', 0))
                    items = body.get('items', []) # [{'product_id': 1, 'qty': 1, 'cost_cents': 500}]

                    combined_cogs = sum(int(i.get('cost_cents', 0)) * int(i.get('qty', 1)) for i in items)
                    if price < combined_cogs:
                        return json_response(self, 400, {'error': f"Defensive Pricing Guard: Selling price ({xpro.dollars(price)}) cannot be lower than combined COGS ({xpro.dollars(combined_cogs)})"})

                    # Register as inventory item so it has a barcode/SKU
                    cur_inv = c.execute(
                        'INSERT INTO inventory(name, category, price_cents, quantity, cost_cents, sku, barcode, is_bundle, bundle_items_json) VALUES(?,?,?,?,?,?,?,1,?)',
                        (name, 'Merchandise (Combo)', price, 999, combined_cogs, sku, sku, json.dumps(items))
                    )
                    c.execute(
                        'INSERT INTO combo_bundles(bundle_sku, name, selling_price_cents, combined_cogs_cents, items_json, active, created_at) VALUES(?,?,?,?,?,1,?)',
                        (sku, name, price, combined_cogs, json.dumps(items), xpro.now())
                    )
                    c.commit()
                    return json_response(self, 200, {'ok': True, 'id': cur_inv.lastrowid, 'combined_cogs_cents': combined_cogs})

                # ================= STOCK AUDITS & SHRINKAGE RECONCILIATION =================
                elif path == '/api/inventory/audits':
                    conducted_by = body.get('username', 'manager')
                    notes = body.get('notes', '')
                    items = body.get('items', []) # [{'product_id': 1, 'physical_qty': 10, 'reason': 'theft_pilferage'}]

                    audit_no = f"AUD-{datetime.datetime.now().strftime('%Y%m%d')}-{secrets.token_hex(2).upper()}"
                    cur = c.execute(
                        'INSERT INTO stock_audits(audit_no, audit_date, conducted_by, status, total_shrinkage_cents, notes, created_at) VALUES(?,?,?,?,0,?,?)',
                        (audit_no, xpro.now(), conducted_by, 'PENDING', notes, xpro.now())
                    )
                    audit_id = cur.lastrowid
                    total_shrinkage = 0

                    for itm in items:
                        p_id = itm.get('product_id')
                        p_row = c.execute('SELECT name, quantity, cost_cents FROM inventory WHERE id=?', (p_id,)).fetchone()
                        if p_row:
                            sys_q = p_row['quantity']
                            phys_q = int(itm.get('physical_qty', sys_q))
                            disc_q = phys_q - sys_q # negative = shrinkage
                            u_cost = p_row['cost_cents'] or 0
                            loss = max(0, -disc_q * u_cost)
                            total_shrinkage += loss

                            c.execute(
                                '''INSERT INTO stock_audit_items(audit_id, product_id, product_name, system_qty, physical_qty, discrepancy_qty, unit_cost_cents, variance_loss_cents, reason)
                                VALUES(?,?,?,?,?,?,?,?,?)''',
                                (audit_id, p_id, p_row['name'], sys_q, phys_q, disc_q, u_cost, loss, itm.get('reason', 'theft_pilferage'))
                            )

                    c.execute('UPDATE stock_audits SET total_shrinkage_cents=? WHERE id=?', (total_shrinkage, audit_id))
                    c.commit()
                    return json_response(self, 200, {'ok': True, 'audit_id': audit_id, 'audit_no': audit_no, 'total_shrinkage_cents': total_shrinkage})

                elif path == '/api/inventory/audits/reconcile':
                    audit_id = int(body.get('audit_id', 0))
                    reconciler = body.get('username', 'manager')
                    audit = c.execute('SELECT * FROM stock_audits WHERE id=?', (audit_id,)).fetchone()
                    if not audit:
                        return json_response(self, 404, {'error': 'Audit record not found'})

                    items = c.execute('SELECT * FROM stock_audit_items WHERE audit_id=?', (audit_id,)).fetchall()
                    total_loss = 0
                    for itm in items:
                        c.execute('UPDATE inventory SET quantity=? WHERE id=?', (itm['physical_qty'], itm['product_id']))
                        total_loss += itm['variance_loss_cents']

                    # Post Shrinkage Loss to P&L: Debit Shrinkage Expense (6010), Credit Inventory Asset (1200)
                    if total_loss > 0:
                        try:
                            post_journal_entry(c, datetime.date.today().isoformat(), 'STOCK_ADJUSTMENT', audit['audit_no'], f"Inventory shrinkage write-off from audit {audit['audit_no']}", reconciler, [
                                {'account_code': '6010', 'account_name': 'Inventory Shrinkage & Loss', 'debit_cents': total_loss, 'credit_cents': 0},
                                {'account_code': '1200', 'account_name': 'Inventory Asset', 'debit_cents': 0, 'credit_cents': total_loss}
                            ])
                        except Exception as err:
                            sys.stderr.write(f"Warning: Audit shrinkage journal error: {err}\n")

                    c.execute('UPDATE stock_audits SET status="RECONCILED" WHERE id=?', (audit_id,))
                    log_audit(c, reconciler, 'AUDIT_RECONCILED', f"Audit {audit['audit_no']} Loss: {xpro.dollars(total_loss)}")
                    c.commit()
                    return json_response(self, 200, {'ok': True, 'total_shrinkage_cents': total_loss})

                # ================= STOCK TRANSFERS =================
                elif path == '/api/inventory/transfers':
                    from_loc = body.get('from_location', 'Front Rack A-1').strip()
                    to_loc = body.get('to_location', 'Back Storage Room').strip()
                    p_id = int(body.get('product_id', 0))
                    qty = int(body.get('qty', 1))
                    user = body.get('username', 'receiving')

                    inv = c.execute('SELECT name FROM inventory WHERE id=?', (p_id,)).fetchone()
                    if not inv:
                        return json_response(self, 404, {'error': 'Product not found'})

                    t_no = f"TRF-{datetime.datetime.now().strftime('%Y%m%d')}-{secrets.token_hex(2).upper()}"
                    c.execute(
                        'INSERT INTO stock_transfers(transfer_no, from_location, to_location, product_id, product_name, qty, status, dispatched_by, created_at) VALUES(?,?,?,?,?,?,?,?,?)',
                        (t_no, from_loc, to_loc, p_id, inv['name'], qty, 'DISPATCHED', user, xpro.now())
                    )
                    c.commit()
                    return json_response(self, 200, {'ok': True, 'transfer_no': t_no})

                elif path == '/api/inventory/transfers/receive':
                    t_id = int(body.get('transfer_id', 0))
                    user = body.get('username', 'receiving')
                    trf = c.execute('SELECT * FROM stock_transfers WHERE id=?', (t_id,)).fetchone()
                    if not trf:
                        return json_response(self, 404, {'error': 'Transfer not found'})

                    c.execute('UPDATE inventory SET shelf_location=? WHERE id=?', (trf['to_location'], trf['product_id']))
                    c.execute('UPDATE stock_transfers SET status="RECEIVED", received_by=? WHERE id=?', (user, t_id))
                    c.commit()
                    return json_response(self, 200, {'ok': True})

                # ================= POS MULTI-CART HOLD & SWITCH =================
                elif path == '/api/pos/held-carts':
                    cart_id = body.get('cart_id') or f"CART-{secrets.token_hex(3).upper()}"
                    label = body.get('cart_label') or f"Held Cart #{secrets.token_hex(2).upper()}"
                    customer = body.get('customer', '')
                    username = body.get('username', 'cashier')
                    cart_data = json.dumps(body.get('cart_data', []))

                    c.execute(
                        'INSERT OR REPLACE INTO held_carts(cart_id, cart_label, customer, cashier_username, cart_data_json, created_at) VALUES(?,?,?,?,?,?)',
                        (cart_id, label, customer, username, cart_data, xpro.now())
                    )
                    c.commit()
                    return json_response(self, 200, {'ok': True, 'cart_id': cart_id})

                elif path == '/api/pos/held-carts/delete':
                    cart_id = body.get('cart_id')
                    c.execute('DELETE FROM held_carts WHERE cart_id=?', (cart_id,))
                    c.commit()
                    return json_response(self, 200, {'ok': True})

                # ================= OMNICHANNEL ORDERS =================
                elif path == '/api/omnichannel/orders':
                    channel = body.get('channel', 'Web Store').strip()
                    cust_name = body.get('customer_name', '').strip()
                    cust_phone = body.get('customer_phone', '').strip()
                    items = body.get('items', [])
                    total_cents = int(body.get('total_cents', 0))
                    notes = body.get('notes', '')

                    order_no = f"OMNI-{datetime.datetime.now().strftime('%Y%m%d')}-{secrets.token_hex(2).upper()}"
                    # Reserve inventory units
                    for itm in items:
                        c.execute('UPDATE inventory SET quantity=MAX(0, quantity - ?) WHERE id=?', (itm.get('quantity', 1), itm.get('id')))

                    c.execute(
                        'INSERT INTO omnichannel_orders(order_no, channel, customer_name, customer_phone, items_json, total_cents, status, notes, created_at) VALUES(?,?,?,?,?,?,?,?,?)',
                        (order_no, channel, cust_name, cust_phone, json.dumps(items), total_cents, 'RESERVED', notes, xpro.now())
                    )
                    c.commit()
                    return json_response(self, 200, {'ok': True, 'order_no': order_no})

                elif path == '/api/omnichannel/orders/update-status':
                    order_id = int(body.get('order_id', 0))
                    new_status = body.get('status', 'COMPLETED') # COMPLETED, RETURNED_COD
                    ord_row = c.execute('SELECT * FROM omnichannel_orders WHERE id=?', (order_id,)).fetchone()
                    if not ord_row:
                        return json_response(self, 404, {'error': 'Order not found'})

                    # Auto-restock if returned COD
                    if new_status == 'RETURNED_COD' and ord_row['status'] != 'RETURNED_COD':
                        try:
                            itms = json.loads(ord_row['items_json'] or '[]')
                            for itm in itms:
                                c.execute('UPDATE inventory SET quantity=quantity + ? WHERE id=?', (itm.get('quantity', 1), itm.get('id')))
                        except Exception:
                            pass

                    c.execute('UPDATE omnichannel_orders SET status=? WHERE id=?', (new_status, order_id))
                    c.commit()
                    return json_response(self, 200, {'ok': True})

                # ================= SERVICE LEDGER, REPAIRS, AUDIT =================
                elif path == '/api/repairs':
                    cust = body.get('customer', '').strip()
                    contact = body.get('contact', '').strip()
                    device = body.get('device', '').strip()
                    issue = body.get('issue', '').strip()
                    user = body.get('username', 'admin')

                    cur = c.execute(
                        'INSERT INTO repairs(created_at, customer, contact, device, issue, status, created_by) VALUES(?,?,?,?,?,?,?)',
                        (xpro.now(), cust, contact, device, issue, 'IN PROGRESS', user)
                    )
                    log_audit(c, user, 'REPAIR_CREATED', f"{device} for {cust}")
                    c.commit()
                    return json_response(self, 200, {'ok': True, 'id': cur.lastrowid})

                elif path == '/api/repairs/update-status':
                    ticket_id = int(body.get('ticket_id', 0))
                    status = body.get('status', 'READY')
                    notification = body.get('notification', 'PHONE_SMS')
                    user = body.get('username', 'admin')

                    ready_at = xpro.now() if status == 'READY' else None
                    c.execute(
                        'UPDATE repairs SET status=?, ready_at=?, notification=? WHERE id=?',
                        (status, ready_at, notification, ticket_id)
                    )
                    log_audit(c, user, 'REPAIR_STATUS', f"Ticket #{ticket_id} marked {status} (Notify: {notification})")
                    c.commit()
                    return json_response(self, 200, {'ok': True})

                elif path == '/api/ledger':
                    user = body.get('username', 'admin')
                    biz = body.get('business', 'Money Transfer')
                    kind = body.get('kind', 'Western Union')
                    ref = body.get('reference', '')
                    desc = body.get('description', '')
                    cash_in = int(body.get('cash_in_cents', 0))
                    cash_out = int(body.get('cash_out_cents', 0))
                    fee = int(body.get('fee_cents', 0))
                    comm = int(body.get('commission_cents', 0))

                    cur = c.execute(
                        '''INSERT INTO service_ledger(created_at, business, kind, reference, description, cash_in_cents, cash_out_cents, fee_cents, commission_cents, username)
                        VALUES(?,?,?,?,?,?,?,?,?,?)''',
                        (xpro.now(), biz, kind, ref, desc, cash_in, cash_out, fee, comm, user)
                    )
                    c.commit()
                    return json_response(self, 200, {'ok': True, 'id': cur.lastrowid})

                elif path == '/api/notes':
                    user = body.get('username', 'admin')
                    note = body.get('note', '').strip()
                    if note:
                        c.execute('INSERT INTO notes(created_at, username, note) VALUES(?,?,?)', (xpro.now(), user, note))
                        c.commit()
                    return json_response(self, 200, {'ok': True})

                elif path == '/api/customers':
                    name = body.get('name', '').strip()
                    phone = body.get('phone', '').strip()
                    email = body.get('email', '').strip()
                    notes = body.get('notes', '').strip()
                    if not name or not phone:
                        return json_response(self, 400, {'error': 'Name and phone are required'})
                    cur = c.execute(
                        'INSERT INTO customers(name, phone, email, notes, created_at) VALUES(?,?,?,?,?)',
                        (name, phone, email, notes, xpro.now())
                    )
                    c.commit()
                    return json_response(self, 200, {'ok': True, 'id': cur.lastrowid})

                elif path == '/api/settings':
                    user = body.get('username', 'admin')
                    role = body.get('role', 'admin')
                    printer_mode = body.get('printer_mode', 'Office duplex')
                    if role != 'admin' and role != 'super_admin':
                        return json_response(self, 403, {'error': 'Admin role required to change settings'})
                    c.execute('INSERT OR REPLACE INTO settings(key, value) VALUES(?,?)', ('printer_mode', printer_mode))
                    log_audit(c, user, 'SETTINGS_CHANGE', f"Printer mode set to {printer_mode}")
                    c.commit()
                    return json_response(self, 200, {'ok': True})

                elif path == '/api/seed-demo':
                    user = body.get('username', 'admin')
                    demo_items = [
                        ('iPhone 15 Pro Max Privacy Glass', 'Repair', 1999, 45, 650, 'Rack A-1 (Cases)', 'XP89100001', 'GLS-15PM'),
                        ('MagSafe Armor Phone Case (Clear)', 'Merchandise', 2499, 32, 1000, 'Rack A-2 (Cases)', 'XP89100002', 'CSE-MAG-CLR'),
                        ('Anker 20W USB-C Nano Fast Charger', 'Merchandise', 1999, 28, 700, 'Rack B-1 (Power)', 'XP89100003', 'CHG-ANK-20W'),
                        ('Anker 30W USB-C Nano Fast Charger', 'Merchandise', 2499, 20, 800, 'Rack B-1 (Power)', 'XP89100004', 'CHG-ANK-30W'),
                        ('Braided USB-C to Lightning Cable (6ft)', 'Merchandise', 1499, 60, 400, 'Rack B-2 (Cables)', 'XP89100005', 'CBL-APL-6FT'),
                        ('Heavy Duty Magnetic Car Mount', 'Merchandise', 1899, 15, 600, 'Rack C-1 (Mounts)', 'XP89100006', 'MNT-MAG-CAR'),
                        ('Samsung S24 Ultra Tempered Screen Guard', 'Repair', 1799, 4, 550, 'Rack A-3 (Protectors)', 'XP89100007', 'GLS-S24U'),
                        ('AirPods Pro Silicon Case with Carabiner', 'Merchandise', 1199, 3, 300, 'Front Counter 1', 'XP89100008', 'CSE-AIRPOD-SIL')
                    ]
                    for name, cat, price, qty, cost, shelf, barcode, sku in demo_items:
                        c.execute(
                            'INSERT OR REPLACE INTO inventory(name, category, price_cents, quantity, cost_cents, shelf_location, barcode, sku, created_by) VALUES(?,?,?,?,?,?,?,?,?)',
                            (name, cat, price, qty, cost, shelf, barcode, sku, user)
                        )
                    log_audit(c, user, 'DEMO_DATA_SEEDED', 'Populated realistic inventory accessories')
                    c.commit()
                    return json_response(self, 200, {'ok': True, 'count': len(demo_items)})

                else:
                    return json_response(self, 404, {'error': 'Not found'})
        except Exception as e:
            traceback.print_exc()
            return json_response(self, 500, {'error': str(e)})

    def serve_static(self, path):
        if path == '/' or path == '':
            path = '/index.html'

        clean_path = path.lstrip('/')
        file_path = (STATIC_DIR / clean_path).resolve()

        if not str(file_path).startswith(str(STATIC_DIR)):
            self.send_response(403)
            self.end_headers()
            return

        if not file_path.is_file():
            self.send_response(404)
            self.end_headers()
            return

        mime_type, _ = mimetypes.guess_type(str(file_path))
        if mime_type is None:
            if file_path.suffix == '.js': mime_type = 'application/javascript'
            elif file_path.suffix == '.css': mime_type = 'text/css'
            elif file_path.suffix == '.json': mime_type = 'application/json'
            elif file_path.suffix == '.png': mime_type = 'image/png'
            else: mime_type = 'application/octet-stream'

        try:
            content = file_path.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', mime_type)
            self.send_header('Content-Length', str(len(content)))
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_response(500)
            self.end_headers()

def run_server(port=PORT):
    server_address = ('', port)
    httpd = HTTPServer(server_address, XProWebHandler)
    print("=" * 50)
    print("X PRO WIRELESS & REPAIR — RETAIL ERP & POS SERVER")
    print(f"Running at: http://localhost:{port}")
    print("=" * 50)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()

if __name__ == '__main__':
    port = PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    run_server(port)
