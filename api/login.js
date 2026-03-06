const {
  getSheetRows,
  rowsToObjects,
  normalize,
  asString,
  createSessionToken,
  setSessionCookie,
  logEvent,
} = require("./_lib");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { email, pin } = req.body || {};
    if (!email || !pin) {
      return res.status(400).json({ ok: false, error: "Missing email or pin" });
    }

    const rows = await getSheetRows("users");
    const users = rowsToObjects(rows);

    const user = users.find(u =>
      normalize(u.email) === normalize(email) &&
      asString(u.pin) === asString(pin) &&
      normalize(u.active) !== "no" &&
      normalize(u.active) !== "false"
    );

    if (!user) {
      await logEvent("", "login_failed", email);
      return res.status(401).json({ ok: false, error: "Feil e-post eller PIN" });
    }

    const sessionUser = {
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      role: user.role || "driver",
    };

    const token = createSessionToken(sessionUser);
    setSessionCookie(res, token);

    await logEvent(user.user_id, "login_success", email);

    return res.status(200).json({
      ok: true,
      user: sessionUser,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
};
