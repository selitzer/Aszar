const bcrypt = require("bcrypt");
const userModel = require("../models/userModel");
const walletModel = require("../models/walletModel");
const { sendWelcomeEmail } = require("./emailService");

function isValidEmail(email) {
  return (
    typeof email === "string" && email.includes("@") && email.length <= 255
  );
}

function isValidUsername(username) {
  return (
    typeof username === "string" &&
    username.length >= 3 &&
    username.length <= 32 &&
    /^[a-zA-Z0-9_]+$/.test(username)
  );
}

async function register({ username, email, password }) {
  if (!isValidUsername(username)) {
    return { ok: false, status: 400, message: "Invalid username." };
  }
  if (!isValidEmail(email)) {
    return { ok: false, status: 400, message: "Invalid email." };
  }
  if (typeof password !== "string" || password.length < 6) {
    return {
      ok: false,
      status: 400,
      message: "Password must be at least 6 characters.",
    };
  }

  const existingU = await userModel.findUserByUsername(username);
  if (existingU)
    return { ok: false, status: 409, message: "Username already taken." };

  const existingE = await userModel.findUserByEmail(email);
  if (existingE)
    return { ok: false, status: 409, message: "Email already in use." };

  const passwordHash = await bcrypt.hash(password, 12);

  const userId = await userModel.createUser({ username, email, passwordHash });
  await walletModel.createWalletForUser(userId, 1000.0);
  sendWelcomeEmail(email, username).catch((err) =>
    console.error("Welcome email failed:", err.message),
  );
  return { ok: true, userId };
}

async function login({ identifier, password }) {
  if (typeof identifier !== "string" || identifier.trim().length < 1) {
    return { ok: false, status: 400, message: "Username or email required." };
  }
  if (typeof password !== "string" || password.length < 1) {
    return { ok: false, status: 400, message: "Password required." };
  }

  const id = identifier.trim();
  const user = id.includes("@")
    ? await userModel.findUserByEmail(id)
    : await userModel.findUserByUsername(id);

  if (!user) return { ok: false, status: 401, message: "Invalid credentials." };

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match)
    return { ok: false, status: 401, message: "Invalid credentials." };

  return { ok: true, userId: user.id };
}

module.exports = {
  register,
  login,
};
