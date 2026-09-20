const express = require('express');
const {
  loginWithGoogle,
  googleCallback,
  getCurrentUser,
  logout,
} = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/google', loginWithGoogle);
router.get('/callback', googleCallback);
router.get('/me', requireAuth, getCurrentUser);
router.post('/logout', logout); 

module.exports = router;
