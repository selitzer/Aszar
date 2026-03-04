const path = require("path");
const express = require("express");
const session = require("express-session");
require("dotenv").config();

const pool = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const walletRoutes = require("./routes/walletRoutes");
const statsRoutes = require("./routes/statsRoutes");

const { createBlackjackRoutes } = require("./routes/blackjackRoutes");
const { createRouletteRoutes } = require("./routes/rouletteRoutes");
const { createBaccaratRoutes } = require("./routes/baccaratRoutes");
const dailyRewardsRoutes = require("./routes/dailyRewardsRoutes");
const savingsRoutes = require("./routes/savingsRoutes");

const app = express();

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev_secret_change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
    },
  }),
);

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.redirect("/login");
}

function redirectIfAuth(req, res, next) {
  if (req.session && req.session.userId) return res.redirect("/dashboard");
  return next();
}

function requireApiAuth(req, res, next) {
  if (req.session?.userId) return next();
  return res.status(401).json({ message: "Not authenticated" });
}

function sendPublic(res, file) {
  return res.sendFile(path.join(__dirname, "..", "public", file));
}

app.get("/dashboard", requireAuth, (req, res) =>
  sendPublic(res, "dashboard.html"),
);

app.get("/blackjack", requireAuth, (req, res) =>
  sendPublic(res, "games/blackjack.html"),
);
app.get("/roulette", requireAuth, (req, res) =>
  sendPublic(res, "games/roulette.html"),
);
app.get("/baccarat", requireAuth, (req, res) =>
  sendPublic(res, "games/baccarat.html"),
);

app.get("/login", redirectIfAuth, (req, res) => sendPublic(res, "login.html"));
app.get("/register", redirectIfAuth, (req, res) =>
  sendPublic(res, "register.html"),
);
app.get("/landing", redirectIfAuth, (req, res) =>
  sendPublic(res, "landing.html"),
);

app.get("/reset-password", redirectIfAuth, (req, res) =>
  sendPublic(res, "reset-password.html"),
);
app.get("/resetPassword", redirectIfAuth, (req, res) =>
  sendPublic(res, "resetPassword.html"),
);

app.get("/", (req, res) => {
  if (req.session?.userId) return res.redirect("/dashboard");
  return sendPublic(res, "index.html");
});

app.get("/dashboard.html", (req, res) => res.redirect(301, "/dashboard"));

app.get("/login.html", (req, res) => res.redirect(301, "/login"));
app.get("/register.html", (req, res) => res.redirect(301, "/register"));
app.get("/landing.html", (req, res) => res.redirect(301, "/landing"));

app.get("/reset-password.html", (req, res) =>
  res.redirect(301, "/reset-password"),
);
app.get("/resetPassword.html", (req, res) =>
  res.redirect(301, "/resetPassword"),
);

app.get("/games/blackjack.html", requireAuth, (req, res) =>
  sendPublic(res, "games/blackjack.html"),
);
app.get("/games/roulette.html", requireAuth, (req, res) =>
  sendPublic(res, "games/roulette.html"),
);
app.get("/games/baccarat.html", requireAuth, (req, res) =>
  sendPublic(res, "games/baccarat.html"),
);

app.get("/games/blackjack", (req, res) => res.redirect(301, "/blackjack"));
app.get("/games/roulette", (req, res) => res.redirect(301, "/roulette"));
app.get("/games/baccarat", (req, res) => res.redirect(301, "/baccarat"));

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ status: "ok", db: rows[0].ok });
  } catch (err) {
    next(err);
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/wallet", requireApiAuth, walletRoutes);
app.use("/api/stats", requireApiAuth, statsRoutes);
app.use("/api/history", requireApiAuth, require("./routes/betHistoryRoutes"));
app.use("/api/roulette", createRouletteRoutes({ pool }));
app.use("/api/daily-rewards", requireApiAuth, dailyRewardsRoutes);
app.use("/api/savings-accounts", requireApiAuth, savingsRoutes);

app.use(
  "/api/blackjack",
  createBlackjackRoutes({
    pool,
    getUserId: (req) => req.session?.userId,
  }),
);

app.use(
  "/api/baccarat",
  createBaccaratRoutes({
    pool,
    getUserId: (req) => req.session?.userId,
  }),
);

module.exports = app;
