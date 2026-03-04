const express = require("express");
const router = express.Router();
const dailyRewardsController = require("../controllers/dailyRewardsController");

router.get("/status", dailyRewardsController.status);
router.post("/claim", dailyRewardsController.claim);

module.exports = router;