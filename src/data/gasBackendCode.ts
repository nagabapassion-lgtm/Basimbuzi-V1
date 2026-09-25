/**
 * Google Apps Script Backend Code for SC Basimbuzi Receipt Management System
 * This file is embedded in the application so users can copy-paste it directly into their Google Apps Script project.
 */

export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * ==============================================================================
 * SC BASIMBUZI RECEIPT MANAGEMENT SYSTEM — GOOGLE APPS SCRIPT BACKEND
 * ==============================================================================
 * Backend engine handling:
 * - Server-side Authorization against Users sheet
 * - Atomic receipt numbering with LockService (Format: SB-YYYY-00001)
 * - Google Sheets storage (Transactions, Users, Settings, Audit Log, Receipt Counters)
 * - Automatic HTML receipt emailing via MailApp/GmailApp
 * - Real-time Reports, Audit Logging, and Admin Management (Max 5 Admins)
 * ==============================================================================
 */

// OPTIONAL SPREADSHEET ID: If you created a standalone script at script.google.com,
// paste your Spreadsheet ID here. If created from Extensions > Apps Script inside the sheet,
// leave this as "" (it will automatically use the active spreadsheet).
var SPREADSHEET_ID = "";

// Sheet Names Constants
var SHEET_TRANSACTIONS = "Transactions";
var SHEET_USERS = "Users";
var SHEET_SETTINGS = "Settings";
var SHEET_AUDIT_LOG = "Audit Log";
var SHEET_COUNTERS = "Receipt Counters";

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
 * Helper to safely parse numbers from Sheet cells (e.g., handles "100,000", numbers, etc.)
 */
