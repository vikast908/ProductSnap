const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin, ROLES } = require('../middleware/rbac');

const router = express.Router();

/**
 * Create admin routes
 * @param {Object} db - LowDB instance
 * @returns {Router} - Express router
 */
function createAdminRoutes(db) {

  // Get all users (admin only)
  router.get('/users', authenticateToken, requireAdmin, (req, res) => {
    try {
      const users = db.get('users').value() || [];

      // Return safe user data (no API keys)
      const safeUsers = users.map(user => ({
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        role: user.role,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        hasApiKeys: {
          openai: !!user.settings?.apiKeys?.openai,
          anthropic: !!user.settings?.apiKeys?.anthropic,
          google: !!user.settings?.apiKeys?.google
        }
      }));

      res.json(safeUsers);
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({ error: 'Failed to get users' });
    }
  });

  // Get single user (admin only)
  router.get('/users/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
      const { id } = req.params;
      const user = db.get('users').find({ id }).value();

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Return safe user data
      const safeUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        role: user.role,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        settings: {
          preferences: user.settings?.preferences || {},
          hasApiKeys: {
            openai: !!user.settings?.apiKeys?.openai,
            anthropic: !!user.settings?.apiKeys?.anthropic,
            google: !!user.settings?.apiKeys?.google
          }
        }
      };

      res.json(safeUser);
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Failed to get user' });
    }
  });

  // Change user role (admin only)
  router.put('/users/:id/role', authenticateToken, requireAdmin, (req, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;

      // Validate role
      if (!role || !Object.values(ROLES).includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      // Find user
      const user = db.get('users').find({ id }).value();

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Prevent admin from demoting themselves
      if (id === req.user.id && role !== ROLES.ADMIN) {
        return res.status(400).json({
          error: 'Cannot demote yourself',
          message: 'Ask another admin to change your role'
        });
      }

      // Ensure at least one admin remains
      if (user.role === ROLES.ADMIN && role !== ROLES.ADMIN) {
        const adminCount = db.get('users').filter({ role: ROLES.ADMIN }).size().value();
        if (adminCount <= 1) {
          return res.status(400).json({
            error: 'Cannot demote last admin',
            message: 'At least one admin must exist'
          });
        }
      }

      // Update role
      db.get('users')
        .find({ id })
        .assign({ role })
        .write();

      console.log(`User ${user.email} role changed to ${role} by ${req.user.email}`);

      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role
        }
      });
    } catch (error) {
      console.error('Change role error:', error);
      res.status(500).json({ error: 'Failed to change user role' });
    }
  });

  // Delete user (admin only)
  router.delete('/users/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
      const { id } = req.params;

      // Cannot delete yourself
      if (id === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete yourself' });
      }

      const user = db.get('users').find({ id }).value();

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Ensure at least one admin remains
      if (user.role === ROLES.ADMIN) {
        const adminCount = db.get('users').filter({ role: ROLES.ADMIN }).size().value();
        if (adminCount <= 1) {
          return res.status(400).json({
            error: 'Cannot delete last admin',
            message: 'At least one admin must exist'
          });
        }
      }

      // Remove user
      db.get('users').remove({ id }).write();

      console.log(`User ${user.email} deleted by ${req.user.email}`);

      res.json({
        success: true,
        message: 'User deleted'
      });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  // Get system stats (admin only)
  router.get('/stats', authenticateToken, requireAdmin, (req, res) => {
    try {
      const users = db.get('users').value() || [];
      const articles = db.get('articles').value() || [];
      const feeds = db.get('feeds').value() || [];

      const stats = {
        users: {
          total: users.length,
          admins: users.filter(u => u.role === ROLES.ADMIN).length,
          withApiKeys: users.filter(u =>
            u.settings?.apiKeys?.openai ||
            u.settings?.apiKeys?.anthropic ||
            u.settings?.apiKeys?.google
          ).length
        },
        content: {
          articles: articles.length,
          feeds: feeds.length,
          activeFeeds: feeds.filter(f => f.active).length
        },
        system: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          nodeVersion: process.version
        }
      };

      res.json(stats);
    } catch (error) {
      console.error('Get admin stats error:', error);
      res.status(500).json({ error: 'Failed to get stats' });
    }
  });

  return router;
}

module.exports = createAdminRoutes;
