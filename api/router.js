var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// lib/backend/vercel-entry.ts
var vercel_entry_exports = {};
__export(vercel_entry_exports, {
  default: () => handler
});
module.exports = __toCommonJS(vercel_entry_exports);

// lib/backend/handlers/auth.ts
var import_crypto2 = __toESM(require("crypto"));

// lib/backend/db.ts
var import_supabase_js = require("@supabase/supabase-js");

// lib/backend/env.ts
var import_dotenv = require("dotenv");
(0, import_dotenv.config)({ quiet: true });
var clean = (value) => String(value || "").trim();
var env = {
  get SUPABASE_URL() {
    return clean(process.env.SUPABASE_URL);
  },
  get SUPABASE_SERVICE_ROLE_KEY() {
    return clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  },
  get SESSION_SECRET() {
    return clean(process.env.SESSION_SECRET);
  }
};
var isBackendConfigured = () => Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

// lib/backend/db.ts
var client = null;
var getDb = () => {
  if (!client) {
    if (!isBackendConfigured()) {
      throw new Error(
        "Supabase backend is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
      );
    }
    client = (0, import_supabase_js.createClient)(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return client;
};
var db = new Proxy({}, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  }
});
var authVerifier = null;
var getAuthVerifier = () => {
  if (!authVerifier) {
    if (!isBackendConfigured()) {
      throw new Error(
        "Supabase backend is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
      );
    }
    authVerifier = (0, import_supabase_js.createClient)(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return authVerifier;
};

// lib/backend/auth.ts
var import_crypto = __toESM(require("crypto"));

// lib/backend/permissions.ts
var getDefaultPermissions = (role) => {
  switch (role) {
    case "OWNER":
      return {
        canIssueReceipts: true,
        canDeleteTransactions: true,
        canViewReports: true,
        canManageUsers: true,
        canEditSettings: true,
        canManageWebsite: true,
        canEditMembers: true
      };
    case "ADMIN":
      return {
        canIssueReceipts: true,
        canDeleteTransactions: true,
        canViewReports: true,
        canManageUsers: false,
        canEditSettings: false,
        canManageWebsite: true,
        canEditMembers: true
      };
    case "MEDIA":
      return {
        canIssueReceipts: false,
        canDeleteTransactions: false,
        canViewReports: false,
        canManageUsers: false,
        canEditSettings: false,
        canManageWebsite: true,
        canEditMembers: false
      };
    case "ISSUER":
    default:
      return {
        canIssueReceipts: true,
        canDeleteTransactions: false,
        canViewReports: false,
        canManageUsers: false,
        canEditSettings: false,
        canManageWebsite: false,
        canEditMembers: false
      };
  }
};
var resolveUserPermissions = (role, permissions) => {
  if (role === "OWNER") return getDefaultPermissions("OWNER");
  const defaults = getDefaultPermissions(role);
  return { ...defaults, ...permissions || {} };
};

// lib/backend/auth.ts
var b64url = (input) => Buffer.from(input).toString("base64url");
var hmac = (data) => import_crypto.default.createHmac("sha256", secretKey()).update(data).digest("base64url");
var secretKey = () => env.SESSION_SECRET || "sc-basimbuzi-dev-session-secret";
var signToken = (payload) => {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({
      ...payload,
      exp: payload.exp ?? Date.now() + 12 * 60 * 60 * 1e3
    })
  );
  return `${header}.${body}.${hmac(`${header}.${body}`)}`;
};
var verifyToken = (token) => {
  const parts = String(token || "").trim().split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  if (!header || !body || !sig) return null;
  const expected = hmac(`${header}.${body}`);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !import_crypto.default.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
    if (!decoded?.sub || !decoded?.exp || Number(decoded.exp) < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
};
var getBearer = (headers) => {
  const auth = String(headers.authorization || headers.Authorization || "").trim();
  if (!auth.toLowerCase().startsWith("bearer ")) return "";
  return auth.slice(7).trim();
};
var requireStaff = async (ctx, roles) => {
  const token = getBearer(ctx.headers);
  const payload = token ? verifyToken(token) : null;
  if (!payload || payload.kind !== "staff") {
    return {
      ok: false,
      response: {
        status: 401,
        body: {
          success: false,
          authorized: false,
          message: "Session expired. Please sign in again."
        }
      }
    };
  }
  const email = String(payload.sub || "").trim().toLowerCase();
  const { data: row, error } = await getDb().from("app_users").select("id, name, email, role, status, permissions, created_at").eq("email", email).maybeSingle();
  if (error || !row) {
    return {
      ok: false,
      response: {
        status: 401,
        body: {
          success: false,
          authorized: false,
          message: "Session expired. Please sign in again."
        }
      }
    };
  }
  if (String(row.status || "").toUpperCase() !== "ACTIVE") {
    return {
      ok: false,
      response: {
        status: 403,
        body: {
          success: false,
          authorized: false,
          message: "This staff account has been set to INACTIVE. Please contact the administrator."
        }
      }
    };
  }
  const role = String(row.role || "ISSUER").toUpperCase();
  if (roles && roles.length > 0 && !roles.includes(role)) {
    return {
      ok: false,
      response: {
        status: 403,
        body: {
          success: false,
          authorized: false,
          error: `ACCESS DENIED: This action requires role ${roles.join(" or ")}.`
        }
      }
    };
  }
  const rawPermissions = row.permissions && typeof row.permissions === "object" ? row.permissions : null;
  return {
    ok: true,
    user: {
      id: String(row.id || ""),
      name: String(row.name || email.split("@")[0]),
      email: String(row.email || email).toLowerCase(),
      role,
      status: String(row.status || "ACTIVE").toUpperCase(),
      permissions: resolveUserPermissions(role, rawPermissions),
      rawPermissions,
      createdAt: String(row.created_at || "")
    }
  };
};
var OTP_TTL_MS = 10 * 60 * 1e3;
var OTP_MAX_ATTEMPTS = 5;
var OTP_RESEND_COOLDOWN_MS = 30 * 1e3;
var hashOtpCode = (email, code) => import_crypto.default.createHash("sha256").update(`${String(email).trim().toLowerCase()}:${String(code).trim()}:${secretKey()}`).digest("hex");
var issueOtp = async (email, purpose) => {
  const cleanEmail = String(email).trim().toLowerCase();
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const { data: existing } = await getDb().from("otp_codes").select("created_at").eq("email", cleanEmail).eq("purpose", purpose).maybeSingle();
  if (existing?.created_at) {
    const elapsed = Date.now() - Date.parse(existing.created_at);
    if (!Number.isNaN(elapsed) && elapsed >= 0 && elapsed < OTP_RESEND_COOLDOWN_MS) {
      return {
        ok: false,
        waitSeconds: Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1e3)
      };
    }
  }
  const code = String(import_crypto.default.randomInt(1e5, 1e6));
  const { error } = await getDb().from("otp_codes").upsert(
    {
      email: cleanEmail,
      code_hash: hashOtpCode(cleanEmail, code),
      purpose,
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      attempts: 0,
      created_at: nowIso
    },
    { onConflict: "email" }
  );
  if (error) return { ok: false };
  return { ok: true, code };
};
var verifyOtp = async (email, purpose, code) => {
  const cleanEmail = String(email).trim().toLowerCase();
  const { data: row } = await getDb().from("otp_codes").select("code_hash, expires_at, attempts").eq("email", cleanEmail).eq("purpose", purpose).maybeSingle();
  if (!row?.code_hash) return { ok: false, reason: "NO_ACTIVE" };
  if (Date.parse(row.expires_at) < Date.now()) {
    await getDb().from("otp_codes").delete().eq("email", cleanEmail).eq("purpose", purpose);
    return { ok: false, reason: "EXPIRED" };
  }
  if (Number(row.attempts) >= OTP_MAX_ATTEMPTS) {
    await getDb().from("otp_codes").delete().eq("email", cleanEmail).eq("purpose", purpose);
    return { ok: false, reason: "TOO_MANY" };
  }
  const candidate = hashOtpCode(cleanEmail, code);
  const storedBuf = Buffer.from(String(row.code_hash), "hex");
  const candBuf = Buffer.from(candidate, "hex");
  const matched = storedBuf.length === candBuf.length && import_crypto.default.timingSafeEqual(storedBuf, candBuf);
  if (!matched) {
    const nextAttempts = Number(row.attempts) + 1;
    if (nextAttempts >= OTP_MAX_ATTEMPTS) {
      await getDb().from("otp_codes").delete().eq("email", cleanEmail).eq("purpose", purpose);
    } else {
      await getDb().from("otp_codes").update({ attempts: nextAttempts }).eq("email", cleanEmail).eq("purpose", purpose);
    }
    return { ok: false, reason: "INCORRECT" };
  }
  await getDb().from("otp_codes").delete().eq("email", cleanEmail).eq("purpose", purpose);
  return { ok: true };
};

// src/utils/ledgerReconciliation.ts
var KNOWN_STAFF_PLACEHOLDER_EMAILS = [
  "nagabapassion@gmail.com",
  "passionwork94@gmail.com",
  "jotham.itungo@gmail.com",
  "jotham.itubgo@gmail.com",
  // historical typo observed on SB-2026-00018
  "hildanamy7@gmail.com"
];
var KNOWN_STAFF_SET = new Set(KNOWN_STAFF_PLACEHOLDER_EMAILS);
var STAFF_OWNER_NAME_KEYWORDS = {
  "nagabapassion@gmail.com": ["nagaba passion", "passion"],
  "jotham.itungo@gmail.com": ["itungo jotham", "jotham itungo", "jotham barigye"],
  "jotham.itubgo@gmail.com": [],
  // always a typo
  "passionwork94@gmail.com": [],
  // PR role address, never a personal member email
  "hildanamy7@gmail.com": ["hilda"]
};
function normalizePersonName(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function cleanPhoneNumber(raw) {
  const stripped = String(raw || "").replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "").trim();
  if (!stripped) return "";
  const compact = stripped.replace(/[\s()-]/g, "");
  if (/^\+2567\d{8}$/.test(compact)) return compact;
  if (/^2567\d{8}$/.test(compact)) return `+${compact}`;
  if (/^07\d{8}$/.test(compact)) return `+256${compact.slice(1)}`;
  if (/^7\d{8}$/.test(compact)) return `+256${compact}`;
  if (/^\+\d{8,15}$/.test(compact)) return compact;
  return stripped;
}
function isStaffOrPlaceholderEmail(email, payerName, extraStaffEmails, extraStaffOwners) {
  const clean2 = String(email || "").trim().toLowerCase();
  if (!clean2) return true;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean2)) return true;
  if (clean2.includes("no-reply") || clean2.includes("noreply") || clean2.includes("whatsapp.direct")) {
    return true;
  }
  const allStaff = new Set(KNOWN_STAFF_SET);
  if (extraStaffEmails) {
    for (const s of extraStaffEmails) {
      const se = String(s || "").trim().toLowerCase();
      if (se) allStaff.add(se);
    }
  }
  if (!allStaff.has(clean2)) {
    return false;
  }
  if (!payerName) {
    return false;
  }
  const normPayer = normalizePersonName(payerName);
  const allowedOwners = [...STAFF_OWNER_NAME_KEYWORDS[clean2] || []];
  if (extraStaffOwners && clean2 !== "passionwork94@gmail.com") {
    const ownerName = normalizePersonName(extraStaffOwners[clean2]);
    if (ownerName && ownerName.length >= 3 && !allowedOwners.includes(ownerName)) {
      allowedOwners.push(ownerName);
    }
  }
  if (normPayer && allowedOwners.some(
    (ownerKw) => normPayer === ownerKw || ownerKw.length >= 8 && normPayer.includes(ownerKw)
  )) {
    return false;
  }
  return true;
}
var PRE_CSV_COVERED_GAS_RECEIPTS = [
  { receiptNumber: "SB-2026-00004", gasName: "Atweta Ben", csvMemberId: "SB-M-0098", csvName: "Atweeta Ben", amount: 5e4, realEmail: "benatweta45@gmail.com", phone: "+256707520699" },
  { receiptNumber: "SB-2026-00005", gasName: "Namitala Goldie", csvMemberId: "SB-M-0206", csvName: "Namitala Goldie", amount: 5e4, realEmail: "namitalagoldie@gmail.com", phone: "+256780229482" },
  { receiptNumber: "SB-2026-00006", gasName: "Atwiine Gift", csvMemberId: "SB-M-0101", csvName: "Atwiine Gift", amount: 8e3, realEmail: "giftatwiine256@gmail.com", phone: "+256752818144" },
  { receiptNumber: "SB-2026-00007", gasName: "Asingwire Willis Junior", csvMemberId: "SB-M-0089", csvName: "Asingwire Willis Junior", amount: 5e3, realEmail: "asingwirewillisjunior@gmail.com", phone: "+256774669976" },
  { receiptNumber: "SB-2026-00008", gasName: "Tandeka Geofrey", csvMemberId: "SB-M-0255", csvName: "Tandeka Geoffrey", amount: 5e3, realEmail: "geofreytandeka66@gmail.com", phone: "+256781860280" },
  { receiptNumber: "SB-2026-00009", gasName: "Mark Matsiko", csvMemberId: "SB-M-0159", csvName: "Mark Matsiko", amount: 5e3, realEmail: "darrenug1111@gmail.com", phone: "+256709203211" },
  { receiptNumber: "SB-2026-00010", gasName: "Brason", csvMemberId: "SB-M-0025", csvName: "Ahamya Brason", amount: 5e3, stripStaffEmail: "passionwork94@gmail.com", phone: "+256705059374" },
  { receiptNumber: "SB-2026-00012", gasName: "Alvin Kamokya", csvMemberId: "SB-M-0055", csvName: "Alvin Kamokya", amount: 1e4, stripStaffEmail: "passionwork94@gmail.com", phone: "+256758346455" },
  { receiptNumber: "SB-2026-00013", gasName: "Ariho Rino Jeremiah", csvMemberId: "SB-M-0071", csvName: "Ariho Rino Jeremiah", amount: 6e3, stripStaffEmail: "passionwork94@gmail.com", phone: "+256700442386" },
  { receiptNumber: "SB-2026-00014", gasName: "Mirimo Watson", csvMemberId: "SB-M-0169", csvName: "Mirimo Watson", amount: 5e3, stripStaffEmail: "passionwork94@gmail.com", phone: "+256768860969" },
  { receiptNumber: "SB-2026-00015", gasName: "Shadrack Asiimwe", csvMemberId: "SB-M-0087", csvName: "Asiimwe Shadrack", amount: 5e3, realEmail: "shedrigar@gmail.com", phone: "+256706439691" },
  { receiptNumber: "SB-2026-00017", gasName: "Ankunda Sheila", csvMemberId: "SB-M-0066", csvName: "Ankunda Sheila", amount: 5e3, stripStaffEmail: "jotham.itungo@gmail.com", phone: "+256762269674" },
  { receiptNumber: "SB-2026-00018", gasName: "Reagan Lutakome", csvMemberId: "SB-M-0155", csvName: "Lutakome Reagan", amount: 5e3, stripStaffEmail: "jotham.itubgo@gmail.com", phone: "+256782430598" },
  { receiptNumber: "SB-2026-00019", gasName: "Ajak Achiek", csvMemberId: "SB-M-0039", csvName: "Ajak Achiek", amount: 85e3, stripStaffEmail: "jotham.itungo@gmail.com", phone: "+254113952273" },
  { receiptNumber: "SB-2026-00020", gasName: "Julian Kekihembo", csvMemberId: "SB-M-0146", csvName: "Kekihembo Julian", amount: 5e4, stripStaffEmail: "jotham.itungo@gmail.com", phone: "+256730975101" },
  { receiptNumber: "SB-2026-00021", gasName: "Danson Tugumisirize", csvMemberId: "SB-M-0263", csvName: "Tugume Danson", amount: 5e3, stripStaffEmail: "jotham.itungo@gmail.com", phone: "+256704317247" },
  { receiptNumber: "SB-2026-00022", gasName: "Ssenyange Eriya", csvMemberId: "SB-M-0252", csvName: "Ssenyange Eriya", amount: 2e4, stripStaffEmail: "nagabapassion@gmail.com", phone: "+256765005836" },
  { receiptNumber: "SB-2026-00024", gasName: "Muhereza Alvin", csvMemberId: "SB-M-0172", csvName: "Muhereza Alvin", amount: 1e4, stripStaffEmail: "nagabapassion@gmail.com", phone: "+256758346455" },
  { receiptNumber: "SB-2026-00026", gasName: "Eriya Mushaija", csvMemberId: "SB-M-0183", csvName: "Mushaija Elia", amount: 5e3, stripStaffEmail: "nagabapassion@gmail.com", phone: "+256780726421" },
  { receiptNumber: "SB-2026-00028", gasName: "Abaasa Precious", csvMemberId: "SB-M-0003", csvName: "Abaasa Precious", amount: 5e3, stripStaffEmail: "nagabapassion@gmail.com", phone: "+256762269674" },
  { receiptNumber: "SB-2026-00030", gasName: "Muhumuza Namanya Kalibala", csvMemberId: "SB-M-0204", csvName: "Namanya Kalibala", amount: 5e3, stripStaffEmail: "nagabapassion@gmail.com", phone: "+256785011163" },
  { receiptNumber: "SB-2026-00032", gasName: "Andrew Ainomugisha", csvMemberId: "SB-M-0037", csvName: "Ainomugisha Andrew", amount: 2e4, stripStaffEmail: "nagabapassion@gmail.com", phone: "+256759324117" },
  { receiptNumber: "SB-2026-00033", gasName: "Andrew Ainomugisha", csvMemberId: "SB-M-0037", csvName: "Ainomugisha Andrew", amount: 5e3, stripStaffEmail: "nagabapassion@gmail.com", phone: "+256759324117" },
  { receiptNumber: "SB-2026-00035", gasName: "Agaba Peter", csvMemberId: "SB-M-0019", csvName: "Agaba Peter", amount: 1e4, stripStaffEmail: "passionwork94@gmail.com", phone: "+256706168877" },
  { receiptNumber: "SB-2026-00036", gasName: "Agaba Paula", csvMemberId: "SB-M-0018", csvName: "Agaba Paula", amount: 1e4, realEmail: "agabapaula9@gmail.com", phone: "+256790913070" },
  { receiptNumber: "SB-2026-00037", gasName: "Ahumuza Keith", csvMemberId: "SB-M-0029", csvName: "Ahumuza Keith", amount: 1e4, stripStaffEmail: "passionwork94@gmail.com", phone: "+256789661858" },
  { receiptNumber: "SB-2026-00038", gasName: "Ahumuza Keith", csvMemberId: "SB-M-0029", csvName: "Ahumuza Keith", amount: 1e4, stripStaffEmail: "passionwork94@gmail.com", phone: "+256789661858" },
  { receiptNumber: "SB-2026-00039", gasName: "Joshua Byamugisha", csvMemberId: "SB-M-0113", csvName: "Byamugisha Joshua", amount: 1e4, stripStaffEmail: "nagabapassion@gmail.com", phone: "+256754250839" },
  { receiptNumber: "SB-2026-00040", gasName: "Natukunda Junior", csvMemberId: "SB-M-0214", csvName: "Natukunda Junior", amount: 5e4, stripStaffEmail: "passionwork94@gmail.com", phone: "+256760185879" },
  { receiptNumber: "SB-2026-00042", gasName: "Edward Mwanje", csvMemberId: "SB-M-0194", csvName: "Mwanje Edward", amount: 1e4, stripStaffEmail: "nagabapassion@gmail.com", phone: "+256709116835" },
  { receiptNumber: "SB-2026-00043", gasName: "Lynnford Mutabazi", csvMemberId: "SB-M-0190", csvName: "Mutabazi Lynnford", amount: 15e3, stripStaffEmail: "nagabapassion@gmail.com", phone: "+256776944825" },
  { receiptNumber: "SB-2026-00045", gasName: "Shukulu Bizimana", csvMemberId: "SB-M-0249", csvName: "Shukulu Bizimana", amount: 2e4, realEmail: "bizimanashukulu@gmail.com", phone: "+256771601701" },
  { receiptNumber: "SB-2026-00049", gasName: "Brian Muhwezi", csvMemberId: "SB-M-0175", csvName: "Muhwezi Brian", amount: 1e4, stripStaffEmail: "nagabapassion@gmail.com", phone: "+256791440828" },
  { receiptNumber: "SB-2026-00054", gasName: "Ariho Jeremiah Rino", csvMemberId: "SB-M-0071", csvName: "Ariho Rino Jeremiah", amount: 5e3, stripStaffEmail: "nagabapassion@gmail.com", phone: "+256700442386" },
  { receiptNumber: "SB-2026-00055", gasName: "Jonathan Naijuka", csvMemberId: "SB-M-0203", csvName: "Naijuka Jonathan", amount: 3e4, stripStaffEmail: "nagabapassion@gmail.com", phone: "+256704208050" },
  { receiptNumber: "SB-2026-00056", gasName: "Gen Enoth", csvMemberId: "SB-M-0121", csvName: "Enoth", amount: 25e3, phone: "+256704047900" },
  { receiptNumber: "SB-2026-00057", gasName: "Isaiah Anyine", csvMemberId: "SB-M-0068", csvName: "Anyine Isaiah", amount: 1e4, phone: "+256771254454" },
  { receiptNumber: "SB-2026-00063", gasName: "Jordan Taremwa", csvMemberId: "SB-M-0256", csvName: "Taremwa Jordan", amount: 3e4, phone: "+256765888558" }
];
var PRE_CSV_COVERED_RECEIPT_SET = new Set(
  PRE_CSV_COVERED_GAS_RECEIPTS.map((r) => r.receiptNumber.toUpperCase())
);
var UNRECORDED_LIVE_GAS_RECEIPTS = [
  { receiptNumber: "SB-2026-00011", gasName: "Anglin Ankunda", targetCanonicalName: "Anglin Ankunda", amount: 1e4, phone: "+256708257078", stripStaffEmail: "passionwork94@gmail.com" },
  { receiptNumber: "SB-2026-00034", gasName: "Malual Dut", targetCanonicalName: "Malual Dut", amount: 11e3, phone: "+256700000000" },
  { receiptNumber: "SB-2026-00058", gasName: "Armstrong Butaahobweishe", targetCanonicalName: "Armstrong Butaahobweishe", amount: 3e4, phone: "+256780184070", stripStaffEmail: "nagabapassion@gmail.com" },
  { receiptNumber: "SB-2026-00059", gasName: "Grace Mpora", targetCsvMemberId: "SB-M-0171", targetCanonicalName: "Mpora Grace", amount: 2e4, phone: "+256794037123", stripStaffEmail: "nagabapassion@gmail.com" },
  { receiptNumber: "SB-2026-00061", gasName: "Ahumuza Martha Joy", targetCsvMemberId: "SB-M-0162", targetCanonicalName: "Martha Joy", amount: 3e4, phone: "+256768145339" },
  { receiptNumber: "SB-2026-00062", gasName: "Mwesigwa Alvin", targetCsvMemberId: "SB-M-0057", targetCanonicalName: "Alvin Mwesigwa", amount: 25e3, phone: "+256782410956" },
  { receiptNumber: "SB-2026-00064", gasName: "Atukunda Blessed Pearl", targetCanonicalName: "Atukunda Blessed Pearl", amount: 3e4, phone: "+256791342030" },
  { receiptNumber: "SB-2026-00065", gasName: "Manzi Gloire", targetCsvMemberId: "SB-M-0157", targetCanonicalName: "Manzi Gloire", amount: 4e5, phone: "+256703643759" }
];
var PAYER_NAME_ALIASES = {
  "atweta ben": "atweeta ben",
  "tandeka geofrey": "tandeka geoffrey",
  "brason": "ahamya brason",
  "shadrack asiimwe": "asiimwe shadrack",
  "reagan lutakome": "lutakome reagan",
  "julian kekihembo": "kekihembo julian",
  "danson tugumisirize": "tugume danson",
  "eriya mushaija": "mushaija elia",
  "muhumuza namanya kalibala": "namanya kalibala",
  "andrew ainomugisha": "ainomugisha andrew",
  "joshua byamugisha": "byamugisha joshua",
  "edward mwanje": "mwanje edward",
  "lynnford mutabazi": "mutabazi lynnford",
  "brian muhwezi": "muhwezi brian",
  "ariho jeremiah rino": "ariho rino jeremiah",
  "jonathan naijuka": "naijuka jonathan",
  "gen enoth": "enoth",
  "isaiah anyine": "anyine isaiah",
  "jordan taremwa": "taremwa jordan",
  "grace mpora": "mpora grace",
  "ahumuza martha joy": "martha joy",
  "mwesigwa alvin": "alvin mwesigwa"
};
function resolveCanonicalMemberNameKey(rawName) {
  const norm = normalizePersonName(rawName);
  return PAYER_NAME_ALIASES[norm] || norm;
}
function normalizeTimeStr(rawTime) {
  const clean2 = String(rawTime || "").trim();
  const match = clean2.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return "00:00:00";
  const hh = match[1].padStart(2, "0");
  const mm = match[2].padStart(2, "0");
  const ss = (match[3] || "00").padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
function getTransactionSortTimestampMs(tx) {
  const dateStr = String(tx?.date || "").trim();
  const createdStr = String(tx?.createdAt || "").trim();
  if (createdStr) {
    const parsedCreated = Date.parse(createdStr);
    if (!Number.isNaN(parsedCreated)) {
      if (!dateStr) return parsedCreated;
      const createdDateUtc = new Date(parsedCreated).toISOString().slice(0, 10);
      const nominalDayMs = Date.parse(`${dateStr}T12:00:00Z`);
      const createdDayMs = Date.parse(`${createdDateUtc}T12:00:00Z`);
      if (!Number.isNaN(nominalDayMs) && Math.abs(createdDayMs - nominalDayMs) <= 3 * 864e5) {
        return parsedCreated;
      }
      return parsedCreated;
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const timeStr = normalizeTimeStr(tx?.time);
    const parsedLocal = Date.parse(`${dateStr}T${timeStr}Z`);
    if (!Number.isNaN(parsedLocal)) return parsedLocal;
    const parsedDateOnly = Date.parse(`${dateStr}T00:00:00Z`);
    if (!Number.isNaN(parsedDateOnly)) return parsedDateOnly;
  }
  return Date.now();
}
function compareTransactions(a, b, order = "desc") {
  const tsA = getTransactionSortTimestampMs(a);
  const tsB = getTransactionSortTimestampMs(b);
  if (tsA !== tsB) {
    return order === "asc" ? tsA - tsB : tsB - tsA;
  }
  const dtA = `${String(a?.date || "").trim()} ${normalizeTimeStr(a?.time)}`;
  const dtB = `${String(b?.date || "").trim()} ${normalizeTimeStr(b?.time)}`;
  if (dtA !== dtB) {
    return order === "asc" ? dtA.localeCompare(dtB) : dtB.localeCompare(dtA);
  }
  const recA = String(a?.receiptNumber || "");
  const recB = String(b?.receiptNumber || "");
  return order === "asc" ? recA.localeCompare(recB) : recB.localeCompare(recA);
}

// src/utils/memberImport.ts
var NTARE_SCHOOL = "Ntare School";
var BWERANYAGYI_SCHOOL = "Bweranyagyi Girls' Secondary School";
var HOUSE_OPTIONS = [
  "Africa House",
  "Aggrey House",
  "Bangizi Jed",
  "Crichton House",
  "Golden House",
  "Kamugungunu",
  "Mbaguta House",
  "New House",
  "Nile House",
  "Pearl House",
  "Pioneer House"
];
function isHouseEligibleSchool(school) {
  const clean2 = String(school || "").trim().toLowerCase().replace(/[\u2018\u2019`]/g, "'");
  if (!clean2) return false;
  return clean2 === "ntare school" || clean2 === "ntare" || clean2 === "bweranyagyi girls' secondary school" || clean2 === "bweranyagyi girls secondary school" || clean2 === "bweranyagyi";
}
function normalizeMemberGender(raw) {
  const clean2 = String(raw || "").trim().toLowerCase();
  if (clean2 === "male" || clean2 === "m") return "Male";
  if (clean2 === "female" || clean2 === "f") return "Female";
  return "";
}
function normalizeMemberSchool(rawSchool, rawOtherSchool) {
  const clean2 = String(rawSchool || "").trim().replace(/[\u2018\u2019`]/g, "'");
  if (!clean2) return "";
  const lower = clean2.toLowerCase();
  if (/^\d[\d,.\s]*$/.test(clean2) || /^(ugx|shs)?\s*[\d,.\s]+$/i.test(clean2) || lower === "supporter" || lower === "incomplete" || lower === "complete" || lower === "pending target" || lower === "paid" || lower === "partial" || lower === "overdue") {
    return "";
  }
  if (lower === "ntare school" || lower === "ntare") {
    return NTARE_SCHOOL;
  }
  if (lower === "bweranyagyi girls' secondary school" || lower === "bweranyagyi girls secondary school" || lower === "bweranyagyi") {
    return BWERANYAGYI_SCHOOL;
  }
  if (lower === "other") {
    const otherClean = String(rawOtherSchool || "").trim().slice(0, 120);
    return /^\d[\d,.\s]*$/.test(otherClean) ? "" : otherClean;
  }
  return clean2.slice(0, 120);
}
function normalizeMemberHouse(rawHouse, resolvedSchool) {
  if (!isHouseEligibleSchool(resolvedSchool)) {
    return "";
  }
  const clean2 = String(rawHouse || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!clean2) return "";
  const exactMatch = HOUSE_OPTIONS.find((opt) => opt.toLowerCase() === clean2);
  if (exactMatch) return exactMatch;
  const normalizedNoSuffix = clean2.replace(/\s+house$/i, "").trim();
  const aliasMatch = HOUSE_OPTIONS.find((opt) => {
    const optLower = opt.toLowerCase();
    const optNoSuffix = optLower.replace(/\s+house$/i, "").trim();
    return optNoSuffix === normalizedNoSuffix || optLower === "bangizi jed" && normalizedNoSuffix === "bangizi";
  });
  return aliasMatch || "";
}
function parseUgxAmount(raw) {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
  }
  const str = String(raw || "").trim();
  if (!str || str === "\u2014" || str === "-" || str === "--") return 0;
  const numeric = str.replace(/[^0-9.-]/g, "");
  const parsed = Number(numeric);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}
function parseRfc4180Csv(csvText) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const text = csvText.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field.trim());
      field = "";
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\n") {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell !== ""));
}
var MALE_STANDARD_TARGET_UGX = 5e4;
var FEMALE_STANDARD_TARGET_UGX = 3e4;
function getStandardTargetForGender(gender) {
  const clean2 = normalizeMemberGender(gender);
  if (clean2 === "Male") return MALE_STANDARD_TARGET_UGX;
  if (clean2 === "Female") return FEMALE_STANDARD_TARGET_UGX;
  return 0;
}
function resolveMemberExpectedTarget(rawTarget, gender, prevGender) {
  const cleanGender = normalizeMemberGender(gender);
  if (!cleanGender) {
    return 0;
  }
  const standard = getStandardTargetForGender(cleanGender);
  const num = rawTarget !== void 0 && rawTarget !== null && rawTarget !== "" ? Number(rawTarget) : NaN;
  if (prevGender !== void 0) {
    const cleanPrev = normalizeMemberGender(prevGender);
    if (cleanGender !== cleanPrev) {
      const prevStandard = getStandardTargetForGender(cleanPrev);
      if (!Number.isFinite(num) || num <= 0 || num === 1e5 || num === prevStandard) {
        return standard;
      }
      return Math.max(0, num);
    }
  }
  if (!Number.isFinite(num) || num <= 0 || num === 1e5) {
    return standard;
  }
  return Math.max(0, num);
}
function computeDuesStatus(totalPaid, targetUgx) {
  if (targetUgx <= 0) return "Pending Target";
  if (totalPaid >= targetUgx) return "Paid";
  if (totalPaid > 0) return "Partial";
  return "Overdue";
}
function isMemberProfileComplete(member) {
  const name = String(member.name || "").trim();
  const phone = cleanPhoneNumber(member.phone || "");
  const address = String(member.address || "").trim();
  const hasValidEmail = !isStaffOrPlaceholderEmail(member.email, name);
  return name.length >= 2 && hasValidEmail && phone.length >= 7 && address.length >= 2;
}
function makeMemberId(index) {
  return `SB-M-${String(index).padStart(4, "0")}`;
}
function parseTreasuryMembersCsv(csvText, options) {
  const defaultTargetUgx = Math.max(0, Number(options?.defaultTargetUgx ?? 0));
  const sourceRef = options?.sourceReference || "0771254454 - Barigye Samson";
  const rows = parseRfc4180Csv(csvText);
  if (rows.length === 0) {
    return {
      members: [],
      historicalTransactions: [],
      summary: {
        memberCount: 0,
        preNllSum: 0,
        spotSum: 0,
        paidAfterSum: 0,
        totalSum: 0,
        reportedGrandTotal: 0,
        reconciliationAdjustmentSum: 0,
        skippedRows: 0,
        warnings: ["CSV file is empty."]
      }
    };
  }
  let headerRowIdx = -1;
  let colMap = {
    index: -1,
    name: -1,
    preNll: -1,
    spot: -1,
    paidAfter: -1,
    totalPaid: -1,
    phone: -1,
    email: -1,
    address: -1,
    gender: -1,
    school: -1,
    house: -1
  };
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const normalized = rows[i].map((c) => c.replace(/\s+/g, " ").trim().toUpperCase());
    const nameIdx = normalized.findIndex((c) => c === "NAME" || c === "FULL NAME" || c === "MEMBER NAME");
    if (nameIdx !== -1) {
      headerRowIdx = i;
      colMap.index = normalized.findIndex((c) => c === "#" || c === "NO" || c === "ID");
      colMap.name = nameIdx;
      colMap.preNll = normalized.findIndex((c) => c.includes("PRE-NLL") || c.includes("PRE NLL"));
      colMap.spot = normalized.findIndex((c) => c.includes("SPOT PAID") || c === "SPOT");
      colMap.paidAfter = normalized.findIndex((c) => c.includes("PAID AFTER"));
      colMap.totalPaid = normalized.findIndex((c) => c.includes("TOTAL PAID") || c === "TOTAL");
      colMap.phone = normalized.findIndex((c) => c.includes("PHONE") || c.includes("WHATSAPP") || c.includes("TEL"));
      colMap.email = normalized.findIndex((c) => c.includes("EMAIL"));
      colMap.address = normalized.findIndex((c) => c.includes("ADDRESS") || c.includes("RESIDENCE") || c.includes("LOCATION"));
      colMap.gender = normalized.findIndex((c) => c === "GENDER" || c === "SEX");
      colMap.school = normalized.findIndex((c) => c.includes("SCHOOL"));
      colMap.house = normalized.findIndex((c) => c === "HOUSE" || c.includes("DORMITORY"));
      break;
    }
  }
  if (headerRowIdx === -1) {
    return {
      members: [],
      historicalTransactions: [],
      summary: {
        memberCount: 0,
        preNllSum: 0,
        spotSum: 0,
        paidAfterSum: 0,
        totalSum: 0,
        reportedGrandTotal: 0,
        reconciliationAdjustmentSum: 0,
        skippedRows: rows.length,
        warnings: ["Could not find a header row containing a NAME column."]
      }
    };
  }
  const members = [];
  const historicalTransactions2 = [];
  const warnings = [];
  let preNllSum = 0;
  let spotSum = 0;
  let paidAfterSum = 0;
  let totalSum = 0;
  let reportedGrandTotal = 0;
  let reconciliationAdjustmentSum = 0;
  let skippedRows = 0;
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const rawIndex = colMap.index >= 0 ? String(row[colMap.index] || "").trim() : "";
    const rawName = colMap.name >= 0 ? String(row[colMap.name] || "").trim() : "";
    const upperIndex = rawIndex.toUpperCase();
    const upperName = rawName.toUpperCase();
    if (upperIndex.includes("GRAND TOTAL") || upperName.includes("GRAND TOTAL") || upperIndex === "TOTAL" || upperName === "TOTAL") {
      if (colMap.totalPaid >= 0) {
        reportedGrandTotal = parseUgxAmount(row[colMap.totalPaid]);
      }
      skippedRows++;
      continue;
    }
    if (!rawName) {
      skippedRows++;
      continue;
    }
    const preNll = colMap.preNll >= 0 ? parseUgxAmount(row[colMap.preNll]) : 0;
    const spot = colMap.spot >= 0 ? parseUgxAmount(row[colMap.spot]) : 0;
    const paidAfter = colMap.paidAfter >= 0 ? parseUgxAmount(row[colMap.paidAfter]) : 0;
    const rawTotal = colMap.totalPaid >= 0 ? parseUgxAmount(row[colMap.totalPaid]) : 0;
    const componentSum = preNll + spot + paidAfter;
    const effectiveTotal = rawTotal > 0 ? rawTotal : componentSum;
    const memberSeq = members.length + 1;
    const memberId = makeMemberId(memberSeq);
    const phone = colMap.phone >= 0 ? cleanPhoneNumber(row[colMap.phone]) : "";
    const rawEmail = colMap.email >= 0 ? String(row[colMap.email] || "").trim().toLowerCase() : "";
    const email = isStaffOrPlaceholderEmail(rawEmail, rawName) ? "" : rawEmail;
    const address = colMap.address >= 0 ? String(row[colMap.address] || "").trim() : "";
    const gender = colMap.gender >= 0 ? normalizeMemberGender(row[colMap.gender]) : "";
    const school = colMap.school >= 0 ? normalizeMemberSchool(row[colMap.school]) : "";
    const house = colMap.house >= 0 ? normalizeMemberHouse(row[colMap.house], school) : "";
    const profileComplete = isMemberProfileComplete({ name: rawName, email, phone, address });
    const rowTargetUgx = gender ? getStandardTargetForGender(gender) : defaultTargetUgx;
    const remainingUgx = rowTargetUgx > 0 ? Math.max(0, rowTargetUgx - effectiveTotal) : 0;
    const member = {
      id: memberId,
      memberId,
      name: rawName,
      phone,
      email,
      address,
      gender,
      school,
      house,
      preNllPaid: preNll,
      spotPaid: spot,
      paidAfter,
      historicalPaid: effectiveTotal,
      livePaid: 0,
      totalContributed: effectiveTotal,
      expectedTargetUgx: rowTargetUgx,
      remainingUgx,
      duesStatus: computeDuesStatus(effectiveTotal, rowTargetUgx),
      profileStatus: profileComplete ? "COMPLETE" : "INCOMPLETE",
      paymentCount: (preNll > 0 ? 1 : 0) + (spot > 0 ? 1 : 0) + (paidAfter > 0 ? 1 : 0),
      lastPaymentDate: paidAfter > 0 ? "2026-09-15" : spot > 0 ? "2026-08-01" : preNll > 0 ? "2026-06-01" : "",
      lastPurpose: paidAfter > 0 ? "Mission NLL XVII \u2014 Paid After" : spot > 0 ? "Mission NLL XVII \u2014 Spot Paid" : preNll > 0 ? "Mission NLL XVII \u2014 Pre-NLL" : "Mission NLL XVII",
      source: "CSV_IMPORT",
      createdAt: nowIso,
      updatedAt: nowIso
    };
    members.push(member);
    preNllSum += preNll;
    spotSum += spot;
    paidAfterSum += paidAfter;
    totalSum += effectiveTotal;
    const baseReceiptSlug = `HIST-NLL17-${String(memberSeq).padStart(4, "0")}`;
    const addHistTx = (suffix, amount, date, purpose, notes) => {
      if (amount <= 0) return;
      const receiptNumber = `${baseReceiptSlug}-${suffix}`;
      historicalTransactions2.push({
        receiptNumber,
        transactionId: receiptNumber,
        memberId,
        type: "INFLOW",
        date,
        time: "12:00:00",
        payerName: rawName,
        phone,
        email,
        amount,
        paymentPurpose: purpose,
        paymentMethod: "Mobile Money",
        paymentReference: sourceRef,
        notes,
        generatedBy: "Treasury Historical Import",
        operatorEmail: "nagabapassion@gmail.com",
        paymentStatus: "COMPLETED",
        emailStatus: email ? "SKIPPED" : "NOT_PROVIDED",
        syncStatus: "PENDING",
        createdAt: `${date}T12:00:00.000Z`
      });
    };
    addHistTx("PRE", preNll, "2026-06-01", "Mission NLL XVII \u2014 Pre-NLL", `Historical treasury import (#${rawIndex || memberSeq})`);
    addHistTx("SPOT", spot, "2026-08-01", "Mission NLL XVII \u2014 Spot Paid", `NLL Ph1 Wks 1-6 + Ph2 Wks 1-3 (#${rawIndex || memberSeq})`);
    addHistTx("AFTER", paidAfter, "2026-09-15", "Mission NLL XVII \u2014 Paid After", `Post-NLL collection (#${rawIndex || memberSeq})`);
    if (effectiveTotal !== componentSum) {
      const diff = effectiveTotal - componentSum;
      if (diff > 0) {
        reconciliationAdjustmentSum += diff;
        addHistTx(
          "ADJ",
          diff,
          "2026-09-20",
          "Mission NLL XVII \u2014 Treasury Adjustment",
          `Reconciled difference between reported row total (${effectiveTotal.toLocaleString()}) and phase columns (${componentSum.toLocaleString()})`
        );
      } else {
        warnings.push(
          `Row "${rawName}": phase columns sum (${componentSum.toLocaleString()}) exceeded row Total Paid (${effectiveTotal.toLocaleString()}).`
        );
      }
    }
  }
  return {
    members,
    historicalTransactions: historicalTransactions2,
    summary: {
      memberCount: members.length,
      preNllSum,
      spotSum,
      paidAfterSum,
      totalSum,
      reportedGrandTotal,
      reconciliationAdjustmentSum,
      skippedRows,
      warnings
    }
  };
}
function csvEscapeSafe(value) {
  let str = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// lib/backend/store.ts
var SYSTEM_OWNER_EMAIL = "nagabapassion@gmail.com";
var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var DEFAULT_SETTINGS = {
  organizationName: "SC Basimbuzi",
  organizationEmail: "info@scbasimbuzi.org",
  organizationPhone: "+256 700 123456",
  organizationAddress: "Lugogo Bypass, Kampala, Uganda",
  receiptPrefix: "SB",
  receiptFooter: "Thank you for your payment and support towards SC Basimbuzi.",
  logoUrl: "/logo.png",
  paymentCategories: [
    "Membership",
    "Contribution",
    "Event",
    "Registration",
    "Fundraising",
    "Merchandise",
    "Tournament Fee",
    "Other"
  ],
  expenseCategories: [
    "Pitch Hire & Facilities",
    "Match Day & Referees",
    "Equipment & Kits",
    "Transport & Logistics",
    "Player Refreshments & Meals",
    "Medical & First Aid",
    "Administration & Utilities",
    "Tournament Entry Fee",
    "Other Expenses"
  ],
  paymentMethods: ["Mobile Money", "Bank Transfer", "Cash", "Other"],
  currency: "UGX",
  customDomain: "",
  legacySpreadsheetId: ""
};
var getSettings = async () => {
  const { data } = await getDb().from("settings").select("data").eq("id", 1).maybeSingle();
  const stored = data && typeof data === "object" ? data : {};
  return { ...DEFAULT_SETTINGS, ...stored };
};
var saveSettings = async (patch, operatorEmail) => {
  const current = await getSettings();
  const updated = {
    ...current,
    ...patch,
    organizationPhone: patch.organizationPhone !== void 0 ? String(patch.organizationPhone).trim() : current.organizationPhone || "",
    logoUrl: patch.logoUrl && String(patch.logoUrl).trim() ? patch.logoUrl : current.logoUrl || "/logo.png",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedBy: operatorEmail
  };
  const { error } = await getDb().from("settings").upsert(
    { id: 1, data: updated, updated_at: (/* @__PURE__ */ new Date()).toISOString(), updated_by: operatorEmail },
    { onConflict: "id" }
  );
  if (error) throw new Error(error.message);
  return updated;
};
var getPublicOrgProfile = async () => {
  const settings = await getSettings();
  return {
    organizationName: String(settings.organizationName || "SC Basimbuzi").trim(),
    organizationEmail: String(settings.organizationEmail || "info@scbasimbuzi.org").trim(),
    organizationPhone: String(settings.organizationPhone || "+256703643759").trim(),
    organizationAddress: String(settings.organizationAddress || "Kampala, Uganda").trim(),
    logoUrl: sanitizeMediaUrl(settings.logoUrl, "/logo.png")
  };
};
var nowDateStr = (d = /* @__PURE__ */ new Date()) => d.toISOString().slice(0, 10);
var nowTimeStr = (d = /* @__PURE__ */ new Date()) => d.toISOString().slice(11, 19);
var logAudit = async (entry) => {
  try {
    await getDb().from("audit_log").insert({
      date: nowDateStr(),
      time: nowTimeStr(),
      user_name: entry.user || "System",
      user_email: entry.userEmail || "",
      action: entry.action,
      receipt_number: entry.receiptNumber || null,
      transaction_id: entry.transactionId || null,
      description: entry.description || ""
    });
  } catch {
  }
};
var getStaffEmailsList = async () => {
  const { data } = await getDb().from("app_users").select("email");
  return (data || []).map((u) => String(u?.email || "").trim().toLowerCase()).filter(Boolean);
};
var getStaffOwnersMap = async () => {
  const { data } = await getDb().from("app_users").select("email, name");
  const map = {};
  for (const u of data || []) {
    const em = String(u?.email || "").trim().toLowerCase();
    const nm = String(u?.name || "").trim();
    if (em && nm) map[em] = nm;
  }
  return map;
};
var isPlaceholderMemberEmail = async (email, payerName) => {
  const clean2 = String(email || "").trim().toLowerCase();
  if (!clean2) return true;
  const { data: memberHit } = await getDb().from("members").select("id").ilike("email", clean2).limit(1).maybeSingle();
  if (memberHit) return false;
  const [staffEmails, staffOwners] = await Promise.all([
    getStaffEmailsList(),
    getStaffOwnersMap()
  ]);
  return isStaffOrPlaceholderEmail(clean2, payerName, staffEmails, staffOwners);
};
var memberRowToMember = (row) => ({
  id: String(row.id || ""),
  memberId: String(row.member_id || row.id || ""),
  name: String(row.name || ""),
  phone: String(row.phone || ""),
  email: String(row.email || ""),
  address: String(row.address || ""),
  gender: String(row.gender || ""),
  school: String(row.school || ""),
  house: String(row.house || ""),
  preNllPaid: Number(row.pre_nll_paid) || 0,
  spotPaid: Number(row.spot_paid) || 0,
  paidAfter: Number(row.paid_after) || 0,
  historicalPaid: Number(row.historical_paid) || 0,
  livePaid: Number(row.live_paid) || 0,
  expectedTargetUgx: Number(row.expected_target_ugx) || 0,
  paymentCount: Number(row.payment_count) || 0,
  lastPaymentDate: String(row.last_payment_date || ""),
  lastPurpose: String(row.last_purpose || ""),
  source: String(row.source || ""),
  claim_token: String(row.claim_token || ""),
  claim_token_expires_at: row.claim_token_expires_at || null,
  createdAt: String(row.created_at || ""),
  updatedAt: String(row.updated_at || "")
});
var sanitizeMemberForClient = (m) => {
  const preNllPaid = Math.max(0, Number(m.preNllPaid) || 0);
  const spotPaid = Math.max(0, Number(m.spotPaid) || 0);
  const paidAfter = Math.max(0, Number(m.paidAfter) || 0);
  const historicalPaid = Math.max(0, Number(m.historicalPaid ?? m.totalContributed) || 0);
  const livePaid = Math.max(0, Number(m.livePaid) || 0);
  const totalContributed = historicalPaid + livePaid;
  const cleanGender = normalizeMemberGender(m.gender);
  const expectedTargetUgx = resolveMemberExpectedTarget(m.expectedTargetUgx, cleanGender);
  const remainingUgx = expectedTargetUgx > 0 ? Math.max(0, expectedTargetUgx - totalContributed) : 0;
  const cleanSchool = normalizeMemberSchool(m.school);
  const cleanHouse = normalizeMemberHouse(m.house, cleanSchool);
  const claimExpires = m.claim_token_expires_at ? Date.parse(String(m.claim_token_expires_at)) : Number(m.claimTokenExpiresAt) || 0;
  return {
    id: String(m.id || m.memberId || ""),
    memberId: String(m.memberId || m.id || ""),
    name: String(m.name || "").trim(),
    phone: cleanPhoneNumber(m.phone || ""),
    email: String(m.email || "").trim().toLowerCase(),
    address: String(m.address || "").trim(),
    gender: cleanGender,
    school: cleanSchool,
    house: cleanHouse,
    preNllPaid,
    spotPaid,
    paidAfter,
    historicalPaid,
    livePaid,
    totalContributed,
    expectedTargetUgx,
    remainingUgx,
    duesStatus: computeDuesStatus(totalContributed, expectedTargetUgx),
    profileStatus: isMemberProfileComplete(m) ? "COMPLETE" : "INCOMPLETE",
    paymentCount: Number(m.paymentCount) || 0,
    lastPaymentDate: String(m.lastPaymentDate || ""),
    lastPurpose: String(m.lastPurpose || ""),
    source: m.source || "CSV_IMPORT",
    hasActiveClaimLink: Boolean(m.claim_token || m.claimTokenHash) && claimExpires > Date.now(),
    claimLinkExpiresAt: claimExpires > 0 ? new Date(claimExpires).toISOString() : void 0,
    createdAt: String(m.createdAt || ""),
    updatedAt: String(m.updatedAt || "")
  };
};
var computeMemberTotals = (m) => {
  const historicalPaid = Math.max(0, Number(m.historicalPaid ?? m.historical_paid ?? m.totalContributed) || 0);
  const livePaid = Math.max(0, Number(m.livePaid ?? m.live_paid) || 0);
  const gender = normalizeMemberGender(m.gender ?? m.gender);
  const target = resolveMemberExpectedTarget(m.expectedTargetUgx ?? m.expected_target_ugx, gender);
  const total = historicalPaid + livePaid;
  return {
    historicalPaid,
    livePaid,
    totalContributed: total,
    expectedTargetUgx: target,
    remainingUgx: target > 0 ? Math.max(0, target - total) : 0,
    duesStatus: computeDuesStatus(total, target),
    profileStatus: isMemberProfileComplete(m) ? "COMPLETE" : "INCOMPLETE"
  };
};
var buildReconciliationSummary = (counters) => {
  const coveredList = PRE_CSV_COVERED_GAS_RECEIPTS.map((r) => r.receiptNumber.toUpperCase());
  return {
    coveredReceiptNumbers: coveredList,
    coveredReceiptCount: coveredList.length,
    coveredAmountUgx: PRE_CSV_COVERED_GAS_RECEIPTS.reduce((s, r) => s + r.amount, 0),
    unrecordedReceipts: UNRECORDED_LIVE_GAS_RECEIPTS.map((r) => ({
      receiptNumber: r.receiptNumber,
      gasName: r.gasName,
      canonicalName: r.targetCanonicalName,
      amount: r.amount
    })),
    unrecordedLiveCount: UNRECORDED_LIVE_GAS_RECEIPTS.length,
    unrecordedAmountUgx: UNRECORDED_LIVE_GAS_RECEIPTS.reduce((s, r) => s + r.amount, 0),
    staffEmailsStripped: counters.staffEmailsStripped,
    realEmailsRecovered: counters.realEmailsRecovered,
    phonesRecovered: counters.phonesRecovered,
    reconciledAt: (/* @__PURE__ */ new Date()).toISOString()
  };
};
var coveredReceiptSet = () => new Set(PRE_CSV_COVERED_RECEIPT_SET);
var nextReceiptNumber = async (scope) => {
  const { data, error } = await getDb().rpc("next_receipt_number", { p_scope: scope });
  if (error || !data) throw new Error(error?.message || "Receipt numbering failed");
  return String(data);
};
var PAYMENT_STATUSES = /* @__PURE__ */ new Set(["COMPLETED", "PENDING", "REFUNDED", "CANCELLED"]);
var sanitizeIncomingTx = async (body) => {
  const rawType = String(body.type || "INFLOW").toUpperCase();
  const type = rawType === "OUTFLOW" ? "OUTFLOW" : "INFLOW";
  const amount = Math.max(0, Number(body.amount) || 0);
  const payerName = String(
    (type === "OUTFLOW" ? body.payee || body.payerName : body.payerName) || ""
  ).trim().slice(0, 120);
  const rawEmail = String(body.email || "").trim().toLowerCase().slice(0, 120);
  const email = rawEmail && !await isPlaceholderMemberEmail(rawEmail, payerName) ? rawEmail : "";
  const phone = cleanPhoneNumber(String(body.phone || "").trim().slice(0, 30));
  const rawStatus = String(body.paymentStatus || "COMPLETED").toUpperCase();
  const paymentStatus = PAYMENT_STATUSES.has(rawStatus) ? rawStatus : "COMPLETED";
  const now = /* @__PURE__ */ new Date();
  return {
    type,
    date: nowDateStr(now),
    time: nowTimeStr(now),
    payer_name: payerName,
    payee: type === "OUTFLOW" ? String(body.payee || payerName || "").trim().slice(0, 120) : null,
    category: type === "OUTFLOW" ? String(body.category || "").trim().slice(0, 80) || null : null,
    voucher_number: type === "OUTFLOW" ? String(body.paymentReference || "").trim().slice(0, 60) || null : null,
    approved_by: type === "OUTFLOW" ? String(body.approvedBy || "").trim().slice(0, 120) || null : null,
    phone,
    email,
    amount,
    payment_purpose: String(body.paymentPurpose || "").trim().slice(0, 120),
    payment_method: String(body.paymentMethod || "").trim().slice(0, 60),
    payment_reference: String(body.paymentReference || "").trim().slice(0, 120),
    notes: String(body.notes || "").trim().slice(0, 500),
    generated_by: String(body.operatorName || "").trim().slice(0, 120),
    operator_email: String(body.operatorEmail || "").trim().toLowerCase(),
    payment_status: paymentStatus,
    email_status: email ? "PENDING" : "NOT_PROVIDED",
    member_id: body.memberId ? String(body.memberId).trim() : null
  };
};
var SAFE_RASTER_DATA_IMAGE_REGEX = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;
var sanitizeMediaUrl = (raw, fallback) => {
  const val = String(raw || "").trim();
  if (!val) return fallback;
  if (val.startsWith("preset:")) return val.slice(0, 40);
  if (SAFE_RASTER_DATA_IMAGE_REGEX.test(val) && val.length <= 12e5) {
    return val;
  }
  if (val.startsWith("/") && !val.startsWith("//")) return val.slice(0, 300);
  try {
    const parsed = new URL(val);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString().slice(0, 500);
    }
  } catch {
    return fallback;
  }
  return fallback;
};

