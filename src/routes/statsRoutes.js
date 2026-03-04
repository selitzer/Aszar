const express = require("express");
const router = express.Router();
const statsModel = require("../models/statsModel");
const requireSession = require("../middleware/requireSession");

router.get("/me", requireSession, async (req, res) => {
  try {
    const userId = req.session.userId;

    await statsModel.ensureUserStatsRow(userId);
    const stats = await statsModel.getUserStats(userId);

    return res.json({ ok: true, stats });
  } catch (err) {
    console.error("[GET /stats/me] failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

module.exports = router;
