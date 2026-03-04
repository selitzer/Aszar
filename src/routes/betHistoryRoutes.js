"use strict";

const express = require("express");
const router = express.Router();

const requireSession = require("../middleware/requireSession");
const betHistoryModel = require("../models/betHistoryModel");

router.get("/me", requireSession, async (req, res) => {
  try {
    const userId = req.session.userId;
    const limit = req.query.limit;

    const rows = await betHistoryModel.getRecentBetHistory(userId, limit);
    return res.json({ ok: true, rows });
  } catch (err) {
    console.error("[GET /bet-history/me] failed:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

module.exports = router;