// lib/backend/map.ts
var iso = (value) => {
  if (!value) return "";
  const str = String(value);
  return str;
};
var mapTxRow = (row) => ({
  receiptNumber: String(row.receipt_number || ""),
  transactionId: row.transaction_id ? String(row.transaction_id) : void 0,
  memberId: row.member_id ? String(row.member_id) : void 0,
  type: String(row.type || "INFLOW"),
  date: String(row.date || ""),
  time: String(row.time || ""),
  payerName: String(row.payer_name || ""),
  payee: row.payee ? String(row.payee) : void 0,
  category: row.category ? String(row.category) : void 0,
  voucherNumber: row.voucher_number ? String(row.voucher_number) : void 0,
  approvedBy: row.approved_by ? String(row.approved_by) : void 0,
  phone: String(row.phone || ""),
  email: String(row.email || ""),
  amount: Number(row.amount) || 0,
  paymentPurpose: String(row.payment_purpose || ""),
  paymentMethod: String(row.payment_method || ""),
  paymentReference: String(row.payment_reference || ""),
  notes: String(row.notes || ""),
  generatedBy: String(row.generated_by || ""),
  operatorEmail: String(row.operator_email || ""),
  paymentStatus: String(row.payment_status || "COMPLETED"),
  emailStatus: String(row.email_status || "NOT_PROVIDED"),
  syncStatus: row.sync_status ? String(row.sync_status) : void 0,
  createdAt: iso(row.created_at)
});
var mapUserRow = (row) => {
  const role = String(row.role || "ISSUER").toUpperCase();
  const rawPermissions = row.permissions && typeof row.permissions === "object" ? row.permissions : null;
  return {
    id: row.id ? String(row.id) : void 0,
    name: String(row.name || ""),
    email: String(row.email || "").toLowerCase(),
    role,
    status: String(row.status || "ACTIVE").toUpperCase(),
    permissions: resolveUserPermissions(role, rawPermissions),
    createdAt: iso(row.created_at) || (/* @__PURE__ */ new Date()).toISOString()
  };
};
var mapSubmissionRow = (row) => ({
  id: String(row.id || ""),
  memberId: String(row.member_id || ""),
  memberName: String(row.member_name || ""),
  submittedName: String(row.submitted_name || ""),
  submittedEmail: String(row.submitted_email || ""),
  submittedPhone: String(row.submitted_phone || ""),
  submittedAddress: String(row.submitted_address || ""),
  submittedGender: row.submitted_gender || "",
  submittedSchool: row.submitted_school ? String(row.submitted_school) : void 0,
  submittedHouse: row.submitted_house ? String(row.submitted_house) : void 0,
  preNllPaid: Number(row.pre_nll_paid) || 0,
  spotPaid: Number(row.spot_paid) || 0,
  paidAfter: Number(row.paid_after) || 0,
  totalPaid: Number(row.total_paid) || 0,
  submittedAt: iso(row.submitted_at),
  status: String(row.status || "PENDING"),
  reviewedBy: row.reviewed_by ? String(row.reviewed_by) : void 0,
  reviewedAt: row.reviewed_at ? iso(row.reviewed_at) : void 0,
  reviewNotes: row.review_notes ? String(row.review_notes) : void 0
});
var mapAuditRow = (row) => ({
  id: row.id !== void 0 && row.id !== null ? String(row.id) : void 0,
  date: String(row.date || ""),
  time: String(row.time || ""),
  user: String(row.user_name || ""),
  userEmail: String(row.user_email || ""),
  action: String(row.action || "SYSTEM_INITIALIZE"),
  receiptNumber: row.receipt_number ? String(row.receipt_number) : void 0,
  transactionId: row.transaction_id ? String(row.transaction_id) : void 0,
  description: String(row.description || "")
});
var mapInquiryRow = (row) => ({
  id: String(row.id || ""),
  fullName: String(row.full_name || ""),
  phone: String(row.phone || ""),
  email: String(row.email || ""),
  interest: String(row.interest || "General"),
  message: String(row.message || ""),
  createdAt: iso(row.created_at),
  status: String(row.status || "NEW")
});

