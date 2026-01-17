const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { v4: uuidv4 } = require('uuid');
const { authenticateToken, generateToken } = require('../middleware/auth');
const { ROLES } = require('../middleware/rbac');

const router = express.Router();

/**
 * Initialize Google OAuth Strategy
 * @param {Object} db - LowDB instance
 */
function initializePassport(db) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback'
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const googleId = profile.id;
      const email = profile.emails?.[0]?.value;
      const name = profile.displayName;
      const picture = profile.photos?.[0]?.value;

      // Check if user exists
      let user = db.get('users').find({ googleId }).value();

      if (user) {
        // Update existing user
        user = db.get('users')
          .find({ googleId })
          .assign({
            name,
            picture,
            lastLogin: new Date().toISOString()
          })
          .write();
      } else {
        // Create new user
        const isFirstUser = db.get('users').size().value() === 0;
        const isAdminEmail = email === process.env.ADMIN_EMAIL;

        user = {
          id: uuidv4(),
          googleId,
          email,
          name,
          picture,
          role: (isFirstUser || isAdminEmail) ? ROLES.ADMIN : ROLES.USER,
          settings: {
            apiKeys: {
              openai: null,
              anthropic: null,
              google: null
            },
            preferences: {
              defaultAIProvider: 'openai',
              theme: 'dark'
            }
          },
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString()
        };

        db.get('users').push(user).write();
        console.log(`New user created: ${email} (${user.role})`);
      }

      return done(null, user);
    } catch (error) {
      console.error('Google OAuth error:', error);
      return done(error, null);
    }
  }));

  // Serialize user for session
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser((id, done) => {
    const user = db.get('users').find({ id }).value();
    done(null, user);
  });
}

/**
 * Create auth routes
 * @param {Object} db - LowDB instance
 * @returns {Router} - Express router
 */
function createAuthRoutes(db) {
  // Initialize passport with database
  initializePassport(db);

  // Start Google OAuth flow
  router.get('/google', passport.authenticate('google', {
    scope: ['profile', 'email']
  }));

  // Google OAuth callback
  router.get('/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: '/login?error=auth_failed' }),
    (req, res) => {
      try {
        // Generate JWT token
        const token = generateToken(req.user);

        // Redirect to frontend with token
        res.redirect(`/?token=${token}`);
      } catch (error) {
        console.error('Callback error:', error);
        res.redirect('/login?error=token_generation_failed');
      }
    }
  );

  // Get current user info
  router.get('/me', authenticateToken, (req, res) => {
    try {
      const user = db.get('users').find({ id: req.user.id }).value();

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Don't send sensitive data
      const safeUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        role: user.role,
        settings: {
          preferences: user.settings?.preferences || {},
          // Only indicate if keys are set, don't send actual keys
          hasApiKeys: {
            openai: !!user.settings?.apiKeys?.openai,
            anthropic: !!user.settings?.apiKeys?.anthropic,
            google: !!user.settings?.apiKeys?.google
          }
        },
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      };

      res.json(safeUser);
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Failed to get user info' });
    }
  });

  // Logout (client-side token removal, but we can log it)
  router.post('/logout', authenticateToken, (req, res) => {
    console.log(`User logged out: ${req.user.email}`);
    res.json({ success: true, message: 'Logged out successfully' });
  });

  // Refresh token
  router.post('/refresh', authenticateToken, (req, res) => {
    try {
      const user = db.get('users').find({ id: req.user.id }).value();

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const newToken = generateToken(user);
      res.json({ token: newToken });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({ error: 'Failed to refresh token' });
    }
  });

  return router;
}

module.exports = createAuthRoutes;
