module.exports = function requireSession(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
  }
  next();
};
