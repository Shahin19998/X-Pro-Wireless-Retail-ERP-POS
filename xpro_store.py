import os, sqlite3, hashlib, secrets, json, html, webbrowser, datetime, pathlib, tkinter as tk
from tkinter import ttk, messagebox, simpledialog
from decimal import Decimal, InvalidOperation

ROOT=pathlib.Path(__file__).resolve().parent
DB=ROOT/'xpro_store.db'
ARCH=ROOT/'Receipt Archive'
POLICY_VERSION='V2.3 - 2026-10-11'
POLICIES={
'STORE POLICY': 'Original receipt required for discretionary returns and exchanges. Approved discretionary returns receive store credit only, except where required by law. No cash refunds except where required by law. Store credit may be applied toward eligible future purchases.',
'MERCHANDISE POLICY': 'Merchandise returns must be requested within 5 calendar days of purchase. Unopened items must be unused, undamaged, complete, and in original undamaged packaging. OPENED MERCHANDISE RETURNS REQUIRE ADMIN APPROVAL. Admin approval does not guarantee acceptance. Eligible discretionary returns receive store credit only. Statutory rights for defective goods remain unaffected.',
'REPAIR POLICY': 'Repair estimates and additional charges require customer approval. Pre-existing device damage may affect repair outcomes. Back up device data before service. No voluntary warranty is provided on replacement parts installed in previously damaged or broken devices unless expressly offered in writing. Statutory consumer rights remain unaffected.',
'REPAIR PICKUP POLICY': 'Collect completed repairs within 10 calendar days after notification that the device is ready. The store will record notification details. Overdue items are subject to applicable unclaimed-property rules. The 10-day deadline alone does not authorize the store to take ownership of or sell customer property. Any disposition requires all legally required notices and procedures.',
'FINAL SALE POLICY': 'Activated prepaid cards/services and SIM cards, successfully completed phone unlocking services, and completed repair labor are final sale and ineligible for discretionary returns, exchanges, or store credit, except where required by law. Incomplete services will be reviewed separately.'}
CATEGORIES=['Merchandise','Repair','Prepaid / SIM','Unlocking','Money Transfer','NY LOTTO','Other']

def connect():
 c=sqlite3.connect(DB); c.row_factory=sqlite3.Row; c.execute('PRAGMA foreign_keys=ON'); return c

def setup():
 with connect() as c:
  c.executescript('''CREATE TABLE IF NOT EXISTS users(username TEXT PRIMARY KEY, salt TEXT, password_hash TEXT, hint TEXT, role TEXT, active INTEGER DEFAULT 1);
 CREATE TABLE IF NOT EXISTS inventory(id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT, price_cents INTEGER, quantity INTEGER DEFAULT 0, created_by TEXT);
 CREATE TABLE IF NOT EXISTS sales(id INTEGER PRIMARY KEY, created_at TEXT, username TEXT, category TEXT, description TEXT, amount_cents INTEGER, payment TEXT, policy_version TEXT, customer TEXT, status TEXT DEFAULT 'SOLD');
 CREATE TABLE IF NOT EXISTS returns(id INTEGER PRIMARY KEY, sale_id INTEGER, created_at TEXT, username TEXT, amount_cents INTEGER, opened INTEGER, approved_by TEXT, note TEXT);
 CREATE TABLE IF NOT EXISTS repairs(id INTEGER PRIMARY KEY, created_at TEXT, customer TEXT, contact TEXT, device TEXT, issue TEXT, status TEXT, ready_at TEXT, notification TEXT, created_by TEXT);
 CREATE TABLE IF NOT EXISTS shifts(id INTEGER PRIMARY KEY, username TEXT, opened_at TEXT, opening_cents INTEGER, closed_at TEXT, actual_cents INTEGER, notes TEXT);
 CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY, created_at TEXT, username TEXT, note TEXT);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, created_at TEXT, username TEXT, action TEXT, details TEXT);
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
 CREATE TABLE IF NOT EXISTS receipt_policy_snapshots(sale_id INTEGER PRIMARY KEY, policy_text TEXT NOT NULL, version TEXT NOT NULL, created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS service_ledger(id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, business TEXT NOT NULL, kind TEXT NOT NULL, reference TEXT, description TEXT, cash_in_cents INTEGER NOT NULL DEFAULT 0, cash_out_cents INTEGER NOT NULL DEFAULT 0, fee_cents INTEGER NOT NULL DEFAULT 0, commission_cents INTEGER NOT NULL DEFAULT 0, username TEXT NOT NULL);''')
  c.execute('INSERT OR IGNORE INTO settings VALUES (?,?)',('printer_mode','Office duplex'))

