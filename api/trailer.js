const {
  getSheetRows,
  rowsToObjects,
  asString,
  normalize,
  getSessionUser,
  canAccess,
  logEvent,
} = require("./_lib");

function extractTrailerReg(text) {
  const m = asString(text).toUpperCase().match(/\b([A-ZÆØÅ]{2})\s?(\d{4})\b/);
  return m ? `${m[1]}${m[2]}` : null;
}

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
    const rows = await getSheetRows("trailers");
    const trailers = rowsToObjects(rows);

    const reg = extractTrailerReg(rawQuery);
    let matches = [];

    const genericTrailerWords = ["henger", "hengere", "tralle", "traller", "kjøl", "kjole", "skap", "gardin"];

    // 1) Hvis bruker skriver generelt ord -> vis alle hengere
    if (genericTrailerWords.includes(query)) {
      matches = trailers;
    }
    // 2) Eksakt regnr
    else if (reg) {
      matches = trailers.filter(t =>
        asString(t.regnr).toUpperCase().replace(/\s/g, "") === reg
      );
    }
    // 3) Vanlig tekstsøk på navn/regnr/notater
    else {
      const tokens = query.split(/\s+/).filter(t => t.length >= 2);

      const scored = trailers.map(t => {
        const regnr = asString(t.regnr).toUpperCase().replace(/\s/g, "");
        const trailerName = normalize(t.trailer_name);
        const notes = normalize(t.notes);
        const hay = `${regnr.toLowerCase()} ${trailerName} ${notes}`.trim();

        let score = 0;

        if (trailerName === query) score += 200;
        if (regnr.toLowerCase() === query) score += 200;

        if (trailerName.startsWith(query)) score += 80;
        if (regnr.toLowerCase().startsWith(query)) score += 80;

        if (hay.includes(query)) score += 40;

        for (const token of tokens) {
          if (hay.includes(token)) score += 10;
        }

        return { trailer: t, score };
      });

      matches = scored
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(x => x.trailer);
    }

    if (!matches.length) {
      return res.status(404).json({ ok: false, error: "Fant ikke henger" });
    }

    // Rollefilter
    matches = matches.filter(t => {
      const required = t.required_role || t.access_role || t.acess_role || "users";
      return canAccess(user.role, required);
    });

    if (!matches.length) {
      return res.status(403).json({ ok: false, error: "Ingen tilgang" });
    }

    // Fjern duplikater på regnr
    const seen = new Set();
    matches = matches.filter(t => {
      const key = asString(t.regnr).toUpperCase().replace(/\s/g, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Flere treff -> liste
    if (matches.length > 1) {
      const items = matches.slice(0, 50).map(t => ({
        regnr: asString(t.regnr).toUpperCase(),
        trailer_name: asString(t.trailer_name),
        notes: asString(t.notes),
      }));

      await logEvent(user.user_id, "search_trailer", rawQuery);

      return res.status(200).json({
        ok: true,
        multiple: true,
        items,
      });
    }

    // Ett treff -> detaljvisning
    const t = matches[0];

    const payload = {
      regnr: asString(t.regnr).toUpperCase(),
      trailer_name: asString(t.trailer_name),
      notes: asString(t.notes),
      vognkort_url: asString(t.vognkort_url),
    };

    await logEvent(user.user_id, "get_trailer", payload.regnr);

    return res.status(200).json({
      ok: true,
      multiple: false,
      trailer: payload,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
};
