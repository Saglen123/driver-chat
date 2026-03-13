const {
  getSheetRows,
  rowsToObjects,
  asString,
  normalize,
  getSessionUser,
  canAccess,
  extractRegNr,
  logEvent,
} = require("./_lib");

module.exports = async function handler(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ ok: false, error: "Ikke innlogget" });
  }

  const rawQuery = asString(req.query.regnr || req.query.q || "");
const query = normalize(rawQuery);

if (!query) {
  return res.status(400).json({ ok: false, error: "Mangler søk" });
}

try {
  const rows = await getSheetRows("vehicles");
  const vehicles = rowsToObjects(rows);

  const reg = extractRegNr(rawQuery);
  let matches = [];

  const genericVehicleWords = ["bil", "biler", "lastebil", "lastebiler", "truck"];

  if (genericVehicleWords.includes(query)) {
    matches = vehicles;
  } else if (reg) {
    matches = vehicles.filter(v =>
      asString(v.regnr).toUpperCase().replace(/\s/g, "") === reg
    );
  } else {
    const tokens = query.split(/\s+/).filter(t => t.length >= 2);

    const scored = vehicles.map(v => {
      const regnr = asString(v.regnr).toUpperCase().replace(/\s/g, "");
      const vehicleName = normalize(v.vehicle_name);
      const notes = normalize(v.notes);
      const hay = `${regnr.toLowerCase()} ${vehicleName} ${notes}`.trim();

      let score = 0;

      if (vehicleName === query) score += 200;
      if (regnr.toLowerCase() === query) score += 200;

      if (vehicleName.startsWith(query)) score += 80;
      if (regnr.toLowerCase().startsWith(query)) score += 80;

      if (hay.includes(query)) score += 40;

      for (const token of tokens) {
        if (hay.includes(token)) score += 10;
      }

      return { vehicle: v, score };
    });

    matches = scored
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.vehicle);
  }

    if (!matches.length) {
      return res.status(404).json({ ok: false, error: "Fant ikke bil" });
    }

    // rollefilter
    matches = matches.filter(v => {
      const required = v.required_role || v.access_role || v.acess_role || "users";
      return canAccess(user.role, required);
    });

    if (!matches.length) {
      return res.status(403).json({ ok: false, error: "Ingen tilgang" });
    }

    // hvis flere treff: returner liste
    if (matches.length > 1) {
      const items = matches.slice(0, 100).map(v => ({
        regnr: asString(v.regnr).toUpperCase(),
        vehicle_name: asString(v.vehicle_name),
        notes: asString(v.notes),
      }));

      await logEvent(user.user_id, "search_vehicle", rawQuery);

      return res.status(200).json({
        ok: true,
        multiple: true,
        items,
      });
    }

    // hvis ett treff: returner full bil
    const v = matches[0];

    const payload = {
      regnr: asString(v.regnr).toUpperCase(),
      vehicle_name: asString(v.vehicle_name),
      notes: asString(v.notes),
      fuel_card_code: asString(v.fuel_card_code),
    };

    await logEvent(user.user_id, "get_vehicle", payload.regnr);

    return res.status(200).json({
      ok: true,
      multiple: false,
      vehicle: payload,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
};