def now(): return datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
def cents(v):
 try:
  d=Decimal(str(v).replace('$','').strip()); assert d>=0
  return int((d*100).quantize(Decimal('1')))
 except (InvalidOperation,ValueError,AssertionError): raise ValueError('Enter a valid non-negative dollar amount.')
def dollars(v): return f'${v/100:,.2f}'
def digest(p,s): return hashlib.pbkdf2_hmac('sha256',p.encode(),bytes.fromhex(s),260000).hex()
def audit(user,action,details=''):
 with connect() as c: c.execute('INSERT INTO audit(created_at,username,action,details) VALUES(?,?,?,?)',(now(),user,action,details))

def safe(s): return html.escape(str(s or ''))

def receipt_file(sale,mode):
 date=datetime.datetime.fromisoformat(sale['created_at'])
 folder=ARCH/str(date.year)/date.strftime('%B')/date.strftime('%d')
 folder.mkdir(parents=True,exist_ok=True)
 back=mode!='Single-sided thermal'
 with connect() as c:
  snapshot=c.execute('SELECT policy_text FROM receipt_policy_snapshots WHERE sale_id=?',(sale['id'],)).fetchone()
 policy_items=json.loads(snapshot['policy_text']) if snapshot else POLICIES
 policy_html=''.join(f'<h3>{safe(k)}</h3><p>{safe(v)}</p>' for k,v in policy_items.items())
 style='''@page{size:auto;margin:13mm}body{font:13px Arial,sans-serif;color:#111;margin:0}.page{max-width:720px;margin:auto}.center{text-align:center}.line{border-top:1px dashed #555;margin:15px 0}.policy{break-before:page;page-break-before:always}h1{font-size:23px}h2{font-size:17px}h3{font-size:13px;margin-bottom:4px}p{margin:5px 0 12px;line-height:1.38}table{width:100%;border-collapse:collapse}td{padding:5px 0}td:last-child{text-align:right}@media print{.noprint{display:none}}'''
 body=f'''<!doctype html><html><head><meta charset="utf-8"><title>X Pro Wireless Receipt {sale['id']}</title><style>{style}</style></head><body><section class="page"><div class="center" style="margin-bottom:8px;"><img src="/logo.png" style="max-height:55px;object-fit:contain;" alt="X Pro Wireless & Repair"></div><h1 class="center" style="margin:2px 0; color:#FF6A00;">X Pro Wireless &amp; Repair</h1><p class="center" style="font-weight:bold; letter-spacing:1px; margin-top:2px;">CUSTOMER RECEIPT</p><div class="line"></div><p>Receipt: XP-{sale['id']:06d}<br>Date: {safe(sale['created_at'])}<br>Customer: {safe(sale['customer'])}<br>Cashier: {safe(sale['username'])}</p><div class="line"></div><table><tr><td>{safe(sale['description'])}<br><small>{safe(sale['category'])}</small></td><td>{dollars(sale['amount_cents'])}</td></tr></table><div class="line"></div><h2 style="color:#FF6A00;">Total: {dollars(sale['amount_cents'])}</h2><p>Payment: {safe(sale['payment'])}</p><p>Thank you for shopping with X Pro Wireless &amp; Repair!</p><p style="font-size:10px">Policy version: {safe(sale['policy_version'])}</p></section>'''
 if back: body+=f'<section class="page policy"><h2 class="center" style="color:#FF6A00;">X Pro Wireless &amp; Repair — STORE &amp; SERVICE POLICIES</h2><p class="center">Policy version {safe(sale['policy_version'])}</p>{policy_html}</section>'
 body+='</body></html>'
 path=folder/f'XP-{sale["id"]:06d}_{mode.lower().replace(" ","_")}.html'
 if not path.exists():path.write_text(body,encoding='utf-8')
 return path

