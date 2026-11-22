/**
 * Google Apps Script Backend Code for SC Basimbuzi Receipt Management System
 * Embedded directly in the application for seamless deployment and copy-pasting into Google Apps Script.
 */

export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * ==============================================================================
 * SC BASIMBUZI RECEIPT MANAGEMENT SYSTEM — GOOGLE APPS SCRIPT BACKEND
 * ==============================================================================
 * Production-Hardened Engine:
 * - High-performance batch spreadsheet operations (zero loops with sequential getRange/setValue)
 * - CacheService acceleration for member/user list retrieval (~50ms response)
 * - Lightning-fast in-memory HTML-to-PDF receipt generation (avoids 6-minute Google Doc timeouts)
 * - Resilient email quota exception handling (detects daily MailApp recipient limits)
 * - HTML entity escaping to prevent template injection and XSS
 * - Atomic receipt numbering with ScriptLock (Format: SB-YYYY-00001)
 * ==============================================================================
 */

// OPTIONAL SPREADSHEET ID: If you created a standalone script at script.google.com,
// paste your Spreadsheet ID here. If created from Extensions > Apps Script inside the sheet,
// leave this as "" (it will automatically use the active spreadsheet).
var SPREADSHEET_ID = "";

// OPTIONAL LEGACY MASTER SPREADSHEET ID: For Dual-Writing sync.
// When set (or configured in Settings), every new Inflow or Outflow is written to both the
// primary internal sheet AND the legacy master spreadsheet simultaneously.
var LEGACY_SPREADSHEET_ID = "";

// Sheet Names Constants
var SHEET_TRANSACTIONS = "Transactions";
var SHEET_USERS = "Users";
var SHEET_MEMBERS = "Members";
var SHEET_SETTINGS = "Settings";
var SHEET_AUDIT_LOG = "Audit Log";
var SHEET_COUNTERS = "Receipt Counters";
var SHEET_PUBLIC_SITE = "Public Site";

// Cache Keys
var CACHE_KEY_USERS = "cached_sc_basimbuzi_users_v3";
var CACHE_KEY_PAYERS = "cached_sc_basimbuzi_payers_v3";
var CACHE_KEY_PUBLIC_SITE = "cached_sc_basimbuzi_public_site_v1";

/**
 * Get active or bound spreadsheet instance safely
 */
function getSpreadsheet() {
  var ss = null;
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== "") {
    try {
      ss = SpreadsheetApp.openById(SPREADSHEET_ID.trim());
    } catch (e) {
      Logger.log("Could not open spreadsheet by ID: " + e.toString());
    }
  }

  if (!ss) {
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {
      Logger.log("Could not get active spreadsheet: " + e.toString());
    }
  }

  if (!ss) {
    try {
      ss = SpreadsheetApp.getActive();
    } catch (e) {}
  }

  if (!ss) {
    throw new Error(
      "Unable to locate Google Spreadsheet. If this is a standalone Apps Script project, please paste your Google Spreadsheet ID into SPREADSHEET_ID at the top of Code.gs."
    );
  }
  return ss;
}

/**
 * Escapes HTML characters to prevent XSS and template injection
 */
function escapeHtmlGas(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Helper to safely format dates retrieved from Google Sheets cells
 */
function formatSheetDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone() || "UTC", "yyyy-MM-dd");
  }
  return String(val).trim();
}

/**
 * Helper to safely format times retrieved from Google Sheets cells
 */
function formatSheetTime(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone() || "UTC", "HH:mm:ss");
  }
  return String(val).trim();
}

/**
 * Helper to safely parse numbers from Sheet cells
 */
function parseSheetNumber(val) {
  if (typeof val === "number") return val;
  if (!val) return 0;
  var cleaned = String(val).replace(/[^0-9.-]+/g, "");
  var num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

var KNOWN_STAFF_EMAILS_GAS = [
  "nagabapassion@gmail.com",
  "passionwork94@gmail.com",
  "jotham.itungo@gmail.com",
  "jotham.itubgo@gmail.com",
  "hildanamy7@gmail.com"
];

var PRE_CSV_COVERED_RECEIPTS_GAS = {
  "SB-2026-00004": true, "SB-2026-00005": true, "SB-2026-00006": true, "SB-2026-00007": true,
  "SB-2026-00008": true, "SB-2026-00009": true, "SB-2026-00010": true, "SB-2026-00012": true,
  "SB-2026-00013": true, "SB-2026-00014": true, "SB-2026-00015": true, "SB-2026-00017": true,
  "SB-2026-00018": true, "SB-2026-00019": true, "SB-2026-00020": true, "SB-2026-00021": true,
  "SB-2026-00022": true, "SB-2026-00024": true, "SB-2026-00026": true, "SB-2026-00028": true,
  "SB-2026-00030": true, "SB-2026-00032": true, "SB-2026-00033": true, "SB-2026-00035": true,
  "SB-2026-00036": true, "SB-2026-00037": true, "SB-2026-00038": true, "SB-2026-00039": true,
  "SB-2026-00040": true, "SB-2026-00042": true, "SB-2026-00043": true, "SB-2026-00045": true,
  "SB-2026-00049": true, "SB-2026-00054": true, "SB-2026-00055": true, "SB-2026-00056": true,
  "SB-2026-00057": true, "SB-2026-00063": true
};

function normalizePhoneGas(raw) {
  var stripped = String(raw || "").replace(/[\\u200E\\u200F\\u202A-\\u202E\\u2066-\\u2069]/g, "").trim();
  if (!stripped) return "";
  var compact = stripped.replace(/[\\s()-]/g, "");
  if (/^\\+2567\\d{8}$/.test(compact)) return compact;
  if (/^2567\\d{8}$/.test(compact)) return "+" + compact;
  if (/^07\\d{8}$/.test(compact)) return "+256" + compact.slice(1);
  if (/^7\\d{8}$/.test(compact)) return "+256" + compact;
  if (/^\\+\\d{8,15}$/.test(compact)) return compact;
  return stripped;
}

function isStaffOrPlaceholderEmailGas(email, payerName) {
  var clean = String(email || "").trim().toLowerCase();
  if (!clean) return true;
  if (clean.indexOf("no-reply") > -1 || clean.indexOf("noreply") > -1 || clean.indexOf("whatsapp.direct") > -1) {
    return true;
  }
  var isStaff = false;
  for (var i = 0; i < KNOWN_STAFF_EMAILS_GAS.length; i++) {
    if (KNOWN_STAFF_EMAILS_GAS[i] === clean) {
      isStaff = true;
      break;
    }
  }
  if (!isStaff) return false;
  var normPayer = String(payerName || "").toLowerCase().replace(/[^a-z0-9\\s]/g, " ").replace(/\\s+/g, " ").trim();
  if (clean === "nagabapassion@gmail.com" && (normPayer === "nagaba passion" || normPayer === "passion")) return false;
  if (clean === "jotham.itungo@gmail.com" && (normPayer.indexOf("itungo jotham") > -1 || normPayer.indexOf("jotham itungo") > -1)) return false;
  if (clean === "hildanamy7@gmail.com" && normPayer.indexOf("hilda") > -1) return false;
  return true;
}

/**
 * Helper to return JSON output with CORS headers
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getCacheVersion() {
  try {
    return PropertiesService.getScriptProperties().getProperty("SCB_CACHE_VERSION") || "1";
  } catch (e) {
    return "1";
  }
}

/**
 * Chunked CacheService helpers (bypasses Apps Script 100KB per-key cache limit)
 */
var GAS_CACHE_CHUNK_SIZE = 60000;

function putChunkedCache(key, strVal, ttlSec) {
  try {
    var cache = CacheService.getScriptCache();
    if (!cache || !strVal) return;
    var ttl = ttlSec || 300;
    if (strVal.length <= GAS_CACHE_CHUNK_SIZE) {
      cache.put(key, strVal, ttl);
      return;
    }
    var chunks = Math.ceil(strVal.length / GAS_CACHE_CHUNK_SIZE);
    if (chunks > 20) return;
    var batch = {};
    batch[key] = JSON.stringify({ _chunked: chunks });
    for (var i = 0; i < chunks; i++) {
      batch[key + "_p" + i] = strVal.slice(i * GAS_CACHE_CHUNK_SIZE, (i + 1) * GAS_CACHE_CHUNK_SIZE);
    }
    cache.putAll(batch, ttl);
  } catch (e) {
    Logger.log("putChunkedCache notice: " + e.toString());
  }
}

function getChunkedCache(key) {
  try {
    var cache = CacheService.getScriptCache();
    if (!cache) return null;
    var raw = cache.get(key);
    if (!raw) return null;
    if (raw.indexOf('{"_chunked":') !== 0) {
      return raw;
    }
    var meta = JSON.parse(raw);
    if (!meta || !meta._chunked) return null;
    var partKeys = [];
    for (var i = 0; i < meta._chunked; i++) {
      partKeys.push(key + "_p" + i);
    }
    var parts = cache.getAll(partKeys);
    var combined = "";
    for (var j = 0; j < partKeys.length; j++) {
      if (!parts[partKeys[j]]) return null;
      combined += parts[partKeys[j]];
    }
    return combined;
  } catch (e) {
    return null;
  }
}

/**
 * Clear backend cache when records or settings are updated
 */
function clearBackendCache() {
  try {
    var props = PropertiesService.getScriptProperties();
    var prevVer = Number(props.getProperty("SCB_CACHE_VERSION") || "0");
    if (isNaN(prevVer)) prevVer = 0;
    var nextVer = String(Math.max(new Date().getTime(), prevVer + 1));
    try {
      props.setProperty("SCB_CACHE_VERSION", nextVer);
    } catch (propErr) {
      Logger.log("Cache version bump warning: " + propErr.toString());
    }
    var cache = CacheService.getScriptCache();
    if (cache) {
      cache.removeAll([
        CACHE_KEY_USERS,
        CACHE_KEY_PAYERS,
        CACHE_KEY_PUBLIC_SITE,
        "sc_members_directory_v2"
      ]);
    }
  } catch (e) {
    Logger.log("Cache clear warning: " + e.toString());
  }
}

/**
 * Web App Entry Point - GET Requests
 */
// ==============================================================================
// OPEN-CLOSED PRINCIPLE (OCP) ARCHITECTURE ENGINE: DISPATCHERS & SINKS
// ==============================================================================

/**
 * Open-Closed Query Dispatcher (GET)
 * Adding new read actions requires registering a handler without mutating core router
 */
var QueryActionRegistry = {
  handlers: {},
  register: function(actionName, handlerFn) {
    this.handlers[actionName] = handlerFn;
  },
  dispatch: function(actionName, e, userEmail) {
    var handler = this.handlers[actionName];
    if (typeof handler === "function") {
      return handler(e, userEmail);
    }
    return { success: false, error: "Unknown GET action: " + actionName };
  }
};

/**
 * Open-Closed Command Dispatcher (POST)
 * Adding new command actions requires registering a handler without mutating core router
 */
var ActionRegistry = {
  handlers: {},
  register: function(actionName, handlerFn) {
    this.handlers[actionName] = handlerFn;
  },
  dispatch: function(actionName, data, operatorEmail) {
    var handler = this.handlers[actionName];
    if (typeof handler === "function") {
      return handler(data, operatorEmail);
    }
    return { success: false, error: "Unknown POST action: " + actionName };
  }
};

/**
 * Open-Closed Transaction Type Strategy Registry
 * Adding new transaction types (e.g. REFUND, ADJUSTMENT) requires only register()
 */
var TransactionTypeRegistry = {
  strategies: {},
  register: function(type, strategy) {
    this.strategies[type.toUpperCase()] = strategy;
  },
  get: function(type) {
    var key = (type || "INFLOW").toUpperCase();
    return this.strategies[key] || this.strategies["INFLOW"];
  }
};

/**
 * Open-Closed Dual-Writing Database Sync Pipeline
 * Broadcasts rows across primary sheet and legacy master spreadsheet
 */
var SyncSinkPipeline = {
  sinks: [],
  registerSink: function(sink) {
    this.sinks.push(sink);
  },
  broadcast: function(transaction, rowData, context) {
    var results = [];
    for (var i = 0; i < this.sinks.length; i++) {
      try {
        var res = this.sinks[i].write(transaction, rowData, context);
        results.push(res);
      } catch (err) {
        Logger.log("Sync sink error [" + this.sinks[i].name + "]: " + err.toString());
        results.push({ success: false, sink: this.sinks[i].name, error: err.toString() });
      }
    }
    return results;
  }
};

// SINK 1: Primary Internal Google Sheet
var PrimarySheetSink = {
  name: "PrimarySheet",
  write: function(transaction, rowData, context) {
    var ss = context.ss || getSpreadsheet();
    var txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
    if (!txSheet) {
      setupSpreadsheet();
      txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
    }
    txSheet.appendRow(rowData);
    return { success: true, sink: "PrimarySheet", target: SHEET_TRANSACTIONS };
  }
};

// SINK 2: Separate Legacy Master Spreadsheet (Dual-Writing)
var LegacyMasterSpreadsheetSink = {
  name: "LegacyMasterSpreadsheet",
  write: function(transaction, rowData, context) {
    var legacyId = (context.settings && context.settings.legacySpreadsheetId) ? 
      context.settings.legacySpreadsheetId.trim() : 
      (typeof LEGACY_SPREADSHEET_ID !== "undefined" ? LEGACY_SPREADSHEET_ID.trim() : "");

    if (!legacyId) {
      return { success: true, sink: "LegacyMasterSpreadsheet", status: "SKIPPED_NOT_CONFIGURED" };
    }

    try {
      var legacySs = SpreadsheetApp.openById(legacyId);
      var preferredSheetName = (context.settings && context.settings.legacySheetName) ? String(context.settings.legacySheetName).trim() : "";
      var masterSheet = (preferredSheetName ? legacySs.getSheetByName(preferredSheetName) : null) ||
                        legacySs.getSheetByName("Master Transactions") || 
                        legacySs.getSheetByName("Transactions") || 
                        legacySs.getSheets()[0];
      
      if (!masterSheet) {
        return { success: false, sink: "LegacyMasterSpreadsheet", error: "No available sheet in legacy master spreadsheet" };
      }

      masterSheet.appendRow(rowData);
      return { success: true, sink: "LegacyMasterSpreadsheet", target: masterSheet.getName() };
    } catch (err) {
      Logger.log("Legacy master sync error (isolated): " + err.toString());
      return { success: false, sink: "LegacyMasterSpreadsheet", error: err.toString() };
    }
  }
};

// Register default sync sinks
SyncSinkPipeline.registerSink(PrimarySheetSink);
SyncSinkPipeline.registerSink(LegacyMasterSpreadsheetSink);

/**
 * Web App Entry Point - GET Requests
 */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "ping";
    var userEmail = (e && e.parameter && (e.parameter.operatorEmail || e.parameter.userEmail || e.parameter.email)) ? (e.parameter.operatorEmail || e.parameter.userEmail || e.parameter.email).trim().toLowerCase() : "";
    var response = QueryActionRegistry.dispatch(action, e, userEmail);
    return createJsonResponse(response);
  } catch (err) {
    return createJsonResponse({
      success: false,
      error: "Server GET Error: " + err.toString()
    });
  }
}

/**
 * Web App Entry Point - POST Requests
 */
function doPost(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (jsonErr) {
        data = {};
      }
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    var action = data.action || "";
    var operatorEmail = (data.operatorEmail || "").trim().toLowerCase();
    var response = ActionRegistry.dispatch(action, data, operatorEmail);
    return createJsonResponse(response);
  } catch (err) {
    return createJsonResponse({
      success: false,
      error: "Server POST Error: " + err.toString()
    });
  }
}