function parseSheetNumber(val) {
  if (typeof val === "number") return val;
  if (!val) return 0;
  var cleaned = String(val).replace(/[^0-9.-]+/g, "");
  var num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Helper to send email safely with MailApp and fallback to GmailApp
 */
function sendEmailSafe(mailOptions) {
  try {
    MailApp.sendEmail(mailOptions);
    return { success: true };
  } catch (err1) {
    try {
      GmailApp.sendEmail(mailOptions.to, mailOptions.subject, mailOptions.body || "", {
        htmlBody: mailOptions.htmlBody,
        name: mailOptions.name,
        replyTo: mailOptions.replyTo
      });
      return { success: true };
    } catch (err2) {
      throw new Error("Email sending failed: " + err1.toString() + " (Fallback error: " + err2.toString() + ")");
    }
  }
}

/**
 * Web App Entry Point - GET Requests
 */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "ping";
    var userEmail = (e && e.parameter && (e.parameter.operatorEmail || e.parameter.userEmail || e.parameter.email)) ? (e.parameter.operatorEmail || e.parameter.userEmail || e.parameter.email).trim().toLowerCase() : "";

    var response = { success: false };

    switch (action) {
      case "ping":
        response = {
          success: true,
          message: "SC Basimbuzi Backend is online and healthy",
          effectiveUser: Session.getEffectiveUser().getEmail() || "nagabapassion@gmail.com",
          timestamp: new Date().toISOString()
        };
        break;

      case "initSheets":
        response = setupSpreadsheet();
        break;

      case "checkAuth":
        var targetAuthEmail = (e && e.parameter && (e.parameter.email || e.parameter.operatorEmail || e.parameter.userEmail)) ? (e.parameter.email || e.parameter.operatorEmail || e.parameter.userEmail).trim().toLowerCase() : userEmail;
        response = checkUserAuth(targetAuthEmail);
        break;

      case "addUser":
        var newUserData = {
          name: (e && e.parameter && e.parameter.name) ? e.parameter.name : "",
          email: (e && e.parameter && (e.parameter.email || e.parameter.targetEmail)) ? (e.parameter.email || e.parameter.targetEmail) : "",
          role: (e && e.parameter && e.parameter.role) ? e.parameter.role : "ADMIN",
          status: (e && e.parameter && e.parameter.status) ? e.parameter.status : "ACTIVE"
        };
        var opEmail = (e && e.parameter && (e.parameter.operatorEmail || e.parameter.userEmail)) ? (e.parameter.operatorEmail || e.parameter.userEmail).trim().toLowerCase() : userEmail;
        response = handleAddUser(newUserData, opEmail);
        break;

      case "editUser":
        var editUserData = {
          name: (e && e.parameter && e.parameter.name) ? e.parameter.name : "",
          role: (e && e.parameter && e.parameter.role) ? e.parameter.role : "",
          status: (e && e.parameter && e.parameter.status) ? e.parameter.status : ""
        };
        var targetUserEmail = (e && e.parameter && (e.parameter.targetEmail || e.parameter.email)) ? (e.parameter.targetEmail || e.parameter.email).trim().toLowerCase() : "";
        var opEmail2 = (e && e.parameter && (e.parameter.operatorEmail || e.parameter.userEmail)) ? (e.parameter.operatorEmail || e.parameter.userEmail).trim().toLowerCase() : userEmail;
        response = handleEditUser(targetUserEmail, editUserData, opEmail2);
        break;

      case "updateUserStatus":
        var targetUserEmail2 = (e && e.parameter && (e.parameter.targetEmail || e.parameter.email)) ? (e.parameter.targetEmail || e.parameter.email).trim().toLowerCase() : "";
        var newStatus = (e && e.parameter && e.parameter.status) ? e.parameter.status : "ACTIVE";
        var opEmail3 = (e && e.parameter && (e.parameter.operatorEmail || e.parameter.userEmail)) ? (e.parameter.operatorEmail || e.parameter.userEmail).trim().toLowerCase() : userEmail;
        response = handleUpdateUserStatus(targetUserEmail2, newStatus, opEmail3);
        break;

      case "removeUser":
        var targetUserEmail3 = (e && e.parameter && (e.parameter.targetEmail || e.parameter.email)) ? (e.parameter.targetEmail || e.parameter.email).trim().toLowerCase() : "";
        var opEmail4 = (e && e.parameter && (e.parameter.operatorEmail || e.parameter.userEmail)) ? (e.parameter.operatorEmail || e.parameter.userEmail).trim().toLowerCase() : userEmail;
        response = handleRemoveUser(targetUserEmail3, opEmail4);
        break;

      case "getInitialData":
        var initLimit = (e && e.parameter && e.parameter.limit) ? Number(e.parameter.limit) : 200;
        response = getInitialAppData(userEmail, initLimit);
        break;

      case "getTransactions":
        var txLimit = (e && e.parameter && e.parameter.limit) ? Number(e.parameter.limit) : 0;
        response = getAllTransactions(userEmail, txLimit);
        break;

      case "getUsers":
        response = getAllUsers(userEmail);
        break;

      case "getSettings":
        response = getAppSettings();
        break;

      case "getAuditLogs":
        var logLimit = (e && e.parameter && e.parameter.limit) ? Number(e.parameter.limit) : 50;
        response = getAuditLogs(userEmail, logLimit);
        break;

      case "getReceipt":
        var receiptNumber = e.parameter.receiptNumber;
        response = getReceiptByNumber(receiptNumber, userEmail);
        break;

      case "searchReceipts":
        var query = e.parameter.q || "";
        response = searchReceipts(query, userEmail);
        break;

      case "sendLoginOtp":
        var targetOtpEmail = (e && e.parameter && (e.parameter.email || e.parameter.targetEmail)) ? (e.parameter.email || e.parameter.targetEmail) : "";
        var targetOtpCode = (e && e.parameter && e.parameter.code) ? e.parameter.code : "";
        response = handleSendLoginOtp(targetOtpEmail, targetOtpCode);
        break;

      default:
        response = { success: false, error: "Unknown GET action: " + action };
    }

    return createJsonResponse(response);
  } catch (err) {
    return createJsonResponse({
      success: false,
      error: "Server Error: " + err.toString()
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
    var response = { success: false };

    switch (action) {
      case "generateReceipt":
        response = handleGenerateReceipt(data, operatorEmail);
        break;

      case "resendReceipt":
        response = handleResendReceipt(data.receiptNumber, operatorEmail);
        break;

      case "deleteTransaction":
        response = handleDeleteTransaction(data.receiptNumber, operatorEmail);
        break;

      case "sendLoginOtp":
        response = handleSendLoginOtp(data.email, data.code);
        break;

      case "addUser":
        response = handleAddUser(data.user || data, operatorEmail);
        break;

      case "editUser":
        response = handleEditUser(data.targetEmail, data.user || data, operatorEmail);
        break;

      case "updateUserStatus":
        response = handleUpdateUserStatus(data.targetEmail, data.status, operatorEmail);
        break;

      case "removeUser":
        response = handleRemoveUser(data.targetEmail, operatorEmail);
        break;

      case "syncUsers":
        response = handleSyncUsers(data.users || data.usersList || [], operatorEmail);
        break;

      case "saveSettings":
        response = handleSaveSettings(data.settings, operatorEmail);
        break;

      case "logAction":
        response = handleLogAction(data, operatorEmail);
        break;

      case "initSheets":
        response = setupSpreadsheet();
        break;

      default:
        response = { success: false, error: "Unknown POST action: " + action };
    }

    return createJsonResponse(response);
  } catch (err) {
    return createJsonResponse({
      success: false,
      error: "Server POST Error: " + err.toString()
    });
  }
}

/**
 * Helper to return JSON output with CORS headers
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 1. AUTHORIZATION LOGIC
 * Checks if user is ACTIVE in Users sheet
 */
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

  var data = userSheet.getDataRange().getValues();
  // Header: Name, Email, Role, Status, Created At

  for (var i = 1; i < data.length; i++) {
    var rowEmail = (data[i][1] || "").toString().trim().toLowerCase();
    var status = (data[i][3] || "").toString().trim().toUpperCase();
    var role = (data[i][2] || "").toString().trim().toUpperCase();
    var name = (data[i][0] || "").toString().trim();
    var createdAt = (data[i][4] || "").toString();

    if (rowEmail === cleanEmail) {
      if (cleanEmail === "nagabapassion@gmail.com") {
        role = "OWNER";
      }
      if (status === "ACTIVE") {
        return {
          success: true,
          authorized: true,
          user: {
            name: name || (cleanEmail === "nagabapassion@gmail.com" ? "Nagaba Passion" : "Authorized Staff"),
            email: cleanEmail,
            role: role || (cleanEmail === "nagabapassion@gmail.com" ? "OWNER" : "ADMIN"),
            status: status,
            createdAt: createdAt
          }
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

  // If this email is the Google account owner (Session.getEffectiveUser() or nagabapassion@gmail.com), auto-provision as OWNER
  var effectiveEmail = "";
  try {
    effectiveEmail = Session.getEffectiveUser().getEmail().toLowerCase();
  } catch (e) {}

  if (cleanEmail === "nagabapassion@gmail.com" || (effectiveEmail && cleanEmail === effectiveEmail)) {
    var nowIso = new Date().toISOString();
    userSheet.appendRow(["Nagaba Passion", cleanEmail, "OWNER", "ACTIVE", nowIso]);
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

  // System Administrator Jotham Itungo is always authorized and auto-provisioned
  if (cleanEmail === "jotham.itungo@gmail.com") {
    var jothamIso = new Date().toISOString();
    userSheet.appendRow(["Jotham Itungo", cleanEmail, "ADMIN", "ACTIVE", jothamIso]);
    return {
      success: true,
      authorized: true,
      user: {
        name: "Jotham Itungo",
        email: cleanEmail,
        role: "ADMIN",
        status: "ACTIVE",
        createdAt: jothamIso
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
 * Helper: Verify if user has permission
 */
function verifyOperator(email, requiredRole) {
  var cleanEmail = (email || "").trim().toLowerCase();
  if (!cleanEmail || cleanEmail === "nagabapassion@gmail.com") {
    return {
      name: "Nagaba Passion",
      email: "nagabapassion@gmail.com",
      role: "OWNER",
      status: "ACTIVE"
    };
  }

  if (cleanEmail === "jotham.itungo@gmail.com") {
    return {
      name: "Jotham Itungo",
      email: cleanEmail,
      role: "ADMIN",
      status: "ACTIVE"
    };
  }

  var effectiveEmail = "";
  try {
    effectiveEmail = Session.getEffectiveUser().getEmail().toLowerCase();
  } catch (e) {}
  if (effectiveEmail && cleanEmail === effectiveEmail) {
    return {
      name: "Nagaba Passion",
      email: cleanEmail,
      role: "OWNER",
      status: "ACTIVE"
    };
  }

  var auth = checkUserAuth(cleanEmail);
  if (!auth.authorized || !auth.user) {
    throw new Error("Unauthorized access. User " + cleanEmail + " is not active in the system.");
  }
  if (requiredRole === "OWNER" && auth.user.role !== "OWNER") {
    throw new Error("Permission denied. This action requires Owner privileges.");
  }
  return auth.user;
}

/**
 * Clear backend cache when records or settings are updated
 */
function clearBackendCache() {
  try {
    var cache = CacheService.getScriptCache();
    if (cache) {
      cache.removeAll([
        "initial_data_bundle_v3_OWNER_200",
        "initial_data_bundle_v3_ADMIN_200",
        "initial_data_bundle_v3_STAFF_200",
        "initial_data_bundle_v3_VIEWER_200",
        "initial_data_bundle_v3_OWNER_0",
        "initial_data_bundle_v3_ADMIN_0",
        "initial_data_bundle_v3_STAFF_0",
        "initial_data_bundle_v3_VIEWER_0"
      ]);
    }
  } catch (e) {
    Logger.log("Cache clear warning: " + e.toString());
  }
}

/**
 * 2. INITIAL DATA BUNDLE
 * Highly optimized with CacheService and single-pass spreadsheet retrieval
 */
function getInitialAppData(email, limit) {
  var auth = checkUserAuth(email);
  if (!auth.authorized) {
    return { success: false, authorized: false, error: auth.error };
  }

  var maxRows = (limit && Number(limit) > 0) ? Number(limit) : 200;
  var role = auth.user.role || "ADMIN";
  var cacheKey = "initial_data_bundle_v3_" + role + "_" + maxRows;

  // 1. Check in-memory CacheService (~100ms response time)
  try {
    var cache = CacheService.getScriptCache();
    if (cache) {
      var cachedJson = cache.get(cacheKey);
      if (cachedJson) {
        var parsed = JSON.parse(cachedJson);
        return {
          success: true,
          authorized: true,
          cached: true,
          user: auth.user,
          data: parsed
        };
      }
    }
  } catch (cacheGetErr) {
    Logger.log("Cache get notice: " + cacheGetErr.toString());
  }

  // 2. Single-pass Spreadsheet Access (avoid opening spreadsheet multiple times)
  var ss = getSpreadsheet();
  var settings = getAppSettings(ss).data;
  var transactions = getAllTransactions(email, maxRows, ss).data || [];
  var users = role === "OWNER" ? (getAllUsers(email, ss).data || []) : [auth.user];
  var auditLogs = role === "OWNER" ? (getAuditLogs(email, 50, ss).data || []) : [];

  var resultData = {
    settings: settings,
    transactions: transactions,
    users: users,
    auditLogs: auditLogs
  };

  // 3. Store in fast memory cache for subsequent requests (5 minutes)
  try {
    var cache2 = CacheService.getScriptCache();
    if (cache2) {
      var payloadStr = JSON.stringify(resultData);
      // Google Apps Script CacheService per-key string size limit is 100KB (102400 bytes)
      if (payloadStr.length < 96000) {
        cache2.put(cacheKey, payloadStr, 300); // 300 seconds (5 minutes)
      }
    }
  } catch (cachePutErr) {
    Logger.log("Cache put notice: " + cachePutErr.toString());
  }

  return {
    success: true,
    authorized: true,
    user: auth.user,
    data: resultData
  };
}

/**
 * 3. ATOMIC RECEIPT NUMBER GENERATOR
 * Generates SB-YYYY-00001 safely using LockService
 */
function generateNextReceiptNumber(prefix) {
  var lock = LockService.getScriptLock();
  // Wait up to 30 seconds for concurrent requests
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
      counterSheet.getRange(rowIndex, 2).setValue(nextSeq);
      counterSheet.getRange(rowIndex, 3).setValue(nowStr);
    } else {
      counterSheet.appendRow([currentYear, nextSeq, nowStr]);
    }

    // Format sequence to 5 digits: 00001
    var formattedSeq = ("00000" + nextSeq).slice(-5);
    var receiptNumber = prefixToUse + "-" + currentYear + "-" + formattedSeq;

    return receiptNumber;
  } finally {
    lock.releaseLock();
  }
}

/**
 * 4. GENERATE RECEIPT & SEND EMAIL (CORE WORKFLOW)
 */
function handleGenerateReceipt(payload, operatorEmail) {
  // Step 1: Verify authorization
  var operator = verifyOperator(operatorEmail);

  // Step 2: Validate inputs
  if (!payload.payerName || !payload.email || !payload.amount) {
    return { success: false, error: "Payer Name, Email, and Amount are required fields." };
  }

  var amount = parseSheetNumber(payload.amount);
  if (isNaN(amount) || amount <= 0) {
    return { success: false, error: "Amount must be a valid positive number." };
  }

  var ss = getSpreadsheet();
  var settings = getAppSettings().data;
  var receiptPrefix = settings.receiptPrefix || "SB";

  // Step 3: Generate atomic receipt number
  var receiptNumber = generateNextReceiptNumber(receiptPrefix);

  var now = new Date();
  var dateStr = Utilities.formatDate(now, Session.getScriptTimeZone() || "UTC", "yyyy-MM-dd");
  var timeStr = Utilities.formatDate(now, Session.getScriptTimeZone() || "UTC", "HH:mm:ss");
  var createdAt = now.toISOString();

  var payerName = String(payload.payerName).trim();
  var payerPhone = String(payload.phone || "").trim();
  var payerEmail = String(payload.email).trim().toLowerCase();
  var paymentPurpose = String(payload.paymentPurpose || "General Payment").trim();
  var paymentMethod = String(payload.paymentMethod || "Cash").trim();
  var paymentReference = String(payload.paymentReference || "").trim();
  var notes = String(payload.notes || "").trim();
  var generatedBy = operator.name;
  var paymentStatus = payload.paymentStatus || "COMPLETED";

  // Step 4: Save transaction to Sheet
  var txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  if (!txSheet) {
    setupSpreadsheet();
    txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  }

  var emailStatus = "PENDING";

  var rowData = [
    receiptNumber,
    dateStr,
    timeStr,
    payerName,
    payerPhone,
    payerEmail,
    amount,
    paymentPurpose,
    paymentMethod,
    paymentReference,
    notes,
    generatedBy,
    operatorEmail,
    paymentStatus,
    emailStatus,
    createdAt
  ];

  txSheet.appendRow(rowData);
  var lastRow = txSheet.getLastRow();

  // Step 5: Send Professional Receipt Email
  var emailError = null;
  try {
    sendReceiptEmail({
      receiptNumber: receiptNumber,
      date: dateStr,
      time: timeStr,
      payerName: payerName,
      payerPhone: payerPhone,
      payerEmail: payerEmail,
      amount: amount,
      paymentPurpose: paymentPurpose,
      paymentMethod: paymentMethod,
      paymentReference: paymentReference,
      notes: notes,
      generatedBy: generatedBy,
      operatorEmail: operatorEmail,
      paymentStatus: paymentStatus
    }, settings);

    emailStatus = "SENT";
    txSheet.getRange(lastRow, 15).setValue("SENT");
  } catch (mailErr) {
    emailStatus = "FAILED";
    emailError = mailErr.toString();
    txSheet.getRange(lastRow, 15).setValue("FAILED");
  }

  // Step 6: Log Audit Trail
  writeAuditLog({
    user: operator.name,
    userEmail: operatorEmail,
    action: "GENERATE_RECEIPT",
    receiptNumber: receiptNumber,
    description: "Generated receipt of UGX " + amount.toLocaleString() + " for " + payerName + " (" + paymentPurpose + "). Email: " + emailStatus
  });

  var resultTransaction = {
    receiptNumber: receiptNumber,
    date: dateStr,
    time: timeStr,
    payerName: payerName,
    phone: payerPhone,
    email: payerEmail,
    amount: amount,
    paymentPurpose: paymentPurpose,
    paymentMethod: paymentMethod,
    paymentReference: paymentReference,
    notes: notes,
    generatedBy: generatedBy,
    operatorEmail: operatorEmail,
    paymentStatus: paymentStatus,
    emailStatus: emailStatus,
    createdAt: createdAt
  };

  clearBackendCache();

  return {
    success: true,
    data: resultTransaction,
    emailStatus: emailStatus,
    emailError: emailError,
    message: emailStatus === "SENT" 
      ? "Receipt generated and emailed successfully to " + payerEmail
      : "Payment recorded successfully, but the receipt email could not be sent: " + (emailError || "Email error")
  };
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
      txData = {
        receiptNumber: String(data[i][0]),
        date: formatSheetDate(data[i][1]),
        time: formatSheetTime(data[i][2]),
        payerName: String(data[i][3]),
        payerPhone: String(data[i][4] || ""),
        payerEmail: String(data[i][5]),
        amount: parseSheetNumber(data[i][6]),
        paymentPurpose: String(data[i][7] || "General Payment"),
        paymentMethod: String(data[i][8] || "Cash"),
        paymentReference: String(data[i][9] || ""),
        notes: String(data[i][10] || ""),
        generatedBy: String(data[i][11] || operator.name),
        operatorEmail: String(data[i][12] || operatorEmail),
        paymentStatus: String(data[i][13] || "COMPLETED"),
        emailStatus: String(data[i][14] || "PENDING")
      };
      break;
    }
  }

  if (!txData) {
    return { success: false, error: "Receipt not found: " + receiptNumber };
  }

  var settings = getAppSettings().data;

  try {
    sendReceiptEmail(txData, settings);
    txSheet.getRange(targetRow, 15).setValue("SENT");
    txData.emailStatus = "SENT";

    writeAuditLog({
      user: operator.name,
      userEmail: operatorEmail,
      action: "RESEND_RECEIPT",
      receiptNumber: receiptNumber,
      description: "Resent receipt email to " + txData.payerEmail
    });

    return {
      success: true,
      message: "Receipt successfully resent to " + txData.payerEmail,
      data: txData
    };
  } catch (err) {
    return {
      success: false,
      error: "Failed to resend email: " + err.toString()
    };
  }
}

/**
 * 5b. DELETE TRANSACTION (OWNER ONLY)
 */
function handleDeleteTransaction(receiptNumber, operatorEmail) {
  var operator = verifyOperator(operatorEmail, "OWNER");

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
        description: "Owner deleted receipt " + cleanReceipt + " (Amount: UGX " + Number(amount).toLocaleString() + ", Payer: " + payerName + ")"
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
 * 5c. SEND LOGIN OTP (EMAIL AUTHENTICATION)
 */
function handleSendLoginOtp(email, code) {
  if (!email || !code) {
    return { success: false, error: "Email and access code are required." };
  }

  var cleanEmail = email.trim().toLowerCase();
  var auth = checkUserAuth(cleanEmail);

  // If checkUserAuth failed or uninitialized, but email is system owner or Jotham, allow delivery
  if (!auth.authorized || !auth.user) {
    if (cleanEmail === "nagabapassion@gmail.com") {
      auth = {
        authorized: true,
        user: {
          name: "Nagaba Passion",
          email: "nagabapassion@gmail.com",
          role: "OWNER",
          status: "ACTIVE"
        }
      };
    } else if (cleanEmail === "jotham.itungo@gmail.com") {
      auth = {
        authorized: true,
        user: {
          name: "Jotham Itungo",
          email: "jotham.itungo@gmail.com",
          role: "ADMIN",
          status: "ACTIVE"
        }
      };
    } else {
      return { success: false, error: "ACCESS DENIED — Email is not authorized or inactive in the system." };
    }
  }

  var settings = {};
  try {
    var settingsRes = getAppSettings();
    if (settingsRes && settingsRes.data) {
      settings = settingsRes.data;
    }
  } catch (e) {
    settings = {};
  }

  var orgName = settings.organizationName || "SC Basimbuzi";
  var orgEmail = settings.organizationEmail || "nagabapassion@gmail.com";
  var subject = orgName + " Sign In Code: " + code;

  var plainBody = "Your " + orgName + " 6-digit access code is: " + code + "\\n\\nThis code expires in 10 minutes.";

  var htmlBody = '<!DOCTYPE html><html><body style="font-family:-apple-system, BlinkMacSystemFont, Roboto, sans-serif; background-color:#f8fafc; padding:24px; color:#1e293b;">' +
    '<div style="max-width:500px; margin:0 auto; background:#ffffff; border-radius:16px; border:1px solid #e2e8f0; padding:32px; text-align:center; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">' +
      '<h2 style="color:#1d4ed8; margin-top:0; font-size:22px; font-weight:800;">' + orgName + '</h2>' +
      '<p style="color:#64748b; font-size:14px; margin-bottom:24px;">Receipt Management System Sign In</p>' +
      '<div style="margin:24px 0; padding:20px; background:#eff6ff; border-radius:12px; border:1px solid #bfdbfe;">' +
        '<div style="font-size:11px; color:#1e40af; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:8px;">Your 6-Digit Access Code</div>' +
        '<div style="font-size:36px; font-weight:800; color:#1d4ed8; letter-spacing:8px; font-family:monospace;">' + code + '</div>' +
      '</div>' +
      '<p style="font-size:13px; color:#64748b; line-height:1.6;">This code expires in 10 minutes. If you did not request this login code, you can safely disregard this message.</p>' +
      '<div style="margin-top:24px; padding-top:16px; border-top:1px solid #f1f5f9; font-size:12px; color:#94a3b8;">' + orgName + ' Security Team</div>' +
    '</div></body></html>';

  try {
    sendEmailSafe({
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
    } catch (auditErr) {
      // Non-blocking
    }

    return {
      success: true,
      message: "Access code sent to " + auth.user.email
    };
  } catch (err) {
    return {
      success: false,
      error: "Failed to send email via Google Apps Script: " + err.toString()
    };
  }
}

/**
 * 6. HTML EMAIL BUILDER & SENDER
 */
function sendReceiptEmail(tx, settings) {
  var orgName = settings.organizationName || "SC Basimbuzi";
  var orgEmail = settings.organizationEmail || "nagabapassion@gmail.com";
  var orgPhone = settings.organizationPhone || "+256 700 000000";
  var orgAddress = settings.organizationAddress || "Kampala, Uganda";
  var footerText = settings.receiptFooter || "Thank you for your payment to SC Basimbuzi.";

  var numAmount = parseSheetNumber(tx.amount);
  var formattedAmount = numAmount.toLocaleString() + " UGX";
  var subject = orgName + " Payment Receipt - " + tx.receiptNumber;

  // Plain-text alternative ensures high deliverability and avoids spam filters
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
        '<h1>' + orgName + '</h1>' +
        '<p>Official Payment Receipt</p>' +
      '</div>' +
      '<div class="amount-banner">' +
        '<div class="amount-label">Amount Received</div>' +
        '<div class="amount-value">' + formattedAmount + '</div>' +
      '</div>' +
      '<div class="content">' +
        '<table class="meta-grid">' +
          '<tr><td class="label">Receipt Number</td><td class="value"><strong>' + tx.receiptNumber + '</strong></td></tr>' +
          '<tr><td class="label">Date & Time</td><td class="value">' + tx.date + ' ' + tx.time + '</td></tr>' +
          '<tr><td class="label">Payer Name</td><td class="value">' + tx.payerName + '</td></tr>' +
          (tx.payerPhone ? '<tr><td class="label">Phone</td><td class="value">' + tx.payerPhone + '</td></tr>' : '') +
          '<tr><td class="label">Payer Email</td><td class="value">' + tx.payerEmail + '</td></tr>' +
          '<tr><td class="label">Payment Purpose</td><td class="value">' + tx.paymentPurpose + '</td></tr>' +
          '<tr><td class="label">Payment Method</td><td class="value">' + tx.paymentMethod + '</td></tr>' +
          (tx.paymentReference ? '<tr><td class="label">Payment Reference</td><td class="value">' + tx.paymentReference + '</td></tr>' : '') +
          '<tr><td class="label">Payment Status</td><td class="value"><span class="badge">' + tx.paymentStatus + '</span></td></tr>' +
          '<tr><td class="label">Issued By</td><td class="value">' + tx.generatedBy + '</td></tr>' +
        '</table>' +
        (tx.notes ? '<div class="notes-box"><strong>Notes:</strong> ' + tx.notes + '</div>' : '') +
      '</div>' +
      '<div class="footer">' +
        '<div><strong>' + footerText + '</strong></div>' +
        '<div style="margin-top: 6px;">' + orgAddress + ' &bull; ' + orgPhone + ' &bull; ' + orgEmail + '</div>' +
        '<div style="margin-top: 8px; color: #94a3b8; font-size: 11px;">This is an electronically generated official receipt. Please retain for your records.</div>' +
      '</div>' +
    '</div></body></html>';

  // Send via safe email dispatcher
  sendEmailSafe({
    to: tx.payerEmail,
    subject: subject,
    body: plainTextBody,
    htmlBody: htmlBody,
    name: orgName,
    replyTo: orgEmail
  });
}

/**
 * Direct Test Function: You can select and RUN this function inside Google Apps Script editor
 * to verify that emails are sending from your Gmail account without errors!
 */
function testSendEmailDirectly() {
  var testEmail = Session.getEffectiveUser().getEmail() || "nagabapassion@gmail.com";
  sendEmailSafe({
    to: testEmail,
    subject: "SC Basimbuzi Test Email Dispatch",
    body: "Hello! This is a test email sent directly from your Google Apps Script backend running under your Gmail account.\\n\\nTimestamp: " + new Date().toISOString(),
    name: "SC Basimbuzi System"
  });
  Logger.log("SUCCESS: Test email successfully sent to " + testEmail);
}

/**
 * 7. USER MANAGEMENT (OWNER ONLY, MAX 5 ADMINS)
 */
function getAllUsers(operatorEmail, optionalSs) {
  verifyOperator(operatorEmail);

  var ss = optionalSs || getSpreadsheet();
  var userSheet = ss.getSheetByName(SHEET_USERS);
  if (!userSheet) {
    setupSpreadsheet();
    userSheet = ss.getSheetByName(SHEET_USERS);
  }

  var data = userSheet.getDataRange().getValues();
  var users = [];

  for (var i = 1; i < data.length; i++) {
    if (data[i][1]) {
      users.push({
        name: String(data[i][0] || ""),
        email: String(data[i][1] || "").toLowerCase(),
        role: String(data[i][2] || "ADMIN").toUpperCase(),
        status: String(data[i][3] || "ACTIVE").toUpperCase(),
        createdAt: String(data[i][4] || "")
      });
    }
  }

  return { success: true, data: users };
}

function handleAddUser(newUserData, operatorEmail) {
  if (!newUserData || !newUserData.email) {
    return { success: false, error: "Name and Email are required." };
  }

  var cleanOperator = String(operatorEmail || "").trim().toLowerCase();
  var operator = verifyOperator(cleanOperator);

  var targetEmail = String(newUserData.email).trim().toLowerCase();
  var targetName = String(newUserData.name || targetEmail.split('@')[0]).trim();
  var targetRole = String(newUserData.role || "ADMIN").trim().toUpperCase();
  var targetStatus = String(newUserData.status || "ACTIVE").trim().toUpperCase();

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
      existingRowIndex = i + 1; // 1-indexed for Sheet
      break;
    }
  }

  var nowIso = new Date().toISOString();

  if (existingRowIndex > -1) {
    // User already exists in sheet - update row details to ensure active status
    userSheet.getRange(existingRowIndex, 1).setValue(targetName);
    if (targetEmail !== "nagabapassion@gmail.com") {
      userSheet.getRange(existingRowIndex, 3).setValue(targetRole);
    }
    userSheet.getRange(existingRowIndex, 4).setValue(targetStatus);

    writeAuditLog({
      user: operator.name || "Operator",
      userEmail: cleanOperator,
      action: "UPDATE_USER",
      description: "Updated staff member: " + targetEmail + " as " + targetRole + " (" + targetStatus + ")"
    });

    return { 
      success: true, 
      message: "Staff member " + targetEmail + " was successfully updated in Google Sheets.",
      data: {
        name: targetName,
        email: targetEmail,
        role: targetRole,
        status: targetStatus,
        createdAt: String(data[existingRowIndex - 1][4] || nowIso)
      }
    };
  }

  // Append new user row
  userSheet.appendRow([
    targetName,
    targetEmail,
    targetRole,
    targetStatus,
    nowIso
  ]);

  writeAuditLog({
    user: operator.name || "Operator",
    userEmail: cleanOperator,
    action: "ADD_ADMIN",
    description: "Added staff member: " + targetEmail + " as " + targetRole + " (" + targetStatus + ")"
  });

  clearBackendCache();

  return { 
    success: true, 
    message: "Staff member " + targetEmail + " was successfully added to Google Sheets.",
    data: {
      name: targetName,
      email: targetEmail,
      role: targetRole,
      status: targetStatus,
      createdAt: nowIso
    }
  };
}

function handleEditUser(targetEmail, newUserData, operatorEmail) {
  var cleanOperator = String(operatorEmail || "").trim().toLowerCase();
  var operator = verifyOperator(cleanOperator);

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
  var currentRole = "";

  for (var i = 1; i < data.length; i++) {
    var email = (data[i][1] || "").toString().trim().toLowerCase();
    if (email === cleanTargetEmail) {
      targetRow = i + 1;
      currentRole = (data[i][2] || "").toString().toUpperCase();
      break;
    }
  }

  if (targetRow === -1) {
    return handleAddUser(newUserData, cleanOperator);
  }

  if (currentRole === "OWNER" && cleanTargetEmail === "nagabapassion@gmail.com") {
    if (newUserData.role && newUserData.role !== "OWNER") {
      return { success: false, error: "Cannot modify the primary Owner account role." };
    }
  }

  if (newUserData.name) {
    userSheet.getRange(targetRow, 1).setValue(String(newUserData.name).trim());
  }
  if (newUserData.role && cleanTargetEmail !== "nagabapassion@gmail.com") {
    userSheet.getRange(targetRow, 3).setValue(String(newUserData.role).toUpperCase());
  }
  if (newUserData.status) {
    userSheet.getRange(targetRow, 4).setValue(String(newUserData.status).toUpperCase());
  }

  writeAuditLog({
    user: operator.name || "Operator",
    userEmail: cleanOperator,
    action: "EDIT_USER",
    description: "Updated account for: " + cleanTargetEmail
  });

  clearBackendCache();

  return { success: true, message: "User " + cleanTargetEmail + " updated successfully in Google Sheets." };
}

function handleUpdateUserStatus(targetEmail, newStatus, operatorEmail) {
  var cleanOperator = String(operatorEmail || "").trim().toLowerCase();
  var operator = verifyOperator(cleanOperator);
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
  var operator = verifyOperator(cleanOperator);
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

function handleSyncUsers(usersList, operatorEmail) {
  var cleanOperator = String(operatorEmail || "").trim().toLowerCase();
  var operator = verifyOperator(cleanOperator);

  if (!usersList || !usersList.length) {
    return { success: false, error: "No users provided for synchronization." };
  }

  var ss = getSpreadsheet();
  var userSheet = ss.getSheetByName(SHEET_USERS);
  if (!userSheet) {
    setupSpreadsheet();
    userSheet = ss.getSheetByName(SHEET_USERS);
  }

  var data = userSheet.getDataRange().getValues();
  var existingMap = {};
  for (var i = 1; i < data.length; i++) {
    var email = (data[i][1] || "").toString().trim().toLowerCase();
    if (email) {
      existingMap[email] = i + 1;
    }
  }

  var nowIso = new Date().toISOString();
  var updatedCount = 0;
  var addedCount = 0;

  for (var j = 0; j < usersList.length; j++) {
    var u = usersList[j];
    if (!u || !u.email) continue;
    var targetEmail = String(u.email).trim().toLowerCase();
    var targetName = String(u.name || targetEmail.split('@')[0]).trim();
    var targetRole = String(u.role || (targetEmail === "nagabapassion@gmail.com" ? "OWNER" : "ADMIN")).toUpperCase();
    var targetStatus = String(u.status || "ACTIVE").toUpperCase();

    if (existingMap[targetEmail]) {
      var row = existingMap[targetEmail];
      userSheet.getRange(row, 1).setValue(targetName);
      if (targetEmail !== "nagabapassion@gmail.com") {
        userSheet.getRange(row, 3).setValue(targetRole);
      }
      userSheet.getRange(row, 4).setValue(targetStatus);
      updatedCount++;
    } else {
      userSheet.appendRow([targetName, targetEmail, targetRole, targetStatus, nowIso]);
      existingMap[targetEmail] = userSheet.getLastRow();
      addedCount++;
    }
  }

  writeAuditLog({
    user: operator.name || "Operator",
    userEmail: cleanOperator,
    action: "SYNC_USERS",
    description: "Synchronized " + (addedCount + updatedCount) + " staff accounts to Google Sheets."
  });

  clearBackendCache();

  return {
    success: true,
    message: "Successfully synchronized " + (addedCount + updatedCount) + " staff accounts to Google Sheets.",
    data: { addedCount: addedCount, updatedCount: updatedCount }
  };
}

/**
 * 8. SETTINGS MANAGEMENT
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
    paymentCategories: ["Membership", "Contribution", "Event", "Registration", "Fundraising", "Merchandise", "Other"],
    paymentMethods: ["Mobile Money", "Bank Transfer", "Cash", "Other"],
    currency: "UGX"
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
      paymentCategories: categories,
      paymentMethods: methods,
      currency: "UGX"
    }
  };
}

function handleSaveSettings(newSettings, operatorEmail) {
  var operator = verifyOperator(operatorEmail, "OWNER");

  var ss = getSpreadsheet();
  var settingsSheet = ss.getSheetByName(SHEET_SETTINGS);
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet(SHEET_SETTINGS);
  }

  settingsSheet.clear();
  settingsSheet.appendRow(["Key", "Value"]);
  settingsSheet.appendRow(["Organization Name", newSettings.organizationName || "SC Basimbuzi"]);
  settingsSheet.appendRow(["Organization Email", newSettings.organizationEmail || "nagabapassion@gmail.com"]);
  settingsSheet.appendRow(["Organization Phone", newSettings.organizationPhone || ""]);
  settingsSheet.appendRow(["Organization Address", newSettings.organizationAddress || ""]);
  settingsSheet.appendRow(["Receipt Prefix", (newSettings.receiptPrefix || "SB").toUpperCase()]);
  settingsSheet.appendRow(["Receipt Footer", newSettings.receiptFooter || ""]);
  settingsSheet.appendRow(["Logo URL", newSettings.logoUrl || ""]);
  settingsSheet.appendRow(["Payment Categories", JSON.stringify(newSettings.paymentCategories || [])]);
  settingsSheet.appendRow(["Payment Methods", JSON.stringify(newSettings.paymentMethods || [])]);

  writeAuditLog({
    user: operator.name,
    userEmail: operatorEmail,
    action: "CHANGE_SETTINGS",
    description: "Updated organization settings and receipt configuration"
  });

  clearBackendCache();

  return { success: true, message: "Settings saved successfully." };
}

/**
 * 9. TRANSACTIONS QUERY & SEARCH
 */
function getAllTransactions(operatorEmail, limit, optionalSs) {
  verifyOperator(operatorEmail);

  var ss = optionalSs || getSpreadsheet();
  var txSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  if (!txSheet) {
    return { success: true, data: [] };
  }

  var lastRow = txSheet.getLastRow();
  if (lastRow <= 1) {
    return { success: true, data: [] };
  }

  var maxLimit = (limit && Number(limit) > 0) ? Number(limit) : 0;
  var lastCol = Math.min(txSheet.getLastColumn(), 16);

  var startRow = 2;
  var numRows = lastRow - 1;

  // High-performance optimization: read only the latest N rows from the bottom of the sheet
  if (maxLimit > 0 && numRows > maxLimit) {
    startRow = lastRow - maxLimit + 1;
    numRows = maxLimit;
  }

  var data = txSheet.getRange(startRow, 1, numRows, lastCol).getValues();
  var transactions = [];

  for (var i = 0; i < data.length; i++) {
    if (data[i][0]) {
      transactions.push({
        receiptNumber: String(data[i][0]),
        date: formatSheetDate(data[i][1]),
        time: formatSheetTime(data[i][2]),
        payerName: String(data[i][3]),
        phone: String(data[i][4] || ""),
        email: String(data[i][5] || ""),
        amount: parseSheetNumber(data[i][6]),
        paymentPurpose: String(data[i][7] || ""),
        paymentMethod: String(data[i][8] || ""),
        paymentReference: String(data[i][9] || ""),
        notes: String(data[i][10] || ""),
        generatedBy: String(data[i][11] || ""),
        operatorEmail: String(data[i][12] || ""),
        paymentStatus: String(data[i][13] || "COMPLETED"),
        emailStatus: String(data[i][14] || "PENDING"),
        createdAt: String(data[i][15] || "")
      });
    }
  }

  // Return descending order (newest first)
  transactions.reverse();

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
  var lastCol = Math.min(auditSheet.getLastColumn(), 7);

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
 * Run this function once in Apps Script Editor (or select setupSpreadsheet and click Run)
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
      "Created At"
    ]);
    txSheet.setFrozenRows(1);
  }

  // 2. Users Sheet
  var userSheet = ss.getSheetByName(SHEET_USERS);
  if (!userSheet) {
    userSheet = ss.insertSheet(SHEET_USERS);
    userSheet.appendRow(["Name", "Email", "Role", "Status", "Created At"]);
    userSheet.setFrozenRows(1);
  }

  // Ensure Owner is registered in Users sheet
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
      new Date().toISOString()
    ]);
  }

  // Ensure Administrator Jotham Itungo is registered in Users sheet
  var jothamRegistered = false;
  for (var j = 1; j < userData.length; j++) {
    var emailInRow2 = (userData[j][1] || "").toString().trim().toLowerCase();
    if (emailInRow2 === "jotham.itungo@gmail.com") {
      jothamRegistered = true;
      break;
    }
  }

  if (!jothamRegistered) {
    userSheet.appendRow([
      "Jotham Itungo",
      "jotham.itungo@gmail.com",
      "ADMIN",
      "ACTIVE",
      new Date().toISOString()
    ]);
  }

  // 3. Settings Sheet
  var settingsSheet = ss.getSheetByName(SHEET_SETTINGS);
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet(SHEET_SETTINGS);
    settingsSheet.appendRow(["Key", "Value"]);
    settingsSheet.appendRow(["Organization Name", "SC Basimbuzi"]);
    settingsSheet.appendRow(["Organization Email", "nagabapassion@gmail.com"]);
    settingsSheet.appendRow(["Organization Phone", "+256 700 000000"]);
    settingsSheet.appendRow(["Organization Address", "Kampala, Uganda"]);
    settingsSheet.appendRow(["Receipt Prefix", "SB"]);
    settingsSheet.appendRow(["Receipt Footer", "Thank you for your payment to SC Basimbuzi."]);
    settingsSheet.appendRow(["Logo URL", ""]);
    settingsSheet.appendRow(["Payment Categories", JSON.stringify(["Membership", "Contribution", "Event", "Registration", "Fundraising", "Merchandise", "Other"])]);
    settingsSheet.appendRow(["Payment Methods", JSON.stringify(["Mobile Money", "Bank Transfer", "Cash", "Other"])]);
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

  Logger.log("SUCCESS: Database initialized with all 5 sheets.");
  return {
    success: true,
    message: "Google Spreadsheet structure initialized successfully with all 5 sheets."
  };
}
`;
