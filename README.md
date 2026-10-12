# 🏢 X Pro Wireless — Enterprise Retail ERP & Offline-First POS System
> **High-Velocity Point-of-Sale Counter & Dual-Brain Executive ERP Suite**  
> *Inspired by the enterprise architecture of iBOS Retail ERP*

---

## 🚀 Key Highlights & Architectural Modules

1. **👑 4-Tier Role-Based Access Control (RBAC)**: Master Login (Owner 👑), Branch Manager (Approvals 📋), Floor In-Charge (Stock 🦺), Cashier (POS 💳).
2. **🏛️ Executive Liquidity & Assets Dashboard**: Real-time working capital, Petty Cash (`1010`), Bank (`1020`), MFS (`1030`), Sellable Inventory Valuation (`1200`), Accounts Payable/Receivable, and 12-Month Trailing comparison.
3. **📥 Digital Procurement & Atomic Goods Receipt**: Draft POs, approval state machine, and one-click "Receive Goods" trigger that atomically updates physical stock, recalculates Weighted Average Cost (WAC), credits Supplier AP, and posts double-entry journal vouchers.
4. **🏃 30-Day Coverage Days Runway & Stock Audit**: Predictive stock exhaustion algorithm (`Current Stock / Daily Sales`), Critical Reorder alerts, and physical count discrepancy audit with automatic P&L shrinkage loss posting.
5. **🎁 Promotional Combos & Bundling Engine**: Defensive COGS pricing check (prevents selling combo below combined constituent cost), and real-time stock consumption upon checkout.
6. **⚖️ Automated Double-Entry Accounting Engine**: Zero manual journal entries! Self-balancing Trial Balance (`is_balanced: true`), Real-Time P&L Statement, General Ledger (GL), and Journal Vouchers (JV).
7. **⚡ Fast-Billing Offline-First POS**:
   - Keyboard-first hotkeys (`F1`-`F10`, `Esc`).
   - Barcode gun auto-detect with Web Audio feedback (<100ms scan-to-cart).
   - Multi-Cart Hold & Switch (Cart Swapping / Tabs).
   - Multi-tender Split Payment (Cash, Card, MFS bKash/Nagad, Loyalty points).
   - Native IndexedDB offline transaction queue with automatic background sync when connection is restored.
8. **🌐 Omnichannel Stock Sync**: Real-time central inventory reservation for web/phone orders and instant restock for returned COD parcels.

---

## 📖 Complete Documentation (Bilingual: English & বাংলা)
For the full A-to-Z operational guide, financial flow diagrams, keyboard hotkeys cheat sheet, and REST API specification, see:  
👉 **[ENTERPRISE_ERP_POS_SYSTEM_DOCUMENTATION.md](./ENTERPRISE_ERP_POS_SYSTEM_DOCUMENTATION.md)**

---

## 🛠️ Quick Start & Running Locally

### Option 1: One-Click Windows Launcher
Double-click `START_WEB_POS.bat` in the root folder. It starts the local server daemon and automatically opens the application in your default browser.

### Option 2: Python Command Line
```powershell
python -u server.py 8000
```
Then visit: **`http://localhost:8000`**

---

## ⌨️ POS Keyboard Hotkeys Cheat Sheet
- **`[F1]`**: Quick Help / Hotkeys Reference
- **`[F2]`**: Focus Barcode Scanner / SKU Search
- **`[F3]`**: Hold Active Cart (Cart Parking)
- **`[F4]`**: Cycle / Resume Held Carts
- **`[F8]`**: Open Split Tender Payment Modal (Cash, Card, MFS)
- **`[F9]`**: Instant 1-Click Cash Checkout
- **`[F10]`**: Register Shift Float & Handover Reconciliation
- **`[Esc]`**: Dismiss any open modal or clear search