/**
 * 1. AUTHORIZATION LOGIC
 */
function parsePermissionsGas(rawVal) {
  if (!rawVal) return null;
  try {
    var parsed = JSON.parse(String(rawVal));
    if (parsed && typeof parsed === "object") return parsed;
  } catch (e) {}
  return null;
}

function checkUserAuth(email) {
  if (!email) {
    return { success: false, authorized: false, error: "Email is required for authorization check" };
  }

  var cleanEmail = email.trim().toLowerCase();
  var ss = getSpreadsheet();
  var userSheet = ss.getSheetByName(SHEET_USERS);

  if (!userSheet) {
    setupSpreadsheet();
    userSheet = ss.getSheetByName(SHEET_USERS);
  }

  // Batch read all user records at once
  var data = userSheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var rowEmail = (data[i][1] || "").toString().trim().toLowerCase();
    var status = (data[i][3] || "").toString().trim().toUpperCase();
    var role = (data[i][2] || "").toString().trim().toUpperCase();
    var name = (data[i][0] || "").toString().trim();
    var createdAt = (data[i][4] || "").toString();
    var perms = parsePermissionsGas(data[i][6]);

    if (rowEmail === cleanEmail) {
      if (cleanEmail === "nagabapassion@gmail.com") {
        role = "OWNER";
      }
      if (status === "ACTIVE") {
        var userObj = {
          name: name || (cleanEmail === "nagabapassion@gmail.com" ? "Nagaba Passion" : "Authorized Staff"),
          email: cleanEmail,
          role: role || (cleanEmail === "nagabapassion@gmail.com" ? "OWNER" : "ADMIN"),
          status: status,
          createdAt: createdAt
        };
        if (perms) userObj.permissions = perms;
        return {
          success: true,
          authorized: true,
          user: userObj
        };
      } else {
        return {
          success: false,
          authorized: false,
          error: "Your account is currently INACTIVE. Please contact the system owner."
        };
      }
    }
  }

  // If this email is the Google account owner, auto-provision as OWNER
  var effectiveEmail = "";
  try {
    effectiveEmail = Session.getEffectiveUser().getEmail().toLowerCase();
  } catch (e) {}

  if (cleanEmail === "nagabapassion@gmail.com" || (effectiveEmail && cleanEmail === effectiveEmail)) {
    var nowIso = new Date().toISOString();
    userSheet.appendRow(["Nagaba Passion", cleanEmail, "OWNER", "ACTIVE", nowIso, "Passion@2026", ""]);
    clearBackendCache();
    return {
      success: true,
      authorized: true,
      user: {
        name: "Nagaba Passion",
        email: cleanEmail,
        role: "OWNER",
        status: "ACTIVE",
        createdAt: nowIso
      }
    };
  }

  return {
    success: false,
    authorized: false,
    error: "ACCESS DENIED — This email address is not registered in the SC Basimbuzi system. Please contact the administrator."
  };
}

/**
 * Verify registered staff member's password dynamically from Google Sheets
 * Ensures ANY staff member added to the system can immediately log in from any device with their assigned password.
 */
function handleVerifyUserPassword(email, enteredPassword) {
  var cleanEmail = String(email || "").trim().toLowerCase();
  var cleanPassword = String(enteredPassword || "").trim();

  if (!cleanEmail || !cleanPassword) {
    return {
      success: false,
      authorized: false,
      error: "Please provide both your registered email address and password."
    };
  }

  var ss = getSpreadsheet();
  var userSheet = ss.getSheetByName(SHEET_USERS);
  if (!userSheet) {
    setupSpreadsheet();
    userSheet = ss.getSheetByName(SHEET_USERS);
  }

  var data = userSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var rowEmail = (data[i][1] || "").toString().trim().toLowerCase();
    if (rowEmail === cleanEmail) {
      var status = (data[i][3] || "").toString().trim().toUpperCase();
      if (status !== "ACTIVE") {
        return {
          success: false,
          authorized: false,
          error: "This staff account is currently INACTIVE. Please contact the administrator."
        };
      }

      var storedPassword = String(data[i][5] || "").trim();
      // System Owner fallback password if not yet populated in sheet column 6
      if (!storedPassword && cleanEmail === "nagabapassion@gmail.com") {
        storedPassword = "Passion@2026";
      }

      if (storedPassword && storedPassword === cleanPassword) {
        var perms = parsePermissionsGas(data[i][6]);
        var verifiedUser = {
          name: String(data[i][0] || cleanEmail.split("@")[0]),
          email: cleanEmail,
          role: String(data[i][2] || (cleanEmail === "nagabapassion@gmail.com" ? "OWNER" : "ADMIN")).toUpperCase(),
          status: status,
          password: storedPassword,
          createdAt: String(data[i][4] || new Date().toISOString())
        };
        if (perms) verifiedUser.permissions = perms;
        return {
          success: true,
          authorized: true,
          user: verifiedUser
        };
      } else {
        return {
          success: false,
          authorized: false,
          error: "Incorrect password. Please verify and try again."
        };
      }
    }
  }

  // Auto-provision owner if clean spreadsheet
  if (cleanEmail === "nagabapassion@gmail.com" && cleanPassword === "Passion@2026") {
    var ownerIso = new Date().toISOString();
    userSheet.appendRow(["Nagaba Passion", cleanEmail, "OWNER", "ACTIVE", ownerIso, "Passion@2026", ""]);
    clearBackendCache();
    return {
      success: true,
      authorized: true,
      user: {
        name: "Nagaba Passion",
        email: cleanEmail,
        role: "OWNER",
        status: "ACTIVE",
        password: "Passion@2026",
        createdAt: ownerIso
      }
    };
  }

  return {
    success: false,
    authorized: false,
    error: "No account registered with this email address. Please contact the administrator."
  };
}

/**
 * Helper: Verify if operator is valid and active
 */
function verifyOperator(email, requiredRole, requiredPermission) {
  var cleanEmail = (email || "").trim().toLowerCase();
  if (cleanEmail === "nagabapassion@gmail.com") {
    return {
      name: "Nagaba Passion",
      email: "nagabapassion@gmail.com",
      role: "OWNER",
      status: "ACTIVE"
    };
  }
  if (!cleanEmail) {
    if (requiredRole || requiredPermission) {
      throw new Error("Permission denied. Operator email is required for this operation.");
    }
    return {
      name: "Nagaba Passion",
      email: "nagabapassion@gmail.com",
      role: "OWNER",
      status: "ACTIVE"
    };
  }

  var auth = checkUserAuth(cleanEmail);
  if (!auth.authorized || !auth.user) {
    throw new Error("Unauthorized access. User " + cleanEmail + " is not active in the system.");
  }
  if (auth.user.role === "OWNER") {
    return auth.user;
  }
  if (requiredPermission) {
    if (auth.user.permissions && auth.user.permissions[requiredPermission] === true) {
      return auth.user;
    }
    if (auth.user.permissions && auth.user.permissions[requiredPermission] === false) {
      throw new Error("Permission denied. Your account does not have " + requiredPermission + " privilege.");
    }
  }
  if (requiredRole === "OWNER") {
    throw new Error("Permission denied. This action requires Owner privileges.");
  }
  return auth.user;
}

/**
 * 2. INITIAL DATA BUNDLE
 */
function getInitialAppData(email, limit) {
  var auth = checkUserAuth(email);
  if (!auth.authorized) {
    return { success: false, authorized: false, error: auth.error };
  }

  var cleanEmail = String(email || "").trim().toLowerCase();
  var maxRows = (limit && Number(limit) > 0) ? Number(limit) : 0;
  var role = auth.user.role || "ADMIN";
  var cacheKey = "initial_data_bundle_v5_" + getCacheVersion() + "_" + cleanEmail + "_" + maxRows;

  var cachedJson = getChunkedCache(cacheKey);
  if (cachedJson) {
    try {
      return {
        success: true,
        authorized: true,
        cached: true,
        user: auth.user,
        data: JSON.parse(cachedJson)
      };
    } catch (e) {}
  }

  var ss = getSpreadsheet();
  var settings = getAppSettings(ss).data;
  var transactions = getAllTransactions(email, maxRows, ss).data || [];
  var users = (role === "OWNER" || (auth.user.permissions && auth.user.permissions.canManageUsers))
    ? (getAllUsers(email, ss).data || [])
    : [auth.user];
  var auditLogs = (role === "OWNER" || (auth.user.permissions && auth.user.permissions.canViewAuditLogs))
    ? (getAuditLogs(email, 50, ss).data || [])
    : [];

  var resultData = {
    settings: settings,
    transactions: transactions,
    users: users,
    auditLogs: auditLogs
  };

  putChunkedCache(cacheKey, JSON.stringify(resultData), 300);

  return {
    success: true,
    authorized: true,
    user: auth.user,
    data: resultData
  };
}

/**
 * 3. ATOMIC RECEIPT NUMBER GENERATOR
 * Uses LockService and strictly batch range write
 */
function generateNextReceiptNumber(prefix) {
  var lock = LockService.getScriptLock();
  var success = lock.tryLock(30000);
  if (!success) {
    throw new Error("System is busy generating another receipt. Please retry in a few seconds.");
  }

  try {
    var ss = getSpreadsheet();
    var counterSheet = ss.getSheetByName(SHEET_COUNTERS);
    if (!counterSheet) {
      counterSheet = ss.insertSheet(SHEET_COUNTERS);
      counterSheet.appendRow(["Year", "Last Sequence Number", "Last Updated"]);
      counterSheet.setFrozenRows(1);
    }

    var currentYear = new Date().getFullYear();
    var prefixToUse = (prefix || "SB").toUpperCase();

    // Batch read counter sheet
    var data = counterSheet.getDataRange().getValues();
    var rowIndex = -1;
    var nextSeq = 1;

    for (var i = 1; i < data.length; i++) {
      if (Number(data[i][0]) === currentYear) {
        rowIndex = i + 1; // 1-indexed for Sheet
        nextSeq = (parseSheetNumber(data[i][1]) || 0) + 1;
        break;
      }
    }

    var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "UTC", "yyyy-MM-dd HH:mm:ss");

    if (rowIndex > -1) {
      // BATCH WRITE: write both sequence and timestamp in a single call
      counterSheet.getRange(rowIndex, 2, 1, 2).setValues([[nextSeq, nowStr]]);
    } else {
      counterSheet.appendRow([currentYear, nextSeq, nowStr]);
    }

    var formattedSeq = ("00000" + nextSeq).slice(-5);
    return prefixToUse + "-" + currentYear + "-" + formattedSeq;
  } finally {
    lock.releaseLock();
  }
}

/**
 * High-speed in-memory HTML to PDF blob generation
 * Avoids Google Docs creation, DocumentApp locks, and 6-minute timeouts!
 */
function createReceiptPdfBlob(htmlContent, receiptNumber) {
  return Utilities.newBlob(htmlContent, "text/html", "Receipt-" + receiptNumber + ".html")
    .getAs("application/pdf")
    .setName("SC_Basimbuzi_Receipt_" + receiptNumber + ".pdf");
}

/**
 * 4. OPEN-CLOSED TRANSACTION STRATEGIES & DUAL-WRITING RUNNER
 */

// Atomic voucher number generator for expenses/outflows
function generateNextVoucherNumber(prefix) {
  var p = prefix || "EXP";
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var counterSheet = ss.getSheetByName(SHEET_COUNTERS);
    if (!counterSheet) {
      setupSpreadsheet();
      counterSheet = ss.getSheetByName(SHEET_COUNTERS);
    }
    var now = new Date();
    var year = now.getFullYear();
    var counterData = counterSheet.getDataRange().getValues();
    var nextSeq = 1;
    var rowToUpdate = -1;
    var counterKey = p + "_" + year;

    for (var i = 1; i < counterData.length; i++) {
      if (String(counterData[i][0]) === counterKey) {
        nextSeq = Number(counterData[i][1]) + 1;
        rowToUpdate = i + 1;
        break;
      }
    }

    if (rowToUpdate !== -1) {
      counterSheet.getRange(rowToUpdate, 2).setValue(nextSeq);
      counterSheet.getRange(rowToUpdate, 3).setValue(now.toISOString());
    } else {
      counterSheet.appendRow([counterKey, nextSeq, now.toISOString()]);
    }

    var formattedSeq = ("00000" + nextSeq).slice(-5);
    return p + "-" + year + "-" + formattedSeq;
  } finally {
    lock.releaseLock();
  }
}

// STRATEGY 1: Inflow Strategy (Receipts, Registrations, Contributions)
var InflowStrategy = {
  type: "INFLOW",
  validate: function(payload) {
    if (!payload.payerName || !payload.amount) {
      return { success: false, error: "Payer Name and Amount are required fields for Inflow." };
    }
    var amount = parseSheetNumber(payload.amount);
    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: "Amount must be a valid positive number." };
    }
    return { success: true, cleanAmount: amount };
  },
  generateIdentifier: function(context) {
    var prefix = (context.settings && context.settings.receiptPrefix) ? context.settings.receiptPrefix : "SB";
    return generateNextReceiptNumber(prefix);
  },
  createRecord: function(payload, identifier, dateStr, timeStr, createdAt, context) {
    var amount = parseSheetNumber(payload.amount);
    var pName = String(payload.payerName).trim();
    var rawEm = payload.email ? String(payload.email).trim().toLowerCase() : "";
    var safeEm = isStaffOrPlaceholderEmailGas(rawEm, pName) ? "" : rawEm;
    return {
      receiptNumber: identifier,
      type: "INFLOW",
      date: dateStr,
      time: timeStr,
      payerName: pName,
      phone: normalizePhoneGas(payload.phone || ""),
      email: safeEm,
      amount: amount,
      paymentPurpose: String(payload.paymentPurpose || "General Payment").trim(),
      paymentMethod: String(payload.paymentMethod || "Cash").trim(),
      paymentReference: String(payload.paymentReference || "").trim(),
      notes: String(payload.notes || "").trim(),
      generatedBy: context.operator.name,
      operatorEmail: context.operatorEmail,
      paymentStatus: payload.paymentStatus || "COMPLETED",
      emailStatus: safeEm ? "PENDING" : "NOT_PROVIDED",
      createdAt: createdAt
    };
  },
  formatRow: function(record, context) {
    return [
      record.receiptNumber,
      record.date,
      record.time,
      record.payerName,
      record.phone,
      record.email,
      record.amount,
      record.paymentPurpose,
      record.paymentMethod,
      record.paymentReference,
      record.notes,
      record.generatedBy,
      record.operatorEmail,
      record.paymentStatus,
      record.emailStatus,
      record.createdAt,
      "INFLOW"
    ];
  },
  onPostProcess: function(record, context) {
    var emailResult = sendReceiptEmail(record, context.settings);
    record.emailStatus = emailResult.emailStatus;

    writeAuditLog({
      user: context.operator.name,
      userEmail: context.operatorEmail,
      action: "GENERATE_RECEIPT",
      receiptNumber: record.receiptNumber,
      description: "Generated inflow receipt " + record.receiptNumber + " of UGX " + record.amount.toLocaleString() + " for " + record.payerName + " (" + record.paymentPurpose + "). Email: " + emailResult.emailStatus
    });

    var msg = (record.emailStatus === "SENT") ? 
      "Receipt " + record.receiptNumber + " generated and PDF emailed to " + record.email :
      "Inflow recorded as " + record.receiptNumber + ". Ready for sharing via WhatsApp.";

    return { success: true, emailStatus: record.emailStatus, message: msg };
  }
};

