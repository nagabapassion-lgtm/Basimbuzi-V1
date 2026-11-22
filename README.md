# SC Basimbuzi Receipt Management System

A digital payment and official receipt issuance system for **SC Basimbuzi**, backed by a Google Sheets spreadsheet database with Google Apps Script Web App API, atomic receipt numbering, in-memory PDF receipt generation, and automated email dispatching.

---

## 1. Quick Start & Setup

### Local Development
```bash
# 1. Install dependencies
npm install

# 2. Run automated unit tests
npm run test

# 3. Start development server
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

---

## 2. Environment Variables

Create a `.env` file in the root directory (refer to `.env.example`):

| Variable | Description | Example |
| :--- | :--- | :--- |
| `VITE_GAS_URL` | Deployed Google Apps Script Web App URL | `https://script.google.com/macros/s/AKfycb.../exec` |
| `PORT` | Node dev / backend server port (default 3000) | `3000` |

---

## 3. Google Apps Script Backend (`Code.gs`)

The backend script lives in `src/data/gasBackendCode.ts` and can be copied directly from the in-app **Google Apps Script Backend** setup page.

### Key Architectural Optimizations:
1. **Strictly Batched Spreadsheet Operations**: All read and write operations read entire ranges into arrays and write back using `.setValues()` in single calls. Loops **never** contain sequential `.getRange()` or `.setValue()` calls, eliminating execution timeouts and spreadsheet lock contention.
2. **CacheService for Member/User Retrieval**: Member and user authorizations are cached in `CacheService.getScriptCache()` for 5 minutes (`300s`), dropping latency from ~1.5s to under 50ms.
3. **In-Memory HTML-to-PDF Generation**: Receipts are converted to PDF directly via `Utilities.newBlob(htmlBody, "text/html").getAs("application/pdf")`. This completes in <100ms and completely bypasses Google Docs file creation, token substitution, and Drive lock contention that frequently trigger Google's 6-minute execution limit.
4. **Quota Exception Handling**: Catches daily Google Mail recipient quotas (`Service invoked too many times`) gracefully. Transactions are recorded safely, the PDF receipt remains available for immediate download or later resend, and the system notifies the operator without crashing.
5. **HTML Entity Escaping**: Prevents script/HTML injection into receipt emails and PDFs via `escapeHtmlGas()`.

---

## 4. Feature-Based Architecture Migration Guide

To migrate from the legacy type-based directory structure (`/components`, `/views`, `/services`) to a scalable domain/feature-based structure:

```text
src/
├── features/
│   ├── payments/
│   │   ├── components/
│   │   │   ├── PaymentForm.tsx
│   │   │   ├── QuickAmounts.tsx
│   │   │   └── PaymentSummary.tsx
│   │   ├── hooks/
│   │   │   ├── usePaymentHistory.ts
│   │   │   └── usePaymentSubmit.ts
│   │   └── views/
│   │       ├── GenerateReceiptView.tsx
│   │       └── TransactionsView.tsx
│   │
│   ├── receipts/
│   │   ├── components/
│   │   │   ├── ReceiptModal.tsx
│   │   │   ├── ReceiptPdfPreview.tsx
│   │   │   ├── ReceiptTemplate.tsx
│   │   │   └── WhatsAppShareModal.tsx
│   │   ├── utils/
│   │   │   ├── receiptFormatter.ts
│   │   │   └── receiptNumberGenerator.ts
│   │   └── views/
│   │       └── SearchReceiptView.tsx
│   │
│   ├── members/
│   │   ├── components/
│   │   │   ├── MemberTable.tsx
│   │   │   ├── MemberModal.tsx
│   │   │   └── RoleBadge.tsx
│   │   ├── hooks/
│   │   │   └── useMembers.ts
│   │   └── views/
│   │       └── UserManagementView.tsx
│   │
│   ├── auth/
│   │   ├── components/
│   │   │   ├── OtpInput.tsx
│   │   │   └── AccessDenied.tsx
│   │   └── views/
│   │       └── LoginView.tsx
│   │
│   └── settings/
│       ├── components/
│       │   ├── BrandingForm.tsx
│       │   └── GasUrlConfig.tsx
│       └── views/
│           ├── SettingsView.tsx
│           ├── SetupGuideView.tsx
│           └── AuditLogsView.tsx
│
├── shared/
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   └── Toast.tsx
│   ├── context/
│   │   └── AppContext.tsx
│   ├── services/
│   │   └── api.ts
│   ├── types/
│   │   └── index.ts
│   └── utils/
│       └── security.ts
```

### Steps to Update Import Paths:
1. Move components into their corresponding domain under `src/features/<domain>/`.
2. Configure path aliases in `tsconfig.json`:
   ```json
   {
     "compilerOptions": {
       "paths": {
         "@/*": ["./src/*"],
         "@features/*": ["./src/features/*"],
         "@shared/*": ["./src/shared/*"]
       }
     }
   }
   ```
3. Update imports in views and components (e.g. `import { usePaymentHistory } from '@/features/payments/hooks/usePaymentHistory'`).

---

## 5. Automated Tests

Run the test suite:
```bash
npm run test
```
The test suite validates:
- HTML escaping against XSS/HTML injection attacks.
- Email RFC formatting & length constraints.
- International & Ugandan phone validation.
- UGX payment amount range constraints.
- Atomic receipt numbering format (`SB-YYYY-00001`).
- Role-based access control (RBAC) permissions matrix for Owner, Admin, and Issuer.
