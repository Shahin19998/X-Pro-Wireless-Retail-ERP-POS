XPRO STORE POS — Windows desktop starter application

Requirements: Python 3.10+ (Tkinter bundled on standard Windows Python).
Run: double-click START_XPRO.bat, or python xpro_store.py
First run: create administrator password and recovery hint. Employee accounts are created by administrator.

Features: SQLite database, role-based login, opening change ($0-$100), inventory, sales, returns, repair tickets, employee notes, policy-versioned receipt archive, and HTML receipts.
Receipt printing: choose Office duplex (receipt front, policies back), duplex thermal (front/back via print settings if printer supports it), or single-sided thermal (front only). Receipt opens in browser; select correct physical printer and duplex settings. Automatic driver-level duplex and cash drawer hardware commands are NOT implemented. Windows browser print settings control the physical printer. HTML duplex layout includes a forced page break for policy reverse side.

This is an initial working release, not a production-certified POS. It does not process card payments, remit money transfers, issue lottery tickets, or provide regulated financial services. Back up xpro_store.db regularly. Test receipt output and compliance before using with customers.
