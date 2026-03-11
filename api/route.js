const {
  getSheetRows,
  rowsToObjects,
  asString,
  asNumberKey,
  normalize,
  timeToHHMM,
  dayCodeToName,
  getSessionUser,
  logEvent,
} = require("./_lib");

module.exports = async function handler(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ ok: false, error: "Ikke innlogget" });
  }

  const routeName = asString(req.query.name);
  if (!routeName) {
    return res.status(400).json({ ok: false, error: "Mangler rutenavn" });
  }

  try {
    const rows = await getSheetRows("routes");
    const routes = rowsToObjects(rows);

    const rawMatched = routes
  .filter(r => normalize(r.route_name) === normalize(routeName))
  .map(r => ({
    route_id: asString(r.route_id),
    location_id: asNumberKey(r.location_id),
    location_name: asString(r.location_name),
    route_name: asString(r.route_name),
    delivery_day_num: Number(r.delivery_day || 0),
    delivery_day: dayCodeToName(r.delivery_day),
    delivery_time: timeToHHMM(r.delivery_time),
    loading_day_num: Number(r.loading_day || 0),
    loading_day: dayCodeToName(r.loading_day),
    loading_time: timeToHHMM(r.loading_time),
    notes: asString(r.notes),
    stop_order: Number(r.stop_order || 9999),
    goods_info: asString(r.goods_info),
  }));

const seen = new Set();
const matched = [];

for (const r of rawMatched) {
  const key = [
    r.route_name,
    r.delivery_day_num,
    r.location_id,
    r.location_name,
    r.delivery_time,
    r.loading_day_num,
    r.loading_time,
    r.notes,
    r.goods_info
  ].join("|");

  if (seen.has(key)) continue;
  seen.add(key);
  matched.push(r);
}

    if (!matched.length) {
      return res.status(404).json({ ok: false, error: "Fant ikke rute" });
    }

    matched.sort((a, b) => {
      if (a.delivery_day_num !== b.delivery_day_num) {
        return a.delivery_day_num - b.delivery_day_num;
      }
      if (a.stop_order !== b.stop_order) {
        return a.stop_order - b.stop_order;
      }
      return a.delivery_time.localeCompare(b.delivery_time);
    });

    const grouped = {};
    for (const stop of matched) {
      const key = stop.delivery_day_num || 0;
      if (!grouped[key]) {
        grouped[key] = {
          day_num: stop.delivery_day_num,
          day_name: stop.delivery_day,
          stops: [],
        };
      }
      grouped[key].stops.push(stop);
    }

    const days = Object.values(grouped).sort((a, b) => a.day_num - b.day_num);

    await logEvent(user.user_id, "get_route", routeName);

    return res.status(200).json({
      ok: true,
      route_name: routeName,
      days,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
};