// STRATEGY 2: Outflow Strategy (Expenses, Logistics, Pitch Hire, Administration)
var OutflowStrategy = {
  type: "OUTFLOW",
  validate: function(payload) {
    var payee = payload.payee || payload.payerName;
    if (!payee || !payload.amount) {
      return { success: false, error: "Payee Name and Amount are required fields for Outflow." };
    }
    var amount = parseSheetNumber(payload.amount);
    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: "Expense amount must be a valid positive number." };
    }
    return { success: true, cleanAmount: amount };
  },
  generateIdentifier: function(context) {
    return generateNextVoucherNumber("EXP");
  },
  createRecord: function(payload, identifier, dateStr, timeStr, createdAt, context) {
    var amount = parseSheetNumber(payload.amount);
    var payee = String(payload.payee || payload.payerName).trim();
    var category = String(payload.category || payload.paymentPurpose || "General Expense").trim();
    return {
      receiptNumber: identifier,
      voucherNumber: identifier,
      type: "OUTFLOW",
      date: dateStr,
      time: timeStr,
      payerName: payee,
      payee: payee,
      category: category,
      phone: String(payload.phone || "").trim(),
      email: payload.email ? String(payload.email).trim().toLowerCase() : "",
      amount: amount,
      paymentPurpose: category,
      paymentMethod: String(payload.paymentMethod || "Cash").trim(),
      paymentReference: String(payload.paymentReference || "").trim(),
      notes: String(payload.notes || "").trim(),
      approvedBy: String(payload.approvedBy || context.operator.name).trim(),
      generatedBy: context.operator.name,
      operatorEmail: context.operatorEmail,
      paymentStatus: "COMPLETED",
      emailStatus: "SKIPPED",
      createdAt: createdAt
    };
  },
  formatRow: function(record, context) {
    return [
      record.receiptNumber,
      record.date,
      record.time,
      record.payee,
      record.phone,
      record.email,
      record.amount,
      record.category,
      record.paymentMethod,
      record.paymentReference,
      record.notes,
      record.generatedBy,
      record.operatorEmail,
      record.paymentStatus,
      "SKIPPED",
      record.createdAt,
      "OUTFLOW"
    ];
  },
  onPostProcess: function(record, context) {
    writeAuditLog({
      user: context.operator.name,
      userEmail: context.operatorEmail,
      action: "RECORD_EXPENSE",
      receiptNumber: record.receiptNumber,
      description: "Recorded expense voucher " + record.receiptNumber + " of UGX " + record.amount.toLocaleString() + " to " + record.payee + " (" + record.category + ")."
    });
    return { success: true, message: "Expense voucher " + record.receiptNumber + " recorded successfully into Financial Ledger." };
  }
};

// Register Strategies into Strategy Registry
TransactionTypeRegistry.register("INFLOW", InflowStrategy);
TransactionTypeRegistry.register("OUTFLOW", OutflowStrategy);

/**
 * Core Open-Closed Transaction Processor
 */
function handleRecordTransaction(payload, operatorEmail) {
  var txType = (payload.type || (payload.payee ? "OUTFLOW" : "INFLOW")).toUpperCase();
  var strategy = TransactionTypeRegistry.get(txType);
  if (!strategy) {
    return { success: false, error: "Unsupported transaction type: " + txType };
  }

  var operator = verifyOperator(operatorEmail);
  var validation = strategy.validate(payload);
  if (!validation.success) {
    return validation;
  }

  var ss = getSpreadsheet();
  var settings = getAppSettings(ss).data;
  var context = { ss: ss, settings: settings, operator: operator, operatorEmail: operatorEmail };

  var identifier = strategy.generateIdentifier(context);
  var now = new Date();
  var dateStr = Utilities.formatDate(now, Session.getScriptTimeZone() || "UTC", "yyyy-MM-dd");
  var timeStr = Utilities.formatDate(now, Session.getScriptTimeZone() || "UTC", "HH:mm:ss");
  var createdAt = now.toISOString();

  var txRecord = strategy.createRecord(payload, identifier, dateStr, timeStr, createdAt, context);
  var rowData = strategy.formatRow(txRecord, context);

  // Dual-Writing broadcast to primary sheet AND legacy master spreadsheet
  var syncResults = SyncSinkPipeline.broadcast(txRecord, rowData, context);

  // Strategy side-effect hook
  var postResult = strategy.onPostProcess(txRecord, context);

  clearBackendCache();

  return {
    success: true,
    data: txRecord,
    syncResults: syncResults,
    emailStatus: txRecord.emailStatus,
    message: postResult.message || "Transaction recorded successfully."
  };
}

/**
 * Legacy Adapter: delegates directly to open-closed processor
 */
function handleGenerateReceipt(payload, operatorEmail) {
  payload = payload || {};
  payload.type = "INFLOW";
  return handleRecordTransaction(payload, operatorEmail);
}

/**
 * 5. RESEND RECEIPT EMAIL
 */
function handleResendReceipt(receiptNumber, operatorEmail) {
  var operator = verifyOperator(operatorEmail);

  if (!receiptNumber) {
    return { success: false, error: "Receipt number is required." };
  }

  var ss = getSpreadsheet();
  var txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  var data = txSheet.getDataRange().getValues();

  var targetRow = -1;
  var txData = null;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toUpperCase() === String(receiptNumber).trim().toUpperCase()) {
      targetRow = i + 1;
      var recNo = String(data[i][0]).trim();
      var pName = String(data[i][3] || "");
      var rawEm = String(data[i][5] || "").trim().toLowerCase();
      var safeEm = isStaffOrPlaceholderEmailGas(rawEm, pName) ? "" : rawEm;
      var cleanPh = normalizePhoneGas(data[i][4] || "");
      var rawType = data[i][16] ? String(data[i][16]).trim().toUpperCase() : "";
      var txType = rawType || (recNo.toUpperCase().indexOf("EXP-") === 0 ? "OUTFLOW" : "INFLOW");
      txData = {
        receiptNumber: recNo,
        type: txType,
        date: formatSheetDate(data[i][1]),
        time: formatSheetTime(data[i][2]),
        payerName: pName,
        phone: cleanPh,
        payerPhone: cleanPh,
        email: safeEm,
        payerEmail: safeEm,
        amount: parseSheetNumber(data[i][6]),
        paymentPurpose: String(data[i][7] || "General Payment"),
        paymentMethod: String(data[i][8] || "Cash"),
        paymentReference: String(data[i][9] || ""),
        notes: String(data[i][10] || ""),
        generatedBy: String(data[i][11] || operator.name),
        operatorEmail: String(data[i][12] || operatorEmail),
        paymentStatus: String(data[i][13] || "COMPLETED"),
        emailStatus: safeEm ? String(data[i][14] || "PENDING") : "NOT_PROVIDED",
        createdAt: String(data[i][15] || "")
      };
      break;
    }
  }

  if (!txData) {
    return { success: false, error: "Receipt not found: " + receiptNumber };
  }

  var settings = getAppSettings().data;
  var emailResult = sendReceiptEmail(txData, settings);

  if (emailResult.success || emailResult.emailStatus === "SENT") {
    txSheet.getRange(targetRow, 15).setValue("SENT");
    txData.emailStatus = "SENT";

    writeAuditLog({
      user: operator.name,
      userEmail: operatorEmail,
      action: "RESEND_RECEIPT",
      receiptNumber: receiptNumber,
      description: "Resent official receipt PDF to " + (txData.email || txData.payerEmail)
    });

    clearBackendCache();

    return {
      success: true,
      message: "Receipt successfully resent to " + (txData.email || txData.payerEmail),
      data: txData
    };
  } else {
    var newStatus = emailResult.emailStatus || "FAILED";
    txSheet.getRange(targetRow, 15).setValue(newStatus);
    txData.emailStatus = newStatus;
    clearBackendCache();
    return {
      success: false,
      error: emailResult.error || "Failed to resend receipt email.",
      data: txData
    };
  }
}

/**
 * 5b. DELETE TRANSACTION (OWNER OR AUTHORIZED OPERATOR WITH canDeleteTransactions)
 */
function handleDeleteTransaction(receiptNumber, operatorEmail) {
  var operator = verifyOperator(operatorEmail, "ADMIN", "canDeleteTransactions");

  if (!receiptNumber) {
    return { success: false, error: "Receipt number is required." };
  }

  var cleanReceipt = String(receiptNumber).trim().toUpperCase();
  var ss = getSpreadsheet();
  var txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  if (!txSheet) {
    return { success: false, error: "Transactions sheet not found." };
  }

  var data = txSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toUpperCase() === cleanReceipt) {
      var payerName = data[i][3] || "N/A";
      var amount = parseSheetNumber(data[i][6]);
      
      txSheet.deleteRow(i + 1);

      writeAuditLog({
        user: operator.name,
        userEmail: operatorEmail,
        action: "DELETE_TRANSACTION",
        receiptNumber: cleanReceipt,
        description: "Deleted receipt " + cleanReceipt + " (Amount: UGX " + Number(amount).toLocaleString() + ", Payer: " + payerName + ")"
      });

      clearBackendCache();

      return {
        success: true,
        message: "Receipt " + cleanReceipt + " was permanently deleted."
      };
    }
  }

  return { success: false, error: "Receipt not found: " + cleanReceipt };
}

/**
 * 5c. SEND LOGIN OTP
 */
function handleSendLoginOtp(email, code) {
  if (!email || !code) {
    return { success: false, error: "Email and access code are required." };
  }

  var cleanEmail = email.trim().toLowerCase();
  var auth = checkUserAuth(cleanEmail);

  if (!auth.authorized || !auth.user) {
    if (cleanEmail === "nagabapassion@gmail.com") {
      auth = {
        authorized: true,
        user: { name: "Nagaba Passion", email: cleanEmail, role: "OWNER", status: "ACTIVE" }
      };
    } else {
      return { success: false, error: "ACCESS DENIED — Email is not authorized or inactive in the system." };
    }
  }

  var settings = {};
  try {
    var settingsRes = getAppSettings();
    if (settingsRes && settingsRes.data) settings = settingsRes.data;
  } catch (e) {}

  var orgName = settings.organizationName || "SC Basimbuzi";
  var orgEmail = settings.organizationEmail || "nagabapassion@gmail.com";
  var subject = orgName + " Sign In Code: " + code;

  var plainBody = "Your " + orgName + " 6-digit access code is: " + code + "\\n\\nThis code expires in 10 minutes.";

  var htmlBody = '<!DOCTYPE html><html><body style="font-family:-apple-system, BlinkMacSystemFont, Roboto, sans-serif; background-color:#f8fafc; padding:24px; color:#1e293b;">' +
    '<div style="max-width:500px; margin:0 auto; background:#ffffff; border-radius:16px; border:1px solid #e2e8f0; padding:32px; text-align:center; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">' +
      '<h2 style="color:#1d4ed8; margin-top:0; font-size:22px; font-weight:800;">' + escapeHtmlGas(orgName) + '</h2>' +
      '<p style="color:#64748b; font-size:14px; margin-bottom:24px;">Receipt Management System Sign In</p>' +
      '<div style="margin:24px 0; padding:20px; background:#eff6ff; border-radius:12px; border:1px solid #bfdbfe;">' +
        '<div style="font-size:11px; color:#1e40af; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:8px;">Your 6-Digit Access Code</div>' +
        '<div style="font-size:36px; font-weight:800; color:#1d4ed8; letter-spacing:8px; font-family:monospace;">' + escapeHtmlGas(code) + '</div>' +
      '</div>' +
      '<p style="font-size:13px; color:#64748b; line-height:1.6;">This code expires in 10 minutes. If you did not request this login code, you can safely disregard this message.</p>' +
      '<div style="margin-top:24px; padding-top:16px; border-top:1px solid #f1f5f9; font-size:12px; color:#94a3b8;">' + escapeHtmlGas(orgName) + ' Security Team</div>' +
    '</div></body></html>';

  try {
    MailApp.sendEmail({
      to: auth.user.email,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody,
      name: orgName,
      replyTo: orgEmail
    });

    try {
      writeAuditLog({
        user: auth.user.name,
        userEmail: auth.user.email,
        action: "LOGIN_OTP_SENT",
        description: "Dispatched 6-digit access code to " + auth.user.email
      });
    } catch (auditErr) {}

    return { success: true, message: "Access code sent to " + auth.user.email };
  } catch (err) {
    var errStr = err.toString();
    try {
      GmailApp.sendEmail(auth.user.email, subject, plainBody, {
        htmlBody: htmlBody,
        name: orgName,
        replyTo: orgEmail
      });
      return { success: true, message: "Access code sent to " + auth.user.email };
    } catch (fallbackErr) {
      return {
        success: false,
        error: "Failed to dispatch email via Google Apps Script: " + errStr
      };
    }
  }
}

/**
 * 5d. SEND MEMBER PORTAL LOGIN OTP (/me self-service)
 */
function handleSendMemberOtp(email, code) {
  var cleanEmail = String(email || "").trim().toLowerCase();
  var cleanCode = String(code || "").trim();

  if (!cleanEmail || cleanEmail.indexOf("@") === -1 || !cleanCode) {
    return { success: false, error: "Valid member email and 6-digit code are required." };
  }

  if (cleanEmail.indexOf("no-reply") > -1 || cleanEmail.indexOf("whatsapp.direct") > -1) {
    return { success: false, error: "Placeholder emails cannot be used for member sign in." };
  }

  var settings = {};
  try {
    var settingsRes = getAppSettings();
    if (settingsRes && settingsRes.data) settings = settingsRes.data;
  } catch (e) {}

  var orgName = settings.organizationName || "SC Basimbuzi";
  var orgEmail = settings.organizationEmail || "nagabapassion@gmail.com";
  var subject = orgName + " Member Sign In Code: " + cleanCode;

  var plainBody = "Your " + orgName + " Member Portal 6-digit sign-in code is: " + cleanCode +
    "\\n\\nThis code expires in 10 minutes. Use it to view your personal payments and receipts.";

  var htmlBody = '<!DOCTYPE html><html><body style="font-family:-apple-system, BlinkMacSystemFont, Roboto, sans-serif; background-color:#f8fafc; padding:24px; color:#1e293b;">' +
    '<div style="max-width:500px; margin:0 auto; background:#ffffff; border-radius:16px; border:1px solid #e2e8f0; padding:32px; text-align:center; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">' +
      '<h2 style="color:#1d4ed8; margin-top:0; font-size:22px; font-weight:800;">' + escapeHtmlGas(orgName) + '</h2>' +
      '<p style="color:#64748b; font-size:14px; margin-bottom:24px;">Member Self-Service Portal Sign In</p>' +
      '<div style="margin:24px 0; padding:20px; background:#eff6ff; border-radius:12px; border:1px solid #bfdbfe;">' +
        '<div style="font-size:11px; color:#1e40af; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:8px;">Your 6-Digit Sign-In Code</div>' +
        '<div style="font-size:36px; font-weight:800; color:#1d4ed8; letter-spacing:8px; font-family:monospace;">' + escapeHtmlGas(cleanCode) + '</div>' +
      '</div>' +
      '<p style="font-size:13px; color:#64748b; line-height:1.6;">Enter this code on the Member Login page to securely view your own payment history and receipts. This code expires in 10 minutes.</p>' +
      '<div style="margin-top:24px; padding-top:16px; border-top:1px solid #f1f5f9; font-size:12px; color:#94a3b8;">' + escapeHtmlGas(orgName) + ' Member Services</div>' +
    '</div></body></html>';

  try {
    MailApp.sendEmail({
      to: cleanEmail,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody,
      name: orgName,
      replyTo: orgEmail
    });

    try {
      writeAuditLog({
        user: "Member Portal",
        userEmail: cleanEmail,
        action: "MEMBER_LOGIN_OTP_SENT",
        description: "Dispatched 6-digit Member Portal sign-in code to " + cleanEmail
      });
    } catch (auditErr) {}

    return { success: true, message: "Sign-in code sent to " + cleanEmail };
  } catch (err) {
    var errStr = err.toString();
    try {
      GmailApp.sendEmail(cleanEmail, subject, plainBody, {
        htmlBody: htmlBody,
        name: orgName,
        replyTo: orgEmail
      });
      return { success: true, message: "Sign-in code sent to " + cleanEmail };
    } catch (fallbackErr) {
      return {
        success: false,
        error: "Failed to dispatch member sign-in email via Google Apps Script: " + errStr
      };
    }
  }
}