class App:
 def __init__(self,root):
  self.root=root;self.root.title('XPRO STORE — POS Manager');self.root.geometry('1130x760');self.root.minsize(880,620)
  self.user=None;self.role=None;self.shift=None
  self.style=ttk.Style();self.style.theme_use('clam');self.style.configure('Treeview',rowheight=27)
  self.login()
 def clear(self):
  for x in self.root.winfo_children(): x.destroy()
 def login(self):
  self.clear();f=ttk.Frame(self.root,padding=50);f.pack(expand=True)
  ttk.Label(f,text='XPRO STORE',font=('Segoe UI',27,'bold')).grid(row=0,column=0,columnspan=2,pady=15)
  with connect() as c: count=c.execute('SELECT count(*) FROM users').fetchone()[0]
  if not count:
   ttk.Label(f,text='First launch: create administrator account').grid(row=1,column=0,columnspan=2,pady=8)
   self.fields={}
   for i,(key,label,show) in enumerate([('username','Admin username',None),('password','Password','*'),('hint','Password hint',None)]):
    ttk.Label(f,text=label).grid(row=i+2,column=0,sticky='e',padx=10,pady=7)
    e=ttk.Entry(f,width=30,show=show);e.grid(row=i+2,column=1);self.fields[key]=e
   ttk.Button(f,text='Create Administrator',command=self.create_admin).grid(row=5,column=0,columnspan=2,pady=20)
  else:
   ttk.Label(f,text='Username').grid(row=1,column=0,pady=8);self.login_name=ttk.Entry(f,width=30);self.login_name.grid(row=1,column=1)
   ttk.Label(f,text='Password').grid(row=2,column=0,pady=8);self.login_pass=ttk.Entry(f,width=30,show='*');self.login_pass.grid(row=2,column=1)
   ttk.Button(f,text='Sign In',command=self.sign_in).grid(row=3,column=0,columnspan=2,pady=18)
   ttk.Button(f,text='Show Password Hint',command=self.show_hint).grid(row=4,column=0,columnspan=2)
 def create_admin(self):
  u=self.fields['username'].get().strip();p=self.fields['password'].get();h=self.fields['hint'].get().strip()
  if not u or len(p)<8: return messagebox.showerror('Validation','Username required; password must be at least 8 characters.')
  s=secrets.token_hex(16)
  with connect() as c:c.execute('INSERT INTO users(username,salt,password_hash,hint,role) VALUES(?,?,?,?,?)',(u,s,digest(p,s),h,'admin'))
  self.login()
 def show_hint(self):
  with connect() as c:r=c.execute('SELECT hint FROM users WHERE username=?',(self.login_name.get().strip(),)).fetchone()
  messagebox.showinfo('Password Hint',r['hint'] if r else 'No matching user.')
 def sign_in(self):
  u=self.login_name.get().strip();p=self.login_pass.get()
  with connect() as c:r=c.execute('SELECT * FROM users WHERE username=? AND active=1',(u,)).fetchone()
  if not r or not secrets.compare_digest(digest(p,r['salt']),r['password_hash']):return messagebox.showerror('Login','Incorrect username or password.')
  self.user=u;self.role=r['role'];audit(u,'LOGIN')
  self.open_shift()
 def open_shift(self):
  val=simpledialog.askstring('Opening Cash Change','Enter cash left for change ($0 to $100):',parent=self.root)
  if val is None:return self.login()
  try:
   amount=cents(val)
   if amount>10000:raise ValueError('Opening change must be between $0 and $100.')
  except ValueError as e:return messagebox.showerror('Invalid opening change',str(e)) or self.open_shift()
  with connect() as c:
   cur=c.execute('INSERT INTO shifts(username,opened_at,opening_cents) VALUES(?,?,?)',(self.user,now(),amount));self.shift=cur.lastrowid
  audit(self.user,'OPEN_SHIFT',dollars(amount));self.dashboard()
 def dashboard(self):
  self.clear();top=ttk.Frame(self.root,padding=12);top.pack(fill='x')
  ttk.Label(top,text='XPRO STORE',font=('Segoe UI',22,'bold')).pack(side='left')
  ttk.Label(top,text=f'  Signed in: {self.user} ({self.role})',font=('Segoe UI',10)).pack(side='left',padx=18)
  ttk.Button(top,text='Close Shift / Log Out',command=self.close_shift).pack(side='right')
  self.tabs=ttk.Notebook(self.root);self.tabs.pack(fill='both',expand=True,padx=12,pady=8)
  self.sales_tab();self.inventory_tab();self.repairs_tab();self.ledger_tab();self.notes_tab();self.history_tab()
  if self.role=='admin':self.admin_tab()
 def tab(self,name):
  f=ttk.Frame(self.tabs,padding=12);self.tabs.add(f,text=name);return f
 def form(self,parent,labels):
  entries={}
  for i,label in enumerate(labels):
   ttk.Label(parent,text=label).grid(row=i,column=0,sticky='w',pady=5)
   e=ttk.Entry(parent,width=42);e.grid(row=i,column=1,sticky='w',pady=5,padx=10);entries[label]=e
  return entries
 def sales_tab(self):
  f=self.tab('Checkout');box=ttk.LabelFrame(f,text='New transaction',padding=15);box.pack(anchor='nw',fill='x')
  self.sale_entries=self.form(box,['Description','Amount ($)','Customer (optional)'])
  ttk.Label(box,text='Category').grid(row=3,column=0,sticky='w');self.sale_cat=ttk.Combobox(box,values=CATEGORIES,state='readonly',width=39);self.sale_cat.set('Merchandise');self.sale_cat.grid(row=3,column=1,pady=5)
  ttk.Label(box,text='Payment').grid(row=4,column=0,sticky='w');self.sale_pay=ttk.Combobox(box,values=['Cash','Card','Other'],state='readonly',width=39);self.sale_pay.set('Cash');self.sale_pay.grid(row=4,column=1,pady=5)
  ttk.Button(box,text='Save Sale & Print Receipt',command=self.save_sale).grid(row=5,column=1,pady=15,sticky='w')
  ttk.Label(f,text='Cash sales: connected cash drawer commands are not enabled in this release. A register-open notice is displayed when a cash receipt is created.',foreground='#555').pack(anchor='w',pady=15)
 def printer_mode(self):
  with connect() as c:return c.execute("SELECT value FROM settings WHERE key='printer_mode'").fetchone()[0]
 def save_sale(self):
  e=self.sale_entries;desc=e['Description'].get().strip()
  try:amt=cents(e['Amount ($)'].get())
  except ValueError as ex:return messagebox.showerror('Invalid amount',str(ex))
  if not desc:return messagebox.showerror('Missing description','Enter a description.')
  with connect() as c:
   cur=c.execute('INSERT INTO sales(created_at,username,category,description,amount_cents,payment,policy_version,customer) VALUES(?,?,?,?,?,?,?,?)',(now(),self.user,self.sale_cat.get(),desc,amt,self.sale_pay.get(),POLICY_VERSION,e['Customer (optional)'].get().strip()));id=cur.lastrowid
   c.execute('INSERT INTO receipt_policy_snapshots(sale_id,policy_text,version,created_at) VALUES(?,?,?,?)',(id,json.dumps(POLICIES),POLICY_VERSION,now()))
   sale=dict(c.execute('SELECT * FROM sales WHERE id=?',(id,)).fetchone())
  audit(self.user,'SALE',f'XP-{id:06d} {dollars(amt)}');path=receipt_file(sale,self.printer_mode());webbrowser.open(path.as_uri())
  if self.sale_pay.get()=='Cash':messagebox.showinfo('Register Open','Cash sale saved. Register Open.\nHardware cash drawer command not configured.')
  else:messagebox.showinfo('Receipt ready',f'Receipt saved and opened in browser:\n{path}\nUse browser Print to select printer.')
  for v in e.values():v.delete(0,'end')
  self.refresh_history()
 def inventory_tab(self):
  f=self.tab('Inventory');b=ttk.LabelFrame(f,text='Add product / receive stock',padding=10);b.pack(fill='x')
  self.inv_e=self.form(b,['Product name','Price ($)','Quantity to add'])
  ttk.Button(b,text='Add / Receive Stock',command=self.add_stock).grid(row=3,column=1,sticky='w',pady=8)
  self.inv_tree=ttk.Treeview(f,columns=('id','name','price','qty'),show='headings',height=11)
  for k,t in [('id','ID'),('name','Product'),('price','Price'),('qty','In stock')]:self.inv_tree.heading(k,text=t)
  self.inv_tree.pack(fill='both',expand=True,pady=10);self.refresh_inventory()
 def add_stock(self):
  e=self.inv_e;name=e['Product name'].get().strip()
  try:price=cents(e['Price ($)'].get());qty=int(e['Quantity to add'].get());assert qty>=0
  except (ValueError,AssertionError):return messagebox.showerror('Invalid input','Enter a valid price and nonnegative whole quantity.')
  if not name:return
  with connect() as c:
   r=c.execute('SELECT id FROM inventory WHERE name=?',(name,)).fetchone()
   if r:c.execute('UPDATE inventory SET quantity=quantity+?,price_cents=? WHERE id=?',(qty,price,r['id']))
   else:c.execute('INSERT INTO inventory(name,category,price_cents,quantity,created_by) VALUES(?,?,?,?,?)',(name,'Merchandise',price,qty,self.user))
  audit(self.user,'RECEIVE_STOCK',f'{name}: +{qty}');self.refresh_inventory()
 def refresh_inventory(self):
  for i in self.inv_tree.get_children():self.inv_tree.delete(i)
  with connect() as c:
   for r in c.execute('SELECT * FROM inventory ORDER BY name'):self.inv_tree.insert('', 'end',values=(r['id'],r['name'],dollars(r['price_cents']),r['quantity']))
 def repairs_tab(self):
  f=self.tab('Repairs');b=ttk.LabelFrame(f,text='New repair ticket',padding=10);b.pack(fill='x');self.rep_e=self.form(b,['Customer','Contact','Device','Issue'])
  ttk.Button(b,text='Create Ticket',command=self.add_repair).grid(row=4,column=1,sticky='w',pady=8)
  ttk.Button(f,text='Mark Selected Ready & Notified',command=self.ready_repair).pack(anchor='w',pady=7)
  self.rep_tree=ttk.Treeview(f,columns=('id','customer','device','status','ready'),show='headings',height=10)
  for k,t in [('id','Ticket'),('customer','Customer'),('device','Device'),('status','Status'),('ready','Ready notification')]:self.rep_tree.heading(k,text=t)
  self.rep_tree.pack(fill='both',expand=True);self.refresh_repairs()
 def add_repair(self):
  e=self.rep_e
  with connect() as c:c.execute('INSERT INTO repairs(created_at,customer,contact,device,issue,status,created_by) VALUES(?,?,?,?,?,?,?)',(now(),*[e[k].get() for k in ['Customer','Contact','Device','Issue']],'IN PROGRESS',self.user))
  audit(self.user,'REPAIR_CREATED');self.refresh_repairs()
 def ready_repair(self):
  s=self.rep_tree.selection()
  if not s:return
  id=int(self.rep_tree.item(s[0])['values'][0]);method=simpledialog.askstring('Notification','How was the customer notified? (e.g. phone/text):',parent=self.root)
  if not method:return
  with connect() as c:c.execute('UPDATE repairs SET status=?,ready_at=?,notification=? WHERE id=?',('READY',now(),method,id))
  audit(self.user,'REPAIR_READY',f'Ticket {id}; {method}');self.refresh_repairs()
 def refresh_repairs(self):
  for i in self.rep_tree.get_children():self.rep_tree.delete(i)
  with connect() as c:
   for r in c.execute('SELECT * FROM repairs ORDER BY id DESC'):
    status=r['status']
    if status=='READY' and r['ready_at'] and (datetime.datetime.now()-datetime.datetime.fromisoformat(r['ready_at'])).days>=10:status='OVERDUE (review only)'
    self.rep_tree.insert('','end',values=(r['id'],r['customer'],r['device'],status,r['ready_at'] or ''))
 def ledger_tab(self):
  f=self.tab('Money Transfer & NY LOTTO')
  ttk.Label(f,text='Internal records only — use authorized provider terminals for actual transactions.',foreground='#555').pack(anchor='w',pady=5)
  b=ttk.LabelFrame(f,text='Record business activity (cash movement is separate from fees and commissions)',padding=10);b.pack(fill='x')
  self.ledger_e=self.form(b,['Provider reference','Description','Cash received ($)','Cash paid out ($)','Customer fee ($)','Earned commission ($)'])
  ttk.Label(b,text='Business').grid(row=6,column=0,sticky='w');self.ledger_business=ttk.Combobox(b,values=['Money Transfer','NY LOTTO'],state='readonly',width=39);self.ledger_business.set('Money Transfer');self.ledger_business.grid(row=6,column=1,pady=5)
  ttk.Label(b,text='Activity').grid(row=7,column=0,sticky='w');self.ledger_kind=ttk.Combobox(b,values=['Customer transaction','Settlement','Adjustment'],state='readonly',width=39);self.ledger_kind.set('Customer transaction');self.ledger_kind.grid(row=7,column=1,pady=5)
  ttk.Button(b,text='Record Activity',command=self.save_ledger).grid(row=8,column=1,sticky='w',pady=8)
  self.ledger_tree=ttk.Treeview(f,columns=('id','time','business','kind','reference','in','out','fee','commission'),show='headings',height=9)
  for k,t in [('id','ID'),('time','Date'),('business','Business'),('kind','Activity'),('reference','Reference'),('in','Cash In'),('out','Cash Out'),('fee','Fee'),('commission','Commission')]:self.ledger_tree.heading(k,text=t);self.ledger_tree.column(k,width=110)
  self.ledger_tree.pack(fill='both',expand=True,pady=8);self.refresh_ledger()
 def save_ledger(self):
  e=self.ledger_e
  try: amounts=[cents(e[k].get().strip() or '0') for k in ['Cash received ($)','Cash paid out ($)','Customer fee ($)','Earned commission ($)']]
  except ValueError as ex:return messagebox.showerror('Invalid amount',str(ex))
  if not any(amounts):return messagebox.showerror('Missing amount','Enter at least one nonzero amount.')
  if not messagebox.askyesno('Confirm activity',f'Record {self.ledger_business.get()} activity?\nCash in: {dollars(amounts[0])}; cash out: {dollars(amounts[1])}'):return
  with connect() as c:c.execute('INSERT INTO service_ledger(created_at,business,kind,reference,description,cash_in_cents,cash_out_cents,fee_cents,commission_cents,username) VALUES(?,?,?,?,?,?,?,?,?,?)',(now(),self.ledger_business.get(),self.ledger_kind.get(),e['Provider reference'].get().strip(),e['Description'].get().strip(),*amounts,self.user))
  audit(self.user,'SERVICE_LEDGER',self.ledger_business.get());self.refresh_ledger()
  for x in e.values():x.delete(0,'end')
 def refresh_ledger(self):
  for i in self.ledger_tree.get_children():self.ledger_tree.delete(i)
  with connect() as c:
   for r in c.execute('SELECT * FROM service_ledger ORDER BY id DESC LIMIT 300'):
    self.ledger_tree.insert('','end',values=(r['id'],r['created_at'],r['business'],r['kind'],r['reference'],dollars(r['cash_in_cents']),dollars(r['cash_out_cents']),dollars(r['fee_cents']),dollars(r['commission_cents'])))
 def notes_tab(self):
  f=self.tab('Employee Notes');ttk.Label(f,text='Shift incident notes / handoff comments').pack(anchor='w');self.note_text=tk.Text(f,height=9);self.note_text.pack(fill='x',pady=8)
  ttk.Button(f,text='Save Note',command=self.save_note).pack(anchor='w')
  self.note_tree=ttk.Treeview(f,columns=('time','user','note'),show='headings');
  for k in ('time','user','note'):self.note_tree.heading(k,text=k.title())
  self.note_tree.pack(fill='both',expand=True,pady=8);self.refresh_notes()
 def save_note(self):
  s=self.note_text.get('1.0','end').strip()
  if not s:return
  with connect() as c:c.execute('INSERT INTO notes(created_at,username,note) VALUES(?,?,?)',(now(),self.user,s))
  self.note_text.delete('1.0','end');self.refresh_notes()
 def refresh_notes(self):
  for i in self.note_tree.get_children():self.note_tree.delete(i)
  with connect() as c:
   for r in c.execute('SELECT * FROM notes ORDER BY id DESC LIMIT 100'):self.note_tree.insert('','end',values=(r['created_at'],r['username'],r['note']))
 def history_tab(self):
  f=self.tab('Sales & Returns');self.hist_tree=ttk.Treeview(f,columns=('id','date','cat','description','amount','payment','status'),show='headings')
  for k in ('id','date','cat','description','amount','payment','status'):self.hist_tree.heading(k,text=k.title())
  self.hist_tree.pack(fill='both',expand=True)
  bar=ttk.Frame(f);bar.pack(fill='x',pady=10)
  ttk.Button(bar,text='Reprint Selected',command=self.reprint).pack(side='left',padx=4)
  ttk.Button(bar,text='Return Selected (Store Credit)',command=self.return_sale).pack(side='left',padx=4)
  ttk.Button(bar,text='Refresh',command=self.refresh_history).pack(side='left',padx=4)
  self.refresh_history()
 def selected_sale(self):
  s=self.hist_tree.selection()
  if not s:return None
  id=int(self.hist_tree.item(s[0])['values'][0])
  with connect() as c:r=c.execute('SELECT * FROM sales WHERE id=?',(id,)).fetchone();return dict(r) if r else None
 def refresh_history(self):
  if not hasattr(self,'hist_tree'):return
  for i in self.hist_tree.get_children():self.hist_tree.delete(i)
  with connect() as c:
   for r in c.execute('SELECT * FROM sales ORDER BY id DESC LIMIT 300'):self.hist_tree.insert('','end',values=(r['id'],r['created_at'],r['category'],r['description'],dollars(r['amount_cents']),r['payment'],r['status']))
 def reprint(self):
  r=self.selected_sale()
  if r:webbrowser.open(receipt_file(r,self.printer_mode()).as_uri());audit(self.user,'REPRINT',str(r['id']))
 def return_sale(self):
  r=self.selected_sale()
  if not r:return
  if r['status']!='SOLD':return messagebox.showerror('Already returned','This transaction is already returned.')
  if r['category'] in ('Prepaid / SIM','Unlocking') or r['category']=='Repair':
   if self.role!='admin':return messagebox.showerror('Restricted','Final-sale category: administrator review required.')
  opened=messagebox.askyesno('Package condition','Has the merchandise package been opened?')
  if opened and self.role!='admin':return messagebox.showerror('Admin required','Opened merchandise returns require an administrator to log in and approve.')
  age=(datetime.datetime.now()-datetime.datetime.fromisoformat(r['created_at'])).days
  if age>=5 and self.role!='admin':return messagebox.showerror('Return window','Outside 5-day discretionary return window. Administrator review required.')
  if r['category']!='Merchandise' and self.role!='admin':return messagebox.showerror('Admin review','Non-merchandise returns require administrator review.')
  if not messagebox.askyesno('Confirm Store Credit',f'Issue {dollars(r["amount_cents"])} store credit for receipt XP-{r["id"]:06d}?'):return
  with connect() as c:
   c.execute('INSERT INTO returns(sale_id,created_at,username,amount_cents,opened,approved_by,note) VALUES(?,?,?,?,?,?,?)',(r['id'],now(),self.user,r['amount_cents'],int(opened),self.user if self.role=='admin' else '', 'Store credit issued; no cash refund'))
   c.execute("UPDATE sales SET status='RETURNED - STORE CREDIT' WHERE id=?",(r['id'],))
  audit(self.user,'STORE_CREDIT_RETURN',f'{r["id"]} {dollars(r["amount_cents"])} opened={opened}');self.refresh_history()
 def admin_tab(self):
  f=self.tab('Admin Settings');b=ttk.LabelFrame(f,text='Receipt printer configuration',padding=15);b.pack(fill='x')
  ttk.Label(b,text='Print mode').pack(anchor='w');self.mode=ttk.Combobox(b,state='readonly',values=['Office duplex','Duplex thermal','Single-sided thermal'],width=28);self.mode.set(self.printer_mode());self.mode.pack(anchor='w',pady=5)
  ttk.Button(b,text='Save Printer Mode',command=self.save_mode).pack(anchor='w')
  ttk.Label(b,text='Office duplex and duplex thermal: front transaction, back policies. Single-sided thermal: front only. Set duplex in printer/browser dialog.',wraplength=700).pack(anchor='w',pady=8)
  u=ttk.LabelFrame(f,text='Create employee / reset password',padding=15);u.pack(fill='x',pady=12)
  self.admin_e=self.form(u,['Username','New password (8+ chars)','Hint'])
  ttk.Button(u,text='Create / Reset Employee',command=self.save_employee).grid(row=3,column=1,sticky='w',pady=8)
  p=ttk.LabelFrame(f,text='Approved policy text — read-only in this release',padding=12);p.pack(fill='both',expand=True)
  t=tk.Text(p,wrap='word',height=14);t.pack(fill='both',expand=True)
  t.insert('end','Policy '+POLICY_VERSION+'\n\n'+'\n\n'.join(k+'\n'+v for k,v in POLICIES.items()));t.config(state='disabled')
 def save_mode(self):
  with connect() as c:c.execute("UPDATE settings SET value=? WHERE key='printer_mode'",(self.mode.get(),))
  audit(self.user,'PRINTER_MODE',self.mode.get());messagebox.showinfo('Saved','Printer mode saved.')
 def save_employee(self):
  e=self.admin_e;u=e['Username'].get().strip();p=e['New password (8+ chars)'].get();hint=e['Hint'].get()
  if not u or len(p)<8:return messagebox.showerror('Validation','Username required and password at least 8 characters.')
  with connect() as c:
   existing=c.execute('SELECT role FROM users WHERE username=?',(u,)).fetchone()
   if existing and existing['role']=='admin':return messagebox.showerror('Restricted','This tool cannot reset administrator accounts.')
   s=secrets.token_hex(16)
   c.execute('INSERT INTO users(username,salt,password_hash,hint,role) VALUES(?,?,?,?,?) ON CONFLICT(username) DO UPDATE SET salt=excluded.salt,password_hash=excluded.password_hash,hint=excluded.hint',(u,s,digest(p,s),hint,'employee'))
  audit(self.user,'EMPLOYEE_PASSWORD_SET',u);messagebox.showinfo('Saved','Employee account saved.')
 def close_shift(self):
  with connect() as c:
   shift=c.execute('SELECT * FROM shifts WHERE id=?',(self.shift,)).fetchone()
   sales=c.execute("SELECT COALESCE(SUM(amount_cents),0) FROM sales WHERE username=? AND created_at>=? AND payment='Cash' AND status='SOLD'",(self.user,shift['opened_at'])).fetchone()[0]
   flow=c.execute('SELECT COALESCE(SUM(cash_in_cents),0),COALESCE(SUM(cash_out_cents),0) FROM service_ledger WHERE username=? AND created_at>=?',(self.user,shift['opened_at'])).fetchone()
  expected=shift['opening_cents']+sales+flow[0]-flow[1]
  entered=simpledialog.askstring('Close Shift',f'Opening change: {dollars(shift["opening_cents"])}\nCash sales: {dollars(sales)}\nService cash received: {dollars(flow[0])}\nService cash paid out: {dollars(flow[1])}\nExpected before cash drops: {dollars(expected)}\n\nEnter actual cash counted ($):',parent=self.root)
  if entered is None:return
  try:actual=cents(entered)
  except ValueError as ex:return messagebox.showerror('Invalid cash count',str(ex))
  notes=simpledialog.askstring('Shift Notes','Closing comments / discrepancies (optional):',parent=self.root) or ''
  with connect() as c:c.execute('UPDATE shifts SET closed_at=?,actual_cents=?,notes=? WHERE id=?',(now(),actual,notes,self.shift))
  audit(self.user,'CLOSE_SHIFT',f'Expected {dollars(expected)}, actual {dollars(actual)}, difference {dollars(actual-expected)}')
  messagebox.showinfo('Shift Closed',f'Cash counted: {dollars(actual)}\nExpected before cash drops: {dollars(expected)}\nDifference: {dollars(actual-expected)}\n\nSet aside your opening change amount for the next shift: {dollars(shift["opening_cents"])}')
  self.user=None;self.login()

if __name__=='__main__':
 setup();root=tk.Tk();App(root);root.mainloop()
