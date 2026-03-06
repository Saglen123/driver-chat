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

    let loc = null;

if (id) {
  loc = locations.find(l => asNumberKey(l.location_id) === asNumberKey(id));
} else if (nameQuery) {
  // 1) eksakt match
  loc = locations.find(l =>
    normalize(l.location_name || l.lokasjon_id) === nameQuery
  );

  // 2) contains match
  if (!loc) {
    loc = locations.find(l =>
      normalize(l.location_name || l.lokasjon_id).includes(nameQuery)
    );
  }

  // 3) token-match fallback
  if (!loc) {
    const tokens = nameQuery.split(/\s+/).filter(t => t.length >= 2);

    let best = null;
    let bestScore = 0;

    for (const l of locations) {
      const hay = normalize(l.location_name || l.lokasjon_id);
      let score = 0;

      for (const t of tokens) {
        if (hay.includes(t)) score++;
      }

      if (score > bestScore) {
        bestScore = score;
        best = l;
      }
    }

    if (bestScore > 0) loc = best;
  }
}

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
    payload.alarmkode = asString(loc.alarmkode);

    await logEvent(user.user_id, "get_location", payload.name);

    return res.status(200).json({ ok: true, location: payload });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
};