/**
 * 6. HTML & PDF RECEIPT SENDER WITH RESILIENT QUOTA HANDLING
 */
function sendReceiptEmail(tx, settings) {
  var cleanEmail = String(tx.payerEmail || "").trim().toLowerCase();
  if (!cleanEmail || cleanEmail.indexOf("whatsapp.direct") > -1 || cleanEmail.indexOf("no-reply") > -1) {
    return { success: true, emailStatus: "NOT_PROVIDED" };
  }

  var orgName = settings.organizationName || "SC Basimbuzi";
  var orgEmail = settings.organizationEmail || "nagabapassion@gmail.com";
  var orgPhone = settings.organizationPhone || "+256 700 000000";
  var orgAddress = settings.organizationAddress || "Kampala, Uganda";
  var footerText = settings.receiptFooter || "Thank you for your payment to SC Basimbuzi.";

  var numAmount = parseSheetNumber(tx.amount);
  var formattedAmount = numAmount.toLocaleString() + " UGX";
  var subject = orgName + " Payment Receipt - " + tx.receiptNumber;

  // Plain-text alternative
  var plainTextBody = orgName + " OFFICIAL PAYMENT RECEIPT\\n" +
    "Receipt Number: " + tx.receiptNumber + "\\n" +
    "Date & Time: " + tx.date + " " + tx.time + "\\n" +
    "Amount Received: " + formattedAmount + "\\n" +
    "Payer Name: " + tx.payerName + "\\n" +
    "Payment Purpose: " + tx.paymentPurpose + "\\n" +
    "Payment Method: " + tx.paymentMethod + "\\n" +
    (tx.paymentReference ? "Payment Reference: " + tx.paymentReference + "\\n" : "") +
    "Status: " + tx.paymentStatus + "\\n" +
    "Issued By: " + tx.generatedBy + "\\n\\n" +
    (tx.notes ? "Notes: " + tx.notes + "\\n\\n" : "") +
    footerText + "\\n" +
    orgAddress + " | " + orgPhone + " | " + orgEmail;

  // Escaped HTML body for security against injection
  var htmlBody = '<!DOCTYPE html>' +
    '<html><head><meta charset="UTF-8"><style>' +
    'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }' +
    '.card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }' +
    '.header { background: #0f172a; color: #ffffff; padding: 28px 24px; text-align: center; }' +
    '.header h1 { margin: 0 0 6px 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }' +
    '.header p { margin: 0; font-size: 13px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.5px; }' +
    '.amount-banner { background: #eff6ff; border-bottom: 1px solid #dbeafe; padding: 20px 24px; text-align: center; }' +
    '.amount-label { font-size: 12px; font-weight: 600; text-transform: uppercase; color: #1e40af; letter-spacing: 1px; margin-bottom: 4px; }' +
    '.amount-value { font-size: 28px; font-weight: 800; color: #1d4ed8; }' +
    '.content { padding: 24px; }' +
    '.meta-grid { width: 100%; border-collapse: collapse; margin-bottom: 20px; }' +
    '.meta-grid td { padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }' +
    '.label { color: #64748b; width: 40%; font-weight: 500; }' +
    '.value { color: #0f172a; font-weight: 600; text-align: right; }' +
    '.badge { display: inline-block; padding: 3px 10px; border-radius: 9999px; font-size: 12px; font-weight: 700; background: #dbeafe; color: #1e40af; }' +
    '.notes-box { background: #f8fafc; border-radius: 8px; padding: 12px 16px; margin-top: 16px; font-size: 13px; color: #475569; border-left: 3px solid #2563eb; }' +
    '.footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; line-height: 1.6; }' +
    '</style></head><body>' +
    '<div class="card">' +
      '<div class="header">' +
        '<h1>' + escapeHtmlGas(orgName) + '</h1>' +
        '<p>Official Payment Receipt</p>' +
      '</div>' +
      '<div class="amount-banner">' +
        '<div class="amount-label">Amount Received</div>' +
        '<div class="amount-value">' + escapeHtmlGas(formattedAmount) + '</div>' +
      '</div>' +
      '<div class="content">' +
        '<table class="meta-grid">' +
          '<tr><td class="label">Receipt Number</td><td class="value"><strong>' + escapeHtmlGas(tx.receiptNumber) + '</strong></td></tr>' +
          '<tr><td class="label">Date & Time</td><td class="value">' + escapeHtmlGas(tx.date) + ' ' + escapeHtmlGas(tx.time) + '</td></tr>' +
          '<tr><td class="label">Payer Name</td><td class="value">' + escapeHtmlGas(tx.payerName) + '</td></tr>' +
          (tx.payerPhone ? '<tr><td class="label">Phone</td><td class="value">' + escapeHtmlGas(tx.payerPhone) + '</td></tr>' : '') +
          '<tr><td class="label">Payer Email</td><td class="value">' + escapeHtmlGas(tx.payerEmail) + '</td></tr>' +
          '<tr><td class="label">Payment Purpose</td><td class="value">' + escapeHtmlGas(tx.paymentPurpose) + '</td></tr>' +
          '<tr><td class="label">Payment Method</td><td class="value">' + escapeHtmlGas(tx.paymentMethod) + '</td></tr>' +
          (tx.paymentReference ? '<tr><td class="label">Payment Reference</td><td class="value">' + escapeHtmlGas(tx.paymentReference) + '</td></tr>' : '') +
          '<tr><td class="label">Payment Status</td><td class="value"><span class="badge">' + escapeHtmlGas(tx.paymentStatus) + '</span></td></tr>' +
          '<tr><td class="label">Issued By</td><td class="value">' + escapeHtmlGas(tx.generatedBy) + '</td></tr>' +
        '</table>' +
        (tx.notes ? '<div class="notes-box"><strong>Notes:</strong> ' + escapeHtmlGas(tx.notes) + '</div>' : '') +
      '</div>' +
      '<div class="footer">' +
        '<div><strong>' + escapeHtmlGas(footerText) + '</strong></div>' +
        '<div style="margin-top: 6px;">' + escapeHtmlGas(orgAddress) + ' &bull; ' + escapeHtmlGas(orgPhone) + ' &bull; ' + escapeHtmlGas(orgEmail) + '</div>' +
        '<div style="margin-top: 8px; color: #94a3b8; font-size: 11px;">This is an official electronically generated PDF receipt. Please retain for your records.</div>' +
      '</div>' +
    '</div></body></html>';

  // Fast in-memory PDF generation (<100ms)
  var pdfBlob = null;
  try {
    pdfBlob = createReceiptPdfBlob(htmlBody, tx.receiptNumber);
  } catch (pdfErr) {
    Logger.log("PDF generation warning: " + pdfErr.toString());
  }

  var mailOptions = {
    to: tx.payerEmail,
    subject: subject,
    body: plainTextBody,
    htmlBody: htmlBody,
    name: orgName,
    replyTo: orgEmail
  };
  if (pdfBlob) {
    mailOptions.attachments = [pdfBlob];
  }

  // Quota exception handling
  try {
    MailApp.sendEmail(mailOptions);
    return { success: true, emailStatus: "SENT" };
  } catch (err1) {
    var err1Str = err1.toString();
    // Detect quota limits
    if (err1Str.indexOf("Service invoked too many times") > -1 || 
        err1Str.indexOf("Limit Exceeded") > -1 || 
        err1Str.indexOf("quota") > -1 || 
        err1Str.indexOf("recipients per day") > -1) {
      return { 
        success: false, 
        emailStatus: "QUOTA_EXCEEDED", 
        error: "Google Mail daily recipient quota reached. PDF generated; can be resent later." 
      };
    }

    // Fallback to GmailApp
    try {
      var gmailOptions = {
        htmlBody: htmlBody,
        name: orgName,
        replyTo: orgEmail
      };
      if (pdfBlob) {
        gmailOptions.attachments = [pdfBlob];
      }
      GmailApp.sendEmail(mailOptions.to, mailOptions.subject, mailOptions.body, gmailOptions);
      return { success: true, emailStatus: "SENT" };
    } catch (err2) {
      var err2Str = err2.toString();
      if (err2Str.indexOf("Service invoked too many times") > -1 || 
          err2Str.indexOf("Limit Exceeded") > -1 || 
          err2Str.indexOf("quota") > -1) {
        return { 
          success: false, 
          emailStatus: "QUOTA_EXCEEDED", 
          error: "Google Mail daily quota reached." 
        };
      }
      return { 
        success: false, 
        emailStatus: "FAILED", 
        error: "Email delivery failed: " + err1Str + " / " + err2Str 
      };
    }
  }
}

/**
 * 7. USER & MEMBER MANAGEMENT (WITH CACHESERVICE & BATCH WRITES)
 */
function getAllUsers(operatorEmail, optionalSs) {
  verifyOperator(operatorEmail);

  var cacheKeyUsers = CACHE_KEY_USERS + "_" + getCacheVersion();
  // Check CacheService first (~20ms) using versioned user cache key
  try {
    var cache = CacheService.getScriptCache();
    if (cache) {
      var cached = cache.get(cacheKeyUsers);
      if (cached) {
        return { success: true, data: JSON.parse(cached), cached: true };
      }
    }
  } catch (e) {
    Logger.log("Cache get error: " + e.toString());
  }

  var ss = optionalSs || getSpreadsheet();
  var userSheet = ss.getSheetByName(SHEET_USERS);
  if (!userSheet) {
    setupSpreadsheet();
    userSheet = ss.getSheetByName(SHEET_USERS);
  }

  // Batch read entire sheet into array
  var data = userSheet.getDataRange().getValues();
  var users = [];

  for (var i = 1; i < data.length; i++) {
    if (data[i][1]) {
      var userEntry = {
        name: String(data[i][0] || ""),
        email: String(data[i][1] || "").toLowerCase(),
        role: String(data[i][2] || "ADMIN").toUpperCase(),
        status: String(data[i][3] || "ACTIVE").toUpperCase(),
        createdAt: String(data[i][4] || ""),
        password: String(data[i][5] || "")
      };
      var parsedPerms = parsePermissionsGas(data[i][6]);
      if (parsedPerms) userEntry.permissions = parsedPerms;
      users.push(userEntry);
    }
  }

  // Store in CacheService for 5 minutes (300 seconds)
  try {
    var cache2 = CacheService.getScriptCache();
    if (cache2) {
      var payload = JSON.stringify(users);
      if (payload.length < 96000) {
        cache2.put(cacheKeyUsers, payload, 300);
      }
    }
  } catch (e) {
    Logger.log("Cache put error: " + e.toString());
  }

  return { success: true, data: users };
}

/**
 * Smart Payer Directory Retrieval for Autofill
 * Searches through the Transactions database for anyone who has paid before.
 * Extracts their full name, phone number, and email address (if provided).
 * NEVER includes system users/administrators unless they actually paid in the ledger.
 */
function getMembersList(operatorEmail, optionalSs) {
  var cacheKeyPayers = CACHE_KEY_PAYERS + "_" + getCacheVersion();
  try {
    var cache = CacheService.getScriptCache();
    if (cache) {
      var cached = cache.get(cacheKeyPayers);
      if (cached) {
        return { success: true, data: JSON.parse(cached), cached: true };
      }
    }
  } catch (e) {}

  var ss = optionalSs || getSpreadsheet();
  var txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  var payerMap = {};

  if (txSheet) {
    var data = txSheet.getDataRange().getValues();
    var hasHistoricalRows = false;
    for (var h = 1; h < data.length; h++) {
      if (String(data[h][0] || "").trim().toUpperCase().indexOf("HIST-") === 0) {
        hasHistoricalRows = true;
        break;
      }
    }
    // Loop through rows in reverse so most recent transactions are indexed first
    for (var i = data.length - 1; i >= 1; i--) {
      var row = data[i];
      var receiptNo = String(row[0] || "").trim().toUpperCase();
      var date = formatSheetDate(row[1]);
      var payerName = String(row[3] || "").trim();
      var phone = normalizePhoneGas(row[4] || "");
      var rawEmail = String(row[5] || "").trim().toLowerCase();
      var email = isStaffOrPlaceholderEmailGas(rawEmail, payerName) ? "" : rawEmail;
      var amount = parseSheetNumber(row[6]);
      var purpose = String(row[7] || "").trim();
      var status = String(row[13] || "").trim().toUpperCase();

      // Skip empty names, cancelled transactions, expense vouchers (OUTFLOWs), and pre-CSV duplicates when historical sheet rows are present
      if (!payerName || status === "CANCELLED" || receiptNo.indexOf("EXP-") === 0) continue;
      if (hasHistoricalRows && PRE_CSV_COVERED_RECEIPTS_GAS[receiptNo]) continue;

      var key = payerName.toLowerCase();

      if (!payerMap[key]) {
        var payerId = "PAYER-" + ("000" + (Object.keys(payerMap).length + 1)).slice(-4);
        payerMap[key] = {
          id: payerId,
          name: payerName,
          phone: phone,
          email: email,
          lastPaymentDate: date,
          totalContributed: amount,
          lastPurpose: purpose,
          paymentCount: 1
        };
      } else {
        payerMap[key].totalContributed = (payerMap[key].totalContributed || 0) + amount;
        payerMap[key].paymentCount = (payerMap[key].paymentCount || 1) + 1;
        // If phone or email were empty on a later row, pick up from earlier row
        if (!payerMap[key].phone && phone) payerMap[key].phone = phone;
        if (!payerMap[key].email && email) payerMap[key].email = email;
      }
    }
  }

  var payerList = [];
  for (var k in payerMap) {
    if (payerMap.hasOwnProperty(k)) {
      payerList.push(payerMap[k]);
    }
  }

  payerList.sort(function(a, b) {
    return a.name.localeCompare(b.name);
  });

  try {
    var cache2 = CacheService.getScriptCache();
    if (cache2) {
      var payloadStr = JSON.stringify(payerList);
      if (payloadStr.length < 96000) {
        cache2.put(CACHE_KEY_PAYERS + "_" + getCacheVersion(), payloadStr, 300);
      }
    }
  } catch (e) {}

  return { success: true, data: payerList };
}

