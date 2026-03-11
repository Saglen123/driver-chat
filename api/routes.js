const {
  getSheetRows,
  rowsToObjects,
  asString,
  normalize,
  getSessionUser,
  logEvent,
} = require("./_lib");

module.exports = async function handler(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ ok: false, error: "Ikke innlogget" });
  }

  try {
    const rows = await getSheetRows("routes");
    const routes = rowsToObjects(rows);

    const seen = new Set();
    const items = [];

    for (const r of routes) {
      const name = asString(r.route_name);
      if (!name) continue;

      const key = normalize(name);
      if (seen.has(key)) continue;

      seen.add(key);
      items.push({ name });
    }

    items.sort((a, b) => a.name.localeCompare(b.name, "no"));

    await logEvent(user.user_id, "list_routes", "");

    return res.status(200).json({
      ok: true,
      items,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
};