// lib/backend/types.ts
var getParam = (ctx, ...keys) => {
  for (const key of keys) {
    const value = ctx.params[key];
    if (value !== void 0 && value !== null && String(value).length > 0) return String(value);
  }
  return "";
};
var ok = (body, headers) => ({
  status: 200,
  body,
  headers
});
var fail = (status, body) => ({ status, body });
var errorResult = (err) => ({
  status: 500,
  body: { success: false, error: err instanceof Error ? err.message : String(err) }
});

// lib/backend/handlers/auth.ts
var EMAIL_REGEX2 = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var loadUserRow = async (email) => {
  const { data, error } = await getDb().from("app_users").select("id, name, email, role, status, permissions, created_at").eq("email", email).maybeSingle();
  if (error) throw new Error(`Profile lookup failed: ${error.message}`);
  return data || null;
};
var provisionProfile = async (email, authUserId) => {
  const isSystemOwner = email === SYSTEM_OWNER_EMAIL;
  const match = await findAuthUserByEmail(email);
  const id = match?.id || authUserId || import_crypto2.default.randomUUID();
  const insert = {
    id,
    email,
    name: isSystemOwner ? "Passion" : email.split("@")[0],
    role: isSystemOwner ? "OWNER" : "ISSUER",
    status: "ACTIVE",
    permissions: null,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const { data, error } = await getDb().from("app_users").upsert(insert, { onConflict: "email" }).select().single();
  if (error) throw new Error(`Profile provisioning failed: ${error.message}`);
  return data;
};
var findAuthUserByEmail = async (email) => {
  const cleanEmail = String(email || "").trim().toLowerCase();
  let page = 1;
  for (; page <= 5; page++) {
    const { data } = await getDb().auth.admin.listUsers({ page, perPage: 200 });
    const users = data?.users || [];
    const match = users.find(
      (u) => String(u?.email || "").trim().toLowerCase() === cleanEmail
    );
    if (match) return match;
    if (users.length < 200) break;
  }
  return null;
};
var login = async (ctx) => {
  try {
    const { email, password } = ctx.body || {};
    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return fail(400, {
        success: false,
        authorized: false,
        message: "Please provide both your registered email address and password."
      });
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    const { data: authData, error: authError } = await getAuthVerifier().auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPassword
    });
    const userRow = await loadUserRow(cleanEmail);
    if (authError || !authData?.session) {
      if (!userRow) {
        return fail(401, {
          success: false,
          authorized: false,
          message: "No account registered with this email. Please contact the administrator (nagabapassion@gmail.com)."
        });
      }
      return fail(401, {
        success: false,
        authorized: false,
        message: "Incorrect password. Please verify and try again."
      });
    }
    const profile = userRow || await provisionProfile(cleanEmail, authData?.user?.id);
    if (!profile) {
      return fail(500, { success: false, authorized: false, message: "Server authentication error" });
    }
    if (String(profile.status || "").toUpperCase() !== "ACTIVE") {
      return fail(403, {
        success: false,
        authorized: false,
        message: "This staff account has been set to INACTIVE. Please contact the administrator."
      });
    }
    const user = mapUserRow(profile);
    const token = signToken({
      sub: cleanEmail,
      name: user.name,
      role: user.role,
      kind: "staff",
      exp: Date.now() + 12 * 60 * 60 * 1e3
    });
    await logAudit({
      user: user.name,
      userEmail: user.email,
      action: "LOGIN",
      description: `${user.name} signed in with a password.`
    });
    return ok({ success: true, authorized: true, user, token });
  } catch (err) {
    return errorResult(err);
  }
};
var sendOtp = async (ctx) => {
  try {
    const cleanEmail = String(ctx.body?.email || "").trim().toLowerCase();
    if (!EMAIL_REGEX2.test(cleanEmail)) {
      return fail(400, {
        success: false,
        error: "Please enter a valid staff email address."
      });
    }
    const userRow = await loadUserRow(cleanEmail);
    if (!userRow) {
      return fail(403, {
        success: false,
        error: "No account registered with this email. Please contact the administrator (nagabapassion@gmail.com)."
      });
    }
    if (String(userRow.status || "").toUpperCase() !== "ACTIVE") {
      return fail(403, {
        success: false,
        error: "This staff account has been set to INACTIVE. Please contact the administrator."
      });
    }
    const issued = await issueOtp(cleanEmail, "STAFF_LOGIN");
    if (!issued.ok) {
      return fail(429, {
        success: false,
        error: `Please wait ${issued.waitSeconds ?? 30}s before requesting another sign-in code.`
      });
    }
    await logAudit({
      user: String(userRow.name || cleanEmail.split("@")[0]),
      userEmail: cleanEmail,
      action: "LOGIN_OTP_SENT",
      description: `OTP sign-in code issued for ${cleanEmail}.`
    });
    return ok({
      success: true,
      data: { email: cleanEmail, code: issued.code },
      devCode: issued.code,
      message: `A 6-digit verification code has been sent to ${cleanEmail}. Check your Inbox \u2014 if you do not see it within 1 minute, check your Spam or Promotions folder and mark it "Not spam".`
    });
  } catch (err) {
    return errorResult(err);
  }
};
var verifyOtpHandler = async (ctx) => {
  try {
    const cleanEmail = String(ctx.body?.email || "").trim().toLowerCase();
    const cleanCode = String(ctx.body?.code || "").trim();
    if (!EMAIL_REGEX2.test(cleanEmail) || !/^\d{6}$/.test(cleanCode)) {
      return fail(400, {
        success: false,
        authorized: false,
        error: "Enter your registered email address and 6-digit sign-in code."
      });
    }
    const result = await verifyOtp(cleanEmail, "STAFF_LOGIN", cleanCode);
    if (result.ok === false) {
      const messages = {
        NO_ACTIVE: { status: 401, message: "No active sign-in code found. Request a new code to continue." },
        EXPIRED: { status: 401, message: "That sign-in code has expired. Please request a new code." },
        TOO_MANY: { status: 429, message: "Too many incorrect attempts. Please request a fresh sign-in code." },
        INCORRECT: { status: 401, message: "Incorrect 6-digit code. Please check your inbox and try again." }
      };
      const m = messages[result.reason];
      return fail(m.status, { success: false, authorized: false, error: m.message });
    }
    const userRow = await loadUserRow(cleanEmail);
    if (!userRow) {
      return fail(401, {
        success: false,
        authorized: false,
        message: "No account registered with this email. Please contact the administrator (nagabapassion@gmail.com)."
      });
    }
    if (String(userRow.status || "").toUpperCase() !== "ACTIVE") {
      return fail(403, {
        success: false,
        authorized: false,
        message: "This staff account has been set to INACTIVE. Please contact the administrator."
      });
    }
    const user = mapUserRow(userRow);
    const token = signToken({
      sub: cleanEmail,
      name: user.name,
      role: user.role,
      kind: "staff",
      exp: Date.now() + 12 * 60 * 60 * 1e3
    });
    await logAudit({
      user: user.name,
      userEmail: user.email,
      action: "LOGIN",
      description: `${user.name} signed in with an email OTP code.`
    });
    return ok({ success: true, authorized: true, user, token });
  } catch (err) {
    return errorResult(err);
  }
};
var check = async (ctx) => {
  try {
    const cleanEmail = String(ctx.body?.email || "").trim().toLowerCase();
    if (!cleanEmail) {
      return fail(400, { success: false, authorized: false });
    }
    const token = getBearer(ctx.headers);
    const payload = token ? verifyToken(token) : null;
    if (!payload || payload.kind !== "staff" || payload.sub.toLowerCase() !== cleanEmail) {
      return ok({
        success: true,
        authorized: false,
        message: "Session expired. Please sign in again."
      });
    }
    const userRow = await loadUserRow(cleanEmail);
    if (!userRow) {
      return ok({
        success: true,
        authorized: false,
        message: "Session expired. Please sign in again."
      });
    }
    if (String(userRow.status || "").toUpperCase() !== "ACTIVE") {
      return ok({
        success: true,
        authorized: false,
        message: "This staff account has been set to INACTIVE. Please contact the administrator."
      });
    }
    return ok({
      success: true,
      authorized: true,
      user: mapUserRow(userRow)
    });
  } catch (err) {
    return errorResult(err);
  }
};