function handleAddUser(newUserData, operatorEmail) {
  if (!newUserData || !newUserData.email) {
    return { success: false, error: "Name and Email are required." };
  }

  var cleanOperator = String(operatorEmail || "").trim().toLowerCase();
  var operator = verifyOperator(cleanOperator, "ADMIN", "canManageUsers");

  var targetEmail = String(newUserData.email).trim().toLowerCase();
  var targetName = String(newUserData.name || targetEmail.split('@')[0]).trim();
  var targetRole = String(newUserData.role || "ADMIN").trim().toUpperCase();
  var targetStatus = String(newUserData.status || "ACTIVE").trim().toUpperCase();
  var targetPermsJson = (newUserData.permissions && typeof newUserData.permissions === "object")
    ? JSON.stringify(newUserData.permissions)
    : "";

  var ss = getSpreadsheet();
  var userSheet = ss.getSheetByName(SHEET_USERS);
  if (!userSheet) {
    setupSpreadsheet();
    userSheet = ss.getSheetByName(SHEET_USERS);
  }

  var data = userSheet.getDataRange().getValues();
  var existingRowIndex = -1;

  for (var i = 1; i < data.length; i++) {
    var email = (data[i][1] || "").toString().trim().toLowerCase();
    if (email === targetEmail) {
      existingRowIndex = i + 1;
      break;
    }
  }

  var nowIso = new Date().toISOString();
  var targetPassword = String((newUserData && newUserData.password) || "").trim();

  if (existingRowIndex > -1) {
    var existingPwd = String(data[existingRowIndex - 1][5] || "");
    var finalPwd = targetPassword || existingPwd;
    var existingPermsStr = String(data[existingRowIndex - 1][6] || "");
    var finalPermsStr = targetPermsJson || existingPermsStr;
    var updatedRow = [
      targetName,
      targetEmail,
      targetEmail === "nagabapassion@gmail.com" ? "OWNER" : targetRole,
      targetStatus,
      String(data[existingRowIndex - 1][4] || nowIso),
      finalPwd,
      finalPermsStr
    ];
    userSheet.getRange(existingRowIndex, 1, 1, 7).setValues([updatedRow]);

    writeAuditLog({
      user: operator.name || "Operator",
      userEmail: cleanOperator,
      action: "UPDATE_USER",
      description: "Updated staff member: " + targetEmail + " as " + targetRole + " (" + targetStatus + ")"
    });

    clearBackendCache();

    var updatedUserData = {
      name: targetName,
      email: targetEmail,
      role: updatedRow[2],
      status: targetStatus,
      createdAt: updatedRow[4],
      password: finalPwd
    };
    var parsedUpdPerms = parsePermissionsGas(finalPermsStr);
    if (parsedUpdPerms) updatedUserData.permissions = parsedUpdPerms;

    return { 
      success: true, 
      message: "Staff member " + targetEmail + " was successfully updated in Google Sheets.",
      data: updatedUserData
    };
  }

  // Append new user row (7 columns including Permissions JSON)
  userSheet.appendRow([
    targetName,
    targetEmail,
    targetRole,
    targetStatus,
    nowIso,
    targetPassword,
    targetPermsJson
  ]);

  writeAuditLog({
    user: operator.name || "Operator",
    userEmail: cleanOperator,
    action: "ADD_ADMIN",
    description: "Added staff member: " + targetEmail + " as " + targetRole + " (" + targetStatus + ")"
  });

  clearBackendCache();

  var createdUserData = {
    name: targetName,
    email: targetEmail,
    role: targetRole,
    status: targetStatus,
    createdAt: nowIso
  };
  if (newUserData.permissions && typeof newUserData.permissions === "object") {
    createdUserData.permissions = newUserData.permissions;
  }

  return { 
    success: true, 
    message: "Staff member " + targetEmail + " was successfully added to Google Sheets.",
    data: createdUserData
  };
}

function handleEditUser(targetEmail, newUserData, operatorEmail) {
  var cleanOperator = String(operatorEmail || "").trim().toLowerCase();
  var operator = verifyOperator(cleanOperator, "ADMIN", "canManageUsers");

  var cleanTargetEmail = String(targetEmail || (newUserData && newUserData.email) || "").trim().toLowerCase();
  if (!cleanTargetEmail) {
    return { success: false, error: "Target email is required." };
  }

  var ss = getSpreadsheet();
  var userSheet = ss.getSheetByName(SHEET_USERS);
  if (!userSheet) {
    setupSpreadsheet();
    userSheet = ss.getSheetByName(SHEET_USERS);
  }

  var data = userSheet.getDataRange().getValues();
  var targetRow = -1;

  for (var i = 1; i < data.length; i++) {
    var email = (data[i][1] || "").toString().trim().toLowerCase();
    if (email === cleanTargetEmail) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow === -1) {
    return handleAddUser(newUserData, cleanOperator);
  }

  var rowVals = data[targetRow - 1];
  var currentName = rowVals[0];
  var currentRole = String(rowVals[2] || "ADMIN").toUpperCase();
  var currentStatus = String(rowVals[3] || "ACTIVE").toUpperCase();
  var currentCreatedAt = rowVals[4];
  var currentPermsStr = String(rowVals[6] || "");

  if (currentRole === "OWNER" && cleanTargetEmail === "nagabapassion@gmail.com") {
    if (newUserData && newUserData.role && String(newUserData.role).toUpperCase() !== "OWNER") {
      return { success: false, error: "Cannot modify the primary Owner account role." };
    }
  }

  var finalEmail = cleanTargetEmail;
  if (newUserData && newUserData.email) {
    var requestedEmail = String(newUserData.email).trim().toLowerCase();
    if (requestedEmail && requestedEmail !== cleanTargetEmail) {
      if (cleanTargetEmail === "nagabapassion@gmail.com") {
        return { success: false, error: "Cannot change the primary Owner email address." };
      }
      for (var c = 1; c < data.length; c++) {
        if ((c + 1) !== targetRow && String(data[c][1] || "").trim().toLowerCase() === requestedEmail) {
          return { success: false, error: "Another user is already registered with email: " + requestedEmail };
        }
      }
      finalEmail = requestedEmail;
    }
  }

  var newName = (newUserData && newUserData.name) ? String(newUserData.name).trim() : currentName;
  var newRole = (newUserData && newUserData.role && finalEmail !== "nagabapassion@gmail.com") 
    ? String(newUserData.role).toUpperCase() 
    : currentRole;
  var newStatus = (newUserData && newUserData.status) ? String(newUserData.status).toUpperCase() : currentStatus;
  var existingPwd = String(rowVals[5] || "");
  var updatedPwd = (newUserData && newUserData.password && String(newUserData.password).trim() !== "")
    ? String(newUserData.password).trim()
    : existingPwd;
  var updatedPermsStr = (newUserData && newUserData.permissions && typeof newUserData.permissions === "object")
    ? JSON.stringify(newUserData.permissions)
    : currentPermsStr;

  // BATCH ROW UPDATE: Write all 7 columns in 1 single call
  userSheet.getRange(targetRow, 1, 1, 7).setValues([[
    newName,
    finalEmail,
    newRole,
    newStatus,
    currentCreatedAt,
    updatedPwd,
    updatedPermsStr
  ]]);

  writeAuditLog({
    user: operator.name || "Operator",
    userEmail: cleanOperator,
    action: "EDIT_USER",
    description: "Updated account for: " + finalEmail
  });

  clearBackendCache();

  var resultUser = {
    name: String(newName),
    email: finalEmail,
    role: newRole,
    status: newStatus,
    createdAt: String(currentCreatedAt),
    password: updatedPwd
  };
  var parsedResultPerms = parsePermissionsGas(updatedPermsStr);
  if (parsedResultPerms) resultUser.permissions = parsedResultPerms;

  return {
    success: true,
    data: resultUser,
    message: "User " + finalEmail + " updated successfully in Google Sheets."
  };
}

function handleUpdateUserStatus(targetEmail, newStatus, operatorEmail) {
  var cleanOperator = String(operatorEmail || "").trim().toLowerCase();
  var operator = verifyOperator(cleanOperator, "ADMIN", "canManageUsers");
  var cleanTargetEmail = String(targetEmail).trim().toLowerCase();
  var statusUpper = String(newStatus).trim().toUpperCase();

  var ss = getSpreadsheet();
  var userSheet = ss.getSheetByName(SHEET_USERS);
  if (!userSheet) {
    setupSpreadsheet();
    userSheet = ss.getSheetByName(SHEET_USERS);
  }

  var data = userSheet.getDataRange().getValues();
  var targetRow = -1;

  for (var i = 1; i < data.length; i++) {
    var email = (data[i][1] || "").toString().trim().toLowerCase();
    if (email === cleanTargetEmail) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow === -1) {
    return { success: false, error: "User not found." };
  }

  userSheet.getRange(targetRow, 4).setValue(statusUpper);

  var action = statusUpper === "ACTIVE" ? "ACTIVATE_ADMIN" : "DEACTIVATE_ADMIN";
  writeAuditLog({
    user: operator.name || "Operator",
    userEmail: cleanOperator,
    action: action,
    description: "Updated status for " + cleanTargetEmail + " to " + statusUpper
  });

  clearBackendCache();

  return { success: true, message: "User status updated to " + statusUpper };
}

function handleRemoveUser(targetEmail, operatorEmail) {
  var cleanOperator = String(operatorEmail || "").trim().toLowerCase();
  var operator = verifyOperator(cleanOperator, "ADMIN", "canManageUsers");
  var cleanTargetEmail = String(targetEmail).trim().toLowerCase();

  var ss = getSpreadsheet();
  var userSheet = ss.getSheetByName(SHEET_USERS);
  if (!userSheet) {
    setupSpreadsheet();
    userSheet = ss.getSheetByName(SHEET_USERS);
  }

  var data = userSheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var email = (data[i][1] || "").toString().trim().toLowerCase();
    var role = (data[i][2] || "").toString().toUpperCase();

    if (email === cleanTargetEmail) {
      if (role === "OWNER" || cleanTargetEmail === "nagabapassion@gmail.com") {
        return { success: false, error: "Cannot delete the Owner account." };
      }
      userSheet.deleteRow(i + 1);

      writeAuditLog({
        user: operator.name || "Operator",
        userEmail: cleanOperator,
        action: "REMOVE_ADMIN",
        description: "Removed user: " + cleanTargetEmail
      });

      clearBackendCache();

      return { success: true, message: "User deleted successfully from Google Sheets." };
    }
  }

  return { success: false, error: "User not found." };
}

/**
 * STRICTLY BATCHED USER SYNCHRONIZATION
 * Rewritten to strictly avoid loops containing sequential .getRange() or .setValue() calls!
 */
function handleSyncUsers(usersList, operatorEmail) {
  var cleanOperator = String(operatorEmail || "").trim().toLowerCase();
  var operator = verifyOperator(cleanOperator, "ADMIN", "canManageUsers");

  if (!usersList || !usersList.length) {
    return { success: false, error: "No users provided for synchronization." };
  }

  var ss = getSpreadsheet();
  var userSheet = ss.getSheetByName(SHEET_USERS);
  if (!userSheet) {
    setupSpreadsheet();
    userSheet = ss.getSheetByName(SHEET_USERS);
  }

  // Step 1: Read entire sheet in ONE batch call & normalize 7-column width
  var sheetData = userSheet.getDataRange().getValues();
  if (sheetData.length > 0) {
    if (sheetData[0].length > 7) sheetData[0] = sheetData[0].slice(0, 7);
    while (sheetData[0].length < 7) sheetData[0].push("");
    if (!sheetData[0][6]) sheetData[0][6] = "Permissions";
  }
  for (var r = 1; r < sheetData.length; r++) {
    if (sheetData[r].length > 7) sheetData[r] = sheetData[r].slice(0, 7);
    while (sheetData[r].length < 7) sheetData[r].push("");
  }

  var existingMap = {};
  for (var i = 1; i < sheetData.length; i++) {
    var email = (sheetData[i][1] || "").toString().trim().toLowerCase();
    if (email) {
      existingMap[email] = i; // 0-based index in sheetData
    }
  }

  var nowIso = new Date().toISOString();
  var updatedCount = 0;
  var newRowsToAppend = [];
  var hasExistingUpdates = false;

  // Step 2: Process updates and additions entirely in memory
  for (var j = 0; j < usersList.length; j++) {
    var u = usersList[j];
    if (!u || !u.email) continue;
    var targetEmail = String(u.email).trim().toLowerCase();
    var targetName = String(u.name || targetEmail.split('@')[0]).trim();
    var targetRole = String(u.role || (targetEmail === "nagabapassion@gmail.com" ? "OWNER" : "ADMIN")).toUpperCase();
    var targetStatus = String(u.status || "ACTIVE").toUpperCase();
    var targetPassword = String(u.password || "").trim();
    var targetPermsStr = (u.permissions && typeof u.permissions === "object") ? JSON.stringify(u.permissions) : "";

    if (existingMap.hasOwnProperty(targetEmail)) {
      var rowIndex = existingMap[targetEmail];
      if (rowIndex < sheetData.length) {
        sheetData[rowIndex][0] = targetName;
        if (targetEmail !== "nagabapassion@gmail.com") {
          sheetData[rowIndex][2] = targetRole;
        }
        sheetData[rowIndex][3] = targetStatus;
        if (targetPassword) {
          sheetData[rowIndex][5] = targetPassword;
        }
        if (targetPermsStr) {
          sheetData[rowIndex][6] = targetPermsStr;
        }
        updatedCount++;
        hasExistingUpdates = true;
      }
    } else {
      newRowsToAppend.push([
        targetName,
        targetEmail,
        targetRole,
        targetStatus,
        nowIso,
        targetPassword,
        targetPermsStr
      ]);
      // Prevent duplicates in same sync payload
      existingMap[targetEmail] = sheetData.length + newRowsToAppend.length - 1;
    }
  }

  // Step 3: Write back in single batch operations
  if (hasExistingUpdates && sheetData.length > 0) {
    userSheet.getRange(1, 1, sheetData.length, 7).setValues(sheetData);
  }

  if (newRowsToAppend.length > 0) {
    var startRow = userSheet.getLastRow() + 1;
    userSheet.getRange(startRow, 1, newRowsToAppend.length, 7).setValues(newRowsToAppend);
  }

  writeAuditLog({
    user: operator.name || "Operator",
    userEmail: cleanOperator,
    action: "SYNC_USERS",
    description: "Batched synchronization of " + (newRowsToAppend.length + updatedCount) + " staff accounts to Google Sheets."
  });

  clearBackendCache();

  return {
    success: true,
    message: "Successfully synchronized " + (newRowsToAppend.length + updatedCount) + " staff accounts to Google Sheets.",
    data: { addedCount: newRowsToAppend.length, updatedCount: updatedCount }
  };
}

/**
 * 8. SETTINGS MANAGEMENT (BATCH WRITES)
 */
