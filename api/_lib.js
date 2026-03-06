const { google } = require("googleapis");
const crypto = require("crypto");

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function getSheetRows(sheetName) {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: sheetName,
  });

  return res.data.values || [];
}

function rowsToObjects(rows) {
  if (!rows || !rows.length) return [];
  const headers = rows[0].map(h => String(h || "").trim());
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? "";
    });
    return obj;
  }).filter(obj => Object.values(obj).some(v => String(v).trim() !== ""));
}

function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

function asString(v) {
  return String(v ?? "").trim();
}

function asNumberKey(v) {
  const s = asString(v);
  if (!s) return "";
  const n = Number(s);
  if (!isNaN(n)) return String(Math.trunc(n));
  return s;
}

function dayCodeToName(v) {
  const s = asString(v);
  if (!s) return "";
  if (/[a-zæøå]/i.test(s)) return s;

  const m = s.match(/\d+/);
  if (!m) return s;

  const map = {
    1: "Mandag",
    2: "Tirsdag",
    3: "Onsdag",
    4: "Torsdag",
    5: "Fredag",
    6: "Lørdag",
    7: "Søndag",
  };

  return map[Number(m[0])] || s;
}

function timeToHHMM(v) {
  const s = asString(v);
  if (!s) return "";
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
  return s;
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach(part => {
    const [k, ...rest] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(rest.join("="));
  });
  return out;
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function sign(data) {
  return crypto
    .createHmac("sha256", process.env.SESSION_SECRET)
    .update(data)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createSessionToken(user) {
  const payload = {
    user_id: user.user_id,
    name: user.name,
    email: user.email,
    role: user.role,
    exp: Date.now() + 1000 * 60 * 60 * 12, // 12 timer
  };

  const encoded = base64url(JSON.stringify(payload));
  const sig = sign(encoded);
  return `${encoded}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || !token.includes(".")) return null;
  const [encoded, sig] = token.split(".");
  if (sign(encoded) !== sig) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function setSessionCookie(res, token) {
  const cookie = [
    `session=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
    "Max-Age=43200"
  ].join("; ");

  res.setHeader("Set-Cookie", cookie);
}

function clearSessionCookie(res) {
  const cookie = [
    "session=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
    "Max-Age=0"
  ].join("; ");

  res.setHeader("Set-Cookie", cookie);
}

function getSessionUser(req) {
  const cookies = parseCookies(req);
  const token = cookies.session;
  return verifySessionToken(token);
}

function canAccess(role, requiredRole) {
  const userRole = normalize(role || "driver");
  const reqRole = normalize(requiredRole || "users");

  if (reqRole === "users") return ["driver", "planner", "admin", "users"].includes(userRole);
  if (reqRole === "planner") return ["planner", "admin"].includes(userRole);
  if (reqRole === "admin") return userRole === "admin";
  if (reqRole === "driver") return ["driver", "planner", "admin"].includes(userRole);

  return false;
}

function extractRegNr(message) {
  const m = asString(message).toUpperCase();
  const hit = m.match(/\b([A-ZÆØÅ]{2})\s?(\d{5})\b/);
  return hit ? (hit[1] + hit[2]) : null;
}

async function logEvent(userId, action, query = "") {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: "logs!A:D",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[new Date().toISOString(), userId || "", action || "", query || ""]],
      },
    });
  } catch {
    // logs-ark er valgfritt, skal ikke stoppe appen
  }
}

module.exports = {
  getSheetRows,
  rowsToObjects,
  normalize,
  asString,
  asNumberKey,
  dayCodeToName,
  timeToHHMM,
  createSessionToken,
  getSessionUser,
  setSessionCookie,
  clearSessionCookie,
  canAccess,
  extractRegNr,
  logEvent,
};
