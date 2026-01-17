/**
 * Role-Based Access Control (RBAC) Middleware
 *
 * Roles:
 * - admin: Full access to all features including user management
 * - user: Standard access to personal features
 */

const ROLES = {
  ADMIN: 'admin',
  USER: 'user'
};

/**
 * Middleware to check if user has required role
 * @param {...string} allowedRoles - Roles that are allowed access
 * @returns {Function} - Express middleware function
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    // User must be authenticated first
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = req.user.role;

    // Admin always has access
    if (userRole === ROLES.ADMIN) {
      return next();
    }

    // Check if user's role is in allowed roles
    if (allowedRoles.includes(userRole)) {
      return next();
    }

    return res.status(403).json({
      error: 'Access denied',
      message: 'You do not have permission to access this resource'
    });
  };
}

/**
 * Middleware to require admin role
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== ROLES.ADMIN) {
    return res.status(403).json({
      error: 'Admin access required',
      message: 'This action requires administrator privileges'
    });
  }

  next();
}

/**
 * Check if a user is admin
 * @param {Object} user - User object
 * @returns {boolean}
 */
function isAdmin(user) {
  return user && user.role === ROLES.ADMIN;
}

/**
 * Get user's role
 * @param {Object} user - User object
 * @returns {string}
 */
function getUserRole(user) {
  return user?.role || ROLES.USER;
}

module.exports = {
  ROLES,
  requireRole,
  requireAdmin,
  isAdmin,
  getUserRole
};
