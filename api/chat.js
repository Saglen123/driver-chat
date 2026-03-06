const {
  getSheetRows,
  rowsToObjects,
  normalize,
  asString,
  asNumberKey,
  getSessionUser,
  extractRegNr,
} = require("./_lib");

module.exports = async function handler(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ ok: false, error: "Ikke innlogget" });
  }

  const { message } = req.body || {};
  if (!message) {
    return res.status(400).json({ ok: false, error: "Missing message" });
  }

  try {

    const msg = normalize(message);

    const [locationRows, routeRows, vehicleRows] = await Promise.all([
      getSheetRows("locations"),
      getSheetRows("routes"),
      getSheetRows("vehicles"),
    ]);

    const locations = rowsToObjects(locationRows);
    const routes = rowsToObjects(routeRows);
    const vehicles = rowsToObjects(vehicleRows);

    // ---------- VEHICLE ----------
    const reg = extractRegNr(message);

    if (reg) {
      const v = vehicles.find(x =>
        asString(x.regnr).toUpperCase().replace(/\s/g, "") === reg
      );

      if (!v) {
        return res.json({
          ok: true,
          answer: `Jeg finner ikke bilen ${reg}.`
        });
      }

      return res.json({
        ok: true,
        answer: `Dieselkort-koden for ${reg} er ${v.fuel_card_code}.`
      });
    }

    // ---------- LOCATION ----------
    const loc = locations.find(l =>
      normalize(l.location_name).includes(msg)
    );

    if (!loc) {
      return res.json({
        ok: true,
        answer: "Jeg finner ikke stedet i databasen."
      });
    }

    const locId = asNumberKey(loc.location_id);

    const routeRowsForLoc = routes.filter(r =>
      asNumberKey(r.location_id) === locId
    );

    let answer = `${loc.location_name}\n\n`;

    if (loc.portkode) {
      answer += `Portkode: ${loc.portkode}\n`;
    }

    if (loc.kodelås) {
      answer += `Kodelås: ${loc.kodelås}\n`;
    }

    if (loc.alarmkode) {
      answer += `Alarmkode: ${loc.alarmkode}\n`;
    }

    if (routeRowsForLoc.length) {
      answer += `\nRuter:\n`;

      routeRowsForLoc.slice(0,4).forEach(r => {
        answer += `• ${r.route_name} – ${r.delivery_day} ${r.delivery_time}\n`;
      });
    }

    return res.json({
      ok: true,
      answer
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: String(err)
    });
  }
};
