const {
  getSheetRows,
  rowsToObjects,
  normalize,
  asString,
  getSessionUser,
  canAccess,
  logEvent,
} = require("./_lib");

module.exports = async function handler(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ ok: false, error: "Ikke innlogget" });
  }

  const q = asString(req.query.q);
  if (!q || q.length < 2) {
    return res.status(200).json({ ok: true, items: [] });
  }

  try {
    const rows = await getSheetRows("locations");
    const locations = rowsToObjects(rows);
    const query = normalize(q);
    const tokens = query.split(/\s+/).filter(t => t.length >= 2);

    const items = [];

    for (const loc of locations) {
      const required = loc.access_role || loc.acess_role || "users";
      if (!canAccess(user.role, required)) continue;

      const name = normalize(loc.location_name || loc.lokasjon_id || "");
      const alias = normalize(loc.alias || "");
      const hay = `${name} ${alias}`.trim();
      if (!hay) continue;

      let score = 0;
      if (name === query) score += 200;
      if (alias === query) score += 180;
      if (name.startsWith(query)) score += 100;
      if (alias.startsWith(query)) score += 80;
      if (query.includes(name) && name) score += 50;
      if (query.includes(alias) && alias) score += 40;
      for (const t of tokens) if (hay.includes(t)) score += 10;

      if (score > 0) {
        items.push({
          id: asString(loc.location_id),
          label: asString(loc.location_name || loc.lokasjon_id),
          score,
        });
      }
    }

    items.sort((a, b) => b.score - a.score);

    await logEvent(user.user_id, "search_location", q);

    return res.status(200).json({
      ok: true,
      items: items.slice(0, 8),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
};
