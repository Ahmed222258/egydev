const jwt = require('jsonwebtoken');
const User = require('../model/user.model');

exports.authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // FIX #1: Added `return` to stop execution after sending 401
  if (!authHeader?.startsWith('Bearer '))
    return res.status(401).json({ message: 'No Token Provided' });

  const token = authHeader.split(' ')[1];
  try {
    const decode = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decode.id).select('-password');
    if (!req.user) return res.status(401).json({ message: 'User not found' });
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Token invalid or expired' });
  }
};