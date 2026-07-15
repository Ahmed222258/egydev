const jwt = require('jsonwebtoken');
const User = require('../model/user.model');

exports.authenticate = async (req, res, next) => {
  let token = req.cookies.token;

  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // FIX #1: Added `return` to stop execution after sending 401
  if (!token)
    return res.status(401).json({ message: 'No Token Provided' });
  try {
    const decode = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decode.id).select('-password');
    if (!req.user) return res.status(401).json({ message: 'User not found' });
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Token invalid or expired' });
  }
};