// lib/backend/handlers/users.ts
var import_crypto3 = __toESM(require("crypto"));
var ALLOWED_ROLES = /* @__PURE__ */ new Set(["OWNER", "ADMIN", "ISSUER", "MEDIA"]);
var ALLOWED_STATUSES = /* @__PURE__ */ new Set(["ACTIVE", "INACTIVE"]);
var sanitizeUser = (u) => {
  if (!u || typeof u !== "object") return null;
  const email = String(u.email || "").trim().toLowerCase();
  if (!EMAIL_REGEX.test(email) || email.length > 100) return null;
  const name = String(u.name || email.split("@")[0]).trim().slice(0, 100);
  let role = String(u.role || "ADMIN").trim().toUpperCase();
  if (!ALLOWED_ROLES.has(role)) role = "ADMIN";
  if (email === SYSTEM_OWNER_EMAIL) role = "OWNER";
  let status = String(u.status || "ACTIVE").trim().toUpperCase();
  if (!ALLOWED_STATUSES.has(status)) status = "ACTIVE";
  if (email === SYSTEM_OWNER_EMAIL) status = "ACTIVE";
  const password = u.password !== void 0 ? String(u.password).trim() : void 0;
  const permissions = u.permissions && typeof u.permissions === "object" ? u.permissions : null;
  return { name, email, role, status, password, permissions, createdAt: u.createdAt };
};
var upsertAuthUserWithPassword = async (email, password) => {
  const existing = await findAuthUserByEmail(email);
  if (existing) {
    const { error: error2 } = await getDb().auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true
    });
    if (error2) throw new Error(error2.message);
    return { id: existing.id, created: false };
  }
  const { data, error } = await getDb().auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (error || !data?.user) throw new Error(error?.message || "Could not create staff auth user");
  return { id: data.user.id, created: true };
};
var listUsers = async (ctx) => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const { data, error } = await getDb().from("app_users").select("id, name, email, role, status, permissions, created_at").order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ok({ success: true, data: (data || []).map(mapUserRow) });
  } catch (err) {
    return errorResult(err);
  }
};
var upsertUsers = async (ctx) => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const operator = auth.user;
    if (!(operator.role === "OWNER" || operator.permissions.canManageUsers)) {
      return fail(403, {
        success: false,
        error: "ACCESS DENIED: Managing staff accounts requires the canManageUsers permission."
      });
    }
    const incoming = Array.isArray(ctx.body?.users) ? ctx.body.users : ctx.body?.user ? [ctx.body.user] : [];
    if (incoming.length === 0) {
      return fail(400, { success: false, error: "Invalid user payload" });
    }
    if (incoming.length > 50) {
      return fail(400, { success: false, error: "Exceeded maximum permitted users (50)" });
    }
    const { data: existingRows } = await getDb().from("app_users").select("id, email, role, status, created_at");
    const existingByEmail = /* @__PURE__ */ new Map();
    for (const row of existingRows || []) {
      existingByEmail.set(String(row.email || "").toLowerCase(), row);
    }
    const saved = [];
    for (const raw of incoming) {
      const sanitized = sanitizeUser(raw);
      if (!sanitized) {
        return fail(400, { success: false, error: "Invalid user payload" });
      }
      const existing = existingByEmail.get(sanitized.email);
      let authUserId = existing?.id;
      if (sanitized.password) {
        const res = await upsertAuthUserWithPassword(sanitized.email, sanitized.password);
        authUserId = res.id;
      } else if (!authUserId) {
        const res = await upsertAuthUserWithPassword(
          sanitized.email,
          import_crypto3.default.randomBytes(24).toString("base64url")
        );
        authUserId = res.id;
      }
      const prevRole = String(existing?.role || "").toUpperCase();
      let role = sanitized.role;
      let status = sanitized.status;
      if (existing && prevRole === "OWNER") {
        role = "OWNER";
        status = "ACTIVE";
      }
      const row = {
        id: authUserId,
        email: sanitized.email,
        name: sanitized.name,
        role,
        status,
        permissions: sanitized.permissions,
        created_at: existing?.created_at || sanitized.createdAt || (/* @__PURE__ */ new Date()).toISOString()
      };
      const { data, error } = await getDb().from("app_users").upsert(row, { onConflict: "email" }).select().single();
      if (error) throw new Error(error.message);
      saved.push(mapUserRow(data));
      await logAudit({
        user: operator.name,
        userEmail: operator.email,
        action: existing ? "EDIT_USER" : "ADD_ADMIN",
        description: `${operator.name} ${existing ? "updated" : "added"} staff account ${sanitized.email} (${role}/${status}).`
      });
    }
    return ok({ success: true, data: Array.isArray(ctx.body?.users) ? saved : saved[0] });
  } catch (err) {
    return errorResult(err);
  }
};
var patchUserStatus = async (ctx) => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const operator = auth.user;
    if (!(operator.role === "OWNER" || operator.permissions.canManageUsers)) {
      return fail(403, {
        success: false,
        error: "ACCESS DENIED: Managing staff accounts requires the canManageUsers permission."
      });
    }
    const email = String(ctx.body?.email || "").trim().toLowerCase();
    const status = String(ctx.body?.status || "").trim().toUpperCase();
    if (!email || !ALLOWED_STATUSES.has(status)) {
      return fail(400, { success: false, error: "Email and a valid status are required." });
    }
    const { data: row } = await getDb().from("app_users").select("id, email, role, status").eq("email", email).maybeSingle();
    if (!row) {
      return fail(404, { success: false, error: "User not found" });
    }
    if (String(row.role || "").toUpperCase() === "OWNER" && status !== "ACTIVE") {
      return fail(403, { success: false, error: "The system owner account cannot be deactivated." });
    }
    const { error } = await getDb().from("app_users").update({ status }).eq("email", email);
    if (error) throw new Error(error.message);
    await logAudit({
      user: operator.name,
      userEmail: operator.email,
      action: status === "ACTIVE" ? "ACTIVATE_ADMIN" : "DEACTIVATE_ADMIN",
      description: `${operator.name} set ${email} to ${status}.`
    });
    return ok({ success: true });
  } catch (err) {
    return errorResult(err);
  }
};
var deleteUser = async (ctx) => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const operator = auth.user;
    if (!(operator.role === "OWNER" || operator.permissions.canManageUsers)) {
      return fail(403, {
        success: false,
        error: "ACCESS DENIED: Managing staff accounts requires the canManageUsers permission."
      });
    }
    const email = String(ctx.query.email || "").trim().toLowerCase();
    if (!email) {
      return fail(400, { success: false, error: "Email query parameter is required." });
    }
    const { data: row } = await getDb().from("app_users").select("id, email, role, name").eq("email", email).maybeSingle();
    if (!row) {
      return fail(404, { success: false, error: "User not found" });
    }
    if (String(row.role || "").toUpperCase() === "OWNER") {
      return fail(403, { success: false, error: "The system owner account cannot be deleted." });
    }
    const { error } = await getDb().from("app_users").delete().eq("email", email);
    if (error) throw new Error(error.message);
    if (row.id) {
      const { error: authErr } = await getDb().auth.admin.deleteUser(String(row.id));
      if (authErr) {
        await logAudit({
          user: operator.name,
          userEmail: operator.email,
          action: "REMOVE_ADMIN",
          description: `${operator.name} removed ${email} from app_users but the auth user delete failed: ${authErr.message}`
        });
      }
    }
    await logAudit({
      user: operator.name,
      userEmail: operator.email,
      action: "REMOVE_ADMIN",
      description: `${operator.name} removed staff account ${email}.`
    });
    return ok({ success: true });
  } catch (err) {
    return errorResult(err);
  }
};
var setUserPassword = async (ctx) => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const operator = auth.user;
    const email = String(ctx.body?.email || "").trim().toLowerCase();
    const password = ctx.body?.password !== void 0 ? String(ctx.body.password).trim() : "";
    if (!email || !password) {
      return fail(400, { success: false, error: "Email and password are required" });
    }
    if (password.length < 4) {
      return fail(400, { success: false, error: "Password must be at least 4 characters" });
    }
    const isSelf = operator.email === email;
    if (!(operator.role === "OWNER" || operator.permissions.canManageUsers || isSelf)) {
      return fail(403, {
        success: false,
        error: "ACCESS DENIED: You can only change your own password."
      });
    }
    const { id } = await upsertAuthUserWithPassword(email, password);
    const { data: existingRow } = await getDb().from("app_users").select("created_at, role").eq("email", email).maybeSingle();
    if (!existingRow) {
      await getDb().from("app_users").upsert(
        {
          id,
          email,
          name: email.split("@")[0],
          role: email === SYSTEM_OWNER_EMAIL ? "OWNER" : "ADMIN",
          status: "ACTIVE",
          permissions: null,
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        },
        { onConflict: "email" }
      );
    }
    await logAudit({
      user: operator.name,
      userEmail: operator.email,
      action: "EDIT_PERMISSIONS",
      description: `${operator.name} updated the password for ${email}${isSelf ? " (self)" : ""}.`
    });
    const { data: userRow } = await getDb().from("app_users").select("id, name, email, role, status, permissions, created_at").eq("email", email).maybeSingle();
    return ok({
      success: true,
      message: "Password updated successfully",
      user: userRow ? mapUserRow(userRow) : void 0
    });
  } catch (err) {
    return errorResult(err);
  }
};

// lib/backend/handlers/transactions.ts
var import_crypto4 = __toESM(require("crypto"));
var canIssue = (user) => user.role === "OWNER" || user.role === "ADMIN" || user.role === "ISSUER" || user.permissions.canIssueReceipts;
var canDelete = (user) => user.role === "OWNER" || user.permissions.canDeleteTransactions;
var fetchAllTxRows = async () => {
  const { data, error } = await getDb().from("transactions").select("*").order("created_at", { ascending: false }).limit(2e4);
  if (error) throw new Error(error.message);
  return data || [];
};
var sanitizeTxForClient = async (row) => {
  const tx = mapTxRow(row);
  if (tx.email && await isPlaceholderMemberEmail(tx.email, tx.payerName)) {
    tx.email = "";
    tx.emailStatus = "NOT_PROVIDED";
  }
  return tx;
};
var historicalTransactions = async (ctx) => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    void ctx.headers["x-operator-email"];
    const rows = await fetchAllTxRows();
    const list = [];
    for (const row of rows) {
      list.push(await sanitizeTxForClient(row));
    }
    list.sort((a, b) => compareTransactions(a, b, "desc"));
    return ok({
      success: true,
      data: list,
      coveredGasReceipts: []
      // all rows now live centrally — nothing is double-covered
    });
  } catch (err) {
    return errorResult(err);
  }
};
var createTransaction = async (ctx) => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const user = auth.user;
    if (!canIssue(user)) {
      return fail(403, {
        success: false,
        error: "ACCESS DENIED: Receipt issuing requires the canIssueReceipts permission."
      });
    }
    const body = ctx.body || {};
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return fail(400, { success: false, error: "Please provide a valid payment amount." });
    }
    const type = String(body.type || "INFLOW").toUpperCase() === "OUTFLOW" ? "OUTFLOW" : "INFLOW";
    const name = String((type === "OUTFLOW" ? body.payee || body.payerName : body.payerName) || "").trim();
    if (name.length < 2) {
      return fail(400, {
        success: false,
        error: type === "OUTFLOW" ? "Payee name is required." : "Payer name is required."
      });
    }
    const row = await sanitizeIncomingTx({
      ...body,
      type,
      operatorEmail: user.email,
      // token identity wins; body operatorEmail is logging-only
      operatorName: String(body.operatorName || user.name || "").trim()
    });
    const settings = await getSettings();
    const year = nowDateStr().slice(0, 4);
    const prefix = String(settings.receiptPrefix || "SB").trim().toUpperCase() || "SB";
    const scope = type === "OUTFLOW" ? `EXP-${year}` : `${prefix}-${year}`;
    const insertRow = {
      receipt_number: await nextReceiptNumber(scope),
      transaction_id: import_crypto4.default.randomUUID(),
      ...row
    };
    let inserted;
    const first = await getDb().from("transactions").insert(insertRow).select().single();
    if (first.error && first.error.code === "23505") {
      insertRow.receipt_number = await nextReceiptNumber(scope);
      const retry = await getDb().from("transactions").insert({ ...insertRow, receipt_number: insertRow.receipt_number }).select().single();
      if (retry.error) throw new Error(retry.error.message);
      inserted = retry.data;
    } else if (first.error) {
      throw new Error(first.error.message);
    } else {
      inserted = first.data;
    }
    const tx = mapTxRow(inserted);
    await logAudit({
      user: user.name,
      userEmail: user.email,
      action: type === "OUTFLOW" ? "OUTFLOW_CREATED" : "INFLOW_CREATED",
      receiptNumber: tx.receiptNumber,
      transactionId: tx.transactionId,
      description: type === "OUTFLOW" ? `${user.name} recorded expense voucher ${tx.receiptNumber} of ${tx.amount.toLocaleString()} UGX to ${tx.payerName}.` : `${user.name} generated receipt ${tx.receiptNumber} for ${tx.payerName} (${tx.amount.toLocaleString()} UGX).`
    });
    return ok({
      success: true,
      data: tx,
      message: type === "OUTFLOW" ? `Expense voucher ${tx.receiptNumber} recorded successfully.` : `Receipt ${tx.receiptNumber} generated successfully.`
    });
  } catch (err) {
    return errorResult(err);
  }
};
var deleteTransaction = async (ctx) => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const user = auth.user;
    if (!canDelete(user)) {
      return fail(403, {
        success: false,
        error: "Permission denied. Cannot delete transactions."
      });
    }
    const receipt = getParam(ctx, "receiptNumber", "receipt").trim().toUpperCase();
    if (!receipt) {
      return fail(400, { success: false, error: "Receipt number is required." });
    }
    const deleted = await getDb().from("transactions").delete().eq("receipt_number", receipt).select().single();
    if (deleted.error || !deleted.data) {
      return fail(404, { success: false, error: `Receipt ${receipt} not found.` });
    }
    await logAudit({
      user: user.name,
      userEmail: user.email,
      action: "DELETE_TRANSACTION",
      receiptNumber: receipt,
      description: `${user.name} deleted transaction ${receipt}.`
    });
    return ok({ success: true, message: `Receipt ${receipt} deleted.` });
  } catch (err) {
    return errorResult(err);
  }
};
var resendReceipt = async (ctx) => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const user = auth.user;
    const receipt = getParam(ctx, "receiptNumber", "receipt").trim().toUpperCase();
    const { data: row, error } = await getDb().from("transactions").select("*").eq("receipt_number", receipt).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) {
      return fail(404, { success: false, error: `Receipt ${receipt} not found.` });
    }
    const tx = await sanitizeTxForClient(row);
    if (!tx.email) {
      return fail(400, {
        success: false,
        error: "No email address was provided on this receipt. Share it on WhatsApp instead."
      });
    }
    const { data: updated, error: updateErr } = await getDb().from("transactions").update({ email_status: "PENDING" }).eq("receipt_number", receipt).select().single();
    if (updateErr) throw new Error(updateErr.message);
    await logAudit({
      user: user.name,
      userEmail: user.email,
      action: "RESEND_RECEIPT",
      receiptNumber: receipt,
      description: `${user.name} queued email re-delivery for receipt ${receipt}.`
    });
    return ok({
      success: true,
      data: mapTxRow(updated),
      message: `Email delivery is queued \u2014 Brevo integration pending. Receipt ${receipt} is ready to share on WhatsApp.`
    });
  } catch (err) {
    return errorResult(err);
  }
};

// lib/backend/handlers/misc.ts
var health = async (_ctx) => {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  if (!isBackendConfigured()) {
    return ok({
      success: true,
      status: "unconfigured",
      message: "The function is running, but the database environment variables are NOT set. In Vercel \u2192 your project \u2192 Settings \u2192 Environment Variables, add SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SESSION_SECRET, then Deployments \u2192 Redeploy.",
      timestamp
    });
  }
  const url = process.env.SUPABASE_URL || "";
  const projectRef = (url.replace(/^https?:\/\//, "").split(".")[0] || "").slice(0, 30);
  const db2 = getDb();
  const checks = { projectRef };
  const failures = [];
  const PROBE_TIMEOUT_MS = 3e3;
  const withTimeout = (p, ms) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no response within ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    );
  });
  const probe = (name, work) => (async () => {
    try {
      await withTimeout(work(), PROBE_TIMEOUT_MS);
      checks[name] = "ok";
    } catch (err) {
      checks[name] = err instanceof Error ? err.message : String(err);
      failures.push(name);
    }
  })();
  await Promise.all([
    probe("table_settings", async () => {
      const { error } = await db2.from("settings").select("id").limit(1);
      if (error) throw new Error(error.message);
    }),
    probe("table_app_users", async () => {
      const { error, count } = await db2.from("app_users").select("id", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      checks.appUsersCount = count ?? null;
      const { data: owner, error: ownerErr } = await db2.from("app_users").select("email, role, status").eq("email", "nagabapassion@gmail.com").maybeSingle();
      if (ownerErr) throw new Error(ownerErr.message);
      checks.ownerProfile = owner ? `${owner.role}/${owner.status}` : "MISSING (owner row not in app_users)";
    }),
    probe("table_members", async () => {
      const { error, count } = await db2.from("members").select("id", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      checks.membersCount = count ?? null;
    }),
    probe("table_transactions", async () => {
      const { error, count } = await db2.from("transactions").select("receipt_number", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      checks.transactionsCount = count ?? null;
    }),
    probe("auth_service", async () => {
      const { data, error } = await db2.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (error) throw new Error(error.message);
      const emails = (data?.users || []).map(
        (u) => String(u.email || "").toLowerCase()
      );
      checks.authUsersCount = emails.length;
      checks.staffAccountsPresent = {
        "nagabapassion@gmail.com": emails.includes("nagabapassion@gmail.com"),
        "jotham.itungo@gmail.com": emails.includes("jotham.itungo@gmail.com"),
        "passionwork94@gmail.com": emails.includes("passionwork94@gmail.com"),
        "hildanamy7@gmail.com": emails.includes("hildanamy7@gmail.com")
      };
    })
  ]);
  return ok({
    success: true,
    status: failures.length === 0 ? "ok" : "unavailable",
    message: failures.length === 0 ? "Central database connected \u2014 all layers healthy." : `Failing layer(s): ${failures.join(", ")}. Details in "checks".`,
    checks,
    timestamp
  });
};
var bootstrap = async (ctx) => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const [settings, txRows, userRows, auditRows] = await Promise.all([
      getSettings(),
      getDb().from("transactions").select("*").limit(2e4),
      getDb().from("app_users").select("id, name, email, role, status, permissions, created_at").order("created_at", { ascending: true }),
      getDb().from("audit_log").select("*").order("id", { ascending: false }).limit(500)
    ]);
    const transactions = [];
    for (const row of txRows.data || []) {
      const tx = mapTxRow(row);
      if (tx.email && await isPlaceholderMemberEmail(tx.email, tx.payerName)) {
        tx.email = "";
        tx.emailStatus = "NOT_PROVIDED";
      }
      transactions.push(tx);
    }
    transactions.sort((a, b) => compareTransactions(a, b, "desc"));
    return ok({
      success: true,
      data: {
        settings,
        transactions,
        users: (userRows.data || []).map(mapUserRow),
        auditLogs: (auditRows.data || []).map(mapAuditRow)
      }
    });
  } catch (err) {
    return errorResult(err);
  }
};
var listAudit = async (ctx) => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const { data, error } = await getDb().from("audit_log").select("*").order("id", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return ok({ success: true, data: (data || []).map(mapAuditRow) });
  } catch (err) {
    return errorResult(err);
  }
};
var addAudit = async (ctx) => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const body = ctx.body || {};
    const userName = String(body.user?.name || auth.user.name || "System").trim().slice(0, 100);
    const userEmail = String(
      body.user?.email || auth.user.email || ""
    ).trim().toLowerCase().slice(0, 120);
    await logAudit({
      user: userName,
      userEmail,
      action: String(body.action || "SYSTEM_INITIALIZE").trim().slice(0, 60),
      receiptNumber: body.receiptNumber ? String(body.receiptNumber).slice(0, 60) : void 0,
      transactionId: body.transactionId ? String(body.transactionId).slice(0, 80) : void 0,
      description: String(body.description || "").slice(0, 500)
    });
    return ok({ success: true });
  } catch (err) {
    return errorResult(err);
  }
};
var exportLedgerCsv = async (ctx) => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const user = auth.user;
    if (!(user.role === "OWNER" || user.role === "ADMIN" || user.permissions.canViewReports)) {
      return fail(403, {
        success: false,
        error: "Unauthorized: Exporting the ledger requires the canViewReports permission."
      });
    }
    const { data, error } = await getDb().from("transactions").select("*").limit(2e4);
    if (error) throw new Error(error.message);
    const list = (data || []).map(mapTxRow).sort((a, b) => compareTransactions(a, b, "asc"));
    const header = [
      "Receipt",
      "Type",
      "Date",
      "Time",
      "Name",
      "Phone",
      "Email",
      "Category/Purpose",
      "Method",
      "Reference",
      "Amount UGX",
      "Status",
      "Generated By"
    ];
    const lines = [header.map(csvEscapeSafe).join(",")];
    for (const tx of list) {
      lines.push(
        [
          tx.receiptNumber,
          String(tx.type || "INFLOW"),
          tx.date,
          tx.time,
          tx.payerName,
          tx.phone,
          tx.email,
          tx.paymentPurpose || tx.category || "",
          tx.paymentMethod,
          tx.paymentReference,
          String(tx.amount),
          tx.paymentStatus,
          tx.generatedBy
        ].map(csvEscapeSafe).join(",")
      );
    }
    const csv = `\uFEFF${lines.join("\r\n")}`;
    return {
      status: 200,
      body: csv,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="sc-basimbuzi-ledger.csv"',
        "Cache-Control": "no-store"
      }
    };
  } catch (err) {
    return errorResult(err);
  }
};