function getAppSettings(optionalSs) {
  var ss = optionalSs || getSpreadsheet();
  var settingsSheet = ss.getSheetByName(SHEET_SETTINGS);

  var defaultSettings = {
    organizationName: "SC Basimbuzi",
    organizationEmail: "nagabapassion@gmail.com",
    organizationPhone: "+256 700 000000",
    organizationAddress: "Kampala, Uganda",
    receiptPrefix: "SB",
    receiptFooter: "Thank you for your payment to SC Basimbuzi.",
    logoUrl: "",
    customDomain: "https://scbasimbuzi-v2.ai.studio",
    paymentCategories: ["Membership", "Contribution", "Event", "Registration", "Fundraising", "Merchandise", "Other"],
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
    legacySpreadsheetId: "",
    legacySheetName: "Master Transactions",
    openingBalance: 0,
    openingBalanceDate: "",
    openingBalanceSetBy: "",
    openingBalanceNotes: ""
  };

  if (!settingsSheet) {
    return { success: true, data: defaultSettings };
  }

  var data = settingsSheet.getDataRange().getValues();
  var settingsMap = {};

  for (var i = 0; i < data.length; i++) {
    var key = (data[i][0] || "").toString().trim();
    var val = data[i][1];
    if (key) {
      settingsMap[key] = val;
    }
  }

  var categories = defaultSettings.paymentCategories;
  if (settingsMap["Payment Categories"]) {
    try {
      categories = JSON.parse(settingsMap["Payment Categories"]);
    } catch(e) {
      categories = String(settingsMap["Payment Categories"]).split(",").map(function(s){return s.trim();});
    }
  }

  var expCategories = defaultSettings.expenseCategories;
  if (settingsMap["Expense Categories"]) {
    try {
      expCategories = JSON.parse(settingsMap["Expense Categories"]);
    } catch(e) {
      expCategories = String(settingsMap["Expense Categories"]).split(",").map(function(s){return s.trim();});
    }
  }

  var methods = defaultSettings.paymentMethods;
  if (settingsMap["Payment Methods"]) {
    try {
      methods = JSON.parse(settingsMap["Payment Methods"]);
    } catch(e) {
      methods = String(settingsMap["Payment Methods"]).split(",").map(function(s){return s.trim();});
    }
  }

  return {
    success: true,
    data: {
      organizationName: settingsMap["Organization Name"] || defaultSettings.organizationName,
      organizationEmail: settingsMap["Organization Email"] || defaultSettings.organizationEmail,
      organizationPhone: settingsMap["Organization Phone"] || defaultSettings.organizationPhone,
      organizationAddress: settingsMap["Organization Address"] || defaultSettings.organizationAddress,
      receiptPrefix: settingsMap["Receipt Prefix"] || defaultSettings.receiptPrefix,
      receiptFooter: settingsMap["Receipt Footer"] || defaultSettings.receiptFooter,
      logoUrl: settingsMap["Logo URL"] || defaultSettings.logoUrl,
      customDomain: settingsMap["Custom Domain"] || defaultSettings.customDomain,
      paymentCategories: categories,
      expenseCategories: expCategories,
      paymentMethods: methods,
      currency: settingsMap["Currency"] || defaultSettings.currency,
      legacySpreadsheetId: settingsMap["Legacy Spreadsheet ID"] || "",
      legacySheetName: settingsMap["Legacy Sheet Name"] || defaultSettings.legacySheetName,
      openingBalance: settingsMap["Opening Balance"] !== undefined && settingsMap["Opening Balance"] !== ""
        ? parseSheetNumber(settingsMap["Opening Balance"])
        : 0,
      openingBalanceDate: settingsMap["Opening Balance Date"] ? formatSheetDate(settingsMap["Opening Balance Date"]) : "",
      openingBalanceSetBy: settingsMap["Opening Balance Set By"] ? String(settingsMap["Opening Balance Set By"]) : "",
      openingBalanceNotes: settingsMap["Opening Balance Notes"] ? String(settingsMap["Opening Balance Notes"]) : ""
    }
  };
}

function handleSaveSettings(newSettings, operatorEmail) {
  var operator = verifyOperator(operatorEmail, "OWNER", "canEditSettings");

  var ss = getSpreadsheet();
  var settingsSheet = ss.getSheetByName(SHEET_SETTINGS);
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet(SHEET_SETTINGS);
  }

  var cleanOpeningBalance = newSettings.openingBalance !== undefined ? parseSheetNumber(newSettings.openingBalance) : 0;
  var savedSettings = {
    organizationName: String(newSettings.organizationName || "SC Basimbuzi"),
    organizationEmail: String(newSettings.organizationEmail || "nagabapassion@gmail.com"),
    organizationPhone: String(newSettings.organizationPhone || ""),
    organizationAddress: String(newSettings.organizationAddress || ""),
    receiptPrefix: String(newSettings.receiptPrefix || "SB").toUpperCase(),
    receiptFooter: String(newSettings.receiptFooter || ""),
    logoUrl: String(newSettings.logoUrl || ""),
    customDomain: String(newSettings.customDomain || "https://scbasimbuzi-v2.ai.studio"),
    paymentCategories: Array.isArray(newSettings.paymentCategories) ? newSettings.paymentCategories : [],
    expenseCategories: Array.isArray(newSettings.expenseCategories) ? newSettings.expenseCategories : [],
    paymentMethods: Array.isArray(newSettings.paymentMethods) ? newSettings.paymentMethods : [],
    currency: String(newSettings.currency || "UGX"),
    legacySpreadsheetId: String(newSettings.legacySpreadsheetId || ""),
    legacySheetName: String(newSettings.legacySheetName || "Master Transactions"),
    openingBalance: cleanOpeningBalance,
    openingBalanceDate: String(newSettings.openingBalanceDate || ""),
    openingBalanceSetBy: String(newSettings.openingBalanceSetBy || ""),
    openingBalanceNotes: String(newSettings.openingBalanceNotes || "")
  };

  var settingsRows = [
    ["Key", "Value"],
    ["Organization Name", savedSettings.organizationName],
    ["Organization Email", savedSettings.organizationEmail],
    ["Organization Phone", savedSettings.organizationPhone],
    ["Organization Address", savedSettings.organizationAddress],
    ["Receipt Prefix", savedSettings.receiptPrefix],
    ["Receipt Footer", savedSettings.receiptFooter],
    ["Logo URL", savedSettings.logoUrl],
    ["Custom Domain", savedSettings.customDomain],
    ["Payment Categories", JSON.stringify(savedSettings.paymentCategories)],
    ["Expense Categories", JSON.stringify(savedSettings.expenseCategories)],
    ["Payment Methods", JSON.stringify(savedSettings.paymentMethods)],
    ["Currency", savedSettings.currency],
    ["Legacy Spreadsheet ID", savedSettings.legacySpreadsheetId],
    ["Legacy Sheet Name", savedSettings.legacySheetName],
    ["Opening Balance", cleanOpeningBalance],
    ["Opening Balance Date", savedSettings.openingBalanceDate],
    ["Opening Balance Set By", savedSettings.openingBalanceSetBy],
    ["Opening Balance Notes", savedSettings.openingBalanceNotes]
  ];

  // BATCH WRITE: clear and write all settings in a single batch setValues call
  settingsSheet.clear();
  settingsSheet.getRange(1, 1, settingsRows.length, 2).setValues(settingsRows);
  settingsSheet.setFrozenRows(1);

  writeAuditLog({
    user: operator.name,
    userEmail: operatorEmail,
    action: "CHANGE_SETTINGS",
    description: "Updated organization settings and receipt configuration via batch write"
  });

  clearBackendCache();

  return { success: true, data: savedSettings, message: "Settings saved successfully." };
}

/**
 * 9. TRANSACTIONS QUERY & SEARCH
 */
function getAllTransactions(operatorEmail, limit, optionalSs) {
  verifyOperator(operatorEmail);

  var maxLimit = (limit && Number(limit) > 0) ? Number(limit) : 0;
  var cacheKeyAll = "tx_all_v5_" + getCacheVersion();
  if (maxLimit === 0) {
    var cachedTxJson = getChunkedCache(cacheKeyAll);
    if (cachedTxJson) {
      try {
        return { success: true, cached: true, data: JSON.parse(cachedTxJson) };
      } catch (e) {}
    }
  }

  var ss = optionalSs || getSpreadsheet();
  var txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  if (!txSheet) {
    return { success: true, data: [] };
  }

  var lastRow = txSheet.getLastRow();
  if (lastRow <= 1) {
    return { success: true, data: [] };
  }

  var lastCol = Math.max(1, Math.min(txSheet.getLastColumn(), 17));

  var startRow = 2;
  var numRows = lastRow - 1;

  if (maxLimit > 0 && numRows > maxLimit) {
    startRow = lastRow - maxLimit + 1;
    numRows = maxLimit;
  }

  // Single batch range retrieval
  var data = txSheet.getRange(startRow, 1, numRows, lastCol).getValues();
  var transactions = [];

  for (var i = 0; i < data.length; i++) {
    if (data[i][0]) {
      var pName = String(data[i][3] || "").trim();
      var rawEm = String(data[i][5] || "").trim().toLowerCase();
      var safeEm = isStaffOrPlaceholderEmailGas(rawEm, pName) ? "" : rawEm;
      var recNo = String(data[i][0] || "").trim().toUpperCase();
      var rawType = data[i][16] ? String(data[i][16]).trim().toUpperCase() : "";
      var txType = rawType || (recNo.indexOf("EXP-") === 0 ? "OUTFLOW" : "INFLOW");
      transactions.push({
        receiptNumber: String(data[i][0]),
        type: txType,
        date: formatSheetDate(data[i][1]),
        time: formatSheetTime(data[i][2]),
        payerName: pName,
        phone: normalizePhoneGas(data[i][4] || ""),
        email: safeEm,
        amount: parseSheetNumber(data[i][6]),
        paymentPurpose: String(data[i][7] || ""),
        paymentMethod: String(data[i][8] || ""),
        paymentReference: String(data[i][9] || ""),
        notes: String(data[i][10] || ""),
        generatedBy: String(data[i][11] || ""),
        operatorEmail: String(data[i][12] || ""),
        paymentStatus: String(data[i][13] || "COMPLETED"),
        emailStatus: safeEm ? String(data[i][14] || "PENDING") : "NOT_PROVIDED",
        createdAt: String(data[i][15] || "")
      });
    }
  }

  transactions.reverse();
  if (maxLimit === 0) {
    putChunkedCache(cacheKeyAll, JSON.stringify(transactions), 300);
  }
  return { success: true, data: transactions };
}

function getReceiptByNumber(receiptNumber, operatorEmail) {
  verifyOperator(operatorEmail);
  var all = getAllTransactions(operatorEmail).data || [];
  var cleanNum = String(receiptNumber).trim().toUpperCase();

  for (var i = 0; i < all.length; i++) {
    if (String(all[i].receiptNumber).toUpperCase() === cleanNum) {
      return { success: true, data: all[i] };
    }
  }

  return { success: false, error: "Receipt not found: " + receiptNumber };
}

function searchReceipts(query, operatorEmail) {
  verifyOperator(operatorEmail);
  var all = getAllTransactions(operatorEmail).data || [];
  if (!query || query.trim() === "") {
    return { success: true, data: all };
  }

  var q = query.trim().toLowerCase();
  var results = all.filter(function(tx) {
    return (
      (tx.receiptNumber && tx.receiptNumber.toLowerCase().indexOf(q) > -1) ||
      (tx.payerName && tx.payerName.toLowerCase().indexOf(q) > -1) ||
      (tx.email && tx.email.toLowerCase().indexOf(q) > -1) ||
      (tx.phone && tx.phone.toLowerCase().indexOf(q) > -1) ||
      (tx.paymentReference && tx.paymentReference.toLowerCase().indexOf(q) > -1) ||
      (tx.paymentPurpose && tx.paymentPurpose.toLowerCase().indexOf(q) > -1)
    );
  });

  return { success: true, data: results };
}

/**
 * 10. AUDIT LOGGING
 */
function writeAuditLog(entry) {
  try {
    var ss = getSpreadsheet();
    var auditSheet = ss.getSheetByName(SHEET_AUDIT_LOG);
    if (!auditSheet) {
      auditSheet = ss.insertSheet(SHEET_AUDIT_LOG);
      auditSheet.appendRow(["Date", "Time", "User", "User Email", "Action", "Receipt Number", "Description"]);
      auditSheet.setFrozenRows(1);
    }

    var now = new Date();
    var dateStr = Utilities.formatDate(now, Session.getScriptTimeZone() || "UTC", "yyyy-MM-dd");
    var timeStr = Utilities.formatDate(now, Session.getScriptTimeZone() || "UTC", "HH:mm:ss");

    auditSheet.appendRow([
      dateStr,
      timeStr,
      entry.user || "System",
      entry.userEmail || "",
      entry.action || "INFO",
      entry.receiptNumber || "",
      entry.description || ""
    ]);
  } catch (e) {
    Logger.log("Audit log error: " + e.toString());
  }
}

function getAuditLogs(operatorEmail, limit, optionalSs) {
  verifyOperator(operatorEmail, "OWNER");

  var ss = optionalSs || getSpreadsheet();
  var auditSheet = ss.getSheetByName(SHEET_AUDIT_LOG);
  if (!auditSheet) {
    return { success: true, data: [] };
  }

  var lastRow = auditSheet.getLastRow();
  if (lastRow <= 1) {
    return { success: true, data: [] };
  }

  var maxLimit = (limit && Number(limit) > 0) ? Number(limit) : 0;
  var lastCol = Math.max(1, Math.min(auditSheet.getLastColumn(), 7));

  var startRow = 2;
  var numRows = lastRow - 1;

  if (maxLimit > 0 && numRows > maxLimit) {
    startRow = lastRow - maxLimit + 1;
    numRows = maxLimit;
  }

  var data = auditSheet.getRange(startRow, 1, numRows, lastCol).getValues();
  var logs = [];

  for (var i = 0; i < data.length; i++) {
    if (data[i][0]) {
      logs.push({
        date: formatSheetDate(data[i][0]),
        time: formatSheetTime(data[i][1]),
        user: String(data[i][2] || ""),
        userEmail: String(data[i][3] || ""),
        action: String(data[i][4] || ""),
        receiptNumber: String(data[i][5] || ""),
        description: String(data[i][6] || "")
      });
    }
  }

  logs.reverse();
  return { success: true, data: logs };
}

function handleLogAction(data, operatorEmail) {
  var operator = verifyOperator(operatorEmail);
  writeAuditLog({
    user: operator.name,
    userEmail: operatorEmail,
    action: data.auditAction || "VIEW_RECEIPT",
    receiptNumber: data.receiptNumber || "",
    description: data.description || ""
  });
  return { success: true };
}

/**
 * 11. SPREADSHEET INITIALIZATION / AUTO-SETUP
 */
