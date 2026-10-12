# 📖 ENTERPRISE RETAIL ERP & OFFLINE-FIRST POS SYSTEM
## Complete Software Documentation & Operational Manual (Bilingual: English & বাংলা)
### Project: X Pro Wireless & Retail Management System (Inspired by iBOS Retail ERP)

---

# 📑 TABLE OF CONTENTS / সূচিপত্র

1. [Executive Overview & Business Mission / নির্বাহী সারসংক্ষেপ ও উদ্দেশ্য](#1-executive-overview--business-mission)
2. [System Architecture & Technology Stack / সিস্টেম আর্কিটেকচার ও টেকনোলজি স্ট্যাক](#2-system-architecture--technology-stack)
3. [Module 1: 4-Tier RBAC & Governance / ৪-স্তরের ভূমিকা ও নিরাপত্তা ম্যাট্রিক্স](#3-module-1-4-tier-rbac--governance)
4. [Module 2: Executive Dashboard & Financial Liquidity / এক্সিকিউটিভ ড্যাশবোর্ড ও লিকুইডিটি](#4-module-2-executive-dashboard--financial-liquidity)
5. [Module 3: Procurement & Vendor Management / প্রকিউরমেন্ট ও সরবরাহকারী ব্যবস্থাপনা](#5-module-3-procurement--vendor-management)
6. [Module 4: Inventory Runway, Stock Audits & Bundling / ইনভেন্টরি রানওয়ে, অডিট ও কম্বো](#6-module-4-inventory-runway-stock-audits--bundling)
7. [Module 5: Automated Double-Entry Accounting Engine / ডাবল-এন্ট্রি অ্যাকাউন্টিং ইঞ্জিন](#7-module-5-automated-double-entry-accounting-engine)
8. [Module 6: Fast-Billing Offline-First POS / দ্রুতগতির অফলাইন-ফার্স্ট পিওএস](#8-module-6-fast-billing-offline-first-pos)
9. [Module 7: Customer CRM & Loyalty Engine / কাস্টমার সিআরএম ও লয়্যালটি](#9-module-7-customer-crm--loyalty-engine)
10. [Module 8: Omnichannel Stock Synchronization / ওমনিচ্যানেল স্টক সিঙ্ক](#10-module-8-omnichannel-stock-synchronization)
11. [Keyboard-First Hotkeys Guide / কীবোর্ড শর্টকাট গাইড](#11-keyboard-first-hotkeys-guide)
12. [Complete REST API Reference / পূর্ণাঙ্গ এপিআই রেফারেন্স](#12-complete-rest-api-reference)
13. [Database Schema Specification / ডাটাবেস স্কিমা স্পেসিফিকেশন](#13-database-schema-specification)
14. [Deployment & Operations Guide / ডিপ্লয়মেন্ট ও অপারেশন গাইড](#14-deployment--operations-guide)

---

# 1. EXECUTIVE OVERVIEW & BUSINESS MISSION
### নির্বাহী সারসংক্ষেপ ও ব্যবসায়িক উদ্দেশ্য

#### English:
This enterprise Retail ERP and Offline-First POS application is engineered to eliminate operational chaos in high-volume retail environments (e.g., supershops, mobile & electronics retailers, repair centers). Inspired by the **"Decoding iBOS Retail ERP"** enterprise architecture, the system operates on a coordinated **Two-Brain Architecture**:
1. **The Deep-Thinking ERP Backend**: Operates centrally in the cloud/server to automate procurement, real-time Weighted Average Cost (WAC) calculations, automated double-entry accounting journals, stock coverage runway predictions, and multi-channel stock sync.
2. **The Fast-Acting POS Frontend**: Built for maximum counter speed with keyboard-first navigation, sub-100ms barcode scanning, multi-cart hold & swap (cart parking), split tender payments, and resilient **offline-first local caching** via browser-native IndexedDB.

#### বাংলা:
এই এন্টারপ্রাইজ রিটেইল ইআরপি (ERP) এবং অফলাইন-ফার্স্ট পিওএস (POS) সফটওয়্যারটি রিটেইল ব্যবসা ও সুপার-শপের সামগ্রিক বিশৃঙ্খলা দূর করার জন্য তৈরি করা হয়েছে। **"Decoding iBOS Retail ERP"**-এর ব্যবসায়িক দর্শনের আলোকে এটি একটি **দ্বৈত-ইঞ্জিন (Two-Brain)** আর্কিটেকচারে কাজ করে:
1. **ডিপ-থিঙ্কিং ব্যাকএন্ড ইআরপি (ERP Backend)**: স্বয়ংক্রিয় প্রকিউরমেন্ট, ওয়েটেড এভারেজ কস্ট (WAC) রিক্যালকুলেশন, জিরো-ম্যানুয়াল ডাবল-এন্ট্রি অ্যাকাউন্টিং, স্টক রানওয়ে প্রিডিকশন এবং ওমনিচ্যানেল স্টক নিয়ন্ত্রণ করে।
2. **ফাস্ট-অ্যাক্টিং ফ্রন্টএন্ড পিওএস (POS Frontend)**: কাউন্টারে আলোর গতিতে বিল করার জন্য কীবোর্ড-ফার্স্ট অপশন, বারকোড স্ক্যানার, মাল্টি-কার্ট হোল্ড অ্যান্ড সুইচ (ট্যাব পার্কিং), স্প্লিট পেমেন্ট (ক্যাশ, কার্ড, বিকাশ/নগদ) এবং **ইন্টারনেট সংযোগ বিচ্ছিন্ন হলেও লোকাল ব্রাউজারে লেনদেন সচল রাখার (IndexedDB)** সুবিধা প্রদান করে।

---

# 2. SYSTEM ARCHITECTURE & TECHNOLOGY STACK
### সিস্টেম আর্কিটেকচার ও টেকনোলজি স্ট্যাক

```
+---------------------------------------------------------------------------------+
|                                 CLIENT TIER                                     |
|  +---------------------------+  +----------------------+  +------------------+  |
|  |     Fast Checkout POS     |  |    Executive ERP     |  |   IndexedDB V1   |  |
|  |  (Keyboard, Gun, Split)   |  | (Trial Bal, P&L, PO) |  |  (Offline Queue) |  |
|  +---------------------------+  +----------------------+  +------------------+  |
+----------------------------------------|----------------------------------------+
                                         | HTTP / JSON REST APIs
+----------------------------------------v----------------------------------------+
|                                APPLICATION TIER                                 |
|  +---------------------------------------------------------------------------+  |
|  |                Python 3 Multi-Threaded HTTP Server Daemon                 |  |
|  |  - Automated Journal Posting Engine      - PO State Machine & WAC Calc     |  |
|  |  - Coverage Days Run-Rate Analyzer      - Defensive Bundle Pricing Guard  |  |
|  |  - 4-Tier RBAC Permission Enforcement   - Omnichannel Stock Reservation   |  |
|  +---------------------------------------------------------------------------+  |
+----------------------------------------|----------------------------------------+
                                         | SQLite WAL Transactions (ACID)
+----------------------------------------v----------------------------------------+
|                                  DATA TIER                                      |
|  +---------------------------------------------------------------------------+  |
|  |                  xpro_store.db (SQLite in WAL Mode)                       |  |
|  |  17-Account Chart of Accounts | Suppliers | POs | GRNs | Combos | Audits  |  |
+---------------------------------------------------------------------------------+
```

- **Backend Runtime**: Python 3 standard library (`http.server`, `urllib`, `sqlite3`, `hashlib`, `json`). Zero heavy external dependencies, sub-millisecond execution latency.
- **Database Architecture**: SQLite with Write-Ahead Logging (`PRAGMA journal_mode=WAL`), foreign keys enabled (`PRAGMA foreign_keys=ON`), and atomic transactions (`BEGIN IMMEDIATE`).
- **Styling & Aesthetics**: Vanilla CSS with custom design system: Obsidian Black (`#07090E`), Electric Amber (`#FF6A00`), Emerald Accent (`#00E676`), and Pure White (`#FFFFFF`).
- **Offline Storage**: Native HTML5 IndexedDB (`xpro_retail_offline_v1`) supporting asynchronous transaction caching and background sync without external libraries.

---

# 3. MODULE 1: 4-TIER RBAC & GOVERNANCE
### ৪-স্তরের ভূমিকা ও নিরাপত্তা ম্যাট্রিক্স

সিস্টেমে ৪টি সুনির্দিষ্ট পারমিশন গ্রুপ রয়েছে (ভিডিওর স্লাইড ১৮ অনুসারে):

```
👑 Master Login (Owner)
         │
         ▼
📋 Manager (Approvals)
         │
         ▼
🦺 Floor In-Charge (Receiving)
         │
         ▼
💳 Cashier / POS Exec (Billing)
```

| Permission Feature / ক্ষমতা | 👑 Master (Owner) | 📋 Manager | 🦺 Floor In-Charge | 💳 Cashier |
| :--- | :---: | :---: | :---: | :---: |
| POS Fast Billing & Receipts | ✅ | ✅ | ❌ | ✅ |
| Product Barcode Lookup & Print | ✅ | ✅ | ✅ | ✅ |
| Inventory Stock Adjustment (Theft) | ✅ | ✅ (Approval) | ❌ | ❌ |
| Create Purchase Order (PO) | ✅ | ✅ | ✅ (Draft) | ❌ |
| Approve Purchase Order | ✅ | ✅ | ❌ | ❌ |
| Receive Goods & GRN Trigger | ✅ | ✅ | ✅ | ❌ |
| View Cost of Goods & Profit Margins | ✅ | ✅ | ❌ | ❌ |
| Double-Entry Trial Balance & P&L | ✅ | ✅ | ❌ | ❌ |
| Shift Float Open / Close | ✅ | ✅ | ❌ | ✅ |
| Store Policies & System Audit Logs | ✅ | ❌ | ❌ | ❌ |

---

# 4. MODULE 2: EXECUTIVE DASHBOARD & FINANCIAL LIQUIDITY
### এক্সিকিউটিভ ড্যাশবোর্ড ও নগদ প্রবাহ

#### English:
Designed for business owners to get a live pulse of the entire business without opening spreadsheets:
- **Liquid Working Capital**: Real-time aggregation of Drawer Cash (`1010`), Bank Accounts (`1020`), and Mobile Money (`1030`).
- **Asset Valuation**: Live sum of sellable inventory at Weighted Average Cost (`1200`).
- **Outstanding Claims**: Real-time Accounts Receivable (Customer dues) and Accounts Payable (Supplier unpaid invoices).
- **12-Month Trailing Comparison**: Historical monthly view comparing Vendor Purchases (GRN), Gross Sales Revenue, Operating Expenses, Net Operating Profit, and Margin percentages.
- **Store Performance**: Average Basket Size (units/order), Average Ticket Value ($), and Store Footfall.

#### বাংলা:
মালিকের জন্য একটি পূর্ণাঙ্গ রিয়েল-টাইম কন্ট্রোল প্যানেল:
- **লিকুইডিটি ও নগদ তহবিল**: ড্রয়ার ক্যাশ (`1010`), ব্যাংক একাউন্ট (`1020`), এবং বিকাশ/নগদ ওয়ালেট (`1030`) থেকে তাৎক্ষণিক ব্যালেন্স।
- **ইনভেন্টরি অ্যাসেট মূল্যায়ন**: গুদামে থাকা সমস্ত পণ্যের বর্তমান মোট কেনা মূল্যের যোগফল (`1200`)।
- **পাওনা ও দেনা (AR & AP)**: কাস্টমারদের কাছে বকেয়া পাওনা (AR) এবং সরবরাহকারীদের কাছে মোট দেনা (AP)।
- **১২ মাসের তুলনামূলক পর্যালোচনা**: গত ১২ মাসের প্রতি মাসের মোট ক্রয়, মোট বিক্রি, খরচ, নিট লাভ এবং লাভের শতকরা হার (Margin %)।

---

# 5. MODULE 3: PROCUREMENT & VENDOR MANAGEMENT
### প্রকিউরমেন্ট ও সরবরাহকারী ব্যবস্থাপনা

#### 1. Digital Purchase Order (PO) State Machine
```
[DRAFT] ────(Submit)────► [PENDING_APPROVAL] ────(Approve)────► [APPROVED] ────(Receive)────► [RECEIVED (GRN)]
   │                             │                           │
   └───────────(Cancel)──────────┴───────────(Cancel)────────┴───────────────────────────► [CANCELLED]
```

#### 2. The Atomic Goods Receipt Trigger ("Receive" বাটন ক্লিক করার প্রক্রিয়া):
যখন গুদাম বা স্টোরের রিসিভিং স্টাফ মাল ডেলিভারি পেয়ে **"Receive Goods"** বাটনে ক্লিক করে, ব্যাকএন্ডে একটি অ্যাটমিক ডাটাবেস ট্রানজ্যাকশনে ৪টি কাজ সম্পন্ন হয়:
1. **Stock Increment**: টার্গেট পণ্যের ফিজিক্যাল স্টক ইনভেন্টরিতে তৎক্ষণাৎ যোগ হয়।
2. **Weighted Average Cost (WAC) Recalculation**:
   $$\text{New Cost} = \frac{(\text{Current Stock} \times \text{Current Cost}) + (\text{Received Qty} \times \text{PO Unit Cost})}{\text{Current Stock} + \text{Received Qty}}$$
3. **Accounts Payable (AP) Ledger Credit**: সরবরাহকারীর লেজারে মোট বিলের সমপরিমাণ টাকা ক্রেডিট (দেনা) হিসেবে জমা হয়।
4. **Automated Journal Posting**: জিরো-ম্যানুয়াল জার্নাল পোস্টিং সম্পন্ন হয়:
   - **Debit**: `1200 - Inventory Asset` (সম্পদ বৃদ্ধি)
   - **Credit**: `2010 - Accounts Payable` (দায় বৃদ্ধি)

---

# 6. MODULE 4: INVENTORY RUNWAY, STOCK AUDITS & BUNDLING
### ইনভেন্টরি রানওয়ে, অডিট ও কম্বো ইঞ্জিন

#### 1. Coverage Days Runway Algorithm (কভারেজ রানওয়ে ফর্মুলা)
$$\text{Daily Sales Velocity} = \frac{\text{Sales in Last 30 Days}}{30}$$
$$\text{Coverage Days Runway} = \frac{\text{Current Stock Quantity}}{\text{Daily Sales Velocity}}$$

- **CRITICAL REORDER (⚠️ লাল)**: রানওয়ে < ৭ দিন।
- **FAST MOVING (🔥 কমলা)**: দৈনিক বিক্রি উচ্চ এবং রানওয়ে ৭-১৫ দিন।
- **NORMAL (🟢 সবুজ)**: রানওয়ে ১৫-৪৫ দিন।
- **SLOW MOVING (💤 নীল)**: রানওয়ে > ৪৫ দিন (স্টক জমে আছে)।

#### 2. Physical Stock Count Discrepancy Reconciliation (স্টক অডিট ও গরমিল সমাধান)
- **দৃশ্যপট**: সিস্টেমে রেকর্ড ১৫০২ টি, কিন্তু ফিজিক্যাল গণনায় পাওয়া গেল ১৫০০ টি।
- ক্যাশিয়ার চুপিসারে ঘাটতি মুছতে পারবে না। ম্যানেজার অডিট স্ক্রিনে কারণ নির্বাচন করবেন:
  - *Theft / Pilferage (চুরি বা চুরিজনিত ক্ষতি)*
  - *Damage / Breakage in Store (দোকানে ভেঙে যাওয়া)*
  - *Unrecorded Retail Sale (আনরেকর্ডেড বিক্রি)*
  - *Supplier Entry Error (সাপ্লায়ার ডাটা এন্ট্রি ভুল)*
- **অটো-পোস্টিং**: অনুমোদন দিলে সাথে সাথে স্টক অ্যাডজাস্ট হয় এবং ঘাটতির কেনা মূল্য সরাসরি P&L একাউন্টে পোস্টিং হয়:
  - **Debit**: `5020 - Inventory Shrinkage & Loss` (P&L ক্ষতি)
  - **Credit**: `1200 - Inventory Asset` (সম্পদ হ্রাস)

#### 3. Combos & Bundling Engine (ডিফেন্সিভ কম্বো ও বান্ডেল ইঞ্জিন)
- একাধিক পণ্য একত্র করে স্পেশাল প্রমোশন তৈরি (যেমন: *১০ কেজি চাল + ২৫০ গ্রাম চিনি* অথবা *আইফোন কেস + গ্লাস প্রোটেক্টর*)।
- **Defensive Pricing Check**: কম্বোর বিক্রয়মূল্য উপাদানগুলোর যৌথ কেনা খরচের (COGS) নিচে নামলে সিস্টেম লাল সতর্কবার্তা দিয়ে সেভ বাটন লক করে দেবে।
- **Real-Time Stock Consumption**: কাউন্টারে কম্বো বারকোড স্ক্যান করে বিক্রি করলে উপাদানগুলোর স্টক তৎক্ষণাৎ আনুপাতিক হারে কমে যাবে।

---

# 7. MODULE 5: AUTOMATED DOUBLE-ENTRY ACCOUNTING ENGINE
### স্বয়ংক্রিয় ডাবল-এন্ট্রি অ্যাকাউন্টিং ইঞ্জিন

#### Zero-Manual Posting Philosophy (জিরো-ম্যানুয়াল জার্নাল ফিলোসফি):
কোনো হিসাবরক্ষকের ম্যানুয়ালি ডেবিট-ক্রেডিট এন্ট্রি দিতে হয় না। প্রতিটি ব্যবসায়িক ইভেন্টে সিস্টেম নিজে জার্নাল তৈরি করে:

| ব্যবসায়িক ইভেন্ট | ডেবিট একাউন্ট (Dr) | ক্রেডিট একাউন্ট (Cr) |
| :--- | :--- | :--- |
| **পিও গুডস রিসিভ (GRN)** | `1200 - Inventory Asset` | `2010 - Accounts Payable` |
| **পিওএস ক্যাশ সেল** | `1010 - Petty Cash` | `4010 - Retail Sales Revenue` |
| *(স্বয়ংক্রিয় COGS এন্ট্রি)* | `5010 - COGS Merchandise` | `1200 - Inventory Asset` |
| **পিওএস কার্ড সেল** | `1020 - Operating Bank Account` | `4010 - Retail Sales Revenue` |
| **পিওএস বিকাশ/নগদ সেল** | `1030 - MFS Account` | `4010 - Retail Sales Revenue` |
| **স্টক ঘাটতি (Shrinkage)** | `5020 - Shrinkage & Loss` | `1200 - Inventory Asset` |
| **সাপ্লায়ার বিল পেমেন্ট** | `2010 - Accounts Payable` | `1020 - Operating Bank Account` |

#### Chart of Accounts (১৭টি স্ট্যান্ডার্ড চার্ট অব অ্যাকাউন্টস):
1. **Assets (1000s)**: `1010 Cash`, `1020 Bank`, `1030 MFS`, `1100 AR`, `1200 Inventory Asset`, `1300 Fixtures`
2. **Liabilities (2000s)**: `2010 Accounts Payable`, `2020 Sales Tax / VAT Payable`
3. **Equity (3000s)**: `3010 Owner Equity / Retained Earnings`
4. **Revenue (4000s)**: `4010 Retail Sales`, `4020 Repair Revenue`, `4030 Service Commissions`
5. **COGS (5000s)**: `5010 Cost of Goods Sold`, `5020 Shrinkage Loss`
6. **Operating Expenses (6000s)**: `6010 Rent`, `6020 Utilities & Internet`, `6030 Wages & Salaries`

> [!NOTE]
> **Dynamic Trial Balance Verification**: সিস্টেমের ট্রায়াল ব্যালেন্সে মোট ডেবিট এবং মোট ক্রেডিট সর্বদা সেন্ট-লেভেলে সমান থাকে (`is_balanced: True`)। যদি এক সেন্টেরও অমিল হয়, সিস্টেম অ্যালার্ট জারি করে।

---

# 8. MODULE 6: FAST-BILLING OFFLINE-FIRST POS
### দ্রুতগতির অফলাইন-ফার্স্ট পিওএস

#### 1. Hardware Barcode Scanner & Web Audio Feedback:
- যেকোনো USB বা Bluetooth বারকোড স্ক্যানার গানে প্রোডাক্টের কোড স্ক্যান করলে ১০০ মিলিসেকেন্ডের নিচে প্রোডাক্ট কার্টে যোগ হয়।
- প্রতিটি সফল স্ক্যানে বিল্ট-ইন ওয়েব অডিও সিন্থেসাইজারে ১.৬ kHz ক্রিস্প বিফ (Beep) শব্দ বেজে ওঠে।

#### 2. Multi-Cart Hold & Switch (কার্ট পার্কিং / সোয়াপিং):
- **দৃশ্যপট**: কাস্টমার লাইনে দাঁড়িয়ে বিল করার সময় হঠাৎ মনে পড়ল অন্য কিছু আনা হয়নি এবং সেলফের দিকে চলে গেল।
- ক্যাশিয়ার **`[F3]`** চাপলে কার্টটি তৎক্ষণাৎ ব্যাকগ্রাউন্ডে হোল্ড (Parked) হয়ে যায় এবং নতুন কাস্টমারের জন্য ফ্রেশ কার্ট খুলে যায়।
- কাস্টমার ফিরে আসলে **`[F4]`** চেপে পূর্বের কার্ট এক ক্লিকে রিস্টোর করে বিল সম্পন্ন করা যায়।

#### 3. Multi-Tender Split Payment Modal (`[F8]`):
- একই বিলে কাস্টমার চাইলে একাধিক মাধ্যমে পেমেন্ট করতে পারে:
  - কিয়দাংশ ক্যাশে (Cash)
  - কিয়দাংশ কার্ডে (Stripe / POS Terminal Card)
  - কিয়দাংশ মোবাইলে (bKash / Nagad TrxID)
- লাইভ টেন্ডার এবং কাস্টমারকে ফেরত দেওয়ার জন্য ভাংতি পয়সা (Change Due) নিখুঁতভাবে প্রদর্শিত হয়।

#### 4. Resilient Offline-First Architecture (IndexedDB Engine):
- ইন্টারনেট সম্পূর্ণ বন্ধ হয়ে গেলেও কাউন্টার বিন্দুমাত্র থামবে না।
- সমস্ত ক্যাটালগ ব্রাউজারের লোকাল IndexedDB-তে ক্যাশ করা থাকে।
- অফলাইনে সম্পন্ন সেলসগুলো ক্রিপ্টোগ্রাফিক ইউনিক আইডি (`OFFLINE-...`) সহ IndexedDB-তে কিউ (Queue) হয়ে থাকে এবং লোকাল রিসিট প্রিন্ট হয়।
- ইন্টারনেট ফিরে আসার সাথে সাথে সিস্টেম অটোমেটিক ব্যাকগ্রাউন্ডে সব অফলাইন সেলস সেন্ট্রাল ERP-তে পুশ করে কেন্দ্রীয় স্টক এবং অ্যাকাউন্টস আপডেট করে দেয়।

#### 5. Cashier Shift Reconciliation (শিফট ফ্লোট ও হিসাব মেলানো):
- শিফট শুরু: ক্যাশ ড্রয়ারে শুরুতেই কত ক্যাশ ছিল (Opening Float) তা রেকর্ড করা।
- শিফট চলাকালীন: ক্যাশিয়ার কত ডিসকাউন্ট দিয়েছে তার অডিট হিস্টোরি সংরক্ষণ।
- শিফট সমাপ্তি (`[F10]`): ড্রয়ারে কত ক্যাশ থাকার কথা এবং ক্যাশিয়ার গুনে কত ক্যাশ বুঝিয়ে দিয়েছে তার রিকনসিলিয়েশন রিপোর্ট।

---

# 9. MODULE 7: CUSTOMER CRM & LOYALTY ENGINE
### কাস্টমার সিআরএম ও লয়্যালটি ইঞ্জিন

- **ফোন নম্বর দিয়ে দ্রুত কাস্টমার অনুসন্ধান**: ফোন নম্বর টাইপ করার সাথে সাথে কাস্টমারের নাম, লাইফটাইম স্পেন্ড এবং অর্ডারের সংখ্যা চলে আসে।
- **Loyalty Points Accrual**: প্রতি $১০ (বা সমমানের) কেনাকাটায় ১ পয়েন্ট জমা হয়।
- **Loyalty Points Redemption**: চেকআউটে পয়েন্ট রিডিম করে ডিসকাউন্ট পাওয়া যায় (প্রতি ১০ পয়েন্টে $১.০০ স্টোর ডিসকাউন্ট)।
- **Promotional Coupons**: প্রমোশনাল কোড যেমন `WELCOME10`, `SAVE5`, `VIP20` প্রয়োগ করে শতকরা বা নির্দিষ্ট অংকের ছাড় দেওয়ার ব্যবস্থা।

---

# 10. MODULE 8: OMNICHANNEL STOCK SYNCHRONIZATION
### ওমনিচ্যানেল স্টক সিঙ্ক্রোনাইজেশন

- **সেন্ট্রাল স্টক ব্লকিং**: ওয়েব স্টোর, শপিফাই, হোয়াটসঅ্যাপ বা ফোনের মাধ্যমে অনলাইন অর্ডার আসার সাথে সাথে গুদামের সেন্ট্রাল ফিজিক্যাল স্টক থেকে ইউনিটটি "RESERVED" হয়ে যায়, যাতে দোকানে উপস্থিত ক্যাশিয়ার সেই পণ্য ভুলবশত অন্য কারও কাছে বিক্রি করে ওভারসেলিং না করে।
- **ক্যাশ অন ডেলিভারি (COD) রিটার্ন রিস্টকিং**: পার্সেল কাস্টমার রিসিভ না করলে বা ক্যানসেল হলে এক ক্লিকে "Restock" করলে সংরক্ষিত পণ্য পুনরায় এভেইলেবল স্টকে ফিরে আসে।

---

# 11. KEYBOARD-FIRST HOTKEYS GUIDE
### কীবোর্ড শর্টকাট রেফারেন্স

| কীবোর্ড কী | ফাংশন ও কার্যকারিতা |
| :---: | :--- |
| **`F1`** | **Quick Help / Hotkeys Cheat Sheet**: হটকি রেফারেন্স মোডাল খোলে। |
| **`F2`** | **Barcode Scanner / Search Focus**: কার্সার সরাসরি বারকোড ইনপুটে নিয়ে যায়। |
| **`F3`** | **Hold Active Cart (Park Cart)**: বর্তমান কাস্টমারের কার্ট হোল্ড করে রাখে। |
| **`F4`** | **Switch / Resume Held Carts**: পার্ক করা পূর্ববর্তী কার্টে সুইচ করে। |
| **`F8`** | **Open Split Tender Modal**: স্প্লিট পেমেন্ট (ক্যাশ, কার্ড, বিকাশ/নগদ) স্ক্রিন খোলে। |
| **`F9`** | **Instant 1-Click Cash Checkout**: দ্রুত ক্যাশ বিল সম্পন্ন করে। |
| **`F10`** | **Register Shift Float**: ক্যাশ রেজিস্টার ওপেন/ক্লোজ উইন্ডো খোলে। |
| **`Esc`** | **Dismiss / Clear**: যেকোনো খোলা মোডাল বা সার্চ বক্স বন্ধ করে। |

---

# 12. COMPLETE REST API REFERENCE
### পূর্ণাঙ্গ এপিআই রেফারেন্স

| মেথড | এন্ডপয়েন্ট | বিবরণ |
| :---: | :--- | :--- |
| `GET` | `/api/status` | সিস্টেমের স্বাস্থ্য, শিফট স্ট্যাটাস ও সার্ভার টাইম রিটার্ন করে |
| `GET` | `/api/inventory` | সমস্ত পণ্য, ক্যাটাগরি, বারকোড ও সেলফ লোকেশন লিস্ট |
| `POST`| `/api/inventory` | নতুন পণ্য বা এক্সেসরি যোগ ও বারকোড জেনারেট |
| `POST`| `/api/pos/split-checkout` | ক্যাশ/কার্ড/MFS স্প্লিট সেলস সম্পন্ন ও অটো-জার্নাল পোস্টিং |
| `GET` | `/api/accounting/trial-balance` | ডাবল-এন্ট্রি ট্রায়াল ব্যালেন্স ও ব্যালেন্সড স্ট্যাটাস |
| `GET` | `/api/accounting/profit-loss` | রিয়েল-টাইম রেভিনিউ, COGS, গ্রস প্রফিট ও নেট মার্জিন |
| `GET` | `/api/accounting/general-ledger` | জেনারেল লেজার এন্ট্রি লিস্ট (ফিল্টার সহ) |
| `GET` | `/api/accounting/journal` | জার্নাল ভাউচার (JV) এবং লাইন আইটেম ব্রেকডাউন |
| `GET` | `/api/procurement/po` | পারচেজ অর্ডার (PO) লিস্ট ও স্ট্যাটাস |
| `POST`| `/api/procurement/po` | নতুন ড্রাফট PO তৈরি |
| `POST`| `/api/procurement/po/approve` | PO অনুমোদন (Manager/Owner) |
| `POST`| `/api/procurement/po/receive` | **অ্যাটমিক গুডস রিসিভিং**: স্টক বৃদ্ধি + WAC + AP ক্রেডিট + JV |
| `GET` | `/api/procurement/suppliers` | ভেন্ডর ডিরেক্টরি ও বকেয়া AP ব্যালেন্স |
| `POST`| `/api/procurement/suppliers` | নতুন সরবরাহকারী প্রোফাইল তৈরি |
| `GET` | `/api/inventory/coverage-analytics` | ৩০ দিনের সেলস রানওয়ে, কভারেজ ডে ও লো-স্টক সতর্কতা |
| `GET` | `/api/inventory/combos` | কম্বো ও বান্ডেল লিস্ট এবং উপাদানসমূহের বিবরণ |
| `POST`| `/api/inventory/combos` | নতুন কম্বো তৈরি (ডিফেন্সিভ COGS গার্ড সহ) |
| `GET` | `/api/inventory/audits` | স্টক অডিট হিস্টোরি ও শ্রিঙ্কেজ ক্ষতির রেকর্ড |
| `POST`| `/api/inventory/audits/reconcile`| ফিজিক্যাল কাউন্ট গরমিল সমাধান ও P&L এ লস পোস্টিং |
| `GET` | `/api/omnichannel/orders` | ওমনিচ্যানেল অর্ডার কিউ ও সংরক্ষিত স্টক |
| `POST`| `/api/omnichannel/orders` | নতুন ওয়েব/ফোন অর্ডার প্লেসমেন্ট ও স্টক ব্লকিং |
| `POST`| `/api/omnichannel/orders/dispatch`| অর্ডার ডেলিভারিতে পাঠানো |
| `POST`| `/api/omnichannel/orders/restock` | ক্যানসেলড/রিটার্ন অর্ডার পুনরায় ইনভেন্টরিতে রিস্টকিং |
| `GET` | `/api/dashboard/executive` | এক্সিকিউটিভ লিকুইডিটি, পেটি ক্যাশ, ব্যাংক ও ১২ মাসের ট্রেন্ড |

---

# 13. DATABASE SCHEMA SPECIFICATION
### ডাটাবেস স্কিমা স্পেসিফিকেশন

সিস্টেমের `xpro_store.db` ডাটাবেসটিতে নিচের টেবিলগুলো রিলেশনশিপ মেইনটেইন করে সংরক্ষিত থাকে:
1. `inventory`: প্রোডাক্ট মাস্টার, বারকোড, ক্যাটাগরি, সেলফ লোকেশন, কস্ট প্রাইস, সেলস প্রাইস, কোয়ান্টিটি, রিরর্ডার পয়েন্ট, কম্বো ফ্ল্যাগ।
2. `chart_of_accounts`: ১৭টি একাউন্ট কোড, নাম, টাইপ (Asset, Liability, Equity, Revenue, Expense)।
3. `journal_entries`: ভাউচার নম্বর, রেফারেন্স টাইপ, ডেসক্রিপশন, ইউজার, টাইমস্ট্যাম্প।
4. `journal_lines`: ভাউচার আইডি, একাউন্ট কোড, ডেবিট সেন্টস, ক্রেডিট সেন্টস।
5. `suppliers`: সরবরাহকারীর নাম, কোড, ফোন, পেমেন্ট টার্মস (`NET_30`), বকেয়া ব্যালেন্স।
6. `purchase_orders`: পিও নম্বর, সাপ্লায়ার আইডি, স্ট্যাটাস, মোট খরচ, এক্সপেক্টেড ডেট।
7. `purchase_order_items`: পিও আইডি, প্রোডাক্ট আইডি, ইউনিট কস্ট, কোয়ান্টিটি, সাবটোটাল।
8. `goods_receipts`: জিআরএন নম্বর, পিও নম্বর, রিসিভ ডেট, রিসিভড বাই ইউজার, জার্নাল এন্ট্রি আইডি।
9. `sales`: সেলস রিসিট নম্বর, কাস্টমার নেম, মোট বিল, পেমেন্টস জেএসওন, ডিসকাউন্ট, জার্নাল এন্ট্রি আইডি।
10. `stock_audits`: অডিট নম্বর, প্রোডাক্ট আইডি, সিস্টেম স্টক, ফিজিক্যাল কাউন্ট, গরমিল, কারণ, P&L জার্নাল আইডি।
11. `combo_bundles`: বান্ডেল নেম, বারকোড, প্রাইস, উপাদানগুলোর জেএসওন (`items_json`)।
12. `omnichannel_orders`: চ্যানেল, কাস্টমার, প্রোডাক্ট আইডি, রিজার্ভড কোয়ান্টিটি, স্ট্যাটাস।
13. `shifts`: ক্যাশিয়ার ইউজার, ওপেনিং ফ্লোট, ক্লোজিং ক্যাশ, ডিসকাউন্ট অডিট।

---

# 14. DEPLOYMENT & OPERATIONS GUIDE
### ডিপ্লয়মেন্ট ও অপারেশন গাইড

#### লোকাল সার্ভার চালনা (Daily Retail Operation):
1. ডিরেক্টরির [`START_WEB_POS.bat`](file:///l:/My%20Drive/0.DIS%20Project/7.X%20Pro%20Wireless/START_WEB_POS.bat) ফাইলটিতে ডাবল ক্লিক করুন।
2. স্বয়ংক্রিয়ভাবে ব্যাকএন্ড সার্ভার চালু হবে এবং ডিফল্ট ব্রাউজারে `http://localhost:8000` খুলে যাবে।
3. লোকাল নেটওয়ার্কের যেকোনো ট্যাবলেট বা কম্পিউটার থেকে একই ওয়াইফাই এর মাধ্যমে আইপি (যেমন: `http://192.168.1.X:8000`) দিয়ে ব্যবহার করা যাবে।

#### গিটহাব ও ক্লাউড ডিপ্লয়মেন্ট প্রস্তুতি:
- সিস্টেমের স্ট্যাটিক ফ্রন্টএন্ড এবং ব্যাকএন্ড এপিআই সম্পূর্ণভাবে মডুলার হওয়ায় এটি যেকোনো গিটহাব রিপোজিটরিতে সংরক্ষণ এবং Vercel / Render / Cloud সার্ভারে হোস্ট করার জন্য শতভাগ প্রস্তুত।
