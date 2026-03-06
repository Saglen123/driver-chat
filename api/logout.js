const { clearSessionCookie } = require("./_lib");

module.exports = async function handler(req, res) {
  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
};
