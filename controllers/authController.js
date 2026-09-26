const jwt = require('jsonwebtoken');
const passport = require('../config/passport');
require('dotenv').config();

const frontendOrigin = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

const generateAppToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      name: user.name,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

const setAuthCookie = (res, token) => {
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie('token', token, {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

const loginWithGoogle = passport.authenticate('google', {
  scope: ['profile', 'email'],
  session: false,
});

const googleCallback = (req, res, next) => {
  passport.authenticate('google', {
    failureRedirect: `${frontendOrigin}/login?error=google_auth_failed`,
    session: false,
  }, (error, user) => {
    if (error || !user) {
      console.error('Google OAuth failed:', error?.message || error);
      return res.redirect(`${frontendOrigin}/login?error=google_auth_failed`);
    }

    const appToken = generateAppToken(user);
    setAuthCookie(res, appToken);
    return res.redirect(`${frontendOrigin}/drive`);
  })(req, res, next);
};

const getCurrentUser = (req, res) => {
  return res.json({
    message: 'User fetched successfully',
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
    },
  });
};

const logout = (req, res) => {
  res.clearCookie('token');
  return res.json({
    success: true,
    message: 'Logged out successfully',
  });
};

module.exports = {
  loginWithGoogle,
  googleCallback,
  getCurrentUser,
  logout,
  generateAppToken,
  setAuthCookie,
};
