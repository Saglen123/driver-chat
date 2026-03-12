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

  const routeDay = Number(r.route_day || 9);

  // unikt på navn + dag
  const key = `${normalize(name)}|${routeDay}`;
  if (seen.has(key)) continue;

  seen.add(key);
  items.push({
    name,
    route_day: routeDay,
  });
}

    items.sort((a, b) => {
  if ((a.route_day || 9) !== (b.route_day || 9)) {
    return (a.route_day || 9) - (b.route_day || 9);
  }

  const aName = a.name || "";
  const bName = b.name || "";

  return aName.localeCompare(bName, "no", {
    numeric: true,
    sensitivity: "base",
  });
});

    await logEvent(user.user_id, "list_routes", "");

    return res.status(200).json({
      ok: true,
      items,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
};
