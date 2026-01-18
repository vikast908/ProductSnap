const jwt = require('jsonwebtoken');

// SECURITY: Require JWT_SECRET to be set - never use defaults
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET environment variable must be set and be at least 32 characters');
  process.exit(1);
}

/**
 * Middleware to verify JWT token
 * Checks for token in: 1) httpOnly cookie (preferred), 2) Authorization header
 * Extracts user from token and attaches to request
 */
function authenticateToken(req, res, next) {
  // First try httpOnly cookie (more secure)
  let token = req.cookies?.auth_token;

  // Fall back to Authorization header for API clients
  if (!token) {
    const authHeader = req.headers['authorization'];
    token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  }

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(403).json({ error: 'Invalid token' });
  }
}

/**
 * Optional authentication - doesn't fail if no token
 * Useful for routes that work differently for authenticated users
 */
function optionalAuth(req, res, next) {
  // First try httpOnly cookie (more secure)
  let token = req.cookies?.auth_token;

  // Fall back to Authorization header for API clients
  if (!token) {
    const authHeader = req.headers['authorization'];
    token = authHeader && authHeader.split(' ')[1];
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
  } catch (error) {
    req.user = null;
  }
  next();
}

/**
 * Generate JWT token for a user
 * @param {Object} user - User object
 * @returns {string} - JWT token
 */
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '24h' } // Reduced from 7d for security
  );
}

/**
 * Verify and decode a token without middleware
 * @param {string} token - JWT token
 * @returns {Object|null} - Decoded token or null
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

module.exports = {
  authenticateToken,
  optionalAuth,
  generateToken,
  verifyToken
};
