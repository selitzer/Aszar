const walletModel = require("../models/walletModel");

async function getBalance(req, res) {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ ok: false });

  const wallet = await walletModel.getWalletByUserId(userId);
  res.json({ ok: true, balance: wallet.balance });
}

module.exports = { getBalance };
