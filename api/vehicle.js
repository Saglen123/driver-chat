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

  const reg = extractRegNr(req.query.regnr || "");
  if (!reg) {
    return res.status(400).json({ ok: false, error: "Ugyldig regnr" });
  }

  try {
    const rows = await getSheetRows("vehicles");
    const vehicles = rowsToObjects(rows);

    const v = vehicles.find(x =>
      asString(x.regnr).toUpperCase().replace(/\s/g, "") === reg
    );

    if (!v) {
      return res.status(404).json({ ok: false, error: "Fant ikke bil" });
    }

    const required = v.access_role || v.acess_role || "users";
    if (!canAccess(user.role, required)) {
      return res.status(403).json({ ok: false, error: "Ingen tilgang" });
    }

    const payload = {
      regnr: asString(v.regnr).toUpperCase(),
      vehicle_name: asString(v.vehicle_name),
      notes: asString(v.notes),
    };

    // dieselkort kun planner/admin i v1
    payload.fuel_card_code = asString(v.fuel_card_code);

    await logEvent(user.user_id, "get_vehicle", payload.regnr);

    return res.status(200).json({ ok: true, vehicle: payload });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
};
