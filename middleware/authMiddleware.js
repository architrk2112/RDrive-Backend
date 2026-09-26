const passport = require('../config/passport');

const requireAuth = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (error, user) => {
    if (error) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    req.user = {
      id: user._id,
      email: user.email,
      name: user.name,
    };

    return next();
  })(req, res, next);
};

module.exports = { requireAuth };