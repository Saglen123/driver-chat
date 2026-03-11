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

    // 1) Finn på ID først
    if (id) {
      loc = locations.find(l =>
        asNumberKey(l.location_id) === asNumberKey(id)
      );
    }

    // 2) Hvis ikke ID-match, prøv navn
    if (!loc && nameQuery) {
      // eksakt match
      loc = locations.find(l =>
        normalize(l.location_name || l.lokasjon_id) === nameQuery
      );

      // delvis match
      if (!loc) {
        loc = locations.find(l =>
          normalize(l.location_name || l.lokasjon_id).includes(nameQuery)
        );
      }

      // token-score fallback
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

    const rawRoutes = routes
  .filter(r =>
    (locId && asNumberKey(r.location_id) === locId) ||
    (locName && normalize(r.location_name) === locName)
  )
  .map(r => ({
    route_name: asString(r.route_name),
    delivery_day_num: Number(r.delivery_day || 0),
    delivery_day: dayCodeToName(r.delivery_day),
    delivery_time: timeToHHMM(r.delivery_time),
    loading_day_num: Number(r.loading_day || 0),
    loading_day: dayCodeToName(r.loading_day),
    loading_time: timeToHHMM(r.loading_time),
    notes: asString(r.notes),
    goods_info: asString(r.goods_info),
  }));

const seen = new Set();
const matchedRoutes = [];

for (const r of rawRoutes) {
  const key = [
    r.route_name,
    r.delivery_day_num,
    r.delivery_time,
    r.loading_day_num,
    r.loading_time,
    r.notes,
    r.goods_info
  ].join("|");

  if (seen.has(key)) continue;
  seen.add(key);
  matchedRoutes.push(r);
}

// først: rader som faktisk har info
const routesWithInfo = matchedRoutes.filter(r =>
  r.delivery_day ||
  r.delivery_time ||
  r.loading_day ||
  r.loading_time ||
  r.goods_info ||
  r.notes
);

// hvis vi fant rader med info, bruk bare dem
const routesToUse = routesWithInfo.length ? routesWithInfo : matchedRoutes;

// sorter pent
routesToUse.sort((a, b) => {
  if (a.delivery_day_num !== b.delivery_day_num) {
    return a.delivery_day_num - b.delivery_day_num;
  }
  if (a.delivery_time !== b.delivery_time) {
    return a.delivery_time.localeCompare(b.delivery_time);
  }
  if (a.loading_day_num !== b.loading_day_num) {
    return a.loading_day_num - b.loading_day_num;
  }
  return a.loading_time.localeCompare(b.loading_time);
});

const finalRoutes = routesToUse.slice(0, 20);

    const payload = {
      name: asString(loc.location_name || loc.lokasjon_id),
      portkode: asString(loc.portkode),
      kodelas: asString(loc.kodelås || loc.kodelas),
      alarmkode: asString(loc.alarmkode),
      nokkelinfo: asString(loc.nøkkelinfo || loc.nokkelinfo),
      routes: finalRoutes,
    };

    await logEvent(user.user_id, "get_location", payload.name);

    return res.status(200).json({ ok: true, location: payload });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
};
