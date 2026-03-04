const pool = require("../config/db");

async function createUser({ username, email, passwordHash }) {
  const [result] = await pool.query(
    "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
    [username, email, passwordHash],
  );
  return result.insertId;
}

async function findUserByUsername(username) {
  const [rows] = await pool.query(
    "SELECT id, username, email, password_hash FROM users WHERE username = ?",
    [username],
  );
  return rows[0];
}

async function updatePasswordHash(userId, passwordHash) {
  const [result] = await pool.query(
    "UPDATE users SET password_hash = ? WHERE id = ?",
    [passwordHash, userId],
  );
  return result.affectedRows > 0;
}
async function findUserByEmail(email) {
  const [rows] = await pool.query(
    "SELECT id, username, email, password_hash FROM users WHERE email = ?",
    [email],
  );
  return rows[0];
}
async function findUserById(id) {
  const [rows] = await pool.query(
    "SELECT id, username, email FROM users WHERE id = ?",
    [id],
  );
  return rows[0];
}
async function getPasswordHashById(id) {
  const [rows] = await pool.query(
    "SELECT password_hash FROM users WHERE id = ?",
    [id],
  );
  return rows[0]?.password_hash || null;
}
module.exports = {
  createUser,
  findUserByUsername,
  findUserByEmail,
  findUserById,
  updatePasswordHash,
  getPasswordHashById,
};