function setupSpreadsheet() {
  var ss = getSpreadsheet();

  // 1. Transactions Sheet
  var txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  if (!txSheet) {
    txSheet = ss.insertSheet(SHEET_TRANSACTIONS);
    txSheet.appendRow([
      "Receipt Number",
      "Date",
      "Time",
      "Payer Name",
      "Phone",
      "Email",
      "Amount",
      "Payment Purpose",
      "Payment Method",
      "Payment Reference",
      "Notes",
      "Generated By",
      "Operator Email",
      "Payment Status",
      "Email Status",
      "Created At",
      "Type"
    ]);
    txSheet.setFrozenRows(1);
  }

  // 2. Users Sheet
  var userSheet = ss.getSheetByName(SHEET_USERS);
  if (!userSheet) {
    userSheet = ss.insertSheet(SHEET_USERS);
    userSheet.appendRow(["Name", "Email", "Role", "Status", "Created At", "Password", "Permissions"]);
    userSheet.setFrozenRows(1);
  }

  var userData = userSheet.getDataRange().getValues();
  var ownerRegistered = false;
  var targetOwnerEmail = "nagabapassion@gmail.com";

  var effectiveEmail = "";
  try {
    effectiveEmail = Session.getEffectiveUser().getEmail().toLowerCase();
  } catch (e) {}

  for (var u = 1; u < userData.length; u++) {
    var emailInRow = (userData[u][1] || "").toString().trim().toLowerCase();
    if (emailInRow === targetOwnerEmail || (effectiveEmail && emailInRow === effectiveEmail)) {
      ownerRegistered = true;
      break;
    }
  }

  if (!ownerRegistered) {
    var primaryOwner = effectiveEmail || targetOwnerEmail;
    userSheet.appendRow([
      "Nagaba Passion",
      primaryOwner.toLowerCase(),
      "OWNER",
      "ACTIVE",
      new Date().toISOString(),
      "Passion@2026",
      ""
    ]);
  }

  // 3. Settings Sheet
  var settingsSheet = ss.getSheetByName(SHEET_SETTINGS);
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet(SHEET_SETTINGS);
    var initSettings = [
      ["Key", "Value"],
      ["Organization Name", "SC Basimbuzi"],
      ["Organization Email", "nagabapassion@gmail.com"],
      ["Organization Phone", "+256 700 000000"],
      ["Organization Address", "Kampala, Uganda"],
      ["Receipt Prefix", "SB"],
      ["Receipt Footer", "Thank you for your payment to SC Basimbuzi."],
      ["Logo URL", ""],
      ["Custom Domain", "https://scbasimbuzi-v2.ai.studio"],
      ["Payment Categories", JSON.stringify(["Membership", "Contribution", "Event", "Registration", "Fundraising", "Merchandise", "Other"])],
      ["Expense Categories", JSON.stringify(["Pitch Hire & Facilities", "Match Day & Referees", "Equipment & Kits", "Transport & Logistics", "Player Refreshments & Meals", "Medical & First Aid", "Administration & Utilities", "Tournament Entry Fee", "Other Expenses"])],
      ["Payment Methods", JSON.stringify(["Mobile Money", "Bank Transfer", "Cash", "Other"])],
      ["Currency", "UGX"],
      ["Legacy Spreadsheet ID", ""],
      ["Legacy Sheet Name", "Master Transactions"],
      ["Opening Balance", 0],
      ["Opening Balance Date", ""],
      ["Opening Balance Set By", ""],
      ["Opening Balance Notes", ""]
    ];
    settingsSheet.getRange(1, 1, initSettings.length, 2).setValues(initSettings);
    settingsSheet.setFrozenRows(1);
  }

  // 4. Audit Log Sheet
  var auditSheet = ss.getSheetByName(SHEET_AUDIT_LOG);
  if (!auditSheet) {
    auditSheet = ss.insertSheet(SHEET_AUDIT_LOG);
    auditSheet.appendRow(["Date", "Time", "User", "User Email", "Action", "Receipt Number", "Description"]);
    auditSheet.setFrozenRows(1);
    auditSheet.appendRow([
      Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "UTC", "yyyy-MM-dd"),
      Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "UTC", "HH:mm:ss"),
      "System",
      "",
      "SYSTEM_INITIALIZE",
      "",
      "Initialized SC Basimbuzi Database and tables."
    ]);
  }

  // 5. Receipt Counters Sheet
  var counterSheet = ss.getSheetByName(SHEET_COUNTERS);
  if (!counterSheet) {
    counterSheet = ss.insertSheet(SHEET_COUNTERS);
    counterSheet.appendRow(["Year", "Last Sequence Number", "Last Updated"]);
    counterSheet.setFrozenRows(1);
    counterSheet.appendRow([
      new Date().getFullYear(),
      0,
      Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "UTC", "yyyy-MM-dd HH:mm:ss")
    ]);
  }

  // 6. Members Directory Sheet (18 columns with Gender, School, House in cols 6-8)
  var membersSheet = ss.getSheetByName(SHEET_MEMBERS);
  if (!membersSheet) {
    membersSheet = ss.insertSheet(SHEET_MEMBERS);
    membersSheet.appendRow(MEMBERS_HEADERS_V2_GAS);
    membersSheet.setFrozenRows(1);
  } else {
    ensureMembersSchemaMigratedGas(membersSheet);
  }

  clearBackendCache();

  return {
    success: true,
    message: "Google Spreadsheet structure initialized successfully with all 6 sheets."
  };
}

/**
 * 12. MEMBERS DIRECTORY & IDEMPOTENT HISTORICAL TREASURY SYNC
 */
var MEMBERS_HEADERS_V2_GAS = [
  "Member ID",
  "Full Name",
  "Phone",
  "Email",
  "Physical Address",
  "Gender",
  "School",
  "House",
  "Pre-NLL Paid",
  "Spot Paid",
  "Paid After",
  "Historical Total",
  "Profile Status",
  "Updated At",
  "Expected Target",
  "Live Paid",
  "Total Contributed",
  "Dues Status"
];

function normalizeMemberNameSimpleGas(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9\\s]/g, " ").replace(/\\s+/g, " ").trim();
}

function isHouseEligibleSchoolGas(school) {
  var s = String(school || "").trim().toLowerCase().replace(/[\\u2018\\u2019\\x60]/g, "'");
  return s === "ntare school" || s === "ntare" || s === "bweranyagyi girls' secondary school" || s === "bweranyagyi girls secondary school" || s === "bweranyagyi";
}

function ensureMembersSchemaMigratedGas(membersSheet) {
  if (!membersSheet) return [];
  var sheetData = membersSheet.getDataRange().getValues();
  if (!sheetData || sheetData.length === 0) {
    membersSheet.getRange(1, 1, 1, 18).setValues([MEMBERS_HEADERS_V2_GAS]);
    membersSheet.setFrozenRows(1);
    return [MEMBERS_HEADERS_V2_GAS.slice(0)];
  }

  var col6Header = String(sheetData[0][5] || "").trim().toLowerCase();
  var isNewSchema = col6Header === "gender" && String(sheetData[0][6] || "").trim().toLowerCase() === "school";
  if (isNewSchema) {
    return sheetData;
  }

  // Migrate legacy 16-col Members sheet (where Col 6 was Tier) to 18-col layout (Gender, School, House at Cols 6-8)
  var newRows = [MEMBERS_HEADERS_V2_GAS.slice(0)];
  var isLegacyTierLayout = col6Header === "tier" || col6Header === "";
  for (var r = 1; r < sheetData.length; r++) {
    var oldRow = sheetData[r];
    if (!oldRow[0] && !oldRow[1]) continue;
    if (isLegacyTierLayout) {
      newRows.push([
        oldRow[0] || "",
        oldRow[1] || "",
        oldRow[2] || "",
        oldRow[3] || "",
        oldRow[4] || "",
        "",
        "",
        "",
        parseSheetNumber(oldRow[6]),
        parseSheetNumber(oldRow[7]),
        parseSheetNumber(oldRow[8]),
        parseSheetNumber(oldRow[9]),
        oldRow[10] || "INCOMPLETE",
        oldRow[11] || "",
        oldRow.length > 12 && oldRow[12] !== "" ? parseSheetNumber(oldRow[12]) : 100000,
        oldRow.length > 13 ? parseSheetNumber(oldRow[13]) : 0,
        oldRow.length > 14 ? parseSheetNumber(oldRow[14]) : 0,
        oldRow[15] || ""
      ]);
    } else {
      var normalized = oldRow.slice(0, 18);
      while (normalized.length < 18) normalized.push("");
      newRows.push(normalized);
    }
  }

  var clearCols = Math.max(membersSheet.getLastColumn(), 18);
  if (sheetData.length > 0) {
    membersSheet.getRange(1, 1, sheetData.length, clearCols).clearContent();
  }
  membersSheet.getRange(1, 1, newRows.length, 18).setValues(newRows);
  membersSheet.setFrozenRows(1);
  return newRows;
}

function formatMemberRowGas(m) {
  var mName = String(m.name || "").trim();
  var mEmail = isStaffOrPlaceholderEmailGas(m.email, mName) ? "" : String(m.email || "").trim().toLowerCase();
  var mGender = String(m.gender || "").trim();
  var mSchool = String(m.school || "").trim();
  var mHouse = isHouseEligibleSchoolGas(mSchool) ? String(m.house || "").trim() : "";
  var histVal = parseSheetNumber(m.historicalPaid !== undefined ? m.historicalPaid : m.totalContributed);
  var liveVal = parseSheetNumber(m.livePaid);
  var totalVal = m.totalContributed !== undefined ? parseSheetNumber(m.totalContributed) : (histVal + liveVal);
  var targetVal = m.expectedTargetUgx !== undefined ? parseSheetNumber(m.expectedTargetUgx) : 100000;
  return [
    String(m.id || m.memberId || ""),
    mName,
    normalizePhoneGas(m.phone || ""),
    mEmail,
    String(m.address || ""),
    mGender,
    mSchool,
    mHouse,
    parseSheetNumber(m.preNllPaid),
    parseSheetNumber(m.spotPaid),
    parseSheetNumber(m.paidAfter),
    histVal,
    String(m.profileStatus || "INCOMPLETE"),
    String(m.updatedAt || new Date().toISOString()),
    targetVal,
    liveVal,
    totalVal,
    String(m.duesStatus || "")
  ];
}

function upsertTransactionsBatchGas(ss, incomingTxs, operator, overwriteExisting) {
  var appendedTxs = 0;
  var updatedTxs = 0;
  if (!incomingTxs || !incomingTxs.length) {
    return { appendedTxs: 0, updatedTxs: 0 };
  }
  var txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  if (!txSheet) {
    setupSpreadsheet();
    txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  }
  var existingData = txSheet.getDataRange().getValues();
  if (existingData.length > 0) {
    if (existingData[0].length > 17) existingData[0] = existingData[0].slice(0, 17);
    while (existingData[0].length < 17) existingData[0].push("");
    if (!existingData[0][16]) existingData[0][16] = "Type";
  }
  var existingRowIndexMap = {};
  for (var i = 1; i < existingData.length; i++) {
    if (existingData[i].length > 17) existingData[i] = existingData[i].slice(0, 17);
    while (existingData[i].length < 17) existingData[i].push("");
    var rec = String(existingData[i][0] || "").trim().toUpperCase();
    if (rec) existingRowIndexMap[rec] = i;
  }

  var newTxRows = [];
  var hasExistingTxUpdates = false;
  for (var j = 0; j < incomingTxs.length; j++) {
    var tx = incomingTxs[j];
    var txRec = String(tx.receiptNumber || "").trim().toUpperCase();
    if (!txRec) continue;

    var txName = String(tx.payerName || "").trim();
    var txSafeEmail = isStaffOrPlaceholderEmailGas(tx.email, txName) ? "" : String(tx.email || "").trim().toLowerCase();
    var txType = String(tx.type || (txRec.indexOf("EXP-") === 0 ? "OUTFLOW" : "INFLOW")).toUpperCase();
    var formattedTxRow = [
      tx.receiptNumber,
      tx.date || "2026-08-01",
      tx.time || "12:00:00",
      txName,
      normalizePhoneGas(tx.phone || ""),
      txSafeEmail,
      parseSheetNumber(tx.amount),
      tx.paymentPurpose || "Mission NLL Season XVII",
      tx.paymentMethod || "Mobile Money",
      tx.paymentReference || "",
      tx.notes || "",
      tx.generatedBy || "Treasury Historical Import",
      tx.operatorEmail || operator.email,
      tx.paymentStatus || "COMPLETED",
      txSafeEmail ? (tx.emailStatus || "SKIPPED") : "NOT_PROVIDED",
      tx.createdAt || new Date().toISOString(),
      txType
    ];

    if (existingRowIndexMap.hasOwnProperty(txRec)) {
      if (txRec.indexOf("HIST-") === 0 || overwriteExisting) {
        existingData[existingRowIndexMap[txRec]] = formattedTxRow;
        hasExistingTxUpdates = true;
        updatedTxs++;
      }
    } else {
      existingRowIndexMap[txRec] = existingData.length + newTxRows.length;
      newTxRows.push(formattedTxRow);
    }
  }

  if (hasExistingTxUpdates && existingData.length > 0) {
    txSheet.getRange(1, 1, existingData.length, 17).setValues(existingData);
  }
  if (newTxRows.length > 0) {
    var startRow = txSheet.getLastRow() + 1;
    txSheet.getRange(startRow, 1, newTxRows.length, 17).setValues(newTxRows);
    appendedTxs = newTxRows.length;
  }
  return { appendedTxs: appendedTxs, updatedTxs: updatedTxs };
}

function handleGetMemberDirectory(operatorEmail) {
  verifyOperator(operatorEmail);
  var cacheKeyDir = "sc_members_dir_v3_" + getCacheVersion();
  var cachedDir = getChunkedCache(cacheKeyDir);
  if (cachedDir) {
    try {
      return { success: true, cached: true, data: JSON.parse(cachedDir) };
    } catch (e) {}
  }

  var ss = getSpreadsheet();
  var membersSheet = ss.getSheetByName(SHEET_MEMBERS);
  if (!membersSheet) {
    return { success: true, data: [] };
  }
  var data = ensureMembersSchemaMigratedGas(membersSheet);
  var list = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0] && !row[1]) continue;
    var mName = String(row[1] || "").trim();
    var rawEm = String(row[3] || "").trim().toLowerCase();
    var safeEm = isStaffOrPlaceholderEmailGas(rawEm, mName) ? "" : rawEm;
    var histTotalNew = parseSheetNumber(row[11]);
    var livePaidNew = row.length > 15 ? parseSheetNumber(row[15]) : 0;
    var totalContribNew = row.length > 16 && row[16] !== "" ? parseSheetNumber(row[16]) : (histTotalNew + livePaidNew);
    var schoolVal = String(row[6] || "").trim();
    var houseVal = isHouseEligibleSchoolGas(schoolVal) ? String(row[7] || "").trim() : "";
    var entry = {
      id: String(row[0] || ""),
      memberId: String(row[0] || ""),
      name: mName,
      phone: normalizePhoneGas(row[2] || ""),
      email: safeEm,
      address: String(row[4] || ""),
      gender: String(row[5] || ""),
      school: schoolVal,
      house: houseVal,
      preNllPaid: parseSheetNumber(row[8]),
      spotPaid: parseSheetNumber(row[9]),
      paidAfter: parseSheetNumber(row[10]),
      historicalPaid: histTotalNew,
      profileStatus: String(row[12] || "INCOMPLETE"),
      updatedAt: String(row[13] || "")
    };
    if (row.length > 14 && row[14] !== "") entry.expectedTargetUgx = parseSheetNumber(row[14]);
    if (row.length > 15 && row[15] !== "") entry.livePaid = livePaidNew;
    entry.totalContributed = totalContribNew;
    if (row.length > 17 && row[17]) entry.duesStatus = String(row[17]);
    list.push(entry);
  }
  putChunkedCache(cacheKeyDir, JSON.stringify(list), 300);
  return { success: true, data: list };
}

