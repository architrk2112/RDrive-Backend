const axios = require('axios');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/user');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:5000/api';
const GOOGLE_REDIRECT_URI = `${BACKEND_URL}/auth/callback`;

const buildGoogleAuthUrl = () => {
  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');

  googleAuthUrl.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
  }).toString();

  return googleAuthUrl.toString();
};

const exchangeGoogleCodeForTokens = async (code) => {
  const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: GOOGLE_REDIRECT_URI,
    grant_type: 'authorization_code',
  });

  return tokenResponse.data;
};

const verifyGoogleUser = async (googleIdToken) => {
  const ticket = await googleClient.verifyIdToken({
    idToken: googleIdToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  if (!payload || !payload.email_verified) {
    throw new Error('Google email is not verified');
  }

  return payload;
};

const findOrCreateGoogleUser = async (googleUserPayload) => {
  let user = await User.findOne({ email: googleUserPayload.email });

  if (!user) {
    user = await User.create({
      googleId: googleUserPayload.sub,
      name: googleUserPayload.name,
      email: googleUserPayload.email,
    });
  }

  return user;
};

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
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

const loginWithGoogle = (req, res) => {
  const googleAuthUrl = buildGoogleAuthUrl();
  return res.json({
    message: 'Google login URL generated successfully',
    url: googleAuthUrl,
  });
};

const googleCallback = async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ message: 'Missing Google OAuth code' });
  }

  try {
    const tokenData = await exchangeGoogleCodeForTokens(code);
    const googleUserPayload = await verifyGoogleUser(tokenData.id_token);
    const user = await findOrCreateGoogleUser(googleUserPayload);
    const appToken = generateAppToken(user);

    setAuthCookie(res, appToken);
    return res.redirect(`${FRONTEND_URL}/drive`);
  } catch (error) {
    console.error('Google OAuth failed:', error.response?.data || error.message);
    return res.status(400).json({ message: 'Google authentication failed' });
  }
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
  buildGoogleAuthUrl,
  exchangeGoogleCodeForTokens,
  verifyGoogleUser,
  findOrCreateGoogleUser,
  generateAppToken,
  setAuthCookie,
};