// lib/backend/handlers/settings.ts
var getSettingsHandler = async (ctx) => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const settings = await getSettings();
    return ok({ success: true, data: settings });
  } catch (err) {
    return errorResult(err);
  }
};
var saveSettingsHandler = async (ctx) => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const user = auth.user;
    if (!(user.role === "OWNER" || user.permissions.canEditSettings)) {
      return fail(403, {
        success: false,
        error: "Unauthorized: Receipt Issuers cannot modify system settings without the canEditSettings permission."
      });
    }
    const settings = ctx.body?.settings;
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      return fail(400, { success: false, error: "Invalid settings payload" });
    }
    const updated = await saveSettings(settings, user.email);
    await logAudit({
      user: user.name,
      userEmail: user.email,
      action: "CHANGE_SETTINGS",
      description: `${user.name} updated shared system settings.`
    });
    return ok({ success: true, data: updated });
  } catch (err) {
    return errorResult(err);
  }
};
var getConfig = async (_ctx) => {
  return ok({ success: true, data: { gasUrl: "" } });
};
var postConfig = async (_ctx) => {
  return ok({ success: true });
};
var invalidateCache = async (_ctx) => {
  return ok({ success: true });
};

// lib/backend/handlers/publicSite.ts
var DEFAULT_PUBLIC_SITE = {
  heroHeadline: "Pride of the Community. Built on Unity and Football.",
  heroSubheadline: "Follow SC Basimbuzi matchday updates, club announcements, youth academy milestones, and official supporter membership across the season.",
  heroImageUrl: "/src/assets/images/hero_club_pitch_1795277918886.jpg",
  aboutTitle: "Rooted in Passion, Driven by Discipline",
  aboutText: "SC Basimbuzi brings together senior squad competition, structured youth development, and an active supporter membership network. Every contribution and matchday turnout helps sustain training operations, equipment, and community football outreach.",
  clubFoundedYear: "2019",
  homeGround: "Basimbuzi Community Ground",
  trainingSchedule: "Tue, Thu & Sat \xB7 4:00 PM EAT",
  membershipTargetLabel: "2026 Season Membership Contribution",
  membershipTargetUgx: 5e4,
  news: [
    {
      id: "news-1",
      title: "First Team Opens Home Campaign With Commanding 3-1 Victory",
      category: "Match Report",
      summary: "A disciplined second-half display and clinical counter-attacks sealed three vital points in front of a lively home crowd.",
      content: "SC Basimbuzi started the home fixture on the front foot, pressing high and controlling midfield possession from the opening whistle.\n\nAfter an even first thirty minutes, the breakthrough arrived from a sweeping wide move finished cleanly into the far corner. Two further goals after the interval put the result beyond doubt despite a late consolation from the visitors.\n\nHead Coach and technical staff praised the squad fitness and thanked supporters who turned out in full club colours.",
      coverImage: "/src/assets/images/news_matchday_action_1795277903178.jpg",
      author: "SC Basimbuzi Media Desk",
      publishedAt: "2026-11-15",
      featured: true,
      status: "PUBLISHED"
    },
    {
      id: "news-2",
      title: "Season Membership Registration & Youth Academy Intake Now Open",
      category: "Club Notice",
      summary: "Supporters and prospective academy players can now submit membership inquiries online ahead of the upcoming tournament cycle.",
      content: "The club executive committee invites returning members, new supporters, and youth prospects to register for the current season.\n\nRegistered members enjoy priority matchday updates, official digital receipts for all club contributions, and direct participation in annual club meetings and community initiatives.\n\nUse the Join Club section below to submit your contact details and our Membership Coordinator will follow up promptly.",
      coverImage: "/src/assets/images/news_community_supporters_1795277904224.jpg",
      author: "Club Secretariat",
      publishedAt: "2026-11-10",
      featured: false,
      status: "PUBLISHED"
    },
    {
      id: "news-3",
      title: "Weekend Community Cup Brings Together Local Youth Squads",
      category: "Community",
      summary: "Over 120 young players participated in Saturday morning clinics and exhibition matches hosted at Basimbuzi Community Ground.",
      content: "Our youth development coaches hosted an open community football morning aimed at identifying emerging talent and promoting sportsmanship.\n\nSupporters and parents gathered pitchside to cheer on the under-15 and under-17 exhibition fixtures, followed by a brief club briefing on upcoming fixtures and kit distribution.",
      coverImage: "/src/assets/images/news_matchday_action_1795277903178.jpg",
      author: "Academy Outreach",
      publishedAt: "2026-11-04",
      featured: false,
      status: "PUBLISHED"
    }
  ],
  fixtures: [
    {
      id: "fix-1",
      opponent: "Akachai FC",
      competition: "Ntare Lions League",
      date: "2026-11-28",
      time: "16:00",
      venue: "KPA",
      isHome: true,
      status: "UPCOMING"
    },
    {
      id: "fix-2",
      opponent: "TY Omujuma",
      competition: "NLL",
      date: "2026-12-05",
      time: "15:30",
      venue: "Home grounds",
      isHome: false,
      status: "UPCOMING"
    },
    {
      id: "fix-3",
      opponent: "Mpawa Lords",
      competition: "Friendlies",
      date: "2026-11-15",
      time: "16:00",
      venue: "Basimbuzi Community Ground",
      isHome: true,
      status: "COMPLETED",
      homeScore: 3,
      awayScore: 4,
      summary: "Strong second-half display with goals in the 38th, 61st, and 77th minutes."
    },
    {
      id: "fix-4",
      opponent: "Akachai FC",
      competition: "Friendlies",
      date: "2026-11-08",
      time: "16:00",
      venue: "KPA",
      isHome: false,
      status: "COMPLETED",
      homeScore: 0,
      awayScore: 5,
      summary: "Crucial away victory secured with an 84th-minute winner."
    }
  ],
  merch: [
    {
      id: "merch-1",
      name: "Official 2026 Preseason Jersey",
      priceUgx: 65e3,
      description: "Breathable royal blue matchday jersey with gold trim and woven SC Basimbuzi crest.",
      imageUrl: "/src/assets/images/merch_home_jersey_1795277903802.jpg",
      sizes: ["S", "M", "L", "XL", "XXL"],
      inStock: true
    }
  ]
};
var normalizeSiteShape = (parsed) => ({
  ...DEFAULT_PUBLIC_SITE,
  ...parsed,
  news: Array.isArray(parsed?.news) ? parsed.news : DEFAULT_PUBLIC_SITE.news,
  fixtures: Array.isArray(parsed?.fixtures) ? parsed.fixtures : DEFAULT_PUBLIC_SITE.fixtures,
  merch: Array.isArray(parsed?.merch) ? parsed.merch : DEFAULT_PUBLIC_SITE.merch
});
var loadSiteContent = async () => {
  const { data } = await getDb().from("site_content").select("content").eq("id", 1).maybeSingle();
  if (data?.content && typeof data.content === "object") {
    return normalizeSiteShape(data.content);
  }
  return { ...DEFAULT_PUBLIC_SITE };
};
var canManageWebsite = (user) => user.role === "OWNER" || user.role === "ADMIN" || user.role === "MEDIA" || user.permissions.canManageWebsite === true;
var EMAIL_REGEX3 = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var getPublicSite = async (ctx) => {
  try {
    let isAdminRequest = false;
    if (ctx.query.mode === "admin") {
      const auth = await requireStaff(ctx);
      isAdminRequest = auth.ok && canManageWebsite(auth.user);
    }
    const content = await loadSiteContent();
    const filteredNews = isAdminRequest ? content.news : content.news.filter((n) => n?.status === "PUBLISHED");
    return ok(
      {
        success: true,
        data: {
          content: { ...content, news: filteredNews },
          organization: await getPublicOrgProfile()
        }
      },
      { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" }
    );
  } catch (err) {
    return errorResult(err);
  }
};
var savePublicSite = async (ctx) => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const operator = auth.user;
    if (!canManageWebsite(operator)) {
      return fail(403, {
        success: false,
        error: "Unauthorized: Only active Owners, Admins, or Media Officers can update public club content."
      });
    }
    const incoming = ctx.body?.content;
    if (!incoming || typeof incoming !== "object") {
      return fail(400, { success: false, error: "Invalid website content payload" });
    }
    const allowedCategories = /* @__PURE__ */ new Set(["Match Report", "Club Notice", "Community", "Academy", "Transfer"]);
    const allowedFixtureStatus = /* @__PURE__ */ new Set(["UPCOMING", "COMPLETED", "POSTPONED"]);
    const sanitizedNews = Array.isArray(incoming.news) ? incoming.news.slice(0, 60).map((item, idx) => ({
      id: String(item?.id || `news-${Date.now()}-${idx}`).slice(0, 64),
      title: String(item?.title || "Club Update").trim().slice(0, 160),
      category: allowedCategories.has(item?.category) ? item.category : "Club Notice",
      summary: String(item?.summary || "").trim().slice(0, 400),
      content: String(item?.content || "").trim().slice(0, 8e3),
      coverImage: sanitizeMediaUrl(item?.coverImage, "preset:matchday"),
      author: String(item?.author || operator.name).trim().slice(0, 80),
      publishedAt: String(item?.publishedAt || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)).slice(0, 20),
      featured: Boolean(item?.featured),
      status: item?.status === "DRAFT" ? "DRAFT" : "PUBLISHED"
    })) : DEFAULT_PUBLIC_SITE.news;
    const sanitizedFixtures = Array.isArray(incoming.fixtures) ? incoming.fixtures.slice(0, 60).map((fix, idx) => ({
      id: String(fix?.id || `fix-${Date.now()}-${idx}`).slice(0, 64),
      opponent: String(fix?.opponent || "TBD").trim().slice(0, 100),
      competition: String(fix?.competition || "Club Friendly").trim().slice(0, 80),
      date: String(fix?.date || "").trim().slice(0, 20),
      time: String(fix?.time || "16:00").trim().slice(0, 20),
      venue: String(fix?.venue || "Basimbuzi Community Ground").trim().slice(0, 120),
      isHome: Boolean(fix?.isHome),
      status: allowedFixtureStatus.has(fix?.status) ? fix.status : "UPCOMING",
      homeScore: fix?.homeScore !== void 0 && fix?.homeScore !== "" ? Math.max(0, Number(fix.homeScore) || 0) : void 0,
      awayScore: fix?.awayScore !== void 0 && fix?.awayScore !== "" ? Math.max(0, Number(fix.awayScore) || 0) : void 0,
      summary: fix?.summary ? String(fix.summary).trim().slice(0, 400) : void 0
    })) : DEFAULT_PUBLIC_SITE.fixtures;
    const sanitizedMerch = Array.isArray(incoming.merch) ? incoming.merch.slice(0, 20).map((m, idx) => ({
      id: String(m?.id || `merch-${Date.now()}-${idx}`).slice(0, 64),
      name: String(m?.name || "Club Jersey").trim().slice(0, 100),
      priceUgx: Math.max(0, Number(m?.priceUgx) || 0),
      description: String(m?.description || "").trim().slice(0, 400),
      imageUrl: sanitizeMediaUrl(m?.imageUrl, "preset:jersey"),
      sizes: Array.isArray(m?.sizes) && m.sizes.length > 0 ? m.sizes.map((s) => String(s).trim().slice(0, 12)).filter(Boolean) : ["S", "M", "L", "XL"],
      inStock: m?.inStock !== false
    })) : DEFAULT_PUBLIC_SITE.merch;
    const sanitizedContent = {
      heroHeadline: String(incoming.heroHeadline || DEFAULT_PUBLIC_SITE.heroHeadline).trim().slice(0, 180),
      heroSubheadline: String(incoming.heroSubheadline || DEFAULT_PUBLIC_SITE.heroSubheadline).trim().slice(0, 450),
      heroImageUrl: sanitizeMediaUrl(incoming.heroImageUrl, "preset:hero"),
      aboutTitle: String(incoming.aboutTitle || DEFAULT_PUBLIC_SITE.aboutTitle).trim().slice(0, 160),
      aboutText: String(incoming.aboutText || DEFAULT_PUBLIC_SITE.aboutText).trim().slice(0, 2e3),
      clubFoundedYear: String(incoming.clubFoundedYear || "2019").trim().slice(0, 10),
      homeGround: String(incoming.homeGround || "Basimbuzi Community Ground").trim().slice(0, 120),
      trainingSchedule: String(incoming.trainingSchedule || "Tue, Thu & Sat \xB7 4:00 PM EAT").trim().slice(0, 120),
      membershipTargetLabel: String(incoming.membershipTargetLabel || "2026 Season Membership Contribution").trim().slice(0, 120),
      membershipTargetUgx: Math.max(0, Math.min(1e8, Number(incoming.membershipTargetUgx) || 0)),
      news: sanitizedNews,
      fixtures: sanitizedFixtures,
      merch: sanitizedMerch,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedBy: operator.email
    };
    const { error } = await getDb().from("site_content").upsert(
      {
        id: 1,
        content: sanitizedContent,
        updated_at: sanitizedContent.updatedAt,
        updated_by: operator.email
      },
      { onConflict: "id" }
    );
    if (error) throw new Error(error.message);
    await logAudit({
      user: operator.name,
      userEmail: operator.email,
      action: "CHANGE_SETTINGS",
      description: `${operator.name} updated the public club website content.`
    });
    return ok({ success: true, data: sanitizedContent });
  } catch (err) {
    return errorResult(err);
  }
};
var uploadImage = async (ctx) => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const operator = auth.user;
    if (!canManageWebsite(operator)) {
      return fail(403, {
        success: false,
        error: "Unauthorized: Only active Owners, Admins, or Media Officers can upload club images."
      });
    }
    const dataUrl = String(ctx.body?.dataUrl || "").trim();
    const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) {
      return fail(400, {
        success: false,
        error: "Please upload a valid PNG, JPG, WEBP, or GIF image."
      });
    }
    const rawExt = match[1].toLowerCase();
    const ext = rawExt === "jpeg" ? "jpg" : rawExt;
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
      return fail(400, {
        success: false,
        error: "Image must be smaller than 5 MB."
      });
    }
    const safeName = `club-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const { error: uploadErr } = await getDb().storage.from("site-media").upload(safeName, buffer, {
      contentType: `image/${rawExt === "svg" ? "png" : rawExt}`,
      upsert: false
    });
    if (uploadErr) throw new Error(uploadErr.message);
    const { data } = getDb().storage.from("site-media").getPublicUrl(safeName);
    return ok({ success: true, url: data?.publicUrl || "" });
  } catch (err) {
    return errorResult(err);
  }
};
var submitInquiry = async (ctx) => {
  try {
    const { fullName, phone, email, interest, message } = ctx.body || {};
    const cleanName = String(fullName || "").trim();
    const cleanPhone = String(phone || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanMessage = String(message || "").trim();
    const allowedInterests = /* @__PURE__ */ new Set(["Membership", "Academy", "Sponsorship", "Merchandise", "General"]);
    if (cleanName.length < 2 || cleanName.length > 100) {
      return fail(400, { success: false, error: "Please enter your full name." });
    }
    if (cleanPhone.length < 7 || cleanPhone.length > 25) {
      return fail(400, { success: false, error: "Please provide a valid phone or WhatsApp number." });
    }
    if (cleanEmail && !EMAIL_REGEX3.test(cleanEmail)) {
      return fail(400, { success: false, error: "Please provide a valid email address." });
    }
    const id = `inq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const row = {
      id,
      full_name: cleanName,
      phone: cleanPhone,
      email: cleanEmail,
      interest: allowedInterests.has(interest) ? interest : "Membership",
      message: cleanMessage.slice(0, 1e3),
      status: "NEW",
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const { data, error } = await getDb().from("inquiries").insert(row).select().single();
    if (error) throw new Error(error.message);
    return ok({ success: true, data: mapInquiryRow(data) });
  } catch (err) {
    return errorResult(err);
  }
};
var listInquiries = async (ctx) => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    if (!canManageWebsite(auth.user)) {
      return fail(403, { success: false, error: "Unauthorized" });
    }
    const { data, error } = await getDb().from("inquiries").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return ok({ success: true, data: (data || []).map(mapInquiryRow) });
  } catch (err) {
    return errorResult(err);
  }
};
var updateInquiryStatus = async (ctx) => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    if (!canManageWebsite(auth.user)) {
      return fail(403, { success: false, error: "Unauthorized" });
    }
    const targetId = getParam(ctx, "id").trim();
    const nextStatus = ctx.body?.status === "CONTACTED" ? "CONTACTED" : "NEW";
    const { data, error } = await getDb().from("inquiries").update({ status: nextStatus }).eq("id", targetId).select().single();
    if (error || !data) {
      return fail(404, { success: false, error: "Inquiry not found" });
    }
    return ok({ success: true, data: mapInquiryRow(data) });
  } catch (err) {
    return errorResult(err);
  }
};