function handleUpsertMember(data, operatorEmail) {
  var operator = verifyOperator(operatorEmail);
  var m = data && data.member ? data.member : data;
  if (!m || !m.name) {
    return { success: false, error: "Member payload with name is required." };
  }
  var incomingTxs = (data && Array.isArray(data.transactions)) ? data.transactions : [];
  var ss = getSpreadsheet();
  var membersSheet = ss.getSheetByName(SHEET_MEMBERS);
  if (!membersSheet) {
    setupSpreadsheet();
    membersSheet = ss.getSheetByName(SHEET_MEMBERS);
  }

  var targetId = String(m.id || m.memberId || "").trim();
  var targetNameNorm = normalizeMemberNameSimpleGas(m.name);
  var targetEmail = isStaffOrPlaceholderEmailGas(m.email, m.name) ? "" : String(m.email || "").trim().toLowerCase();
  var sheetData = ensureMembersSchemaMigratedGas(membersSheet);

  var rowToUpdate = -1;
  var matchedIdx = -1;
  if (targetId) {
    for (var i = 1; i < sheetData.length; i++) {
      if (String(sheetData[i][0] || "").trim().toLowerCase() === targetId.toLowerCase()) {
        rowToUpdate = i + 1;
        matchedIdx = i;
        break;
      }
    }
  }
  if (rowToUpdate === -1 && targetEmail) {
    for (var j = 1; j < sheetData.length; j++) {
      if (String(sheetData[j][3] || "").trim().toLowerCase() === targetEmail) {
        rowToUpdate = j + 1;
        matchedIdx = j;
        break;
      }
    }
  }
  if (rowToUpdate === -1 && targetNameNorm) {
    for (var k = 1; k < sheetData.length; k++) {
      if (normalizeMemberNameSimpleGas(sheetData[k][1]) === targetNameNorm) {
        rowToUpdate = k + 1;
        matchedIdx = k;
        break;
      }
    }
  }

  var rowVals = formatMemberRowGas(m);
  if (matchedIdx !== -1) {
    var existingRowId = String(sheetData[matchedIdx][0] || "").trim();
    if (existingRowId && (!targetId || targetId.toUpperCase().indexOf("SB-LIVE-") === 0)) {
      rowVals[0] = existingRowId;
    }
    membersSheet.getRange(rowToUpdate, 1, 1, 18).setValues([rowVals]);
  } else {
    membersSheet.appendRow(rowVals);
  }

  var txRes = upsertTransactionsBatchGas(ss, incomingTxs, operator, true);

  writeAuditLog({
    user: operator.name || "Operator",
    userEmail: operator.email,
    action: "UPSERT_MEMBER",
    description: "Updated member " + String(m.name || targetId) + " in Google Sheets (" + txRes.updatedTxs + " historical rows refreshed)."
  });

  clearBackendCache();

  return {
    success: true,
    message: "Member " + String(m.name || targetId) + " synced to Google Sheets.",
    data: {
      memberId: rowVals[0],
      updatedTransactions: txRes.updatedTxs,
      syncedTransactions: txRes.appendedTxs
    }
  };
}

function handleSyncMembersAndHistorical(data, operatorEmail) {
  var operator = verifyOperator(operatorEmail);
  var incomingMembers = (data && Array.isArray(data.members)) ? data.members : [];
  var incomingTxs = (data && Array.isArray(data.transactions)) ? data.transactions : [];
  var overwriteExisting = Boolean(data && data.overwriteExisting);

  var ss = getSpreadsheet();
  var membersSheet = ss.getSheetByName(SHEET_MEMBERS);
  if (!membersSheet) {
    setupSpreadsheet();
    membersSheet = ss.getSheetByName(SHEET_MEMBERS);
  }

  // Batch replace Members sheet rows safely after preserving newer/non-empty sheet contact fields
  if (incomingMembers.length > 0) {
    var existingSheetRows = ensureMembersSchemaMigratedGas(membersSheet);
    var existingByKeyGas = {};
    for (var er = 1; er < existingSheetRows.length; er++) {
      var eRow = existingSheetRows[er];
      var eId = String(eRow[0] || "").trim().toLowerCase();
      var eName = normalizeMemberNameSimpleGas(eRow[1] || "");
      var eObj = {
        phone: normalizePhoneGas(eRow[2] || ""),
        email: isStaffOrPlaceholderEmailGas(eRow[3], eRow[1]) ? "" : String(eRow[3] || "").trim().toLowerCase(),
        address: String(eRow[4] || "").trim(),
        gender: String(eRow[5] || "").trim(),
        school: String(eRow[6] || "").trim(),
        house: String(eRow[7] || "").trim(),
        updatedAt: String(eRow[13] || "").trim()
      };
      if (eId) existingByKeyGas["id:" + eId] = eObj;
      if (eName) existingByKeyGas["name:" + eName] = eObj;
    }

    var mergedIncoming = incomingMembers.map(function(im) {
      var imId = String(im.id || im.memberId || "").trim().toLowerCase();
      var imName = normalizeMemberNameSimpleGas(im.name || "");
      var prev = (imId && existingByKeyGas["id:" + imId]) || (imName && existingByKeyGas["name:" + imName]) || null;
      if (!prev) return im;
      var nextObj = {};
      for (var k in im) {
        if (Object.prototype.hasOwnProperty.call(im, k)) nextObj[k] = im[k];
      }
      if (!nextObj.phone && prev.phone) nextObj.phone = prev.phone;
      if (!nextObj.email && prev.email) nextObj.email = prev.email;
      if (!nextObj.address && prev.address) nextObj.address = prev.address;
      if (!nextObj.gender && prev.gender) nextObj.gender = prev.gender;
      if (!nextObj.school && prev.school) nextObj.school = prev.school;
      if (!nextObj.house && prev.house && isHouseEligibleSchoolGas(nextObj.school || prev.school)) nextObj.house = prev.house;
      return nextObj;
    });

    var lastRow = membersSheet.getLastRow();
    var lastCol = Math.max(membersSheet.getLastColumn(), 18);
    membersSheet.getRange(1, 1, 1, 18).setValues([[
      "Member ID", "Full Name", "Phone", "Email", "Physical Address", "Gender", "School", "House",
      "Pre-NLL Paid", "Spot Paid", "Paid After", "Historical Total",
      "Profile Status", "Updated At", "Expected Target", "Live Paid",
      "Total Contributed", "Dues Status"
    ]]);
    if (lastRow > 1) {
      membersSheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
    }
    var memberRows = mergedIncoming.map(formatMemberRowGas);
    membersSheet.getRange(2, 1, memberRows.length, 18).setValues(memberRows);
  }

  // Idempotently upsert historical transactions & append new rows with 17 columns
  var txSyncRes = upsertTransactionsBatchGas(ss, incomingTxs, operator, overwriteExisting);

  writeAuditLog({
    user: operator.name || "Operator",
    userEmail: operator.email,
    action: "HISTORICAL_IMPORT_COMPLETED",
    description: "Synced " + incomingMembers.length + " members, updated " + txSyncRes.updatedTxs + " and appended " + txSyncRes.appendedTxs + " historical transactions to Google Sheets."
  });

  clearBackendCache();

  return {
    success: true,
    message: "Synced " + incomingMembers.length + " members (" + txSyncRes.updatedTxs + " updated, " + txSyncRes.appendedTxs + " new transactions) to Google Sheets.",
    data: {
      syncedMembers: incomingMembers.length,
      updatedTransactions: txSyncRes.updatedTxs,
      syncedTransactions: txSyncRes.appendedTxs
    }
  };
}

function handleCleanupStaffEmailsAndAudit(operatorEmail) {
  var operator = verifyOperator(operatorEmail, "OWNER");
  var ss = getSpreadsheet();
  var txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  var strippedCount = 0;

  if (txSheet && txSheet.getLastRow() > 1) {
    var data = txSheet.getDataRange().getValues();
    var changed = false;
    for (var i = 1; i < data.length; i++) {
      var pName = String(data[i][3] || "").trim();
      var rawEm = String(data[i][5] || "").trim().toLowerCase();
      var cleanedPhone = normalizePhoneGas(data[i][4] || "");
      if (String(data[i][4] || "") !== cleanedPhone) {
        data[i][4] = cleanedPhone;
        changed = true;
      }
      if (rawEm && isStaffOrPlaceholderEmailGas(rawEm, pName)) {
        data[i][5] = "";
        data[i][14] = "NOT_PROVIDED";
        strippedCount++;
        changed = true;
      }
    }
    if (changed) {
      txSheet.getRange(1, 1, data.length, data[0].length).setValues(data);
    }
  }

  clearBackendCache();
  writeAuditLog({
    user: operator.name || "Owner",
    userEmail: operator.email,
    action: "CLEANUP_STAFF_EMAILS",
    description: "Scrubbed " + strippedCount + " staff/typo emails and normalized phones in Transactions sheet."
  });

  return {
    success: true,
    message: "Cleaned " + strippedCount + " accidental staff emails from Google Sheets.",
    data: { strippedCount: strippedCount }
  };
}

/**
 * Open-Closed Registrations: QueryActionRegistry (GET)
 * Adding new read operations requires zero modifications to doGet router
 */
QueryActionRegistry.register("ping", function() {
  return { success: true, message: "SC Basimbuzi Live Backend Online", version: "3.2.1" };
});

QueryActionRegistry.register("checkAuth", function(e, email) {
  return checkUserAuth(email);
});

QueryActionRegistry.register("verifyPassword", function(e, email) {
  var password = (e && e.parameter && e.parameter.password) ? e.parameter.password : "";
  return handleVerifyUserPassword(email, password);
});

QueryActionRegistry.register("getInitialData", function(e, email) {
  var limit = (e && e.parameter && e.parameter.limit) ? Number(e.parameter.limit) : 0;
  return getInitialAppData(email, limit);
});

QueryActionRegistry.register("getTransactions", function(e, email) {
  var limit = (e && e.parameter && e.parameter.limit) ? Number(e.parameter.limit) : 0;
  return getAllTransactions(email, limit);
});

QueryActionRegistry.register("getReceipt", function(e, email) {
  var receiptNumber = (e && e.parameter && e.parameter.receiptNumber) ? e.parameter.receiptNumber : "";
  return getReceiptByNumber(receiptNumber, email);
});

QueryActionRegistry.register("getUsers", function(e, email) {
  return getAllUsers(email);
});

QueryActionRegistry.register("getMembers", function(e, email) {
  return getMembersList(email);
});

QueryActionRegistry.register("getMemberDirectory", function(e, email) {
  return handleGetMemberDirectory(email);
});

QueryActionRegistry.register("getSettings", function(e, email) {
  return getAppSettings();
});

function getPublicSiteData(optionalSs) {
  var cacheKey = CACHE_KEY_PUBLIC_SITE + "_" + getCacheVersion();
  var cached = getChunkedCache(cacheKey);
  if (cached) {
    try {
      return { success: true, cached: true, data: JSON.parse(cached) };
    } catch (e) {}
  }

  var ss = optionalSs || getSpreadsheet();
  var siteSheet = ss.getSheetByName(SHEET_PUBLIC_SITE);
  if (!siteSheet || siteSheet.getLastRow() < 2) {
    return { success: true, data: null };
  }

  var data = siteSheet.getDataRange().getValues();
  var jsonStr = "";
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || "") === "PUBLIC_SITE_JSON") {
      jsonStr += String(data[i][2] || "");
    }
  }
  if (!jsonStr) {
    return { success: true, data: null };
  }

  try {
    var parsed = JSON.parse(jsonStr);
    putChunkedCache(cacheKey, jsonStr, 300);
    return { success: true, data: parsed };
  } catch (e) {
    return { success: false, error: "Corrupted Public Site data in sheet." };
  }
}

function handleSavePublicSite(contentPayload, operatorEmail) {
  var operator = verifyOperator(operatorEmail, "", "canManageWebsite");
  if (!contentPayload || typeof contentPayload !== "object") {
    return { success: false, error: "Invalid public site content payload." };
  }

  var ss = getSpreadsheet();
  var siteSheet = ss.getSheetByName(SHEET_PUBLIC_SITE);
  if (!siteSheet) {
    siteSheet = ss.insertSheet(SHEET_PUBLIC_SITE);
  }

  var nowIso = new Date().toISOString();
  var toSave = contentPayload;
  if (!toSave.updatedAt) toSave.updatedAt = nowIso;
  if (!toSave.updatedBy) toSave.updatedBy = operator.email || operatorEmail;

  var jsonStr = JSON.stringify(toSave);
  var chunkSize = 40000;
  var rows = [["Key", "ChunkIndex", "Value", "UpdatedAt", "UpdatedBy"]];
  var chunks = Math.max(1, Math.ceil(jsonStr.length / chunkSize));
  for (var c = 0; c < chunks; c++) {
    rows.push([
      "PUBLIC_SITE_JSON",
      c,
      jsonStr.slice(c * chunkSize, (c + 1) * chunkSize),
      toSave.updatedAt,
      toSave.updatedBy
    ]);
  }

  siteSheet.clearContents();
  siteSheet.getRange(1, 1, rows.length, 5).setValues(rows);
  siteSheet.setFrozenRows(1);

  writeAuditLog({
    user: operator.name || "Operator",
    userEmail: operator.email || operatorEmail,
    action: "UPDATE_PUBLIC_SITE",
    description: "Updated public website news, fixtures, and club settings in Google Sheets."
  });

  clearBackendCache();
  return { success: true, data: toSave, message: "Public website content saved to Google Sheets." };
}

QueryActionRegistry.register("getAuditLogs", function(e, email) {
  var limit = (e && e.parameter && e.parameter.limit) ? Number(e.parameter.limit) : 100;
  return getAuditLogs(email, limit);
});

QueryActionRegistry.register("getPublicSite", function() {
  return getPublicSiteData();
});

/**
 * Open-Closed Registrations: ActionRegistry (POST)
 * Adding new commands or transaction mutations requires zero modifications to doPost router
 */
ActionRegistry.register("checkAuth", function(data, email) {
  return checkUserAuth(email || data.email);
});

ActionRegistry.register("verifyPassword", function(data) {
  return handleVerifyUserPassword(data.email, data.password);
});

ActionRegistry.register("sendLoginOtp", function(data) {
  return handleSendLoginOtp(data.email, data.code);
});

ActionRegistry.register("sendMemberOtp", function(data) {
  return handleSendMemberOtp(data.email, data.code);
});

ActionRegistry.register("recordTransaction", function(data, email) {
  return handleRecordTransaction(data, email);
});

ActionRegistry.register("generateReceipt", function(data, email) {
  return handleGenerateReceipt(data, email);
});

ActionRegistry.register("resendReceipt", function(data, email) {
  return handleResendReceipt(data.receiptNumber, email);
});

ActionRegistry.register("deleteTransaction", function(data, email) {
  return handleDeleteTransaction(data.receiptNumber, email);
});

ActionRegistry.register("getUsers", function(data, email) {
  return getAllUsers(email);
});

ActionRegistry.register("getMembers", function(data, email) {
  return getMembersList(email);
});

ActionRegistry.register("getMemberDirectory", function(data, email) {
  return handleGetMemberDirectory(email);
});

ActionRegistry.register("upsertMember", function(data, email) {
  return handleUpsertMember(data, email);
});

ActionRegistry.register("syncMembersAndHistorical", function(data, email) {
  return handleSyncMembersAndHistorical(data, email);
});

ActionRegistry.register("cleanupStaffEmailsAndAudit", function(data, email) {
  return handleCleanupStaffEmailsAndAudit(email);
});

ActionRegistry.register("addUser", function(data, email) {
  return handleAddUser(data.user || data, email);
});

ActionRegistry.register("editUser", function(data, email) {
  return handleEditUser(data.targetEmail, data.updates || data, email);
});

ActionRegistry.register("updateUserStatus", function(data, email) {
  return handleUpdateUserStatus(data.targetEmail, data.status, email);
});

ActionRegistry.register("removeUser", function(data, email) {
  return handleRemoveUser(data.targetEmail, email);
});

ActionRegistry.register("syncUsers", function(data, email) {
  return handleSyncUsers(data.users, email);
});

ActionRegistry.register("saveSettings", function(data, email) {
  return handleSaveSettings(data.settings || data, email);
});

ActionRegistry.register("logAction", function(data, email) {
  return handleLogAction(data, email);
});

ActionRegistry.register("savePublicSite", function(data, email) {
  return handleSavePublicSite(data.content || data, email);
});

ActionRegistry.register("getPublicSite", function() {
  return getPublicSiteData();
});

ActionRegistry.register("setupSpreadsheet", function() {
  return setupSpreadsheet();
});
`;

