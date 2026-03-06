const {
  getSheetRows,
  rowsToObjects,
  normalize,
  asString,
  asNumberKey,
  dayCodeToName,
  timeToHHMM,
  getSessionUser,
  canAccess,
  logEvent,
} = require("./_lib");

module.exports = async function handler(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ ok: false, error: "Ikke innlogget" });
  }

  const id = asString(req.query.id);
  const nameQuery = normalize(req.query.name);

  try {
    const [locationRows, routeRows] = await Promise.all([
      getSheetRows("locations"),
      getSheetRows("routes"),
    ]);

    const locations = rowsToObjects(locationRows);
    const routes = rowsToObjects(routeRows);

    const loc = locations.find(l =>
      (id && asNumberKey(l.location_id) === asNumberKey(id)) ||
      (nameQuery && normalize(l.location_name || l.lokasjon_id) === nameQuery)
    );

    if (!loc) {
      return res.status(404).json({ ok: false, error: "Fant ikke sted" });
    }

    const required = loc.access_role || loc.acess_role || "users";
    if (!canAccess(user.role, required)) {
      return res.status(403).json({ ok: false, error: "Ingen tilgang" });
    }

    const locId = asNumberKey(loc.location_id);
    const locName = normalize(loc.location_name || loc.lokasjon_id);

    const matchedRoutes = routes
      .filter(r =>
        (locId && asNumberKey(r.location_id) === locId) ||
        (locName && normalize(r.location_name) === locName)
      )
      .slice(0, 10)
      .map(r => ({
        route_name: asString(r.route_name),
        delivery_day: dayCodeToName(r.delivery_day),
        delivery_time: timeToHHMM(r.delivery_time),
        loading_day: dayCodeToName(r.loading_day),
        loading_time: timeToHHMM(r.loading_time),
        notes: asString(r.notes),
      }));

    const payload = {
      id: asString(loc.location_id),
      name: asString(loc.location_name || loc.lokasjon_id),
      portkode: asString(loc.portkode),
      kodelas: asString(loc.kodelås || loc.kodelas),
      nokkelinfo: asString(loc.nøkkelinfo || loc.nokkelinfo),
      routes: matchedRoutes,
    };

    // alarmkode kun planner/admin i v1
    if (["planner", "admin"].includes(normalize(user.role))) {
      payload.alarmkode = asString(loc.alarmkode);
    }

    await logEvent(user.user_id, "get_location", payload.name);

    return res.status(200).json({ ok: true, location: payload });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
};
