'use strict';
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { query } = require('../../db/pool');
const env    = require('../../config/env');

const SALT_ROUNDS = 12;

/**
 * Register a new user.
 * @returns {{ user, token }}
 */
async function register({ email, password, slug }) {
  // Check for duplicate email
  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rowCount > 0) {
    const err = new Error('Email already registered');
    err.status = 409;
    err.code   = 'EMAIL_TAKEN';
    throw err;
  }

  // Check for duplicate slug
  const slugCheck = await query('SELECT id FROM users WHERE slug = $1', [slug]);
  if (slugCheck.rowCount > 0) {
    const err = new Error('Slug already taken');
    err.status = 409;
    err.code   = 'SLUG_TAKEN';
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, slug)
     VALUES ($1, $2, $3)
     RETURNING id, email, slug, created_at`,
    [email, passwordHash, slug],
  );

  const user  = rows[0];
  const token = signToken(user);
  return { user, token };
}

/**
 * Authenticate a user and return a JWT.
 */
async function login({ email, password }) {
  const { rows } = await query(
    'SELECT id, email, slug, password_hash, telegram_chat_id, created_at FROM users WHERE email = $1',
    [email],
  );

  const user = rows[0];
  // Constant-time compare even if user not found to avoid timing attacks
  const hash = user?.password_hash ?? '$2a$12$invalid.hash.that.never.matches';
  const match = await bcrypt.compare(password, hash);

  if (!user || !match) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    err.code   = 'INVALID_CREDENTIALS';
    throw err;
  }

  const token = signToken(user);
  const { password_hash, ...safeUser } = user;  // eslint-disable-line no-unused-vars
  return { user: safeUser, token };
}

/**
 * Get user profile by id.
 */
async function getProfile(userId) {
  const { rows } = await query(
    'SELECT id, email, slug, telegram_chat_id, created_at FROM users WHERE id = $1',
    [userId],
  );
  return rows[0] ?? null;
}

/**
 * Update mutable profile fields.
 */
async function updateProfile(userId, { slug, telegram_chat_id }) {
  if (slug) {
    const check = await query('SELECT id FROM users WHERE slug = $1 AND id != $2', [slug, userId]);
    if (check.rowCount > 0) {
      const err = new Error('Slug already taken');
      err.status = 409;
      err.code   = 'SLUG_TAKEN';
      throw err;
    }
  }

  const { rows } = await query(
    `UPDATE users
     SET slug             = COALESCE($2, slug),
         telegram_chat_id = COALESCE($3, telegram_chat_id)
     WHERE id = $1
     RETURNING id, email, slug, telegram_chat_id, created_at`,
    [userId, slug ?? null, telegram_chat_id ?? null],
  );
  return rows[0];
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, slug: user.slug },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN },
  );
}

module.exports = { register, login, getProfile, updateProfile };