// lib/backend/handlers/members.ts
var import_crypto5 = __toESM(require("crypto"));
var canEditMembers = (user) => user.role === "OWNER" || user.permissions.canEditMembers === true;
var requireMemberEditor = async (ctx, deniedMessage) => {
  const auth = await requireStaff(ctx);
  if (auth.ok === false) return auth;
  if (!canEditMembers(auth.user)) {
    return {
      ok: false,
      response: fail(403, { success: false, error: deniedMessage })
    };
  }
  return auth;
};
var loadMemberRows = async () => {
  const { data, error } = await getDb().from("members").select("*").order("created_at", { ascending: false }).limit(2e4);
  if (error) throw new Error(error.message);
  return data || [];
};
var loadTxRows = async () => {
  const { data, error } = await getDb().from("transactions").select("*").limit(2e4);
  if (error) throw new Error(error.message);
  return data || [];
};
var loadSubmissionRows = async () => {
  const { data, error } = await getDb().from("member_submissions").select("*").order("submitted_at", { ascending: false }).limit(5e3);
  if (error) throw new Error(error.message);
  return data || [];
};
var histBucketFor = (rows) => {
  const map = /* @__PURE__ */ new Map();
  for (const tx of rows) {
    const mId = String(tx?.member_id || "").trim();
    const recNo = String(tx?.receipt_number || "").trim().toUpperCase();
    if (!mId || !recNo.startsWith("HIST-")) continue;
    const amt = Math.max(0, Number(tx?.amount) || 0);
    if (!map.has(mId)) map.set(mId, { pre: 0, spot: 0, after: 0, total: 0 });
    const bucket = map.get(mId);
    bucket.total += amt;
    if (recNo.endsWith("-PRE")) bucket.pre += amt;
    else if (recNo.endsWith("-SPOT")) bucket.spot += amt;
    else if (recNo.endsWith("-AFTER") || recNo.endsWith("-ADJ")) bucket.after += amt;
  }
  return map;
};
var reconciliationCounters = (members, txRows) => {
  let staffEmailsStripped = 0;
  for (const tx of txRows) {
    const em = String(tx?.email || "").trim().toLowerCase();
    if (em && isStaffOrPlaceholderEmail(em, tx?.payer_name)) staffEmailsStripped++;
  }
  const realEmails = new Set(
    PRE_CSV_COVERED_GAS_RECEIPTS.map((r) => String(r.realEmail || "").toLowerCase()).filter(Boolean)
  );
  const recoveredPhones = new Set(
    [
      ...PRE_CSV_COVERED_GAS_RECEIPTS.map((r) => r.phone),
      ...UNRECORDED_LIVE_GAS_RECEIPTS.map((r) => r.phone)
    ].filter(Boolean).map((p) => cleanPhoneNumber(p))
  );
  let realEmailsRecovered = 0;
  let phonesRecovered = 0;
  for (const m of members) {
    const em = String(m.email || "").toLowerCase();
    if (em && realEmails.has(em)) realEmailsRecovered++;
    const ph = cleanPhoneNumber(m.phone || "");
    if (ph && recoveredPhones.has(ph)) phonesRecovered++;
  }
  return { staffEmailsStripped, realEmailsRecovered, phonesRecovered };
};
var recomputeMembersFromLedger = async () => {
  const [memberRows, txRows] = await Promise.all([loadMemberRows(), loadTxRows()]);
  const members = memberRows.map(memberRowToMember);
  const histByMember = histBucketFor(txRows);
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const updates = [];
  for (const m of members) {
    const bucket = histByMember.get(String(m.id));
    if (!bucket) continue;
    const livePaid = Math.max(0, Number(m.livePaid) || 0);
    const historicalPaid = bucket.total;
    const totalContributed = historicalPaid + livePaid;
    const target = resolveMemberExpectedTarget(m.expectedTargetUgx, normalizeMemberGender(m.gender));
    const remaining = target > 0 ? Math.max(0, target - totalContributed) : 0;
    updates.push({
      id: String(m.id),
      pre_nll_paid: bucket.pre,
      spot_paid: bucket.spot,
      paid_after: bucket.after,
      historical_paid: historicalPaid,
      total_contributed: totalContributed,
      expected_target_ugx: target,
      remaining_ugx: remaining,
      dues_status: computeDuesStatus(totalContributed, target),
      updated_at: nowIso
    });
  }
  for (let i = 0; i < updates.length; i += 200) {
    const chunk = updates.slice(i, i + 200);
    const { error } = await getDb().from("members").upsert(chunk, { onConflict: "id" });
    if (error) throw new Error(error.message);
  }
  return buildReconciliationSummary(reconciliationCounters(members, txRows));
};
var listMembers = async (ctx) => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const [memberRows, txRows, submissionRows] = await Promise.all([
      loadMemberRows(),
      loadTxRows(),
      loadSubmissionRows()
    ]);
    const covered = coveredReceiptSet();
    const histByMember = histBucketFor(txRows);
    const idxByEmail = /* @__PURE__ */ new Map();
    const idxByName = /* @__PURE__ */ new Map();
    const members = memberRows.map(memberRowToMember);
    members.forEach((m, i) => {
      const em = String(m.email || "").trim().toLowerCase();
      if (em && !isStaffOrPlaceholderEmail(em)) idxByEmail.set(em, i);
      const key = resolveCanonicalMemberNameKey(m.name);
      if (key && !idxByName.has(key)) idxByName.set(key, i);
    });
    const idxById = /* @__PURE__ */ new Map();
    members.forEach((m, i) => idxById.set(String(m.id), i));
    const liveByMember = /* @__PURE__ */ new Map();
    const newUnregistered = [];
    const unregisteredByName = /* @__PURE__ */ new Map();
    for (const tx of txRows) {
      const rec = String(tx?.receipt_number || "").trim().toUpperCase();
      const type = String(tx?.type || "INFLOW").toUpperCase();
      const status = String(tx?.paymentStatus || tx?.payment_status || "COMPLETED").toUpperCase();
      if (type === "OUTFLOW" || rec.startsWith("EXP-") || status === "CANCELLED") continue;
      if (rec.startsWith("HIST-")) continue;
      if (covered.has(rec)) continue;
      const amt = Math.max(0, Number(tx?.amount) || 0);
      const payerName = String(tx?.payer_name || "").trim();
      const rawEm = String(tx?.email || "").trim().toLowerCase();
      const cleanEm = rawEm && !isStaffOrPlaceholderEmail(rawEm, payerName) ? rawEm : "";
      const cleanPh = cleanPhoneNumber(tx?.phone || "");
      const canonKey = resolveCanonicalMemberNameKey(payerName);
      let targetIdx;
      const mid = String(tx?.member_id || "").trim();
      if (mid && idxById.has(mid)) targetIdx = idxById.get(mid);
      if (targetIdx === void 0 && cleanEm && idxByEmail.has(cleanEm)) targetIdx = idxByEmail.get(cleanEm);
      if (targetIdx === void 0 && canonKey && idxByName.has(canonKey)) targetIdx = idxByName.get(canonKey);
      if (targetIdx !== void 0) {
        const cur = liveByMember.get(targetIdx) || { amount: 0, count: 0, phone: "", email: "", lastDate: "", lastPurpose: "" };
        cur.amount += amt;
        cur.count += 1;
        if (!cur.phone && cleanPh) cur.phone = cleanPh;
        if (!cur.email && cleanEm) cur.email = cleanEm;
        const txDate = String(tx?.date || "");
        if (txDate && (!cur.lastDate || txDate > cur.lastDate)) {
          cur.lastDate = txDate;
          cur.lastPurpose = String(tx?.payment_purpose || cur.lastPurpose);
        }
        liveByMember.set(targetIdx, cur);
      } else if (payerName) {
        const existing = unregisteredByName.get(canonKey);
        if (existing !== void 0) {
          const nm = newUnregistered[existing];
          nm.livePaid += amt;
          nm.paymentCount += 1;
          if (!nm.phone && cleanPh) nm.phone = cleanPh;
          if (!nm.email && cleanEm) nm.email = cleanEm;
        } else {
          const id = `SB-LIVE-${String(newUnregistered.length + 1).padStart(4, "0")}`;
          unregisteredByName.set(canonKey, newUnregistered.length);
          newUnregistered.push({
            id,
            memberId: id,
            name: payerName,
            phone: cleanPh,
            email: cleanEm,
            address: "",
            gender: "",
            school: "",
            house: "",
            preNllPaid: 0,
            spotPaid: 0,
            paidAfter: 0,
            historicalPaid: 0,
            livePaid: amt,
            expectedTargetUgx: 0,
            paymentCount: 1,
            lastPaymentDate: String(tx?.date || ""),
            lastPurpose: String(tx?.payment_purpose || "Membership"),
            source: "LIVE_RECEIPT",
            createdAt: String(tx?.created_at || (/* @__PURE__ */ new Date()).toISOString()),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
      }
    }
    const sanitized = members.map((m, i) => {
      const live = liveByMember.get(i);
      const hist = histByMember.get(String(m.id));
      const enriched = {
        ...m,
        email: String(m.email || "").trim().toLowerCase(),
        phone: cleanPhoneNumber(m.phone || live?.phone || ""),
        preNllPaid: hist ? hist.pre : m.preNllPaid,
        spotPaid: hist ? hist.spot : m.spotPaid,
        paidAfter: hist ? hist.after : m.paidAfter,
        historicalPaid: hist ? hist.total : m.historicalPaid,
        livePaid: live ? live.amount : Math.max(0, Number(m.livePaid) || 0),
        paymentCount: (m.source === "LIVE_RECEIPT" ? 0 : Number(m.paymentCount) || 0) + (live?.count || 0),
        lastPaymentDate: live?.lastDate && (!m.lastPaymentDate || live.lastDate > m.lastPaymentDate) ? live.lastDate : m.lastPaymentDate,
        lastPurpose: live?.lastPurpose || m.lastPurpose
      };
      return sanitizeMemberForClient(enriched);
    });
    for (const extra of newUnregistered) {
      sanitized.push(sanitizeMemberForClient(extra));
    }
    const pendingCount = submissionRows.filter((s) => s?.status === "PENDING").length;
    const summary = {
      totalMembers: sanitized.length,
      completeProfiles: sanitized.filter((m) => m.profileStatus === "COMPLETE").length,
      incompleteProfiles: sanitized.filter((m) => m.profileStatus === "INCOMPLETE").length,
      missingEmailCount: sanitized.filter((m) => !m.email).length,
      missingPhoneCount: sanitized.filter((m) => !m.phone).length,
      preNllSum: sanitized.reduce((acc, m) => acc + m.preNllPaid, 0),
      spotSum: sanitized.reduce((acc, m) => acc + m.spotPaid, 0),
      paidAfterSum: sanitized.reduce((acc, m) => acc + m.paidAfter, 0),
      historicalTotalSum: sanitized.reduce((acc, m) => acc + m.historicalPaid, 0),
      combinedTotalSum: sanitized.reduce((acc, m) => acc + (m.totalContributed || 0), 0),
      pendingSubmissions: pendingCount
    };
    return ok({
      success: true,
      data: {
        members: sanitized,
        submissions: submissionRows.map(mapSubmissionRow),
        summary,
        reconciliation: buildReconciliationSummary(reconciliationCounters(members, txRows))
      }
    });
  } catch (err) {
    return errorResult(err);
  }
};
var upsertMember = async (ctx) => {
  try {
    const auth = await requireMemberEditor(
      ctx,
      "Unauthorized: You do not have permission to edit or add member details."
    );
    if (auth.ok === false) return auth.response;
    const operator = auth.user;
    const incoming = ctx.body?.member;
    if (!incoming || typeof incoming !== "object") {
      return fail(400, { success: false, error: "Invalid member payload." });
    }
    const cleanName = String(incoming.name || "").trim().slice(0, 120);
    if (cleanName.length < 2) {
      return fail(400, { success: false, error: "Member full name is required." });
    }
    const cleanEmail = String(incoming.email || "").trim().toLowerCase().slice(0, 120);
    if (cleanEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || await isPlaceholderMemberEmail(cleanEmail))) {
      return fail(400, {
        success: false,
        error: "Please enter a valid email address or leave blank."
      });
    }
    const cleanPhone = cleanPhoneNumber(String(incoming.phone || "").trim().slice(0, 30));
    const cleanAddress = String(incoming.address || "").trim().slice(0, 200);
    const cleanGender = normalizeMemberGender(incoming.gender);
    const cleanSchool = normalizeMemberSchool(incoming.school, incoming.otherSchool);
    const cleanHouse = normalizeMemberHouse(incoming.house, cleanSchool);
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const memberRows = await loadMemberRows();
    const members = memberRows.map(memberRowToMember);
    const targetId = String(incoming.id || incoming.memberId || "").trim();
    let existing = void 0;
    let existingIdx = -1;
    if (targetId && !targetId.toUpperCase().startsWith("SB-LIVE-")) {
      existingIdx = members.findIndex(
        (m) => String(m.id || "").trim().toLowerCase() === targetId.toLowerCase() || String(m.memberId || "").trim().toLowerCase() === targetId.toLowerCase()
      );
    }
    if (existingIdx === -1 && cleanName) {
      const cleanCanonKey = resolveCanonicalMemberNameKey(cleanName);
      const cleanIncomingName = normalizePersonName(cleanName);
      existingIdx = members.findIndex(
        (m) => cleanCanonKey && resolveCanonicalMemberNameKey(m.name) === cleanCanonKey || normalizePersonName(m.name) === cleanIncomingName
      );
    }
    if (existingIdx !== -1) existing = members[existingIdx];
    if (cleanEmail) {
      const duplicate = members.find(
        (m, idx) => idx !== existingIdx && String(m?.email || "").trim().toLowerCase() === cleanEmail
      );
      if (duplicate) {
        return fail(409, {
          success: false,
          error: `Duplicate email conflict: "${cleanEmail}" is already assigned to ${duplicate.name} (${duplicate.id}).`
        });
      }
    }
    const touchTransactions = async (memberId) => {
      await getDb().from("transactions").update({
        payer_name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        email_status: cleanEmail ? "SKIPPED" : "NOT_PROVIDED"
      }).eq("member_id", memberId);
    };
    if (existing) {
      const prevGender = normalizeMemberGender(existing.gender);
      const nextGender = incoming.gender !== void 0 ? cleanGender : prevGender;
      const nextExpected = resolveMemberExpectedTarget(
        incoming.expectedTargetUgx !== void 0 ? incoming.expectedTargetUgx : existing.expectedTargetUgx,
        nextGender,
        prevGender
      );
      const totals = computeMemberTotals({
        historicalPaid: existing.historicalPaid ?? existing.totalContributed,
        livePaid: existing.livePaid,
        gender: nextGender,
        expectedTargetUgx: nextExpected,
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        address: cleanAddress
      });
      const nextSchool = incoming.school !== void 0 ? cleanSchool : normalizeMemberSchool(existing.school);
      const nextHouse = isHouseEligibleSchool(nextSchool) ? incoming.house !== void 0 ? cleanHouse : normalizeMemberHouse(existing.house, nextSchool) : "";
      const updatedRecord = {
        ...existing,
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        address: cleanAddress,
        gender: nextGender,
        school: nextSchool,
        house: nextHouse,
        expectedTargetUgx: totals.expectedTargetUgx,
        totalContributed: totals.totalContributed,
        remainingUgx: totals.remainingUgx,
        duesStatus: totals.duesStatus,
        profileStatus: totals.profileStatus,
        updatedAt: nowIso
      };
      const { data: data2, error: error2 } = await getDb().from("members").upsert(
        {
          id: String(existing.id),
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          address: cleanAddress,
          gender: nextGender,
          school: nextSchool,
          house: nextHouse,
          expected_target_ugx: totals.expectedTargetUgx,
          total_contributed: totals.totalContributed,
          remaining_ugx: totals.remainingUgx,
          dues_status: totals.duesStatus,
          profile_status: totals.profileStatus,
          updated_at: nowIso
        },
        { onConflict: "id" }
      ).select().single();
      if (error2) throw new Error(error2.message);
      await touchTransactions(String(existing.id));
      await logAudit({
        user: operator.name,
        userEmail: operator.email,
        action: "EDIT_USER",
        description: `${operator.name} updated member ${cleanName} (${existing.id}).`
      });
      return ok({
        success: true,
        data: sanitizeMemberForClient(data2 ? memberRowToMember(data2) : updatedRecord)
      });
    }
    const { count } = await getDb().from("members").select("id", { count: "exact", head: true });
    const nextSeq = (count || members.length) + 1;
    const newId = `SB-M-${String(nextSeq).padStart(4, "0")}-${import_crypto5.default.randomBytes(2).toString("hex").toUpperCase()}`;
    const newExpectedTarget = resolveMemberExpectedTarget(incoming.expectedTargetUgx, cleanGender);
    const profile = {
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      address: cleanAddress
    };
    const newRecord = {
      id: newId,
      memberId: newId,
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      address: cleanAddress,
      gender: cleanGender,
      school: cleanSchool,
      house: cleanHouse,
      preNllPaid: 0,
      spotPaid: 0,
      paidAfter: 0,
      historicalPaid: 0,
      livePaid: 0,
      totalContributed: 0,
      expectedTargetUgx: newExpectedTarget,
      remainingUgx: newExpectedTarget,
      duesStatus: computeDuesStatus(0, newExpectedTarget),
      profileStatus: isMemberProfileComplete(profile) ? "COMPLETE" : "INCOMPLETE",
      paymentCount: 0,
      lastPaymentDate: "",
      lastPurpose: "",
      source: "MANUAL",
      createdAt: nowIso,
      updatedAt: nowIso
    };
    const { data, error } = await getDb().from("members").insert({
      id: newId,
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      address: cleanAddress,
      gender: cleanGender,
      school: cleanSchool,
      house: cleanHouse,
      expected_target_ugx: newExpectedTarget,
      remaining_ugx: newExpectedTarget,
      dues_status: newRecord.duesStatus,
      profile_status: newRecord.profileStatus,
      payment_count: 0,
      source: "MANUAL",
      created_at: nowIso,
      updated_at: nowIso
    }).select().single();
    if (error) throw new Error(error.message);
    await logAudit({
      user: operator.name,
      userEmail: operator.email,
      action: "ADD_ADMIN",
      description: `${operator.name} added member ${cleanName} (${newId}).`
    });
    return ok({
      success: true,
      data: sanitizeMemberForClient(data ? memberRowToMember(data) : newRecord)
    });
  } catch (err) {
    return errorResult(err);
  }
};
var importCsv = async (ctx) => {
  try {
    const auth = await requireMemberEditor(
      ctx,
      "Unauthorized: You do not have permission to import or modify member records."
    );
    if (auth.ok === false) return auth.response;
    const operator = auth.user;
    const csvText = String(ctx.body?.csvText || "");
    if (!csvText.trim() || csvText.length > 2 * 1024 * 1024) {
      return fail(400, { success: false, error: "Please provide a valid CSV file under 2 MB." });
    }
    const parsed = parseTreasuryMembersCsv(csvText, { defaultTargetUgx: 0 });
    if (parsed.members.length === 0) {
      return fail(400, {
        success: false,
        error: parsed.summary.warnings[0] || "No member rows were found in that CSV."
      });
    }
    if (parsed.members.length > 2e3) {
      return fail(400, { success: false, error: "Maximum 2,000 rows per CSV import." });
    }
    const memberRows = await loadMemberRows();
    const members = memberRows.map(memberRowToMember);
    const byId = /* @__PURE__ */ new Map();
    const byCanonicalName = /* @__PURE__ */ new Map();
    for (const m of members) {
      if (m.id) byId.set(String(m.id), m);
      const canonKey = m.name ? resolveCanonicalMemberNameKey(m.name) : "";
      if (canonKey && !byCanonicalName.has(canonKey)) byCanonicalName.set(canonKey, m);
    }
    let addedCount = 0;
    let updatedCount = 0;
    const merged = [];
    const seenIds = /* @__PURE__ */ new Set();
    for (const imported of parsed.members) {
      const canonImported = resolveCanonicalMemberNameKey(imported.name);
      const existing = (imported.id ? byId.get(String(imported.id)) : void 0) || (canonImported ? byCanonicalName.get(canonImported) : void 0);
      if (existing) {
        updatedCount++;
        const mergedEmail = String(imported.email || existing.email || "").toLowerCase();
        const mergedPhone = cleanPhoneNumber(imported.phone || existing.phone || "");
        const mergedAddress = imported.address || existing.address || "";
        const mergedGender = normalizeMemberGender(existing.gender || imported.gender);
        const mergedSchool = normalizeMemberSchool(existing.school || imported.school);
        const mergedHouse = normalizeMemberHouse(existing.house || imported.house, mergedSchool);
        const preservedLivePaid = Math.max(0, Number(existing.livePaid) || 0);
        const nextTotal = Math.max(0, Number(imported.historicalPaid) || 0) + preservedLivePaid;
        const updated = {
          ...existing,
          preNllPaid: Math.max(0, Number(imported.preNllPaid) || 0),
          spotPaid: Math.max(0, Number(imported.spotPaid) || 0),
          paidAfter: Math.max(0, Number(imported.paidAfter) || 0),
          historicalPaid: Math.max(0, Number(imported.historicalPaid) || 0),
          livePaid: preservedLivePaid,
          totalContributed: nextTotal,
          email: mergedEmail,
          phone: mergedPhone,
          address: mergedAddress,
          gender: mergedGender,
          school: mergedSchool,
          house: mergedHouse,
          profileStatus: isMemberProfileComplete({
            name: existing.name,
            email: mergedEmail,
            phone: mergedPhone,
            address: mergedAddress
          }) ? "COMPLETE" : "INCOMPLETE",
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        merged.push(updated);
        seenIds.add(String(updated.id));
      } else {
        addedCount++;
        merged.push(imported);
        seenIds.add(String(imported.id));
      }
    }
    for (const existing of members) {
      if (!seenIds.has(String(existing.id))) merged.push(existing);
    }
    const memberUpserts = merged.map((m) => ({
      id: String(m.id),
      name: String(m.name || ""),
      phone: cleanPhoneNumber(m.phone || ""),
      email: String(m.email || "").toLowerCase(),
      address: String(m.address || ""),
      gender: String(m.gender || ""),
      school: String(m.school || ""),
      house: String(m.house || ""),
      pre_nll_paid: Math.max(0, Number(m.preNllPaid) || 0),
      spot_paid: Math.max(0, Number(m.spotPaid) || 0),
      paid_after: Math.max(0, Number(m.paidAfter) || 0),
      historical_paid: Math.max(0, Number(m.historicalPaid) || 0),
      live_paid: Math.max(0, Number(m.livePaid) || 0),
      total_contributed: Math.max(0, Number(m.totalContributed) || 0),
      expected_target_ugx: Math.max(0, Number(m.expectedTargetUgx) || 0),
      remaining_ugx: Math.max(0, Number(m.remainingUgx) || 0),
      dues_status: String(m.duesStatus || ""),
      profile_status: String(m.profileStatus || ""),
      payment_count: Number(m.paymentCount) || 0,
      last_payment_date: String(m.lastPaymentDate || ""),
      last_purpose: String(m.lastPurpose || ""),
      source: String(m.source || "CSV_IMPORT"),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }));
    for (let i = 0; i < memberUpserts.length; i += 200) {
      const { error } = await getDb().from("members").upsert(memberUpserts.slice(i, i + 200), { onConflict: "id" });
      if (error) throw new Error(error.message);
    }
    const { data: existingHist } = await getDb().from("transactions").select("*").limit(2e4);
    const histByReceipt = /* @__PURE__ */ new Map();
    for (const tx of existingHist || []) {
      if (tx?.receipt_number) histByReceipt.set(String(tx.receipt_number), tx);
    }
    const memberLookup = /* @__PURE__ */ new Map();
    for (const m of merged) memberLookup.set(String(m.id), m);
    const txUpserts = [];
    for (const tx of parsed.historicalTransactions) {
      const prev = histByReceipt.get(String(tx.receiptNumber));
      const ownerMember = tx.memberId ? memberLookup.get(String(tx.memberId)) : null;
      const email = String(ownerMember?.email || prev?.email || tx.email || "").toLowerCase();
      txUpserts.push({
        receipt_number: String(tx.receiptNumber),
        transaction_id: prev?.transaction_id || `hist-${String(tx.receiptNumber).toLowerCase()}`,
        member_id: String(tx.memberId || prev?.member_id || ""),
        type: "INFLOW",
        date: String(tx.date || ""),
        time: String(tx.time || ""),
        payer_name: String(ownerMember?.name || prev?.payer_name || tx.payerName || ""),
        phone: cleanPhoneNumber(ownerMember?.phone || prev?.phone || tx.phone || ""),
        email,
        amount: Math.max(0, Number(tx.amount) || 0),
        payment_purpose: String(tx.paymentPurpose || prev?.payment_purpose || ""),
        payment_method: String(tx.paymentMethod || prev?.payment_method || ""),
        payment_reference: String(tx.paymentReference || prev?.payment_reference || ""),
        notes: String(tx.notes || prev?.notes || ""),
        generated_by: String(tx.generatedBy || prev?.generated_by || ""),
        operator_email: String(tx.operatorEmail || prev?.operator_email || ""),
        payment_status: String(tx.paymentStatus || prev?.payment_status || "COMPLETED").toUpperCase(),
        email_status: email ? "SKIPPED" : "NOT_PROVIDED",
        sync_status: "SYNCED"
      });
      histByReceipt.set(String(tx.receiptNumber), { member_id: txUpserts[txUpserts.length - 1].member_id });
    }
    for (let i = 0; i < txUpserts.length; i += 200) {
      const { error } = await getDb().from("transactions").upsert(txUpserts.slice(i, i + 200), { onConflict: "receipt_number" });
      if (error) throw new Error(error.message);
    }
    await recomputeMembersFromLedger();
    await logAudit({
      user: operator.name,
      userEmail: operator.email,
      action: "HISTORICAL_IMPORT_COMPLETED",
      description: `${operator.name} imported ${parsed.members.length} member rows (${addedCount} new, ${updatedCount} updated).`
    });
    return ok({
      success: true,
      message: `Imported ${parsed.members.length} members (${addedCount} new, ${updatedCount} updated) & reconciled ledger. Historical treasury: ${parsed.summary.totalSum.toLocaleString()} UGX.`,
      data: {
        addedCount,
        updatedCount,
        summary: parsed.summary
      }
    });
  } catch (err) {
    return errorResult(err);
  }
};
var mergeMembers = async (ctx) => {
  try {
    const auth = await requireMemberEditor(
      ctx,
      "Unauthorized: You do not have permission to merge member profiles."
    );
    if (auth.ok === false) return auth.response;
    const operator = auth.user;
    const primaryId = String(ctx.body?.primaryMemberId || "").trim();
    const duplicateIds = Array.isArray(ctx.body?.duplicateMemberIds) ? ctx.body.duplicateMemberIds.map((id) => String(id || "").trim()).filter((id) => id && id !== primaryId) : [];
    if (!primaryId || duplicateIds.length === 0) {
      return fail(400, {
        success: false,
        error: "Select one primary member and at least one duplicate member to merge."
      });
    }
    const memberRows = await loadMemberRows();
    const members = memberRows.map(memberRowToMember);
    const primaryIdx = members.findIndex((m) => String(m.id || m.memberId) === primaryId);
    if (primaryIdx === -1) {
      return fail(404, { success: false, error: "Primary member record was not found." });
    }
    const dupSet = new Set(duplicateIds);
    const toMerge = members.filter((m) => dupSet.has(String(m.id || m.memberId)));
    if (toMerge.length === 0) {
      return fail(404, { success: false, error: "Selected duplicate records were not found." });
    }
    const primary = { ...members[primaryIdx] };
    for (const d of toMerge) {
      primary.preNllPaid = (Number(primary.preNllPaid) || 0) + (Number(d.preNllPaid) || 0);
      primary.spotPaid = (Number(primary.spotPaid) || 0) + (Number(d.spotPaid) || 0);
      primary.paidAfter = (Number(primary.paidAfter) || 0) + (Number(d.paidAfter) || 0);
      primary.historicalPaid = (Number(primary.historicalPaid) || 0) + (Number(d.historicalPaid) || 0);
      primary.livePaid = (Number(primary.livePaid) || 0) + (Number(d.livePaid) || 0);
      primary.paymentCount = (Number(primary.paymentCount) || 0) + (Number(d.paymentCount) || 0);
      if (!primary.email && d.email && !isStaffOrPlaceholderEmail(d.email)) primary.email = d.email;
      if (!primary.phone && d.phone) primary.phone = cleanPhoneNumber(d.phone);
      if (!primary.address && d.address) primary.address = d.address;
    }
    primary.phone = cleanPhoneNumber(primary.phone || "");
    primary.totalContributed = (Number(primary.historicalPaid) || 0) + (Number(primary.livePaid) || 0);
    const targetUgx = resolveMemberExpectedTarget(primary.expectedTargetUgx, primary.gender);
    primary.expectedTargetUgx = targetUgx;
    primary.remainingUgx = targetUgx > 0 ? Math.max(0, targetUgx - primary.totalContributed) : 0;
    primary.duesStatus = computeDuesStatus(primary.totalContributed, targetUgx);
    primary.profileStatus = isMemberProfileComplete(primary) ? "COMPLETE" : "INCOMPLETE";
    primary.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    const { error: updErr } = await getDb().from("members").upsert(
      {
        id: String(primary.id),
        email: String(primary.email || "").toLowerCase(),
        phone: primary.phone,
        address: String(primary.address || ""),
        pre_nll_paid: primary.preNllPaid,
        spot_paid: primary.spotPaid,
        paid_after: primary.paidAfter,
        historical_paid: primary.historicalPaid,
        live_paid: primary.livePaid,
        total_contributed: primary.totalContributed,
        expected_target_ugx: primary.expectedTargetUgx,
        remaining_ugx: primary.remainingUgx,
        dues_status: primary.duesStatus,
        profile_status: primary.profileStatus,
        payment_count: primary.paymentCount,
        updated_at: primary.updatedAt
      },
      { onConflict: "id" }
    );
    if (updErr) throw new Error(updErr.message);
    const { error: txErr } = await getDb().from("transactions").update({
      member_id: String(primary.id),
      payer_name: primary.name,
      ...primary.email ? { email: String(primary.email).toLowerCase() } : {},
      ...primary.phone ? { phone: primary.phone } : {}
    }).in("member_id", Array.from(dupSet));
    if (txErr) throw new Error(txErr.message);
    const { error: delErr } = await getDb().from("members").delete().in("id", Array.from(dupSet));
    if (delErr) throw new Error(delErr.message);
    await logAudit({
      user: operator.name,
      userEmail: operator.email,
      action: "EDIT_USER",
      description: `${operator.name} merged ${toMerge.length} duplicate member record(s) into ${primary.name}.`
    });
    return ok({
      success: true,
      message: `Merged ${toMerge.length} duplicate record${toMerge.length === 1 ? "" : "s"} into ${primary.name}.`
    });
  } catch (err) {
    return errorResult(err);
  }
};
var claimLink = async (ctx) => {
  try {
    const auth = await requireMemberEditor(
      ctx,
      "Unauthorized: You do not have permission to edit or add member details."
    );
    if (auth.ok === false) return auth.response;
    const memberId = getParam(ctx, "id").trim();
    const { data: row, error } = await getDb().from("members").select("id, name").eq("id", memberId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) {
      return fail(404, { success: false, error: "Member not found." });
    }
    const rawToken = import_crypto5.default.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1e3).toISOString();
    const { error: updErr } = await getDb().from("members").update({ claim_token: rawToken, claim_token_expires_at: expiresAt, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", memberId);
    if (updErr) throw new Error(updErr.message);
    return ok({
      success: true,
      data: {
        token: rawToken,
        expiresAt,
        memberName: String(row.name || "")
      }
    });
  } catch (err) {
    return errorResult(err);
  }
};
var reviewSubmission = async (ctx) => {
  try {
    const auth = await requireMemberEditor(
      ctx,
      "Unauthorized: You do not have permission to review or change member submissions."
    );
    if (auth.ok === false) return auth.response;
    const operator = auth.user;
    const submissionId = getParam(ctx, "submissionId", "id").trim();
    const decision = String(ctx.body?.decision || "").trim().toUpperCase();
    const reviewNotes = String(ctx.body?.reviewNotes || "").trim().slice(0, 300);
    if (decision !== "APPROVE" && decision !== "REJECT") {
      return fail(400, { success: false, error: "Decision must be APPROVE or REJECT." });
    }
    const { data: sub, error: subErr } = await getDb().from("member_submissions").select("*").eq("id", submissionId).maybeSingle();
    if (subErr) throw new Error(subErr.message);
    if (!sub) {
      return fail(404, { success: false, error: "Submission not found." });
    }
    if (String(sub.status) !== "PENDING") {
      return fail(400, {
        success: false,
        error: `Submission has already been ${String(sub.status).toLowerCase()}.`
      });
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (decision === "APPROVE") {
      const { data: memberRow, error: mErr } = await getDb().from("members").select("*").eq("id", String(sub.member_id)).maybeSingle();
      if (mErr) throw new Error(mErr.message);
      if (!memberRow) {
        return fail(404, { success: false, error: "Target member record no longer exists." });
      }
      const member = memberRowToMember(memberRow);
      const cleanEmail = String(sub.submitted_email || "").trim().toLowerCase();
      if (cleanEmail) {
        const { data: conflicts } = await getDb().from("members").select("id, name, email").ilike("email", cleanEmail);
        const conflict = (conflicts || []).find((m) => String(m.id) !== String(member.id));
        if (conflict) {
          return fail(409, {
            success: false,
            error: `Cannot approve: "${cleanEmail}" is already registered to ${conflict.name}.`
          });
        }
      }
      const prevGender = normalizeMemberGender(member.gender);
      const cleanPhone = cleanPhoneNumber(sub.submitted_phone || member.phone || "");
      const cleanSchool = normalizeMemberSchool(sub.submitted_school || member.school);
      const cleanGender = normalizeMemberGender(sub.submitted_gender || member.gender);
      const cleanHouse = normalizeMemberHouse(sub.submitted_house || member.house, cleanSchool);
      const nextTarget = resolveMemberExpectedTarget(member.expectedTargetUgx, cleanGender, prevGender);
      const histPaid = Math.max(0, Number(member.historicalPaid ?? member.totalContributed) || 0);
      const livePaid = Math.max(0, Number(member.livePaid) || 0);
      const totalContributed = histPaid + livePaid;
      const updatedMember = {
        ...member,
        name: String(sub.submitted_name || member.name),
        email: cleanEmail,
        phone: cleanPhone,
        address: String(sub.submitted_address || member.address),
        gender: cleanGender,
        school: cleanSchool,
        house: cleanHouse,
        expectedTargetUgx: nextTarget,
        remainingUgx: nextTarget > 0 ? Math.max(0, nextTarget - totalContributed) : 0,
        duesStatus: computeDuesStatus(totalContributed, nextTarget),
        claim_token: "",
        claim_token_expires_at: null,
        updatedAt: nowIso
      };
      updatedMember.profileStatus = isMemberProfileComplete(updatedMember) ? "COMPLETE" : "INCOMPLETE";
      const { error: updErr } = await getDb().from("members").upsert(
        {
          id: String(member.id),
          name: updatedMember.name,
          email: cleanEmail,
          phone: cleanPhone,
          address: updatedMember.address,
          gender: cleanGender,
          school: cleanSchool,
          house: cleanHouse,
          expected_target_ugx: nextTarget,
          remaining_ugx: updatedMember.remainingUgx,
          dues_status: updatedMember.duesStatus,
          profile_status: updatedMember.profileStatus,
          claim_token: "",
          claim_token_expires_at: null,
          updated_at: nowIso
        },
        { onConflict: "id" }
      );
      if (updErr) throw new Error(updErr.message);
      await getDb().from("transactions").update({
        payer_name: updatedMember.name,
        email: cleanEmail,
        phone: cleanPhone,
        email_status: cleanEmail ? "SKIPPED" : "NOT_PROVIDED"
      }).eq("member_id", String(member.id));
    }
    const { data: updatedSub, error: subUpdErr } = await getDb().from("member_submissions").update({
      status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
      reviewed_by: operator.email,
      reviewed_at: nowIso,
      review_notes: reviewNotes
    }).eq("id", submissionId).select().single();
    if (subUpdErr) throw new Error(subUpdErr.message);
    await logAudit({
      user: operator.name,
      userEmail: operator.email,
      action: "EDIT_USER",
      description: decision === "APPROVE" ? `${operator.name} approved ${String(sub.submitted_name)}'s profile update.` : `${operator.name} rejected ${String(sub.submitted_name)}'s profile update.`
    });
    return ok({
      success: true,
      message: decision === "APPROVE" ? `Approved and synced ${String(sub.submitted_name)}'s details. They can now sign in at /me.` : `Rejected update request from ${String(sub.submitted_name)}.`,
      data: mapSubmissionRow(updatedSub)
    });
  } catch (err) {
    return errorResult(err);
  }
};
var reconcileLedger = async (ctx) => {
  try {
    const auth = await requireMemberEditor(
      ctx,
      "Unauthorized: You do not have permission to edit or add member details."
    );
    if (auth.ok === false) return auth.response;
    const operator = auth.user;
    const summary = await recomputeMembersFromLedger();
    await logAudit({
      user: operator.name,
      userEmail: operator.email,
      action: "LEGACY_SYNC_SUCCEEDED",
      description: `${operator.name} reconciled the member ledger (${summary.coveredReceiptCount} pre-CSV receipts deduplicated).`
    });
    return ok({
      success: true,
      message: `Cleaned & reconciled ledger: ${summary.coveredReceiptCount} pre-CSV live receipts deduplicated (${summary.coveredAmountUgx.toLocaleString()} UGX), ${summary.realEmailsRecovered} real emails & ${summary.phonesRecovered} phones recovered, zero staff emails attached.`,
      data: summary
    });
  } catch (err) {
    return errorResult(err);
  }
};

// lib/backend/handlers/me.ts
var loadMembers = async () => {
  const { data, error } = await getDb().from("members").select("*").limit(2e4);
  if (error) throw new Error(error.message);
  return (data || []).map(memberRowToMember);
};
var loadInflowTxRows = async () => {
  const { data, error } = await getDb().from("transactions").select("*").limit(2e4);
  if (error) throw new Error(error.message);
  return data || [];
};
var verifyMemberBearer = (headers) => {
  const auth = String(headers.authorization || "").trim();
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const payload = verifyToken(auth.slice(7).trim());
  if (!payload || payload.kind !== "member") return null;
  const email = String(payload.sub || "").trim().toLowerCase();
  if (isStaffOrPlaceholderEmail(email)) return null;
  return {
    email,
    memberId: String(payload.memberId || ""),
    name: String(payload.name || email.split("@")[0]).trim()
  };
};
var fetchRegisteredMemberData = async (cleanEmail, memberId = "") => {
  const members = await loadMembers();
  const memberRecord = members.find(
    (m) => String(m.email || "").trim().toLowerCase() && !isStaffOrPlaceholderEmail(String(m.email || "").trim().toLowerCase()) && String(m.email || "").trim().toLowerCase() === cleanEmail
  ) || (memberId ? members.find((m) => String(m.id) === String(memberId)) : void 0) || null;
  const covered = coveredReceiptSet();
  const txRows = await loadInflowTxRows();
  const inflowMap = /* @__PURE__ */ new Map();
  for (const tx of txRows) {
    const rec = String(tx?.receipt_number || "").trim().toUpperCase();
    const type = String(tx?.type || "INFLOW").toUpperCase();
    const status = String(tx?.payment_status || "COMPLETED").toUpperCase();
    if (type === "OUTFLOW" || rec.startsWith("EXP-") || status === "CANCELLED") continue;
    if (covered.has(rec)) continue;
    const rawEm = String(tx?.email || "").trim().toLowerCase();
    const txEmail = rawEm && !isStaffOrPlaceholderEmail(rawEm, tx?.payer_name) ? rawEm : "";
    const txPhone = cleanPhoneNumber(tx?.phone || "");
    const memberPhone = memberRecord ? cleanPhoneNumber(memberRecord.phone || "") : "";
    const emailMatch = Boolean(txEmail && txEmail === cleanEmail);
    const phoneMatch = Boolean(
      memberRecord && memberPhone && txPhone && txPhone === memberPhone
    );
    const nameMatch = Boolean(
      memberRecord && resolveCanonicalMemberNameKey(tx?.payer_name) === resolveCanonicalMemberNameKey(memberRecord.name)
    );
    const memberRefMatch = Boolean(
      memberRecord && String(tx?.member_id || "") && String(tx.member_id) === String(memberRecord.id)
    );
    if (emailMatch || phoneMatch || nameMatch || memberRefMatch) {
      if (rec) inflowMap.set(rec, tx);
    }
  }
  const inflows = Array.from(inflowMap.values());
  if (inflows.length === 0 && !memberRecord) {
    return { registered: false, memberName: "", memberRecord: null, inflows: [] };
  }
  const resolvedName = String(
    memberRecord?.name || inflows[0]?.payer_name || cleanEmail.split("@")[0]
  ).trim();
  return { registered: true, memberName: resolvedName, memberRecord, inflows };
};
var meSendCode = async (ctx) => {
  try {
    const cleanEmail = String(ctx.body?.email || "").trim().toLowerCase();
    if (isStaffOrPlaceholderEmail(cleanEmail)) {
      return fail(400, {
        success: false,
        error: "Please enter a valid registered member email address."
      });
    }
    const issued = await issueOtp(cleanEmail, "MEMBER_LOGIN");
    if (!issued.ok) {
      return fail(429, {
        success: false,
        error: `Please wait ${issued.waitSeconds ?? 30}s before requesting another sign-in code.`
      });
    }
    const lookup = await fetchRegisteredMemberData(cleanEmail);
    if (!lookup.registered) {
      const { data: pendingSub } = await getDb().from("member_submissions").select("id").eq("status", "PENDING").ilike("submitted_email", cleanEmail).limit(1).maybeSingle();
      if (pendingSub) {
        return fail(403, {
          success: false,
          error: "Your profile update for this email is awaiting administrator approval in the Members Directory. Please contact the club secretariat to approve it so your sign-in code can be sent."
        });
      }
      return fail(403, {
        success: false,
        error: "This email address is not registered on any SC Basimbuzi member record. Only registered members with an email on file can sign in."
      });
    }
    await logAudit({
      user: lookup.memberName,
      userEmail: cleanEmail,
      action: "MEMBER_LOGIN_OTP_SENT",
      description: `Member sign-in code issued for ${cleanEmail}.`
    });
    return ok({
      success: true,
      message: `A 6-digit verification code has been sent to ${cleanEmail}. Check your Inbox \u2014 if you do not see it within 1 minute, check your Spam or Promotions folder and mark it "Not spam".`,
      devCode: issued.code,
      data: { email: cleanEmail, code: issued.code }
    });
  } catch (err) {
    return errorResult(err);
  }
};
var meVerifyCode = async (ctx) => {
  try {
    const cleanEmail = String(ctx.body?.email || "").trim().toLowerCase();
    const cleanCode = String(ctx.body?.code || "").trim();
    if (isStaffOrPlaceholderEmail(cleanEmail) || !/^\d{6}$/.test(cleanCode)) {
      return fail(400, {
        success: false,
        error: "Enter your registered email address and 6-digit sign-in code."
      });
    }
    const result = await verifyOtp(cleanEmail, "MEMBER_LOGIN", cleanCode);
    if (result.ok === false) {
      const messages = {
        NO_ACTIVE: { status: 401, message: "No active sign-in code found. Request a new code to continue." },
        EXPIRED: { status: 401, message: "That sign-in code has expired. Please request a new code." },
        TOO_MANY: { status: 429, message: "Too many incorrect attempts. Please request a fresh sign-in code." },
        INCORRECT: { status: 401, message: "Incorrect 6-digit code. Please check your inbox and try again." }
      };
      const m = messages[result.reason];
      return fail(m.status, { success: false, error: m.message });
    }
    const lookup = await fetchRegisteredMemberData(cleanEmail);
    const memberName = lookup.memberName || cleanEmail.split("@")[0];
    const token = signToken({
      sub: cleanEmail,
      name: memberName,
      memberId: lookup.memberRecord ? String(lookup.memberRecord.id) : void 0,
      kind: "member",
      exp: Date.now() + 12 * 60 * 60 * 1e3
    });
    return ok({
      success: true,
      token,
      member: { email: cleanEmail, name: memberName }
    });
  } catch (err) {
    return errorResult(err);
  }
};
var mePayments = async (ctx) => {
  try {
    const member = verifyMemberBearer(ctx.headers);
    if (!member) {
      return fail(401, {
        found: false,
        error: "Your member session has expired. Please sign in again.",
        message: "Please sign in with your registered email to view your payments."
      });
    }
    const { data: siteRow } = await getDb().from("site_content").select("content").eq("id", 1).maybeSingle();
    const site = siteRow?.content && typeof siteRow.content === "object" ? siteRow.content : {};
    const targetLabel = String(site.membershipTargetLabel || "2026 Season Membership Contribution");
    const configuredTarget = Math.max(0, Number(site.membershipTargetUgx) || 0);
    const lookup = await fetchRegisteredMemberData(member.email, member.memberId);
    if (!lookup.registered) {
      return fail(503, {
        found: false,
        query: member.email,
        memberEmail: member.email,
        payerName: member.name,
        targetLabel,
        expectedTargetUgx: configuredTarget,
        totalPaidUgx: 0,
        pendingUgx: 0,
        remainingUgx: configuredTarget,
        progressPercent: 0,
        overallStatus: "NOT_FOUND",
        payments: [],
        message: "Payment records are temporarily unavailable. Please try again shortly."
      });
    }
    let totalPaidUgx = 0;
    let pendingUgx = 0;
    const payments = lookup.inflows.map((tx) => {
      const amt = Math.max(0, Number(tx.amount) || 0);
      const status = String(tx.payment_status || "COMPLETED").toUpperCase();
      if (status === "COMPLETED") {
        totalPaidUgx += amt;
      } else if (status === "PENDING") {
        pendingUgx += amt;
      }
      return {
        receiptNumber: String(tx.receipt_number || ""),
        date: String(tx.date || ""),
        paymentPurpose: String(tx.payment_purpose || "Club Contribution"),
        paymentMethod: String(tx.payment_method || ""),
        paymentReference: String(tx.payment_reference || ""),
        amount: amt,
        paymentStatus: status
      };
    });
    const resolvedGender = normalizeMemberGender(lookup.memberRecord?.gender);
    const expectedTargetUgx = lookup.memberRecord ? resolveMemberExpectedTarget(lookup.memberRecord.expectedTargetUgx, resolvedGender) : 0;
    const remainingUgx = expectedTargetUgx > 0 ? Math.max(0, expectedTargetUgx - totalPaidUgx) : 0;
    const progressPercent = expectedTargetUgx > 0 ? Math.min(100, Math.round(totalPaidUgx / expectedTargetUgx * 100)) : 0;
    let overallStatus = "PARTIAL";
    if (totalPaidUgx === 0 && pendingUgx > 0) {
      overallStatus = "PENDING";
    } else if (expectedTargetUgx > 0 && remainingUgx === 0 && totalPaidUgx > 0) {
      overallStatus = "FULLY_PAID";
    } else if (expectedTargetUgx === 0 && totalPaidUgx === 0) {
      overallStatus = "PENDING";
    }
    const oldestDate = lookup.inflows.reduce((earliest, tx) => {
      const d = String(tx?.date || "").trim();
      if (!d) return earliest;
      return !earliest || d < earliest ? d : earliest;
    }, "");
    return ok({
      found: true,
      query: member.email,
      payerName: lookup.memberName || member.name,
      memberEmail: member.email,
      phone: String(lookup.memberRecord?.phone || lookup.inflows[0]?.phone || ""),
      memberProfile: lookup.memberRecord ? sanitizeMemberForClient(lookup.memberRecord) : {
        name: lookup.memberName || member.name,
        email: member.email,
        phone: String(lookup.inflows[0]?.phone || ""),
        address: "",
        gender: "",
        school: "",
        house: "",
        preNllPaid: 0,
        spotPaid: 0,
        paidAfter: 0,
        duesStatus: computeDuesStatus(totalPaidUgx, expectedTargetUgx)
      },
      memberSince: oldestDate,
      targetLabel,
      expectedTargetUgx,
      totalPaidUgx,
      pendingUgx,
      remainingUgx,
      progressPercent,
      overallStatus,
      payments,
      message: payments.length > 0 ? `Showing ${payments.length} payment record${payments.length === 1 ? "" : "s"} registered to ${member.email}.` : `No payments recorded yet under ${member.email}.`
    });
  } catch (err) {
    return errorResult(err);
  }
};
var meVerifyReceipt = async (ctx) => {
  try {
    const member = verifyMemberBearer(ctx.headers);
    if (!member) {
      return fail(401, {
        found: false,
        receiptNumber: "",
        message: "Please sign in with your registered email to verify your receipts."
      });
    }
    const cleanReceipt = String(ctx.body?.receiptNumber || "").trim().toUpperCase();
    if (!cleanReceipt || cleanReceipt.length > 40 || !/^[A-Z0-9-]+$/.test(cleanReceipt)) {
      return fail(400, {
        found: false,
        receiptNumber: cleanReceipt,
        message: "Enter a valid receipt reference (e.g. SB-2026-00001)."
      });
    }
    const lookup = await fetchRegisteredMemberData(member.email);
    if (!lookup.registered) {
      return fail(503, {
        found: false,
        receiptNumber: cleanReceipt,
        message: "Live receipt verification is temporarily unavailable."
      });
    }
    const match = lookup.inflows.find((tx) => {
      const rec = String(tx?.receipt_number || "").trim().toUpperCase();
      const ref = String(tx?.payment_reference || "").toUpperCase();
      const notes = String(tx?.notes || "").toUpperCase();
      return rec === cleanReceipt || ref.includes(cleanReceipt) || notes.includes(cleanReceipt);
    });
    if (!match) {
      return ok({
        found: false,
        receiptNumber: cleanReceipt,
        message: "No matching receipt was found under your registered member email."
      });
    }
    return ok({
      found: true,
      receiptNumber: String(match.receipt_number || cleanReceipt),
      date: String(match.date || ""),
      amount: Math.max(0, Number(match.amount) || 0),
      paymentStatus: String(match.payment_status || "COMPLETED"),
      paymentPurpose: String(match.payment_purpose || "Club Contribution"),
      paymentMethod: String(match.payment_method || ""),
      paymentReference: String(match.payment_reference || ""),
      message: "Verified: Official SC Basimbuzi receipt matches your member account."
    });
  } catch (err) {
    return errorResult(err);
  }
};
var meClaimLookup = async (ctx) => {
  try {
    const rawToken = getParam(ctx, "token").trim();
    if (!rawToken || rawToken.length < 16 || rawToken.length > 128) {
      return fail(400, { success: false, error: "Invalid profile completion link." });
    }
    const { data: member, error } = await getDb().from("members").select("*").eq("claim_token", rawToken).maybeSingle();
    if (error) throw new Error(error.message);
    if (!member || Date.parse(String(member.claim_token_expires_at || "")) <= Date.now()) {
      return fail(404, {
        success: false,
        error: "This profile link has expired or has already been used. Ask the club secretariat for a fresh link."
      });
    }
    const { count } = await getDb().from("member_submissions").select("id", { count: "exact", head: true }).eq("member_id", String(member.id)).eq("status", "PENDING");
    const claimSchool = normalizeMemberSchool(member.school);
    return ok({
      success: true,
      data: {
        memberId: String(member.id),
        name: String(member.name || ""),
        phone: String(member.phone || ""),
        email: String(member.email || ""),
        address: String(member.address || ""),
        gender: normalizeMemberGender(member.gender),
        school: claimSchool,
        house: normalizeMemberHouse(member.house, claimSchool),
        preNllPaid: Math.max(0, Number(member.pre_nll_paid) || 0),
        spotPaid: Math.max(0, Number(member.spot_paid) || 0),
        paidAfter: Math.max(0, Number(member.paid_after) || 0),
        totalPaid: Math.max(0, Number(member.historical_paid ?? member.total_contributed) || 0),
        hasPendingSubmission: (count || 0) > 0
      }
    });
  } catch (err) {
    return errorResult(err);
  }
};
var meClaimSubmit = async (ctx) => {
  try {
    const rawToken = getParam(ctx, "token").trim();
    if (!rawToken || rawToken.length < 16 || rawToken.length > 128) {
      return fail(400, { success: false, error: "Invalid profile completion link." });
    }
    const { data: memberRow, error } = await getDb().from("members").select("*").eq("claim_token", rawToken).maybeSingle();
    if (error) throw new Error(error.message);
    if (!memberRow || Date.parse(String(memberRow.claim_token_expires_at || "")) <= Date.now()) {
      return fail(404, {
        success: false,
        error: "This profile link has expired or was already submitted."
      });
    }
    const targetMember = memberRowToMember(memberRow);
    const submittedName = String(ctx.body?.fullName || "").trim().slice(0, 120);
    const submittedEmail = String(ctx.body?.email || "").trim().toLowerCase().slice(0, 120);
    const submittedPhone = cleanPhoneNumber(String(ctx.body?.phone || "").trim().slice(0, 30));
    const submittedAddress = String(ctx.body?.address || "").trim().slice(0, 200);
    const submittedGender = normalizeMemberGender(ctx.body?.gender);
    const submittedSchool = normalizeMemberSchool(ctx.body?.school, ctx.body?.otherSchool);
    const submittedHouse = normalizeMemberHouse(ctx.body?.house, submittedSchool);
    if (submittedName.length < 2) {
      return fail(400, { success: false, error: "Enter your full name." });
    }
    if (isStaffOrPlaceholderEmail(submittedEmail)) {
      return fail(400, { success: false, error: "Enter a valid personal email address." });
    }
    if (submittedPhone.replace(/\D/g, "").length < 7) {
      return fail(400, { success: false, error: "Enter a valid phone or WhatsApp number." });
    }
    if (submittedAddress.length < 2) {
      return fail(400, { success: false, error: "Enter your physical address / residence." });
    }
    if (!submittedGender) {
      return fail(400, { success: false, error: "Select your gender (Male or Female)." });
    }
    if (!submittedSchool) {
      return fail(400, { success: false, error: "Select your school or enter your school name." });
    }
    if (isHouseEligibleSchool(submittedSchool) && !submittedHouse) {
      return fail(400, {
        success: false,
        error: `Please select your house at ${submittedSchool}.`
      });
    }
    const { data: memberConflicts } = await getDb().from("members").select("id").ilike("email", submittedEmail);
    if ((memberConflicts || []).some((m) => String(m.id) !== String(targetMember.id))) {
      return fail(409, {
        success: false,
        error: "This email address is already registered to another club member. Please contact the club treasury if this is a mistake."
      });
    }
    const { data: pendingConflicts } = await getDb().from("member_submissions").select("id").eq("status", "PENDING").ilike("submitted_email", submittedEmail);
    if ((pendingConflicts || []).some((s) => String(s.id))) {
      return fail(409, {
        success: false,
        error: "A pending update already uses this email address."
      });
    }
    const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const submission = {
      id,
      member_id: String(targetMember.id),
      member_name: String(targetMember.name),
      submitted_name: submittedName,
      submitted_email: submittedEmail,
      submitted_phone: submittedPhone,
      submitted_address: submittedAddress,
      submitted_gender: submittedGender,
      submitted_school: submittedSchool,
      submitted_house: submittedHouse,
      pre_nll_paid: Math.max(0, Number(targetMember.preNllPaid) || 0),
      spot_paid: Math.max(0, Number(targetMember.spotPaid) || 0),
      paid_after: Math.max(0, Number(targetMember.paidAfter) || 0),
      total_paid: Math.max(0, Number(targetMember.historicalPaid ?? targetMember.totalContributed) || 0),
      submitted_at: (/* @__PURE__ */ new Date()).toISOString(),
      status: "PENDING"
    };
    const { error: subErr } = await getDb().from("member_submissions").insert(submission);
    if (subErr) throw new Error(subErr.message);
    const { error: clearErr } = await getDb().from("members").update({ claim_token: "", claim_token_expires_at: null, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", String(targetMember.id));
    if (clearErr) throw new Error(clearErr.message);
    return ok({
      success: true,
      message: "Thank you! Your details have been submitted for confirmation by the club administrator. Once approved, you can sign in to /me with your email anytime."
    });
  } catch (err) {
    return errorResult(err);
  }
};
var meUpdateProfile = async (ctx) => {
  try {
    const member = verifyMemberBearer(ctx.headers);
    if (!member) {
      return fail(401, {
        success: false,
        error: "Please sign in with your registered email to update your profile."
      });
    }
    const cleanName = String(ctx.body?.fullName || "").trim().slice(0, 120);
    const cleanPhone = cleanPhoneNumber(String(ctx.body?.phone || "").trim().slice(0, 30));
    const cleanAddress = String(ctx.body?.address || "").trim().slice(0, 200);
    const cleanGender = normalizeMemberGender(ctx.body?.gender);
    const cleanSchool = normalizeMemberSchool(ctx.body?.school, ctx.body?.otherSchool);
    const cleanHouse = normalizeMemberHouse(ctx.body?.house, cleanSchool);
    if (cleanName.length < 2) {
      return fail(400, { success: false, error: "Full name is required." });
    }
    if (cleanPhone.replace(/\D/g, "").length < 7) {
      return fail(400, { success: false, error: "Enter a valid phone or WhatsApp number." });
    }
    if (!cleanGender) {
      return fail(400, { success: false, error: "Please select your gender (Male or Female)." });
    }
    if (!cleanSchool) {
      return fail(400, { success: false, error: "Please select your school or enter your school name." });
    }
    if (isHouseEligibleSchool(cleanSchool) && !cleanHouse) {
      return fail(400, { success: false, error: `Please select your house at ${cleanSchool}.` });
    }
    const members = await loadMembers();
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const idx = members.findIndex(
      (m) => String(m?.email || "").trim().toLowerCase() === member.email
    );
    let savedRecord;
    if (idx !== -1) {
      const existing = members[idx];
      const prevGender = normalizeMemberGender(existing.gender);
      const nextTarget = resolveMemberExpectedTarget(existing.expectedTargetUgx, cleanGender, prevGender);
      const histPaid = Math.max(0, Number(existing.historicalPaid ?? existing.totalContributed) || 0);
      const livePaid = Math.max(0, Number(existing.livePaid) || 0);
      const totalContributed = histPaid + livePaid;
      savedRecord = {
        ...existing,
        name: cleanName,
        phone: cleanPhone,
        address: cleanAddress,
        gender: cleanGender,
        school: cleanSchool,
        house: cleanHouse,
        expectedTargetUgx: nextTarget,
        remainingUgx: nextTarget > 0 ? Math.max(0, nextTarget - totalContributed) : 0,
        duesStatus: computeDuesStatus(totalContributed, nextTarget),
        updatedAt: nowIso
      };
      savedRecord.profileStatus = isMemberProfileComplete(savedRecord) ? "COMPLETE" : "INCOMPLETE";
      const { error: updErr } = await getDb().from("members").upsert(
        {
          id: String(existing.id),
          name: cleanName,
          phone: cleanPhone,
          address: cleanAddress,
          gender: cleanGender,
          school: cleanSchool,
          house: cleanHouse,
          expected_target_ugx: nextTarget,
          remaining_ugx: savedRecord.remainingUgx,
          dues_status: savedRecord.duesStatus,
          profile_status: savedRecord.profileStatus,
          updated_at: nowIso
        },
        { onConflict: "id" }
      );
      if (updErr) throw new Error(updErr.message);
      await getDb().from("transactions").update({ payer_name: cleanName, phone: cleanPhone }).eq("member_id", String(existing.id));
    } else {
      const { count } = await getDb().from("members").select("id", { count: "exact", head: true });
      const newId = `SB-M-${String((count || members.length) + 1).padStart(4, "0")}`;
      const standardTarget = getStandardTargetForGender(cleanGender);
      savedRecord = {
        id: newId,
        memberId: newId,
        name: cleanName,
        email: member.email,
        phone: cleanPhone,
        address: cleanAddress,
        gender: cleanGender,
        school: cleanSchool,
        house: cleanHouse,
        preNllPaid: 0,
        spotPaid: 0,
        paidAfter: 0,
        historicalPaid: 0,
        livePaid: 0,
        totalContributed: 0,
        expectedTargetUgx: standardTarget,
        remainingUgx: standardTarget,
        duesStatus: computeDuesStatus(0, standardTarget),
        profileStatus: isMemberProfileComplete({
          name: cleanName,
          email: member.email,
          phone: cleanPhone,
          address: cleanAddress
        }) ? "COMPLETE" : "INCOMPLETE",
        source: "LIVE_RECEIPT",
        createdAt: nowIso,
        updatedAt: nowIso
      };
      const { error: insErr } = await getDb().from("members").insert({
        id: newId,
        name: cleanName,
        email: member.email,
        phone: cleanPhone,
        address: cleanAddress,
        gender: cleanGender,
        school: cleanSchool,
        house: cleanHouse,
        expected_target_ugx: standardTarget,
        remaining_ugx: standardTarget,
        dues_status: savedRecord.duesStatus,
        profile_status: savedRecord.profileStatus,
        payment_count: 0,
        source: "LIVE_RECEIPT",
        created_at: nowIso,
        updated_at: nowIso
      });
      if (insErr) throw new Error(insErr.message);
    }
    return ok({
      success: true,
      message: "Your member contact details have been updated.",
      data: sanitizeMemberForClient(savedRecord)
    });
  } catch (err) {
    return errorResult(err);
  }
};

// lib/backend/router.ts
var routes = [
  // --- misc ---------------------------------------------------------------
  { segments: ["health"], handle: health },
  { segments: ["bootstrap"], handle: bootstrap },
  { segments: ["export", "ledger.csv"], handle: exportLedgerCsv },
  { segments: ["audit"], handle: async (ctx) => ctx.method === "POST" ? addAudit(ctx) : listAudit(ctx) },
  // --- legacy no-ops / config --------------------------------------------
  { segments: ["config"], handle: async (ctx) => ctx.method === "POST" ? postConfig(ctx) : getConfig(ctx) },
  { segments: ["gas", "invalidate-cache"], handle: invalidateCache },
  // --- auth ---------------------------------------------------------------
  { segments: ["auth", "login"], handle: login },
  { segments: ["auth", "check"], handle: check },
  { segments: ["auth", "send-otp"], handle: sendOtp },
  { segments: ["auth", "verify-otp"], handle: verifyOtpHandler },
  // --- staff users --------------------------------------------------------
  {
    segments: ["users"],
    handle: async (ctx) => {
      switch (ctx.method) {
        case "POST":
          return upsertUsers(ctx);
        case "PATCH":
          return patchUserStatus(ctx);
        case "DELETE":
          return deleteUser(ctx);
        default:
          return listUsers(ctx);
      }
    }
  },
  { segments: ["users", "password"], handle: setUserPassword },
  // --- transactions / ledger ----------------------------------------------
  { segments: ["transactions"], handle: createTransaction },
  { segments: ["transactions", ":receipt"], handle: deleteTransaction },
  { segments: ["transactions", ":receipt", "resend"], handle: resendReceipt },
  { segments: ["historical-transactions"], handle: historicalTransactions },
  // Legacy alias kept for the pre-migration client: DELETE /api/historical-transactions/:receiptNumber
  { segments: ["historical-transactions", ":receipt"], handle: deleteTransaction },
  // --- settings ------------------------------------------------------------
  { segments: ["settings"], handle: async (ctx) => ctx.method === "POST" ? saveSettingsHandler(ctx) : getSettingsHandler(ctx) },
  // --- members admin --------------------------------------------------------
  { segments: ["admin", "members"], handle: async (ctx) => ctx.method === "POST" ? upsertMember(ctx) : listMembers(ctx) },
  { segments: ["admin", "members", "import-csv"], handle: importCsv },
  { segments: ["admin", "members", "merge"], handle: mergeMembers },
  { segments: ["admin", "members", "reconcile-ledger"], handle: reconcileLedger },
  { segments: ["admin", "members", ":id", "claim-link"], handle: claimLink },
  { segments: ["admin", "members", "submissions", ":submissionId", "review"], handle: reviewSubmission },
  // --- public website --------------------------------------------------------
  { segments: ["public-site"], handle: async (ctx) => ctx.method === "POST" ? savePublicSite(ctx) : getPublicSite(ctx) },
  { segments: ["public-site", "upload-image"], handle: uploadImage },
  { segments: ["public-inquiries"], handle: async (ctx) => ctx.method === "POST" ? submitInquiry(ctx) : listInquiries(ctx) },
  { segments: ["public-inquiries", ":id"], handle: updateInquiryStatus },
  // --- member portal --------------------------------------------------------
  { segments: ["me", "payments"], handle: mePayments },
  { segments: ["me", "profile"], handle: meUpdateProfile },
  { segments: ["me", "send-code"], handle: meSendCode },
  { segments: ["me", "verify-code"], handle: meVerifyCode },
  { segments: ["me", "verify-receipt"], handle: meVerifyReceipt },
  { segments: ["me", "claim", ":token"], handle: async (ctx) => ctx.method === "POST" ? meClaimSubmit(ctx) : meClaimLookup(ctx) }
];
var safeDecode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};
var matchRoute = (segments) => {
  const decoded = segments.map(safeDecode);
  for (const route of routes) {
    if (route.segments.length !== decoded.length) continue;
    const params = {};
    let matched = true;
    for (let i = 0; i < route.segments.length; i++) {
      const pattern = route.segments[i];
      const actual = decoded[i];
      if (pattern.startsWith(":")) {
        params[pattern.slice(1)] = actual;
      } else if (pattern !== actual) {
        matched = false;
        break;
      }
    }
    if (matched) return { handle: route.handle, params };
  }
  return null;
};
var routeApiRequest = async (apiPath, ctx) => {
  const matched = matchRoute(apiPath.split("/").filter(Boolean));
  if (!matched) {
    return {
      status: 404,
      body: { success: false, error: `API route not found: /api/${apiPath}` }
    };
  }
  ctx.params = matched.params;
  return matched.handle(ctx);
};

// lib/backend/vercel-entry.ts
async function handler(req, res) {
  const INVOCATION_TIMEOUT_MS = 8500;
  const withTimeout = (work) => new Promise((resolve) => {
    const timer = setTimeout(
      () => resolve({
        status: 503,
        body: {
          success: false,
          error: "The request took too long. Check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in Vercel \u2192 Settings \u2192 Environment Variables, and that the Supabase project is active (not paused)."
        }
      }),
      INVOCATION_TIMEOUT_MS
    );
    work.then(
      (r) => {
        clearTimeout(timer);
        resolve(r);
      },
      (e) => {
        clearTimeout(timer);
        resolve({
          status: 500,
          body: { success: false, error: e instanceof Error ? e.message : String(e) }
        });
      }
    );
  });
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const query = {};
  for (const [k, v] of url.searchParams.entries()) {
    if (k !== "_route") query[k] = v;
  }
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") headers[k.toLowerCase()] = v;
    else if (Array.isArray(v) && v.length > 0) headers[k.toLowerCase()] = v[0];
  }
  const raw = url.searchParams.get("_route") || url.pathname || "/";
  let apiPath = "";
  try {
    apiPath = decodeURIComponent(raw);
  } catch {
    apiPath = raw;
  }
  apiPath = apiPath.replace(/^\/+api\/+/i, "").replace(/^\/+api$/i, "").replace(/^router\/+/i, "").replace(/^\/+/, "").replace(/\/+$/, "");
  const ctx = {
    method: String(req.method || "GET").toUpperCase(),
    headers,
    query,
    params: {},
    body: req.body
  };
  let result;
  try {
    result = await withTimeout(routeApiRequest(apiPath, ctx));
  } catch (err) {
    result = {
      status: 500,
      body: { success: false, error: err instanceof Error ? err.message : String(err) }
    };
  }
  if (result.headers) {
    for (const [k, v] of Object.entries(result.headers)) res.setHeader(k, v);
  }
  res.status(result.status);
  if (typeof result.body === "string") {
    res.send(result.body);
  } else {
    res.json(result.body);
  }
}
//# sourceMappingURL=router.js.map
